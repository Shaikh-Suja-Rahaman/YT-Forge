// main.js - This is your backend (Node.js environment)

const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const https = require("https");
const ytdl = require("@distube/ytdl-core");
const { spawn } = require("child_process");

// Fix for ESM/CJS interop issues with bundlers like Vite
const _Store = require("electron-store");
const Store = _Store.default || _Store;

const store = new Store();
let mainWindow;

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
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// --- IPC Handlers (History, Info, Thumbnail) ---
// These functions are correct and remain unchanged.
ipcMain.handle("get-history", () => store.get('downloadHistory', []));
ipcMain.handle("clear-history", () => store.set('downloadHistory', []));
ipcMain.handle("open-file-location", (event, filePath) => shell.showItemInFolder(filePath));
ipcMain.handle("get-video-info", async (event, url) => {
  try {
    if (!ytdl.validateURL(url)) throw new Error("Invalid YouTube URL");
    const info = await ytdl.getInfo(url);
    const videoFormats = ytdl.filterFormats(info.formats, 'videoonly').filter(f => f.container === 'mp4' && f.qualityLabel).map(f => ({ itag: f.itag, quality: f.qualityLabel }));
    const combinedFormats = info.formats.filter(f => f.hasVideo && f.hasAudio && f.container === 'mp4' && f.qualityLabel).map(f => ({ itag: f.itag, quality: f.qualityLabel }));
    const allFormatsMap = new Map();
    [...combinedFormats, ...videoFormats].forEach(f => { if (!allFormatsMap.has(f.quality)) allFormatsMap.set(f.quality, f); });
    const formats = Array.from(allFormatsMap.values()).sort((a, b) => parseInt(b.quality) - parseInt(a.quality));
    const thumbnails = info.videoDetails.thumbnails;
    const thumbnailUrl = thumbnails[thumbnails.length - 1]?.url;
    return { success: true, videoId: info.videoDetails.videoId, formats, title: info.videoDetails.title, description: info.videoDetails.description, thumbnailUrl };
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
            if (response.statusCode !== 200) { fs.unlink(filePath, () => {}); reject({ success: false, error: `Download failed. Status: ${response.statusCode}` }); return; }
            response.pipe(fileStream);
        });
        fileStream.on('finish', () => fileStream.close(() => resolve({ success: true, path: filePath })));
        request.on('error', (err) => { fs.unlink(filePath, () => {}); reject({ success: false, error: err.message }); });
    });
});


// --- CORRECTED IPC Handler to Download Video ---
ipcMain.handle("download-video", async (event, { videoId, url, quality, qualityLabel, type, title, thumbnailUrl }) => {
    const safeTitle = title.replace(/[\\/:"*?<>|]/g, '');
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: `Save ${type.toUpperCase()}`,
        defaultPath: `${safeTitle}.${type}`,
        buttonLabel: "Save",
        filters: type === 'mp4' ? [{ name: "MPEG-4 Video", extensions: ["mp4"] }] : [{ name: "MP3 Audio", extensions: ["mp3"] }],
    });

    if (canceled || !filePath) return { success: false, error: "Save dialog was canceled." };

    const downloadPromise = new Promise(async (resolve, reject) => {
        try {
            const info = await ytdl.getInfo(url);
            const format = info.formats.find(f => f.itag == quality);
            let ffmpeg;

            const audioStream = ytdl(url, { quality: "highestaudio" });

            if (type === 'mp3') {
                trackProgress(audioStream, 'audio'); // This call now works
                ffmpeg = spawn('ffmpeg', ['-y', '-i', 'pipe:3', '-vn', '-b:a', '192k', filePath], { stdio: ['inherit', 'inherit', 'inherit', 'pipe'] });
                audioStream.pipe(ffmpeg.stdio[3]);
            } else {
                const videoStream = ytdl(url, { quality });
                trackProgress(videoStream, 'video'); // This call now works

                if (format && format.hasVideo && format.hasAudio) {
                    ffmpeg = spawn("ffmpeg", ["-y", "-i", "pipe:3", "-c", "copy", filePath], { stdio: ["inherit", "inherit", "inherit", "pipe"] });
                    videoStream.pipe(ffmpeg.stdio[3]);
                } else {
                    trackProgress(audioStream, 'audio'); // Track audio separately in merge
                    ffmpeg = spawn('ffmpeg', ['-y', '-i', 'pipe:3', '-i', 'pipe:4', '-c:v', 'copy', '-c:a', 'aac', '-map', '0:v:0', '-map', '1:a:0', filePath], { stdio: ['inherit', 'inherit', 'inherit', 'pipe', 'pipe'] });
                    videoStream.pipe(ffmpeg.stdio[3]);
                    audioStream.pipe(ffmpeg.stdio[4]);
                }
            }
            ffmpeg.on("close", (code) => {
                if (code === 0) resolve({ success: true, path: filePath });
                else reject({ success: false, error: `ffmpeg exited with code: ${code}` });
            });
            ffmpeg.on("error", (err) => reject({ success: false, error: `ffmpeg error: ${err.message}` }));
        } catch (err) {
            reject({ success: false, error: err.message });
        }
    });

    return downloadPromise.then((result) => {
        if (result.success) {
            const history = store.get('downloadHistory', []);
            const label = type === 'mp3' ? 'AUDIO' : qualityLabel;
            const newHistoryItem = {
                id: videoId, title, thumbnailUrl,
                format: `${label} (${type.toUpperCase()})`,
                path: filePath, timestamp: new Date().toISOString(),
            };
            const updatedHistory = [newHistoryItem, ...history.filter(h => h.id !== videoId || h.path !== filePath)];
            store.set('downloadHistory', updatedHistory);
        }
        return result;
    });
});

// --- THIS FUNCTION WAS MISSING ---
// Helper function to send download progress back to the renderer process.
const trackProgress = (stream, type) => {
  let totalProgress = { video: 0, audio: 0 };
  stream.on("progress", (chunkLength, downloaded, total) => {
    const percent = (downloaded / total) * 100;
    // For merges, we can average the progress. For single streams, it's direct.
    totalProgress[type] = percent;
    const overallPercent = (totalProgress.video + totalProgress.audio) / (totalProgress.audio > 0 ? 2 : 1);
    mainWindow.webContents.send("download-progress", { type, percent: overallPercent.toFixed(2) });
  });
};
