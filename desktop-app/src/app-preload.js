'use strict';
// Runs inside TF News Studio / TF Post Maker.
//  - images from other websites stay usable on the canvas (keeps video/card export working)
//  - gives the page one safe door to the shell: open the mother "খবর" tab
const { webFrame, contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('tfShell', {
  openHub: () => ipcRenderer.send('tf:switch', 'hub'),
  render: {
    available: () => ipcRenderer.invoke('render:available'),
    start: (o) => ipcRenderer.invoke('render:start', o),
    frame: (b) => ipcRenderer.invoke('render:frame', b),
    finish: (o) => ipcRenderer.invoke('render:finish', o),
    cancel: () => ipcRenderer.invoke('render:cancel')
  }
});
webFrame.executeJavaScript('(' + function () {
  try {
    var d = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    var need = function (v, img) {
      try { var u = new URL(v, location.href); return (u.protocol === 'http:' || u.protocol === 'https:') && !img.crossOrigin; } catch (e) { return false; }
    };
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      configurable: true, enumerable: d.enumerable, get: d.get,
      set: function (v) { if (need(v, this)) this.crossOrigin = 'anonymous'; d.set.call(this, v); }
    });
    var sa = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (n, v) {
      if (this instanceof HTMLImageElement && String(n).toLowerCase() === 'src' && need(v, this)) this.crossOrigin = 'anonymous';
      return sa.call(this, n, v);
    };
  } catch (e) {}
}.toString() + ')()');
