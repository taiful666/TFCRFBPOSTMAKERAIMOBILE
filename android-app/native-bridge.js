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

  /* ---------- Updates, entirely inside the app ----------
     Every time the app opens (or comes back from the background) it asks GitHub which
     build is on the Releases page. If it is newer, a message appears; "আপডেট করুন" downloads
     the new APK inside the app in the background (progress shown at the bottom, you can keep
     working), checks it (same app, newer, SHA-256), then opens Android's own Update screen.
     The very first time Android asks once to "Allow from this source" — the app opens that
     screen by itself and carries on when you come back. If the in-app download keeps failing,
     a fallback link is offered so an update is never stuck. */
  var REPO = 'taiful666/TFCRFBPOSTMAKERAIMOBILE';
  var APK_URL = 'https://github.com/' + REPO + '/releases/download/android-latest/TF-FB-Reels-Post-Maker.apk';
  var Up = (C.isPluginAvailable && !C.isPluginAvailable('TFUpdater')) ? null : plug('TFUpdater');
  var hasUp = function () { return !!Up; };
  var myBuild = 0, skipped = 0, lastCheck = 0, dialogOpen = false, rel = null, upBusy = false, fails = 0;
  var FONT = 'font-family:"Hind Siliguri","Noto Sans Bengali",sans-serif';

  function dialog(html, onAct) {
    if (dialogOpen || !document.body) return null;
    dialogOpen = true;
    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;background:rgba(6,10,24,.62);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:22px;' + FONT;
    wrap.innerHTML = '<div style="background:#fff;color:#111;border-radius:18px;max-width:380px;width:100%;padding:22px 20px 18px;box-shadow:0 20px 50px rgba(0,0,0,.35);text-align:center">' + html + '</div>';
    function close() { dialogOpen = false; wrap.remove(); document.removeEventListener('keydown', onKey, true); }
    function onKey(e) { if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); onAct('esc'); } }
    wrap.addEventListener('click', function (e) {
      var a = e.target && e.target.closest && e.target.closest('[data-a]');
      if (a) { close(); onAct(a.getAttribute('data-a')); }
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(wrap);
    return wrap;
  }
  var BTN = 'margin-top:16px;width:100%;border:0;border-radius:12px;background:#1877F2;color:#fff;font-size:16px;font-weight:700;padding:13px;' + FONT;
  var BTN2 = 'margin-top:8px;width:100%;border:0;border-radius:12px;background:#eef1f6;color:#333;font-size:15px;padding:11px;' + FONT;
  var TXT = 'font-size:14.5px;line-height:1.6;color:#444';

  /* small bar at the bottom while the update downloads — the app stays usable */
  var pill = null, pillT = 0;
  function pillShow(text, pct, tone) {
    if (!document.body) return;
    clearTimeout(pillT);
    if (!pill) {
      pill = document.createElement('div');
      pill.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(14px + env(safe-area-inset-bottom));z-index:2147483646;background:rgba(17,20,28,.95);color:#fff;border-radius:14px;padding:11px 14px 12px;box-shadow:0 8px 26px rgba(0,0,0,.35);' + FONT + ';font-size:14px;line-height:1.4;pointer-events:none';
      pill.innerHTML = '<div data-t></div><div data-w style="height:6px;border-radius:3px;background:rgba(255,255,255,.18);margin-top:8px;overflow:hidden"><i data-b style="display:block;height:100%;width:0;background:#1877F2;border-radius:3px;transition:width .25s"></i></div>';
      document.body.appendChild(pill);
    }
    pill.querySelector('[data-t]').textContent = text;
    var bar = pill.querySelector('[data-b]');
    bar.style.width = (pct == null || pct === false ? 100 : Math.max(3, Math.min(100, pct))) + '%';
    bar.style.background = tone === 'ok' ? '#1e8e3e' : tone === 'bad' ? '#d93025' : '#1877F2';
    pill.querySelector('[data-w]').style.display = pct === false ? 'none' : '';
  }
  function pillHide(ms) { clearTimeout(pillT); pillT = setTimeout(function () { if (pill) { pill.remove(); pill = null; } }, ms || 0); }
  function mb(n) { return (n / 1048576).toFixed(1); }
  var INSTALLING = 'ইনস্টল হচ্ছে — Android-এর স্ক্রিনে "আপডেট / Update" চাপুন';

  if (Up && Up.addListener) {
    Up.addListener('updateProgress', function (p) {
      var pct = p.total > 0 ? Math.round(p.received * 100 / p.total) : null;
      pillShow('নতুন আপডেট নামছে… ' + (pct != null ? pct + '% (' + mb(p.received) + ' / ' + mb(p.total) + ' MB)' : mb(p.received) + ' MB') + ' — অ্যাপ চালাতে থাকুন', pct);
    });
    Up.addListener('updateState', function (s) {
      upBusy = false;
      if (s.state === 'installing') { pillShow(INSTALLING, null, 'ok'); pillHide(7000); }
      else if (s.state === 'denied') { pillHide(); askPermission(true); }
      else { pillShow('ইনস্টল শুরু করা যায়নি — আবার "আপডেট করুন" চাপুন', false, 'bad'); pillHide(5000); }
    });
  }

  function askPermission(again) {
    dialog(
      '<div style="font-size:40px;line-height:1">🔐</div>' +
      '<div style="font-size:18px;font-weight:700;margin:10px 0 6px">' + (again ? 'অনুমতিটি এখনো চালু হয়নি' : 'শুধু একবার অনুমতি দিন') + '</div>' +
      '<div style="' + TXT + '">অ্যাপ নিজেই আপডেট বসাতে Android শুধু প্রথমবার একটি অনুমতি চায়। পরের স্ক্রিনে <b>"Allow from this source / এই উৎস থেকে অনুমতি দিন"</b> চালু করে <b>Back</b> চাপুন — আপডেট নিজেই শুরু হবে। পরের আপডেটগুলোতে আর লাগবে না।</div>' +
      '<button data-a="go" style="' + BTN + '">ঠিক আছে, চালু করি</button><button data-a="later" style="' + BTN2 + '">পরে</button>',
      function (a) { if (a === 'go') doInstall(true); else { upBusy = false; pillHide(); } }
    );
  }

  async function doInstall(afterAsk) {
    try {
      var inf = await Up.info();
      if (!inf.canInstall && !afterAsk) { pillHide(); askPermission(false); return; }
      upBusy = true;
      var r = await Up.install();
      if (r.status === 'installing') { upBusy = false; pillShow(INSTALLING, null, 'ok'); pillHide(7000); }
      else if (r.status === 'permission') pillShow('"Allow from this source" চালু করে Back চাপুন — বাকিটা নিজেই হবে', false);
    } catch (e) {
      upBusy = false; pillShow('ইনস্টল শুরু করা যায়নি — আবার "আপডেট করুন" চাপুন', false, 'bad'); pillHide(5000);
    }
  }

  async function startUpdate(build) {
    if (upBusy) { say('আপডেট আগেই নামছে…'); return; }
    if (!Up) { say('ডাউনলোড শুরু হচ্ছে…'); window.location.href = APK_URL; return; }   // only the older app builds come here
    upBusy = true;
    pillShow('নতুন আপডেট নামানো শুরু হচ্ছে…', 2);
    var asset = rel && (rel.assets || []).filter(function (x) { return /\.apk$/i.test(x.name || ''); })[0];
    var urls = [asset && asset.browser_download_url, APK_URL].filter(function (u, i, a) { return u && a.indexOf(u) === i; });
    var m = /SHA256:\s*([a-f0-9]{64})/i.exec(String((rel && rel.body) || ''));
    var sum = m ? m[1].toLowerCase() : '';
    for (var n = 0; n < 3; n++) {
      try {
        var r = await Up.download({ url: urls[n % urls.length], sha256: sum, build: build });
        fails = 0;
        pillShow(r.cached ? 'আপডেট আগেই নামানো আছে — ইনস্টল হচ্ছে…' : 'নামানো শেষ ✓ — ইনস্টল হচ্ছে…', 100, 'ok');
        upBusy = false;
        await doInstall(false);
        return;
      } catch (e) {
        var msg = String((e && e.message) || e);
        if (/busy/.test(msg)) { return; }
        if (/not newer/.test(msg)) { upBusy = false; pillShow('আপনার অ্যাপ এখনই সর্বশেষ ভার্সনে আছে ✓', false, 'ok'); pillHide(3500); return; }
        if (n < 2) { pillShow('নেটে সমস্যা — আবার চেষ্টা করছি (' + (n + 2) + '/3)…', 2); await new Promise(function (res) { setTimeout(res, 2500 * (n + 1)); }); }
      }
    }
    upBusy = false; fails++;
    pillHide();
    dialog(
      '<div style="font-size:40px;line-height:1">📶</div><div style="font-size:18px;font-weight:700;margin:10px 0 6px">আপডেট নামানো যায়নি</div>' +
      '<div style="' + TXT + '">ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।' + (fails >= 2 ? ' তাতেও না হলে বিকল্প পথে ফাইলটি নামাতে পারেন।' : '') + '</div>' +
      '<button data-a="retry" style="' + BTN + '">আবার চেষ্টা করুন</button>' +
      (fails >= 2 ? '<button data-a="link" style="' + BTN2 + '">বিকল্প পথে নামান</button>' : '') +
      '<button data-a="later" style="' + BTN2 + '">পরে</button>',
      function (a) { if (a === 'retry') startUpdate(build); else if (a === 'link') window.location.href = APK_URL; }
    );
  }

  function showUpdate(newBuild, ready) {
    dialog(
      '<div style="font-size:42px;line-height:1">🎉</div>' +
      '<div style="font-size:19px;font-weight:700;margin:10px 0 6px">নতুন আপডেট এসেছে!</div>' +
      '<div style="' + TXT + '">TF FB Reels &amp; Post Maker-এর নতুন ভার্সন <b>1.0.' + newBuild + '</b> পাওয়া যাচ্ছে।<br>' +
      '(আপনার ফোনে আছে 1.0.' + myBuild + ')<br><br>' +
      (!Up ? '"আপডেট করুন" চাপলে ফাইল ডাউনলোড হবে। ডাউনলোড শেষে ফাইলটি খুলে <b>Update / ইনস্টল</b> চাপুন। এরপর থেকে আপডেট অ্যাপের ভেতরেই হবে।'
        : ready ? 'আপডেট আগেই নামানো আছে — চাপ দিলেই ইনস্টল শুরু হবে।'
        : '"আপডেট করুন" চাপলে অ্যাপের ভেতরেই নামতে থাকবে — আপনি কাজ চালিয়ে যেতে পারবেন। শেষ হলে নিজেই ইনস্টল শুরু হবে।') +
      ' আপনার সব কাজ ও সেটিং থেকে যাবে।</div>' +
      '<button data-a="go" style="' + BTN + '">আপডেট করুন</button>' +
      '<button data-a="later" style="' + BTN2 + '">পরে করবো</button>',
      function (a) { if (a === 'go') startUpdate(newBuild); else skipped = newBuild; }
    );
  }

  async function checkUpdate() {
    var now = Date.now();
    if (upBusy || now - lastCheck < 10 * 60 * 1000) return;   // at most once every 10 minutes
    lastCheck = now;
    try {
      if (!myBuild && App && App.getInfo) myBuild = parseInt((await App.getInfo()).build, 10) || 0;
      if (!myBuild) return;
      var ready = -1;
      if (Up) { try { ready = (await Up.info()).readyVersion; } catch (e) {} }    // also deletes a finished update file
      var r = await fetch('https://api.github.com/repos/' + REPO + '/releases/tags/android-latest', { cache: 'no-store' });
      if (!r.ok) return;
      rel = await r.json();
      var m = /build\s+(\d+)/i.exec(String(rel.name || ''));
      var latest = m ? parseInt(m[1], 10) : 0;
      var hasApk = (rel.assets || []).some(function (x) { return /\.apk$/i.test(x.name || ''); });
      if (hasApk && latest > myBuild && latest !== skipped) showUpdate(latest, ready >= latest);
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
