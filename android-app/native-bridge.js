/* TF FB Reels & Post Maker — Android bridge.
   Loaded first inside the Android app only. Makes the web app's
   save / share / back-button behave like a real phone app.
   In a normal browser it does nothing. */
(function () {
  'use strict';
  var C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;

  function plug(name) {
    return (C.Plugins && C.Plugins[name]) || (C.registerPlugin && C.registerPlugin(name));
  }
  var FS = plug('Filesystem'), Share = plug('Share'), App = plug('App');
  var FOLDER = 'TF FB Reels and Post Maker';

  function say(msg) {
    try { if (typeof window.toast === 'function') { window.toast(msg); return; } } catch (e) {}
    var d = document.createElement('div');
    d.textContent = msg;
    d.style.cssText = 'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:rgba(20,24,40,.92);color:#fff;padding:10px 16px;border-radius:12px;font:14px/1.4 sans-serif;z-index:2147483647;max-width:86vw;text-align:center';
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 2200);
  }

  function blobToB64(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result).split(',')[1] || ''); };
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
  }
  function cleanName(n) { return String(n || 'file').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120); }
  function stamp(n) {
    var i = n.lastIndexOf('.'), t = new Date().toISOString().replace(/\D/g, '').slice(2, 14);
    return i > 0 ? n.slice(0, i) + '_' + t + n.slice(i) : n + '_' + t;
  }

  async function toCache(blob, name) {
    var r = await FS.writeFile({ path: 'share/' + cleanName(name), data: await blobToB64(blob), directory: 'CACHE', recursive: true });
    return r.uri;
  }

  /* ---------- Share (replaces the browser's navigator.share) ---------- */
  async function nativeShare(data) {
    data = data || {};
    var files = [];
    for (var i = 0; i < (data.files || []).length; i++) {
      var f = data.files[i];
      files.push(await toCache(f, f.name || ('file' + i)));
    }
    var opts = { dialogTitle: 'শেয়ার করুন' };
    if (data.title) opts.title = data.title;
    if (data.text) opts.text = data.text;
    if (data.url) opts.url = data.url;
    if (files.length) opts.files = files;
    try { await Share.share(opts); }
    catch (e) {
      var m = String((e && e.message) || e);
      if (/cancel/i.test(m)) throw new DOMException('Share canceled', 'AbortError');
      throw e;
    }
  }
  try {
    Object.defineProperty(Navigator.prototype, 'share', { configurable: true, writable: true, value: nativeShare });
    Object.defineProperty(Navigator.prototype, 'canShare', { configurable: true, writable: true, value: function (d) { return !!d; } });
  } catch (e) {}

  /* ---------- Save files (replaces <a download>) ---------- */
  async function saveBlob(blob, name) {
    name = stamp(cleanName(name));
    var media = /^(image|video)\//.test(blob.type) || /\.(png|jpe?g|webp|gif|mp4|webm)$/i.test(name);
    var path = (media ? 'Pictures/' : 'Download/') + FOLDER + '/' + name;
    try {
      await FS.writeFile({ path: path, data: await blobToB64(blob), directory: 'EXTERNAL_STORAGE', recursive: true });
      say('সেভ হয়েছে: ' + path);
    } catch (e) {
      // If the phone does not allow saving there, open the share sheet instead (Save to Drive / Files, etc.)
      try { await Share.share({ title: name, files: [await toCache(blob, name)], dialogTitle: 'ফাইল সেভ / শেয়ার' }); }
      catch (e2) { if (!/cancel/i.test(String(e2 && e2.message))) say('সেভ করা যায়নি'); }
    }
  }
  async function handleDownload(a) {
    try {
      var blob = await (await fetch(a.href)).blob();
      await saveBlob(blob, a.getAttribute('download') || 'file');
    } catch (e) { say('সেভ করা যায়নি'); }
  }
  function isFileLink(a) {
    return a && a.hasAttribute && a.hasAttribute('download') && /^(blob:|data:)/.test(a.href || '');
  }
  var origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (isFileLink(this)) { handleDownload(this); return; }
    return origClick.apply(this, arguments);
  };
  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest && ev.target.closest('a[download]');
    if (isFileLink(a)) { ev.preventDefault(); handleDownload(a); }
  }, true);

  /* ---------- No service worker inside the app (files are already on the phone) ---------- */
  try {
    if (navigator.serviceWorker) {
      navigator.serviceWorker.register = function () { return Promise.resolve({ unregister: function () { return Promise.resolve(true); } }); };
    }
  } catch (e) {}

  /* ---------- Phone back button ---------- */
  var lastBack = 0;
  if (App && App.addListener) {
    App.addListener('backButton', function (e) {
      // Let the app close any open panel first (same as pressing Esc).
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
      if (e && e.canGoBack) { history.back(); return; }
      var now = Date.now();
      if (now - lastBack < 2000) { App.exitApp(); return; }
      lastBack = now;
      say('বের হতে আবার Back চাপুন');
    });
  }

  document.documentElement.classList.add('tf-android-app');
})();
