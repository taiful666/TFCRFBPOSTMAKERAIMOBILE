'use strict';
// Runs inside TF News Studio / TF Post Maker.
//  - images from other websites stay usable on the canvas (keeps video/card export working)
//  - gives the page one safe door to the shell: open the mother "খবর" tab
const { webFrame, contextBridge, ipcRenderer } = require('electron');
// ---- shared, persistent API keys (one encrypted store for both apps; see main.js) ----
const APP = (() => { try { return location.hostname; } catch (e) { return ''; } })();
const KEYMAP = APP === 'news' ? { gemini: ['tfx_gkey', 0], claude: ['tfx_ckey', 0], cartesia: ['tfx_cartkey', 0] }
  : APP === 'post' ? { gemini: ['tfcr_gkey', 1], claude: ['tfcr_ckey', 1] } : {};
const readK = (k, json) => {
  let v = ''; try { v = localStorage.getItem(k) || sessionStorage.getItem(k) || ''; } catch (e) {}
  if (json && v) { try { v = JSON.parse(v); } catch (e) {} }
  return typeof v === 'string' ? v.trim() : '';
};
const writeK = (k, json, v) => {
  try { sessionStorage.removeItem(k); if (v) localStorage.setItem(k, json ? JSON.stringify(v) : v); else if (json) localStorage.setItem(k, '""'); else localStorage.removeItem(k); } catch (e) {}
};
const last = {};
try {
  const vault = ipcRenderer.sendSync('keys:get') || { v: {}, seen: {} };
  for (const [name, [k, json]] of Object.entries(KEYMAP)) {
    const cur = readK(k, json), want = vault.v[name] || '';
    if (vault.seen[name]) { if (cur !== want) writeK(k, json, want); last[name] = want; }
    else if (cur) { ipcRenderer.send('keys:set', name, cur); last[name] = cur; if (!json) writeK(k, json, cur); }
    else last[name] = '';
  }
} catch (e) {}
setInterval(() => {   // a key saved, changed or removed inside the app → into the shared store (also fixes keys kept only "for this session")
  for (const [name, [k, json]] of Object.entries(KEYMAP)) {
    const cur = readK(k, json);
    if (cur !== last[name]) { last[name] = cur; ipcRenderer.send('keys:set', name, cur); if (cur && !json) { try { if (!localStorage.getItem(k)) writeK(k, json, cur); } catch (e) {} } }
  }
}, 1200);
ipcRenderer.on('keys:changed', (e, name, v) => { const m = KEYMAP[name]; if (!m) return; last[name] = v || ''; writeK(m[0], m[1], v || ''); });
// News Studio: the shell's home screen chooses the video size, so the app does not ask again on open
if (APP === 'news') { try { sessionStorage.setItem('tf13asked', '1'); } catch (e) {} }
// Post maker: dark look by default, to match the rest of the studio (the user can still switch it)
if (APP === 'post') { try { if (localStorage.getItem('tfcr_theme') === null) localStorage.setItem('tfcr_theme', '"dark"'); } catch (e) {} }

contextBridge.exposeInMainWorld('tfShell', {
  openHub: () => ipcRenderer.send('tf:switch', 'hub'),
  openHome: () => ipcRenderer.send('tf:switch', 'home'),
  pendingVoice: () => ipcRenderer.invoke('news:pending-voice'),
  saveProject: () => ipcRenderer.invoke('news:save'),
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
