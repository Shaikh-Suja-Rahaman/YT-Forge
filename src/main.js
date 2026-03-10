// Handle Windows Squirrel installer events (install/update/uninstall)
// Must be at the very top before any other code runs
if (require('electron-squirrel-startup')) app.quit();

const { app, BrowserWindow, ipcMain, dialog, shell, net } = require("electron");
const path = require("path");
const fs = require("fs");
const https = require("https");
const { spawn, execFile } = require("child_process");

// Fix asar-packed paths: ffmpeg-static/ffprobe-static resolve inside .asar
// which isn't executable. asarUnpack extracts them to .asar.unpacked.
const fixAsar = (p) => p.replace('app.asar', 'app.asar.unpacked');
const ffmpegPath = fixAsar(require('ffmpeg-static'));
const ffprobePath = fixAsar(require('ffprobe-static').path);

// Build env with ffmpeg+ffprobe directories on PATH so yt-dlp can find both
function getYtDlpEnv() {
  const dirs = new Set([path.dirname(ffmpegPath), path.dirname(ffprobePath)]);
  const extraPath = [...dirs].join(path.delimiter);
  return { ...process.env, PATH: `${extraPath}${path.delimiter}${process.env.PATH || ''}` };
}

const _Store = require("electron-store");
const Store = _Store.default || _Store;

// Base yt-dlp flags shared by info fetch and download
const BASE_ARGS = [
  '--no-playlist',
  '--ignore-config',
  '--retries', '10',
  '--retry-sleep', '3',
  '--fragment-retries', '10',
  '--js-runtimes', 'default,node,bun',  // enable Node/Bun as JS runtimes alongside deno
];

const store = new Store();
let mainWindow;
let currentDownloadProcess = null;
let isUpdatingYtDlp = false;
let networkCheckInterval = null;
let wasOnline = true;

// ---------------------------------------------------------------------------
// Cross-platform yt-dlp binary resolution
// ---------------------------------------------------------------------------

/**
 * Returns the platform-specific yt-dlp binary filename.
 *   Windows → yt-dlp.exe
 *   macOS   → yt-dlp_macos
 *   Linux   → yt-dlp_linux
 */
function getBinaryName() {
  switch (process.platform) {
    case 'win32':  return 'yt-dlp.exe';
    case 'darwin': return 'yt-dlp_macos';
    case 'linux':  return 'yt-dlp_linux';
    default:       return 'yt-dlp_linux'; // best guess
  }
}

/**
 * Where the bundled (read-only) binary lives inside the packaged app.
 * In dev mode it sits at <projectRoot>/bin/; in production at resources/bin/.
 */
function getBundledBinaryPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'bin', getBinaryName());
  }
  return path.join(app.getAppPath(), 'bin', getBinaryName());
}

/**
 * Writable location where the binary is copied so `yt-dlp -U` can self-update.
 * Falls back to the bundled path in development.
 */
function getWritableBinaryPath() {
  if (!app.isPackaged) return getBundledBinaryPath(); // dev mode — bin/ is already writable
  return path.join(app.getPath('userData'), 'bin', getBinaryName());
}

/**
 * Ensures the yt-dlp binary exists in the writable location.
 * On first launch after install, copies from the bundled resource.
 */
function ensureYtDlpBinary() {
  const writable = getWritableBinaryPath();
  const bundled  = getBundledBinaryPath();

  // In dev, just make sure the file exists in bin/
  if (!app.isPackaged) {
    if (!fs.existsSync(writable)) {
      console.error('yt-dlp binary not found at:', writable);
      console.error('Download it from https://github.com/yt-dlp/yt-dlp/releases and place it in bin/');
      return writable;
    }
  } else {
    // Production: copy from bundled resources to writable userData if missing
    const dir = path.dirname(writable);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (!fs.existsSync(writable)) {
      if (fs.existsSync(bundled)) {
        fs.copyFileSync(bundled, writable);
        console.log('Copied yt-dlp binary to writable location:', writable);
      } else {
        console.error('Bundled yt-dlp binary not found at:', bundled);
      }
    }
  }

  // Make executable on Unix systems (no-op concern on Windows)
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(writable, '755');
    } catch (err) {
      console.error('Failed to chmod yt-dlp binary:', err);
    }
  }

  console.log('Using yt-dlp binary at:', writable);
  return writable;
}

