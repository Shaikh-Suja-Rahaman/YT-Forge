const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getVideoInfo: (url) => ipcRenderer.invoke("get-video-info", url),
  downloadVideo: (options) => ipcRenderer.invoke("download-video", options),
  downloadThumbnail: (options) => ipcRenderer.invoke("download-thumbnail", options),
  getHistory: () => ipcRenderer.invoke("get-history"),
  clearHistory: () => ipcRenderer.invoke("clear-history"),
  openFileLocation: (filePath) => ipcRenderer.invoke("open-file-location", filePath),
  openExternalLink: (url) => ipcRenderer.invoke("open-external-link", url),
  cancelDownload: () => ipcRenderer.send("cancel-download"),
  onDownloadProgress: (callback) => ipcRenderer.on("download-progress", (_event, value) => callback(value)),
});
