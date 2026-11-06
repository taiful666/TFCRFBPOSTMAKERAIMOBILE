'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('home', {
  state: () => ipcRenderer.invoke('home:state'),
  create: (kind) => ipcRenderer.invoke('home:new', String(kind)),
  open: (id) => ipcRenderer.invoke('home:open', String(id)),
  remove: (id) => ipcRenderer.invoke('home:remove', String(id)),
  rename: (id, name) => ipcRenderer.invoke('home:rename', String(id), String(name)),
  importFile: () => ipcRenderer.invoke('home:import'),
  onState: (cb) => ipcRenderer.on('home:state', (e, s) => cb(s))
});
