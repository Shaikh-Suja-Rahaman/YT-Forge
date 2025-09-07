const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs"); // Make sure fs is required
const https = require("https");
const ytdl = require("@distube/ytdl-core");
const { spawn } = require("child_process");
const ffmpegPath = require('ffmpeg-static');

const _Store = require("electron-store");
const Store = _Store.default || _Store;

const store = new Store();
let mainWindow;
let currentDownloadProcess = null;

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

    let isCancelled = false;
    let activeStreams = [];
    let ffmpegProcess;
    let tempVideoPath = path.join(app.getPath('temp'), `${videoId}_video.tmp`);
    let tempAudioPath = path.join(app.getPath('temp'), `${videoId}_audio.tmp`);

    const cleanup = () => {
        if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
        if (fs.existsSync(tempAudioPath)) fs.unlinkSync(tempAudioPath);
    };

    currentDownloadProcess = {
        cancel: () => {
            isCancelled = true;
            activeStreams.forEach(s => s.destroy());
            if (ffmpegProcess) ffmpegProcess.kill('SIGKILL');
            cleanup();
        }
    };

    const downloadStreamToFile = (streamUrl, downloadPath, streamType, progressState) => {
        return new Promise((resolve, reject) => {
            if (isCancelled) return reject(new Error("Download was canceled."));

            const ytdlOptions = {
                quality: streamType === 'video' ? quality : 'highestaudio',
                highWaterMark: 1 << 26 // 64MB buffer
            };
            const stream = ytdl(streamUrl, ytdlOptions);
            activeStreams.push(stream);
            const fileStream = fs.createWriteStream(downloadPath);

            stream.on('progress', (chunkLength, downloaded, total) => {
                progressState[streamType] = { downloaded, total };
                const totalDownloaded = (progressState.video.downloaded || 0) + (progressState.audio.downloaded || 0);
                const totalSize = (progressState.video.total || 0) + (progressState.audio.total || 0);
                const percent = (totalDownloaded / totalSize) * 100;
                mainWindow.webContents.send("download-progress", { percent, downloaded: totalDownloaded, total: totalSize });
            });

            stream.pipe(fileStream);
            fileStream.on('finish', () => {
                activeStreams = activeStreams.filter(s => s !== stream);
                resolve();
            });
            stream.on('error', (err) => reject(err));
            fileStream.on('error', (err) => reject(err));
        });
    };

    try {
        if (type === 'mp3') {
            const progressState = { audio: { downloaded: 0, total: 1 } };
            await downloadStreamToFile(url, filePath, 'audio', progressState);
        } else {
            const info = await ytdl.getInfo(url);
            const format = info.formats.find(f => f.itag == quality);
            const hasSeparateStreams = format && format.hasVideo && !format.hasAudio;

            if (hasSeparateStreams) {
                const progressState = { video: { downloaded: 0, total: 1 }, audio: { downloaded: 0, total: 1 } };

                await Promise.all([
                    downloadStreamToFile(url, tempVideoPath, 'video', progressState),
                    downloadStreamToFile(url, tempAudioPath, 'audio', progressState)
                ]);

                if (isCancelled) throw new Error("Download was canceled.");

                await new Promise((resolve, reject) => {
                    ffmpegProcess = spawn(ffmpegPath, ['-y', '-i', tempVideoPath, '-i', tempAudioPath, '-c', 'copy', filePath]);
                    ffmpegProcess.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`)));
                    ffmpegProcess.on('error', (err) => reject(err));
                });

            } else { // Combined stream
                const progressState = { video: { downloaded: 0, total: 1 } };
                await downloadStreamToFile(url, filePath, 'video', progressState);
            }
        }

        if (isCancelled) throw new Error("Download was canceled.");

        const history = store.get('downloadHistory', []);
        const label = type === 'mp3' ? 'AUDIO' : qualityLabel;
        const newHistoryItem = {
            id: videoId, title, thumbnailUrl, url,
            format: `${label} (${type.toUpperCase()})`,
            path: filePath, timestamp: new Date().toISOString(),
        };
        const updatedHistory = [newHistoryItem, ...history.filter(h => h.id !== videoId || h.path !== filePath)];
        store.set('downloadHistory', updatedHistory);

        return { success: true, path: filePath };

    } catch (err) {
        if (fs.existsSync(filePath) && !isCancelled) fs.unlinkSync(filePath);
        return { success: false, error: err.message };
    } finally {
        cleanup();
        currentDownloadProcess = null;
    }
});