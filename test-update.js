const { ipcRenderer } = require('electron');

console.log("Mocking 'update available'...");
ipcRenderer.emit('app-update-status', null, { status: 'available', version: '1.0.1' });

setTimeout(() => {
  console.log("Mocking 'downloading' 25%...");
  ipcRenderer.emit('app-update-status', null, { status: 'downloading', percent: 25 });
}, 3000);

setTimeout(() => {
  console.log("Mocking 'downloading' 65%...");
  ipcRenderer.emit('app-update-status', null, { status: 'downloading', percent: 65 });
}, 5000);

setTimeout(() => {
  console.log("Mocking 'downloading' 90%...");
  ipcRenderer.emit('app-update-status', null, { status: 'downloading', percent: 90 });
}, 7000);

setTimeout(() => {
  console.log("Mocking 'downloaded'...");
  ipcRenderer.emit('app-update-status', null, { status: 'downloaded' });
}, 9000);
