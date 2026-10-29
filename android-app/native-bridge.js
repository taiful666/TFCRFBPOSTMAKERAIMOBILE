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
      // If the update message is open, Back just closes it.
      if (dialogOpen) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return; }
      // Let the app close any open panel first (same as pressing Esc).
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
      if (e && e.canGoBack) { history.back(); return; }
      var now = Date.now();
      if (now - lastBack < 2000) { App.exitApp(); return; }
      lastBack = now;
      say('বের হতে আবার Back চাপুন');
    });
  }

  /* ---------- "New update available" check ----------
     Every time the app opens (or comes back from the background), it asks
     GitHub which build is on the Releases page. If that build is newer than
     the one installed, it shows a message with an "Update" button that
     downloads the new APK in the phone's browser. */
  var REPO = 'taiful666/TFCRFBPOSTMAKERAIMOBILE';
  var APK_URL = 'https://github.com/' + REPO + '/releases/download/android-latest/TF-FB-Reels-Post-Maker.apk';
  var myBuild = 0, skipped = 0, lastCheck = 0, dialogOpen = false;

  function showUpdate(newBuild) {
    if (dialogOpen || !document.body) return;
    dialogOpen = true;
    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;background:rgba(6,10,24,.62);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:22px;font-family:"Hind Siliguri","Noto Sans Bengali",sans-serif';
    wrap.innerHTML =
      '<div style="background:#fff;color:#111;border-radius:18px;max-width:380px;width:100%;padding:22px 20px 18px;box-shadow:0 20px 50px rgba(0,0,0,.35);text-align:center">' +
        '<div style="font-size:42px;line-height:1">🎉</div>' +
        '<div style="font-size:19px;font-weight:700;margin:10px 0 6px">নতুন আপডেট এসেছে!</div>' +
        '<div style="font-size:14.5px;line-height:1.6;color:#444">TF FB Reels &amp; Post Maker-এর নতুন ভার্সন <b>1.0.' + newBuild + '</b> পাওয়া যাচ্ছে।<br>' +
        '(আপনার ফোনে আছে 1.0.' + myBuild + ')<br><br>' +
        '"আপডেট করুন" চাপলে ফাইল ডাউনলোড হবে। ডাউনলোড শেষে ফাইলটি খুলে <b>Update / ইনস্টল</b> চাপুন — আপনার সব কাজ ও সেটিং থেকে যাবে।</div>' +
        '<button data-a="go" style="margin-top:16px;width:100%;border:0;border-radius:12px;background:#1877F2;color:#fff;font-size:16px;font-weight:700;padding:13px">আপডেট করুন</button>' +
        '<button data-a="later" style="margin-top:8px;width:100%;border:0;border-radius:12px;background:#eef1f6;color:#333;font-size:15px;padding:11px">পরে করবো</button>' +
      '</div>';
    function close() { dialogOpen = false; wrap.remove(); document.removeEventListener('keydown', onKey, true); }
    function onKey(e) { if (e.key === 'Escape') { skipped = newBuild; close(); e.stopImmediatePropagation(); } }
    wrap.addEventListener('click', function (e) {
      var a = e.target && e.target.getAttribute && e.target.getAttribute('data-a');
      if (a === 'go') { close(); say('ডাউনলোড শুরু হচ্ছে…'); window.location.href = APK_URL; }
      else if (a === 'later') { skipped = newBuild; close(); }
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(wrap);
  }

  async function checkUpdate() {
    var now = Date.now();
    if (now - lastCheck < 10 * 60 * 1000) return;   // at most once every 10 minutes
    lastCheck = now;
    try {
      if (!myBuild && App && App.getInfo) myBuild = parseInt((await App.getInfo()).build, 10) || 0;
      if (!myBuild) return;
      var r = await fetch('https://api.github.com/repos/' + REPO + '/releases/tags/android-latest', { cache: 'no-store' });
      if (!r.ok) return;
      var rel = await r.json();
      var m = /build\s+(\d+)/i.exec(String(rel.name || ''));
      var latest = m ? parseInt(m[1], 10) : 0;
      var hasApk = (rel.assets || []).some(function (x) { return /\.apk$/i.test(x.name || ''); });
      if (hasApk && latest > myBuild && latest !== skipped) showUpdate(latest);
    } catch (e) { /* no internet etc. — try again next time */ }
  }

  function startUpdateChecks() {
    setTimeout(checkUpdate, 3000);
    if (App && App.addListener) App.addListener('resume', function () { setTimeout(checkUpdate, 1500); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startUpdateChecks);
  else startUpdateChecks();

  document.documentElement.classList.add('tf-android-app');
})();
