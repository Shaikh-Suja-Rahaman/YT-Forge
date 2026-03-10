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
  cancelDownload: () => ipcRenderer.send("cancel-download"),
  onDownloadProgress: (callback) => {
    // Remove any previous listener before adding a new one to prevent stacking
    ipcRenderer.removeAllListeners('download-progress');
    ipcRenderer.on('download-progress', (_event, value) => callback(value));
  },
});
