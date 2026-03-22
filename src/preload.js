const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getVideoInfo: (url) => ipcRenderer.invoke("get-video-info", url),
  downloadVideo: (options) => ipcRenderer.invoke("download-video", options),
  downloadThumbnail: (options) => ipcRenderer.invoke("download-thumbnail", options),
  getHistory: () => ipcRenderer.invoke("get-history"),
  clearHistory: () => ipcRenderer.invoke("clear-history"),
  deleteHistoryItem: (timestamp) => ipcRenderer.invoke("delete-history-item", timestamp),
  openFileLocation: (filePath) => ipcRenderer.invoke("open-file-location", filePath),
  openExternalLink: (url) => ipcRenderer.invoke("open-external-link", url),
  cancelDownload: (options) => ipcRenderer.send("cancel-download", options),
  cancelInfoFetch: () => ipcRenderer.send("cancel-info-fetch"),
  pauseDownload: () => ipcRenderer.send("pause-download"),
  resumeDownload: () => ipcRenderer.send("resume-download"),
  onDownloadProgress: (callback) => {
    // Remove any previous listener before adding a new one to prevent stacking
    ipcRenderer.removeAllListeners('download-progress');
    ipcRenderer.on('download-progress', (_event, value) => callback(value));
  },
  onYtDlpUpdateStatus: (callback) => {
    ipcRenderer.removeAllListeners('ytdlp-update-status');
    ipcRenderer.on('ytdlp-update-status', (_event, value) => callback(value));
  },
  getYtDlpStatus: () => ipcRenderer.invoke('get-ytdlp-status'),
  // App auto-update APIs
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
});