const ytDlpBinaryPath = ensureYtDlpBinary();

/** Safe send — guard against destroyed window (e.g. app quit during async callback) */
function safeSend(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

/**
 * Auto-update yt-dlp on app launch.
 * Runs `yt-dlp -U` in the background. Because the binary lives in a writable
 * directory (userData/bin/), it can replace itself in-place.
 */
function updateYtDlp() {
  // Don't update while a download is active
  if (currentDownloadProcess) {
    console.log('Skipping yt-dlp update — download in progress');
    return;
  }
  isUpdatingYtDlp = true;
  console.log('Checking for yt-dlp updates...');
  safeSend('ytdlp-update-status', { updating: true });
  execFile(ytDlpBinaryPath, ['-U'], (err, stdout, stderr) => {
    isUpdatingYtDlp = false;
    const updated = stdout && stdout.includes('Updated yt-dlp');
    safeSend('ytdlp-update-status', { updating: false, updated });
    if (err) {
      console.log('yt-dlp update check failed (non-critical):', err.message);
      return;
    }
    if (stdout) console.log('yt-dlp update:', stdout.trim());
    if (stderr) console.log('yt-dlp update stderr:', stderr.trim());

    // After a successful update, re-apply executable permissions on Unix
    if (process.platform !== 'win32') {
      try {
        fs.chmodSync(ytDlpBinaryPath, '755');
      } catch (chmodErr) {
        console.error('Failed to chmod yt-dlp after update:', chmodErr);
      }
    }

    // On macOS, clear quarantine flag so Gatekeeper doesn't block the updated binary
    if (process.platform === 'darwin') {
      execFile('xattr', ['-dr', 'com.apple.quarantine', ytDlpBinaryPath], (xattrErr) => {
        if (xattrErr) console.log('xattr quarantine clear (non-critical):', xattrErr.message);
      });
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 700,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // In development, load from Vite dev server; in production, load the file
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
}

// ---------------------------------------------------------------------------
// Network monitoring — auto-pause/resume downloads on connectivity changes
// ---------------------------------------------------------------------------
function startNetworkMonitoring() {
  if (networkCheckInterval) return;
  wasOnline = net.isOnline();
  networkCheckInterval = setInterval(() => {
    const online = net.isOnline();
    if (online === wasOnline) return;
    wasOnline = online;
    if (!online && currentDownloadProcess && !currentDownloadProcess.isPaused) {
      // Lost connectivity — auto-pause to prevent yt-dlp from burning retries
      currentDownloadProcess.pause('network');
    } else if (online && currentDownloadProcess && currentDownloadProcess.isPaused && currentDownloadProcess.pauseReason === 'network') {
      // Back online — auto-resume only network-paused downloads (respect user pauses)
      currentDownloadProcess.resume();
    }
  }, 3000);
}

app.whenReady().then(() => {
  createWindow();
  // Non-blocking: check for yt-dlp updates after the window is ready
  updateYtDlp();
  startNetworkMonitoring();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Clean up paused downloads on quit — a SIGSTOPped process can't handle SIGTERM
app.on('before-quit', () => {
  if (currentDownloadProcess) {
    currentDownloadProcess.cancel();
  }
  if (networkCheckInterval) {
    clearInterval(networkCheckInterval);
    networkCheckInterval = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

const formatBytes = (bytes, decimals = 2) => {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

const sizeToBytes = (value, unit) => {
  const normalizedUnit = (unit || '').toUpperCase();
  const multiplierMap = {
    B: 1,
    KB: 1024,
    KIB: 1024,
    MB: 1024 ** 2,
    MIB: 1024 ** 2,
    GB: 1024 ** 3,
    GIB: 1024 ** 3,
    TB: 1024 ** 4,
    TIB: 1024 ** 4,
  };
  const multiplier = multiplierMap[normalizedUnit] || 1;
  return Math.round(value * multiplier);
};

ipcMain.handle("get-history", () => store.get('downloadHistory', []));
ipcMain.handle("clear-history", () => store.set('downloadHistory', []));
ipcMain.handle("delete-history-item", (event, timestamp) => {
  const history = store.get('downloadHistory', []);
  const updated = history.filter(item => item.timestamp !== timestamp);
  store.set('downloadHistory', updated);
  return updated;
});

// --- MODIFIED SECTION START ---
ipcMain.handle("open-file-location", (event, filePath) => {
  // 1. Check if the file exists at the stored path
  if (fs.existsSync(filePath)) {
    // 2. If it exists, show it in the folder
    shell.showItemInFolder(filePath);
  } else {
    // 3. If not, show an error dialog to the user
    dialog.showErrorBox(
      "File Not Found",
      "The file could not be found at the original location. It may have been moved or deleted."
    );
  }
});
// --- MODIFIED SECTION END ---

ipcMain.handle("open-external-link", (event, url) => shell.openExternal(url));

ipcMain.on("cancel-download", () => {
    if (currentDownloadProcess && typeof currentDownloadProcess.cancel === 'function') {
        currentDownloadProcess.cancel();
    }
});

ipcMain.on("pause-download", () => {
    if (currentDownloadProcess && typeof currentDownloadProcess.pause === 'function') {
        currentDownloadProcess.pause();
    }
});

ipcMain.on("resume-download", () => {
    if (currentDownloadProcess && typeof currentDownloadProcess.resume === 'function') {
        currentDownloadProcess.resume();
    }
});

ipcMain.handle("get-video-info", async (event, url) => {
  if (isUpdatingYtDlp) {
    return { success: false, error: 'yt-dlp is updating in the background, please try again in a moment.' };
  }
  try {
    console.log('Fetching video info for:', url);

    // Use execPromise with --dump-json directly — avoids yt-dlp-wrap's internal
    // "-f best" flag which limits results to a single 360p pre-merged stream
    const stdout = await new Promise((resolve, reject) => {
      const proc = spawn(ytDlpBinaryPath, [
        url,
        '--dump-json',
        ...BASE_ARGS,
      ], { env: getYtDlpEnv() });
      let out = '';
      let err = '';
      proc.stdout.on('data', d => { out += d.toString(); });
      proc.stderr.on('data', d => { err += d.toString(); });
      proc.on('close', code => {
        if (code === 0) resolve(out);
        else reject(new Error(err || `yt-dlp exited with code ${code}`));
      });
      proc.on('error', reject);
    });

    const info = JSON.parse(stdout);
    console.log('Total formats available:', info.formats.length);

    // Debug: log raw format dimensions to help diagnose issues
    info.formats.forEach(f => {
      if (f.vcodec && f.vcodec !== 'none') {
        console.log(`  fmt ${f.format_id}: ${f.width}x${f.height} vcodec=${f.vcodec} acodec=${f.acodec} size=${f.filesize || f.filesize_approx || '?'}`);
      }
    });

    // Build quality list from ALL video formats (adaptive + muxed).
    // Priority: adaptive H.264 > adaptive VP9 > muxed H.264 > muxed VP9.
    // AV1 is always skipped — poor app compatibility.
    const heightMap = {};
    info.formats.forEach(f => {
      const rawH = f.height || 0;
      const rawW = f.width || 0;

      // Use the shorter dimension as the display quality (handles portrait/vertical videos)
      // e.g. a vertical 1080p video is 1080×1920 → display as "1080p", not "1920p"
      const displayH = (rawW > 0 && rawH > 0) ? Math.min(rawW, rawH) : rawH;

      if (!displayH || displayH < 240) return;
      if (!f.vcodec || f.vcodec === 'none') return;
      if (f.vcodec.startsWith('av01')) return; // skip AV1

      const size = f.filesize || f.filesize_approx || 0;
      const fps = f.fps || 30;
      const isAdaptive = f.acodec === 'none';
      const isH264 = f.vcodec.startsWith('avc') || f.vcodec === 'h264';
      const key = `${displayH}_${fps > 30 ? fps : 30}`;
      // Score: adaptive = 2 pts, H.264 = 1 pt — higher score wins
      const score = (isAdaptive ? 2 : 0) + (isH264 ? 1 : 0);
      const cur = heightMap[key];
      const curScore = cur ? (cur.isAdaptive ? 2 : 0) + (cur.isH264 ? 1 : 0) : -1;
      if (score > curScore || (score === curScore && size > (cur?.size || 0))) {
        heightMap[key] = {
          displayHeight: displayH,   // shorter dimension — for UI label
          ytdlpHeight: rawH,         // actual yt-dlp height — for format filter
          fps, size, isAdaptive, isH264,
        };
      }
    });

    const uniqueFormats = Object.values(heightMap)
      .map(f => ({
        itag: `${f.ytdlpHeight}`,   // actual yt-dlp height, used in download format arg
        quality: `${f.displayHeight}p${f.fps > 30 ? f.fps : ''}${f.isH264 ? '' : ' (VP9)'}`,
        height: f.displayHeight,
        size: f.size,
        sizeFormatted: f.size > 0 ? formatBytes(f.size) : 'N/A',
        isH264: f.isH264,
      }))
      .sort((a, b) => b.height - a.height);

    console.log('Available qualities:', uniqueFormats.map(f => f.quality).join(', '));

    const audioFormat = info.formats
      .filter(f => f.acodec !== 'none' && f.vcodec === 'none')
      .sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];
    const audioSize = audioFormat?.filesize || audioFormat?.filesize_approx || 0;

    return {
      success: true,
      videoId: info.id,
      formats: uniqueFormats.length > 0 ? uniqueFormats : [{ itag: 'best', quality: 'Best', size: 0, sizeFormatted: 'N/A' }],
      title: info.title,
      description: info.description || '',
      thumbnailUrl: info.thumbnail,
      audioSizeFormatted: formatBytes(audioSize),
    };
  } catch (error) {
    console.error("Error fetching video info:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("download-thumbnail", async (event, { url, title }) => {
    const safeTitle = title.replace(/[\\/:"*?<>|]/g, '');
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Thumbnail', defaultPath: `${safeTitle}_thumbnail.jpg`,
        buttonLabel: 'Save Image', filters: [{ name: 'JPEG Image', extensions: ['jpg'] }]
    });
    if (canceled || !filePath) return { success: false, error: 'Save dialog was canceled.' };
    return new Promise((resolve) => {
        const fileStream = fs.createWriteStream(filePath);
        const request = https.get(url, (response) => {
            if (response.statusCode !== 200) { fs.unlink(filePath, () => {}); resolve({ success: false, error: `Download failed. Status: ${response.statusCode}` }); return; }
            response.pipe(fileStream);
        });
        fileStream.on('finish', () => fileStream.close(() => resolve({ success: true, path: filePath })));
        request.on('error', (err) => { fs.unlink(filePath, () => {}); resolve({ success: false, error: err.message }); });
    });
});

ipcMain.handle("download-video", async (event, { videoId, url, quality, qualityLabel, type, title, thumbnailUrl }) => {
    if (isUpdatingYtDlp) {
      return { success: false, error: 'yt-dlp is updating in the background, please try again in a moment.' };
    }
    const safeTitle = title.replace(/[\\/:"*?<>|]/g, '');
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: `Save ${type.toUpperCase()}`,
        defaultPath: `${safeTitle}.${type}`,
        buttonLabel: "Save",
        filters: type === 'mp4' ? [{ name: "MPEG-4 Video", extensions: ["mp4"] }] : [{ name: "MP3 Audio", extensions: ["mp3"] }],
    });

    if (canceled || !filePath) return { success: false, error: "Save dialog was canceled." };

    // Delete the file if it already exists to force re-download
    if (fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
            console.log('Deleted existing file to force fresh download');
        } catch (err) {
            console.error('Failed to delete existing file:', err);
        }
    }

    let isCancelled = false;
    let isPaused = false;
    let pauseReason = null;       // null | 'user' | 'network'
    let ytDlpProcess = null;
    let downloadStage = 'starting';

    currentDownloadProcess = {
        cancel: () => {
            isCancelled = true;
            if (ytDlpProcess) {
                // If paused (SIGSTOP), resume the process group first so it can receive SIGTERM
                if (isPaused && process.platform !== 'win32') {
                    try { process.kill(-ytDlpProcess.pid, 'SIGCONT'); } catch (e) { console.error('SIGCONT on cancel failed:', e.message); }
                }
                if (process.platform === 'win32') {
                    spawn('taskkill', ['/pid', String(ytDlpProcess.pid), '/f', '/t']);
                } else {
                    // Kill the entire process group
                    try { process.kill(-ytDlpProcess.pid, 'SIGTERM'); } catch (_) {
                        ytDlpProcess.kill('SIGTERM');
                    }
                }
            }
            isPaused = false;
            pauseReason = null;
        },
        pause: (reason = 'user') => {
            if (isPaused || !ytDlpProcess || isCancelled) return;
            // Don't allow pausing during merging/processing (local ffmpeg ops)
            if (downloadStage === 'merging' || downloadStage === 'processing') return;
            isPaused = true;
            pauseReason = reason;
            if (process.platform !== 'win32') {
                try {
                    // Send SIGSTOP to the entire process group (negative PID)
                    process.kill(-ytDlpProcess.pid, 'SIGSTOP');
                    console.log(`SIGSTOP sent to process group -${ytDlpProcess.pid}`);
                } catch (e) {
                    console.error('SIGSTOP failed:', e.message);
                    // Fallback: try sending to just the process
                    try { ytDlpProcess.kill('SIGSTOP'); } catch (e2) { console.error('SIGSTOP fallback also failed:', e2.message); }
                }
            }
            console.log(`Download paused (${reason})`);
            safeSend('download-progress', { paused: true, reason, stage: downloadStage });
        },
        resume: () => {
            if (!isPaused || !ytDlpProcess || isCancelled) return;
            isPaused = false;
            pauseReason = null;
            if (process.platform !== 'win32') {
                try {
                    process.kill(-ytDlpProcess.pid, 'SIGCONT');
                    console.log(`SIGCONT sent to process group -${ytDlpProcess.pid}`);
                } catch (e) {
                    console.error('SIGCONT failed:', e.message);
                    try { ytDlpProcess.kill('SIGCONT'); } catch (e2) { console.error('SIGCONT fallback also failed:', e2.message); }
                }
            }
            console.log('Download resumed');
            safeSend('download-progress', { paused: false, reason: null, stage: downloadStage });
        },
        get isPaused() { return isPaused; },
        get pauseReason() { return pauseReason; },
        get stage() { return downloadStage; },
    };

    try {
      let formatArg;
      if (type === 'mp3') {
        formatArg = 'bestaudio[ext=m4a]/bestaudio';
      } else {
        const h = parseInt(quality);
        if (!isNaN(h)) {
          // Prefer H.264 (avc) for QuickTime / Premiere Pro / iMovie compatibility.
          // Fall back to VP9 only if H.264 isn't available (e.g. 1440p / 4K).
          // AV1 is never selected.
          formatArg =
            `bestvideo[height=${h}][vcodec^=avc]+bestaudio[ext=m4a]/` +
            `bestvideo[height=${h}][vcodec^=avc]+bestaudio/` +
            `bestvideo[height=${h}][vcodec!^=av01]+bestaudio[ext=m4a]/` +
            `bestvideo[height=${h}][vcodec!^=av01]+bestaudio/` +
            `bestvideo[height<=${h}][vcodec^=avc]+bestaudio[ext=m4a]/` +
            `bestvideo[height<=${h}][vcodec^=avc]+bestaudio/` +
            `bestvideo[height<=${h}][vcodec!^=av01]+bestaudio[ext=m4a]/` +
            `bestvideo[height<=${h}][vcodec!^=av01]+bestaudio/best`;
        } else {
          formatArg =
            'bestvideo[vcodec^=avc]+bestaudio[ext=m4a]/' +
            'bestvideo[vcodec^=avc]+bestaudio/' +
            'bestvideo[vcodec!^=av01]+bestaudio[ext=m4a]/' +
            'bestvideo[vcodec!^=av01]+bestaudio/best';
        }
      }

      console.log('Download request - Selected format:', formatArg, 'Quality itag:', quality, 'Type:', type);

      const args = [
        url,
        '--format', formatArg,
        '--output', filePath,
        '--ffmpeg-location', ffmpegPath,
        '--newline',
        ...BASE_ARGS,
      ];

      if (type === 'mp3') {
        args.push('--extract-audio', '--audio-format', 'mp3', '--audio-quality', '0');
      } else {
        // ffmpeg merges separate video+audio streams into a single mp4 container
        args.push('--merge-output-format', 'mp4');
      }

      console.log('Starting yt-dlp with command:', ytDlpBinaryPath, args.join(' '));

      // Spawn in its own process group (detached) so SIGSTOP/SIGCONT
      // can freeze/resume the entire group via negative PID
      ytDlpProcess = spawn(ytDlpBinaryPath, args, { env: getYtDlpEnv(), detached: true });

      // Send an initial "started" event so the UI shows activity immediately
      safeSend('download-progress', { percent: 0, downloadedBytes: 0, totalBytes: 0, stage: 'starting' });

      let lastPercent = -1;
      let stdoutBuf = '';
      let stageCount = 0; // tracks how many [download] Destination lines we've seen

      ytDlpProcess.stdout.on('data', (chunk) => {
        stdoutBuf += chunk.toString();
        const lines = stdoutBuf.split(/\r?\n/);
        stdoutBuf = lines.pop(); // keep incomplete last line
        lines.forEach((line) => {
          if (!line.trim()) return;
          console.log('yt-dlp:', line);

          // Detect stage transitions even while paused (so we track state correctly)
          if (line.includes('[download] Destination:')) {
            stageCount++;
            if (type === 'mp3') {
              downloadStage = 'audio';
            } else {
              downloadStage = stageCount === 1 ? 'video' : 'audio';
            }
            lastPercent = -1;
          } else if (line.includes('[Merger]') || line.includes('[Mux]')) {
            downloadStage = 'merging';
            if (!isPaused) safeSend('download-progress', { percent: -1, downloadedBytes: 0, totalBytes: 0, stage: 'merging' });
          } else if (line.includes('[ExtractAudio]') || line.includes('[FFmpegMetadata]')) {
            downloadStage = 'processing';
            if (!isPaused) safeSend('download-progress', { percent: -1, downloadedBytes: 0, totalBytes: 0, stage: 'processing' });
          }

          // Don't send progress events while paused — pipe buffer may still drain
          if (isPaused) return;

          // yt-dlp progress line looks like: [download]  12.3% of   54.23MiB at  3.10MiB/s ETA 00:15
          const downloadMatch = line.match(/\[download\]\s+([\d.]+)%\s+of\s+~?\s*([\d.]+)([KMGTi]+B)/i);
          let percentValue = null;
          let downloadedBytes = 0;
          let totalBytes = 0;

          if (downloadMatch) {
            percentValue = Math.min(100, parseFloat(downloadMatch[1]));
            const totalValue = parseFloat(downloadMatch[2]);
            const unit = downloadMatch[3];
            totalBytes = sizeToBytes(totalValue, unit);
            downloadedBytes = Math.round(totalBytes * (percentValue / 100));
          } else {
            // Fallback: grab any bare percentage in the line
            const bare = line.match(/(?:^|\s)(\d{1,3}\.?\d*)%/);
            if (bare) percentValue = Math.min(100, parseFloat(bare[1]));
          }

          if (percentValue !== null && percentValue !== lastPercent) {
            lastPercent = percentValue;
            safeSend('download-progress', { percent: percentValue, downloadedBytes, totalBytes, stage: downloadStage });
          }
        });
      });

      ytDlpProcess.stderr.on('data', (data) => {
        console.error('yt-dlp stderr:', data.toString());
      });

      await new Promise((resolve, reject) => {
        ytDlpProcess.on('close', (code) => {
          if (isCancelled) {
            reject(new Error('Download was canceled.'));
          } else if (code === 0) {
            resolve();
          } else {
            reject(new Error(`yt-dlp exited with code ${code}`));
          }
        });
        ytDlpProcess.on('error', (err) => reject(err));
      });

      if (isCancelled) throw new Error("Download was canceled.");

      console.log('Download complete! File saved at:', filePath);

      const finalSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
      safeSend("download-progress", {
        percent: 100,
        downloadedBytes: finalSize,
        totalBytes: finalSize,
        stage: 'done',
      });

        // Add to history
        const history = store.get('downloadHistory', []);
        const label = type === 'mp3' ? 'AUDIO' : qualityLabel;
        const newHistoryItem = {
            id: videoId,
            title,
            thumbnailUrl,
            url,
            format: `${label} (${type.toUpperCase()})`,
            path: filePath,
            timestamp: new Date().toISOString(),
        };
        const updatedHistory = [newHistoryItem, ...history.filter(h => h.id !== videoId || h.path !== filePath)];
        store.set('downloadHistory', updatedHistory);

        return { success: true, path: filePath };

    } catch (err) {
        if (fs.existsSync(filePath) && !isCancelled) fs.unlinkSync(filePath);
        return { success: false, error: err.message };
    } finally {
        currentDownloadProcess = null;
    }
});
