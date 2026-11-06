'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('tf', {
  switchTab: (t) => ipcRenderer.send('tf:switch', String(t)),
  paperGo: (u) => ipcRenderer.send('tf:paper-go', String(u)),
  paperCmd: (c) => ipcRenderer.send('tf:paper-cmd', String(c)),
  setPick: (on) => ipcRenderer.send('tf:pick-mode', !!on),
  setTarget: (t) => ipcRenderer.send('tf:pick-target', String(t)),
  showFile: (p) => ipcRenderer.send('tf:show-file', String(p)),
  onState: (cb) => ipcRenderer.on('tf:state', (e, s) => cb(s)),
  onToast: (cb) => ipcRenderer.on('tf:toast', (e, t) => cb(t))
});
