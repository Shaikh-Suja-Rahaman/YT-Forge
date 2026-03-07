const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const https = require("https");
const { spawn, execSync } = require("child_process");
const YTDlpWrap = require("yt-dlp-wrap").default;
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;

const _Store = require("electron-store");
const Store = _Store.default || _Store;

const store = new Store();
let mainWindow;
let currentDownloadProcess = null;

// Use the yt-dlp binary from the project root
const ytDlpBinaryPath = path.join(app.getAppPath(), 'yt-dlp');

// Ensure yt-dlp is executable
if (fs.existsSync(ytDlpBinaryPath)) {
  try {
    fs.chmodSync(ytDlpBinaryPath, '755');
    console.log('Using yt-dlp binary at:', ytDlpBinaryPath);
  } catch (error) {
    console.error('Failed to make yt-dlp executable:', error);
  }
} else {
  console.error('yt-dlp binary not found at:', ytDlpBinaryPath);
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

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
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

ipcMain.handle("get-video-info", async (event, url) => {
  try {
    console.log('Fetching video info for:', url);
    const ytDlp = new YTDlpWrap(ytDlpBinaryPath);

    // Get video info using yt-dlp
    const info = await ytDlp.getVideoInfo(url);

    console.log('Total formats available:', info.formats.length);

    // Extract video formats - Allow all formats, will convert to H.264 if needed
    // This gives access to all quality options but may require conversion
    const videoFormats = info.formats
      .filter(f => {
        const isVideoOnly = f.vcodec !== 'none' && f.height && f.acodec === 'none';
        const isNotFragmented = !f.format_id.includes('-');
        const isMP4orWebM = f.ext === 'mp4' || f.ext === 'webm';
        const notAV1 = !f.vcodec.includes('av01'); // AV1 causes issues, skip it
        const isGoodQuality = f.height >= 360;

        return isVideoOnly && isNotFragmented && isMP4orWebM && notAV1 && isGoodQuality;
      })
      .map(f => ({
        itag: f.format_id,
        quality: f.height + 'p' + (f.fps > 30 ? f.fps : ''),
        height: f.height,
        fps: f.fps || 30,
        size: f.filesize || f.filesize_approx || 0,
        sizeFormatted: formatBytes(f.filesize || f.filesize_approx || 0),
        ext: f.ext,
        vcodec: f.vcodec
      }));

    console.log('Video formats found:', videoFormats.length);
    videoFormats.forEach(f => {
      console.log(`Format: ${f.quality} (${f.itag}) - ${f.sizeFormatted} - ${f.ext} - ${f.vcodec}`);
    });

    // Group by height and take the best format for each resolution (prefer larger size = better bitrate)
    const formatsByHeight = {};
    videoFormats.forEach(f => {
      const key = f.height;
      if (!formatsByHeight[key] ||
          formatsByHeight[key].size < f.size) {
        formatsByHeight[key] = f;
      }
    });

    const uniqueFormats = Object.values(formatsByHeight)
      .sort((a, b) => b.height - a.height);    // Get audio format size
    const audioFormat = info.formats
      .filter(f => f.acodec !== 'none' && f.vcodec === 'none')
      .sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];
    const audioSize = audioFormat?.filesize || audioFormat?.filesize_approx || 0;

    console.log('Unique formats to show:', uniqueFormats.length);
    console.log('Best audio format:', audioFormat?.format_id, formatBytes(audioSize));

    return {
      success: true,
      videoId: info.id,
      formats: uniqueFormats.length > 0 ? uniqueFormats : [{ itag: 'best', quality: 'Best', size: 0, sizeFormatted: 'N/A' }],
      title: info.title,
      description: info.description || '',
      thumbnailUrl: info.thumbnail,
      audioSizeFormatted: formatBytes(audioSize)
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
    let ytDlpProcess = null;

    currentDownloadProcess = {
        cancel: () => {
            isCancelled = true;
            if (ytDlpProcess) {
                ytDlpProcess.kill(); // SIGTERM by default
            }
        }
    };

    try {
      const ytDlp = new YTDlpWrap(ytDlpBinaryPath);

      let formatArg;
      if (type === 'mp3') {
        formatArg = 'bestaudio[ext=m4a]/bestaudio';
      } else {
        if (quality === 'best' || quality === 'Best') {
          formatArg = 'bestvideo+bestaudio/best';
        } else {
          formatArg = `${quality}+bestaudio/best`;
        }
      }

      console.log('Download request - Selected format:', formatArg, 'Quality itag:', quality, 'Type:', type);

      const args = [
        url,
        '--format', formatArg,
        '--output', filePath,
        '--ffmpeg-location', ffmpegPath,
        '--no-playlist',
        '--newline',
        '--ignore-config',
        '--retries', '5',
        '--retry-sleep', '3',
        // Use the TV client — it is not affected by YouTube's SABR streaming enforcement
        '--extractor-args', 'youtube:player_client=tv,default',
      ];

      if (type === 'mp3') {
        args.push(
          '--extract-audio',
          '--audio-format', 'mp3',
          '--audio-quality', '0'
        );
      } else {
        // Merge into mp4 container; avoid --recode-video so we don't re-encode unnecessarily
        args.push('--merge-output-format', 'mp4');
      }

      console.log('Starting yt-dlp with command:', ytDlpBinaryPath, args.join(' '));

      // Use spawn directly so we get raw stdout/stderr streams for progress parsing
      ytDlpProcess = spawn(ytDlpBinaryPath, args);

      // Send an initial "started" event so the UI shows activity immediately
      mainWindow.webContents.send('download-progress', { percent: 0, downloadedBytes: 0, totalBytes: 0 });

      let lastPercent = -1;
      let stdoutBuf = '';

      ytDlpProcess.stdout.on('data', (chunk) => {
        stdoutBuf += chunk.toString();
        const lines = stdoutBuf.split(/\r?\n/);
        stdoutBuf = lines.pop(); // keep incomplete last line
        lines.forEach((line) => {
          if (!line.trim()) return;
          console.log('yt-dlp:', line);
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
            mainWindow.webContents.send('download-progress', { percent: percentValue, downloadedBytes, totalBytes });
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
      mainWindow.webContents.send("download-progress", {
        percent: 100,
        downloadedBytes: finalSize,
        totalBytes: finalSize,
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