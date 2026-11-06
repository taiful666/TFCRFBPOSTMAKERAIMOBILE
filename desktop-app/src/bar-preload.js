'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('tf', {
  switchTab: (t) => ipcRenderer.send('tf:switch', String(t)),
  showFile: (p) => ipcRenderer.send('tf:show-file', String(p)),
  onState: (cb) => ipcRenderer.on('tf:state', (e, s) => cb(s)),
  onToast: (cb) => ipcRenderer.on('tf:toast', (e, t) => cb(t))
});
