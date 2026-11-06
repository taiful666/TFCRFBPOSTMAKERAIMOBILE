'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const call = (ch, ...a) => ipcRenderer.invoke(ch, ...a);
contextBridge.exposeInMainWorld('hub', {
  state: () => call('hub:state'),
  live: (force) => call('hub:live', !!force),
  setSub: (s) => ipcRenderer.send('hub:sub', String(s)),
  paperGo: (u) => ipcRenderer.send('hub:paper-go', String(u)),
  paperCmd: (c) => ipcRenderer.send('hub:paper-cmd', String(c)),
  setAdblock: (on) => ipcRenderer.send('hub:adblock', !!on),
  setPick: (on) => ipcRenderer.send('hub:pick', !!on),
  add: (item) => call('hub:add', item),
  remove: (link) => call('hub:remove', String(link)),
  clear: () => call('hub:clear'),
  send: (kind, link) => call('hub:send', String(kind), link ? String(link) : ''),
  onState: (cb) => ipcRenderer.on('hub:state', (e, s) => cb(s)),
  onToast: (cb) => ipcRenderer.on('hub:toast', (e, t) => cb(t))
});
