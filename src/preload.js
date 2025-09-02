// preload.js - This script is the secure bridge between the renderer and main process.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Video functions
  getVideoInfo: (url) => ipcRenderer.invoke("get-video-info", url),
  downloadVideo: (options) => ipcRenderer.invoke("download-video", options),
  downloadThumbnail: (options) => ipcRenderer.invoke("download-thumbnail", options),
  onDownloadProgress: (callback) => {
    ipcRenderer.on("download-progress", (_event, value) => callback(value));
  },

  // History functions
  getHistory: () => ipcRenderer.invoke("get-history"),
  clearHistory: () => ipcRenderer.invoke("clear-history"),
  openFileLocation: (filePath) => ipcRenderer.invoke("open-file-location", filePath),
});