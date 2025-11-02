const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const https = require("https");
const { spawn, execSync } = require("child_process");
const YTDlpWrap = require("yt-dlp-wrap").default;
const ffmpegPath = require('ffmpeg-static');

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
  mainWindow.loadFile("index.html");
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

    // Extract video formats - prefer mp4/av01, filter out webm and fragmented formats
    const videoFormats = info.formats
      .filter(f =>
        f.vcodec !== 'none' &&
        f.height &&
        f.acodec === 'none' &&  // Video only (will be merged with audio)
        !f.format_id.includes('-') && // Exclude fragmented formats like 91-0, 92-1
        (f.ext === 'mp4' || f.vcodec.includes('av01')) && // Prefer mp4 and av01 codec
        f.height >= 360 // Filter out very low quality
      )
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
                ytDlpProcess.kill('SIGTERM');
            }
        }
    };

    try {
        const ytDlp = new YTDlpWrap(ytDlpBinaryPath);

        // Build yt-dlp arguments
        let formatArg;
        if (type === 'mp3') {
            formatArg = 'bestaudio[ext=m4a]/bestaudio';
        } else {
            // For video, use the specific format_id (itag) + best audio
            if (quality === 'best' || quality === 'Best') {
                // Get the absolute best quality available
                formatArg = 'bestvideo+bestaudio/best';
            } else {
                // Use specific format_id (itag) and merge with best audio
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
            '--verbose',  // Add verbose output to see what's happening
        ];

        if (type === 'mp3') {
            args.push(
                '--extract-audio',
                '--audio-format', 'mp3',
                '--audio-quality', '0'
            );
        } else {
            args.push('--merge-output-format', 'mp4');
        }

        console.log('Starting yt-dlp with command:', ytDlpBinaryPath, args.join(' '));

        // Use execStream for better process control
        ytDlpProcess = spawn(ytDlpBinaryPath, args);

        let lastProgress = 0;

        ytDlpProcess.stdout.on('data', (data) => {
            const output = data.toString();
            console.log('yt-dlp output:', output);

            // Parse progress from yt-dlp output
            const downloadMatch = output.match(/(\d+\.?\d*)%/);
            if (downloadMatch) {
                const percent = parseFloat(downloadMatch[1]);
                if (percent !== lastProgress) {
                    lastProgress = percent;
                    mainWindow.webContents.send("download-progress", {
                        percent,
                        downloaded: percent,
                        total: 100
                    });
                }
            }
        });

        ytDlpProcess.stderr.on('data', (data) => {
            console.log('yt-dlp stderr:', data.toString());
        });

        await new Promise((resolve, reject) => {
            ytDlpProcess.on('close', (code) => {
                if (isCancelled) {
                    reject(new Error("Download was canceled."));
                } else if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`yt-dlp exited with code ${code}`));
                }
            });
            ytDlpProcess.on('error', (err) => reject(err));
        });

        if (isCancelled) throw new Error("Download was canceled.");

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