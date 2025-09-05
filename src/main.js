const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const https = require("https");
const ytdl = require("@distube/ytdl-core");
const { spawn } = require("child_process");
const ffmpegPath = require('ffmpeg-static'); // <-- ADD THIS LINE

const _Store = require("electron-store");
const Store = _Store.default || _Store;

const store = new Store();
let mainWindow;
let ffmpegProcess;
let currentDownloadPath;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    resizable: false,
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
ipcMain.handle("open-file-location", (event, filePath) => shell.showItemInFolder(filePath));
ipcMain.handle("open-external-link", (event, url) => shell.openExternal(url));

ipcMain.on("cancel-download", () => {
    if (ffmpegProcess) {
        ffmpegProcess.kill('SIGKILL');
        ffmpegProcess = null;

        if (currentDownloadPath && fs.existsSync(currentDownloadPath)) {
            try {
                fs.unlinkSync(currentDownloadPath);
            } catch (error) {
                console.error("Failed to delete partial file:", error);
            }
        }
        currentDownloadPath = null;
    }
});


ipcMain.handle("get-video-info", async (event, url) => {
  try {
    if (!ytdl.validateURL(url)) throw new Error("Invalid YouTube URL");
    const info = await ytdl.getInfo(url);

    const mapFormat = f => ({
        itag: f.itag,
        quality: f.qualityLabel,
        size: f.contentLength,
        sizeFormatted: formatBytes(f.contentLength)
    });

    const videoFormats = ytdl.filterFormats(info.formats, 'videoonly').filter(f => f.container === 'mp4' && f.qualityLabel).map(mapFormat);
    const combinedFormats = info.formats.filter(f => f.hasVideo && f.hasAudio && f.container === 'mp4' && f.qualityLabel).map(mapFormat);
    const allFormatsMap = new Map();
    [...combinedFormats, ...videoFormats].forEach(f => { if (!allFormatsMap.has(f.quality)) allFormatsMap.set(f.quality, f); });
    const formats = Array.from(allFormatsMap.values()).sort((a, b) => parseInt(b.quality) - parseInt(a.quality));

    const audioFormat = ytdl.filterFormats(info.formats, 'audioonly').sort((a,b) => b.bitrate - a.bitrate)[0];

    const thumbnails = info.videoDetails.thumbnails;
    const thumbnailUrl = thumbnails[thumbnails.length - 1]?.url;
    return { success: true, videoId: info.videoDetails.videoId, formats, title: info.videoDetails.title, description: info.videoDetails.description, thumbnailUrl, audioSizeFormatted: formatBytes(audioFormat?.contentLength) };
  } catch (error) {
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
    return new Promise((resolve, reject) => {
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
    currentDownloadPath = filePath;

    const downloadPromise = new Promise(async (resolve, reject) => {
        try {
            const info = await ytdl.getInfo(url);
            const format = info.formats.find(f => f.itag == quality);

            const progress = {
                video: { downloaded: 0, total: 1 },
                audio: { downloaded: 0, total: 1 }
            };

            const trackProgress = (stream, streamType) => {
                stream.on("progress", (chunkLength, downloaded, total) => {
                    progress[streamType] = { downloaded, total };
                    const totalDownloaded = progress.video.downloaded + progress.audio.downloaded;
                    const totalSize = progress.video.total + progress.audio.total;
                    const percent = (totalDownloaded / totalSize) * 100;
                    mainWindow.webContents.send("download-progress", { percent, downloaded: totalDownloaded, total: totalSize });
                });
            };

            const audioStream = ytdl(url, { quality: "highestaudio" });
            trackProgress(audioStream, 'audio');

            if (type === 'mp3') {
                progress.video.total = 0;
                // CHANGED 'ffmpeg' to ffmpegPath
                ffmpegProcess = spawn(ffmpegPath, ['-y', '-i', 'pipe:3', '-vn', '-b:a', '192k', filePath], { stdio: ['inherit', 'inherit', 'inherit', 'pipe'] });
                audioStream.pipe(ffmpegProcess.stdio[3]);
            } else {
                const videoStream = ytdl(url, { quality });
                trackProgress(videoStream, 'video');
                if (format && format.hasVideo && format.hasAudio) {
                    progress.audio.total = 0;
                    // CHANGED 'ffmpeg' to ffmpegPath
                    ffmpegProcess = spawn(ffmpegPath, ["-y", "-i", "pipe:3", "-c", "copy", filePath], { stdio: ["inherit", "inherit", "inherit", "pipe"] });
                    videoStream.pipe(ffmpegProcess.stdio[3]);
                } else {
                    // CHANGED 'ffmpeg' to ffmpegPath
                    ffmpegProcess = spawn(ffmpegPath, ['-y', '-i', 'pipe:3', '-i', 'pipe:4', '-c:v', 'copy', '-c:a', 'aac', '-map', '0:v:0', '-map', '1:a:0', filePath], { stdio: ['inherit', 'inherit', 'inherit', 'pipe', 'pipe'] });
                    videoStream.pipe(ffmpegProcess.stdio[3]);
                    audioStream.pipe(ffmpegProcess.stdio[4]);
                }
            }

            ffmpegProcess.on("close", (code) => {
                ffmpegProcess = null;
                currentDownloadPath = null;
                if (code === 0) resolve({ success: true, path: filePath });
                else {
                    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                    resolve({ success: false, error: `Download was canceled.` });
                }
            });
            ffmpegProcess.on("error", (err) => {
                 ffmpegProcess = null;
                 currentDownloadPath = null;
                 if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                 resolve({ success: false, error: `ffmpeg error: ${err.message}` });
            });
        } catch (err) {
            resolve({ success: false, error: err.message });
        }
    });

    return downloadPromise.then((result) => {
        if (result.success) {
            const history = store.get('downloadHistory', []);
            const label = type === 'mp3' ? 'AUDIO' : qualityLabel;
            const newHistoryItem = {
                id: videoId, title, thumbnailUrl, url,
                format: `${label} (${type.toUpperCase()})`,
                path: filePath, timestamp: new Date().toISOString(),
            };
            const updatedHistory = [newHistoryItem, ...history.filter(h => h.id !== videoId || h.path !== filePath)];
            store.set('downloadHistory', updatedHistory);
        }
        return result;
    });
});