'use strict';
/* TF Media Studio — main process.
   Runs TF News Studio, TF FB Reels & Post Maker and a newspaper browser in one window.
   Security: contextIsolation + sandbox on, no node in pages, apps served only from the
   bundled folder (tfapp://), pages cannot open other windows, all permissions denied
   except what the two apps need, cookies are never sent from the app pages. */

const { app, BaseWindow, WebContentsView, session, protocol, net, ipcMain, shell, Menu, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const SELFTEST = process.env.TF_SELFTEST === '1';
const APPS_DIR = path.join(__dirname, '..', 'apps');
const BAR_H1 = 56;          // tab bar
const BAR_H2 = 100;         // tab bar + newspaper row
const MAX_IMG = 30 * 1024 * 1024;

const TABS = ['news', 'post', 'paper'];
const PARTS = { news: 'persist:tf-news', post: 'persist:tf-post', paper: 'persist:tf-paper', bar: 'tf-bar' };
const INPUT_ID = { post: 'cardFile', news: 'galFiles' };

const PAPERS = [
  ['প্রথম আলো', 'https://www.prothomalo.com/'], ['কালবেলা', 'https://www.kalbela.com/'],
  ['যুগান্তর', 'https://www.jugantor.com/'], ['কালের কণ্ঠ', 'https://www.kalerkantho.com/'],
  ['সমকাল', 'https://samakal.com/'], ['ইত্তেফাক', 'https://www.ittefaq.com.bd/'],
  ['বাংলাদেশ প্রতিদিন', 'https://www.bd-pratidin.com/'], ['নয়া দিগন্ত', 'https://www.dailynayadiganta.com/'],
  ['আজকের পত্রিকা', 'https://www.ajkerpatrika.com/'], ['দেশ রূপান্তর', 'https://www.deshrupantor.com/'],
  ['বিডিনিউজ২৪', 'https://bangla.bdnews24.com/'], ['ঢাকা পোস্ট', 'https://www.dhakapost.com/'],
  ['জাগো নিউজ', 'https://www.jagonews24.com/'], ['বাংলানিউজ২৪', 'https://www.banglanews24.com/'],
  ['রাইজিংবিডি', 'https://www.risingbd.com/'], ['বাংলা ট্রিবিউন', 'https://www.banglatribune.com/'],
  ['যমুনা টিভি', 'https://jamuna.tv/'], ['সময় টিভি', 'https://www.somoynews.tv/'],
  ['আরটিভি', 'https://www.rtvonline.com/'], ['এনটিভি', 'https://www.ntvbd.com/'],
  ['চ্যানেল ২৪', 'https://www.channel24bd.tv/'], ['একাত্তর টিভি', 'https://ekattor.tv/'],
  ['ডেইলি স্টার', 'https://www.thedailystar.net/'], ['প্রথম আলো (ইংরেজি)', 'https://en.prothomalo.com/']
];

let win = null;
const views = {};
let activeTab = 'news';
let paperPicking = false;
let pickTarget = 'post';
let barH = BAR_H1;
let toastTimer = null;
const loaded = {};

/* ---------- helpers ---------- */
function isHttpUrl(u) { try { const p = new URL(u); return p.protocol === 'http:' || p.protocol === 'https:'; } catch (e) { return false; } }
function isBlockedHost(host) {
  host = String(host || '').toLowerCase();
  if (SELFTEST && host === '127.0.0.1') return false; // build checks only
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (host === '[::1]' || host.startsWith('[fe80') || host.startsWith('[fc') || host.startsWith('[fd')) return true;
  const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const a = +m[1], b = +m[2];
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return true;
  }
  return false;
}
function stateOf() {
  const pv = views.paper && views.paper.webContents;
  return {
    tab: activeTab, picking: paperPicking, target: pickTarget,
    url: pv && !pv.isDestroyed() ? pv.getURL() : '',
    canBack: !!(pv && !pv.isDestroyed() && pv.navigationHistory.canGoBack()),
    canFwd: !!(pv && !pv.isDestroyed() && pv.navigationHistory.canGoForward()),
    papers: PAPERS
  };
}
function pushState() { if (views.bar && !views.bar.webContents.isDestroyed()) views.bar.webContents.send('tf:state', stateOf()); }
function say(msg, extra) {
  if (!views.bar || views.bar.webContents.isDestroyed()) return;
  views.bar.webContents.send('tf:toast', Object.assign({ msg }, extra || {}));
  clearTimeout(toastTimer);
}
function layout() {
  if (!win) return;
  const [w, h] = win.getContentSize();
  views.bar.setBounds({ x: 0, y: 0, width: w, height: barH });
  for (const t of TABS) views[t].setBounds({ x: 0, y: barH, width: w, height: Math.max(0, h - barH) });
}
function showTab(tab) {
  if (!TABS.includes(tab)) return;
  activeTab = tab;
  if (!loaded[tab]) {
    loaded[tab] = true;
    if (tab === 'paper') views.paper.webContents.loadURL(PAPERS[0][1]);
    else views[tab].webContents.loadURL('tfapp://' + tab + '/index.html');
  }
  for (const t of TABS) views[t].setVisible(t === tab);
  barH = tab === 'paper' ? BAR_H2 : BAR_H1;
  layout();
  views[tab].webContents.focus();
  if (tab !== 'paper' && paperPicking) setPicking(false);
  pushState();
  try { fs.writeFileSync(path.join(app.getPath('userData'), 'last-tab.json'), JSON.stringify({ tab })); } catch (e) {}
}
function setPicking(on) {
  paperPicking = !!on;
  if (views.paper && !views.paper.webContents.isDestroyed()) views.paper.webContents.send('tf:pick-mode', paperPicking);
  pushState();
}

/* ---------- sessions (network rules) ---------- */
const CHROME_UA = process.versions.chrome;
function userAgent() {
  return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + CHROME_UA + ' Safari/537.36';
}
function setupAppSession(ses) {
  ses.setUserAgent(userAgent());
  // The two apps are our own bundled code. Let them read any news site directly (no slow public proxies),
  // but never send cookies, so no login of the user can leak through a page.
  const filter = { urls: ['http://*/*', 'https://*/*'] };
  ses.webRequest.onBeforeSendHeaders(filter, (d, cb) => {
    const h = d.requestHeaders;
    try {
      const o = new URL(d.url).origin;
      delete h.Cookie; delete h.cookie;
      h.Referer = o + '/';
      if (h.Origin) h.Origin = o;
      delete h['Sec-Fetch-Site']; delete h['Sec-Fetch-Mode']; delete h['Sec-Fetch-Dest'];
    } catch (e) {}
    cb({ requestHeaders: h });
  });
  ses.webRequest.onHeadersReceived(filter, (d, cb) => {
    const h = d.responseHeaders || {};
    for (const k of Object.keys(h)) {
      const lk = k.toLowerCase();
      if (lk.startsWith('access-control-') || lk === 'set-cookie' || lk === 'cross-origin-resource-policy') delete h[k];
    }
    h['Access-Control-Allow-Origin'] = ['*'];
    h['Access-Control-Allow-Methods'] = ['GET, POST, PUT, DELETE, OPTIONS'];
    h['Access-Control-Allow-Headers'] = ['*'];
    cb({ responseHeaders: h, statusLine: d.method === 'OPTIONS' ? 'HTTP/1.1 200 OK' : d.statusLine });
  });
  const allowed = new Set(['media', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'audioCapture', 'videoCapture']);
  ses.setPermissionRequestHandler((wc, perm, cb, det) => {
    let ok = false;
    try { ok = allowed.has(perm) && new URL(det.requestingUrl || wc.getURL()).protocol === 'tfapp:'; } catch (e) {}
    cb(ok);
  });
  ses.setPermissionCheckHandler((wc, perm, origin) => allowed.has(perm) && String(origin).startsWith('tfapp:'));
  ses.on('will-download', (e, item) => handleDownload(item));
}
function setupPaperSession(ses) {
  ses.setUserAgent(userAgent());
  ses.setPermissionRequestHandler((wc, perm, cb) => cb(false));
  ses.setPermissionCheckHandler(() => false);
  ses.on('will-download', (e) => e.preventDefault()); // the newspaper browser never saves files by itself
}
function uniquePath(dir, name) {
  name = String(name || 'file').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120) || 'file';
  const ext = path.extname(name), base = path.basename(name, ext);
  let p = path.join(dir, name), i = 1;
  while (fs.existsSync(p)) p = path.join(dir, base + ' (' + (i++) + ')' + ext);
  return p;
}
function handleDownload(item) {
  try {
    const dir = path.join(app.getPath('downloads'), 'TF Media Studio');
    fs.mkdirSync(dir, { recursive: true });
    const p = uniquePath(dir, item.getFilename());
    item.setSavePath(p);
    item.once('done', (e, state) => {
      if (state === 'completed') say('সেভ হয়েছে: ' + path.basename(p), { folder: p });
      else say('সেভ করা যায়নি');
    });
  } catch (e) { item.cancel(); say('সেভ করা যায়নি'); }
}

/* ---------- serving the bundled apps ---------- */
function registerProtocol(ses) {
  ses.protocol.handle('tfapp', async (req) => {
    try {
      const u = new URL(req.url);
      const root = path.join(APPS_DIR, u.hostname);
      if (!['post', 'news'].includes(u.hostname)) return new Response('Not found', { status: 404 });
      let rel = decodeURIComponent(u.pathname);
      if (rel === '/' || rel === '') rel = '/index.html';
      const file = path.normalize(path.join(root, rel));
      if (!file.startsWith(root + path.sep)) return new Response('Forbidden', { status: 403 });
      const r = await net.fetch(pathToFileURL(file).toString());
      const h = new Headers(r.headers);
      h.set('Content-Security-Policy',
        "default-src 'self' blob: data:; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:; " +
        "style-src 'self' 'unsafe-inline'; img-src * data: blob:; media-src * data: blob:; connect-src * data: blob:; " +
        "font-src 'self' data: blob:; worker-src 'self' blob:; frame-src 'self' blob: data:; object-src 'none'; base-uri 'self'; form-action 'none'");
      h.set('X-Content-Type-Options', 'nosniff');
      return new Response(r.body, { status: r.status, headers: h });
    } catch (e) { return new Response('Not found', { status: 404 }); }
  });
}

/* ---------- picking a newspaper image and sending it to an app ---------- */
async function fetchImage(imgUrl, pageUrl) {
  if (!isHttpUrl(imgUrl)) throw new Error('bad url');
  if (isBlockedHost(new URL(imgUrl).hostname)) throw new Error('blocked host');
  const ses = session.fromPartition(PARTS.paper);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30000);
  try {
    const r = await ses.fetch(imgUrl, { headers: { Referer: isHttpUrl(pageUrl) ? pageUrl : new URL(imgUrl).origin + '/', Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' }, signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const len = Number(r.headers.get('content-length') || 0);
    if (len > MAX_IMG) throw new Error('too big');
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_IMG || buf.length < 200) throw new Error('bad size');
    let mime = String(r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const sig = buf.subarray(0, 16);
    if (sig[0] === 0x89 && sig[1] === 0x50) mime = 'image/png';
    else if (sig[0] === 0xff && sig[1] === 0xd8) mime = 'image/jpeg';
    else if (sig.toString('ascii', 0, 4) === 'RIFF' && sig.toString('ascii', 8, 12) === 'WEBP') mime = 'image/webp';
    else if (sig.toString('ascii', 0, 3) === 'GIF') mime = 'image/gif';
    else if (sig.toString('ascii', 4, 12).startsWith('ftypavif')) mime = 'image/avif';
    else mime = '';
    if (!mime) throw new Error('not an image');
    return { buf, mime };
  } finally { clearTimeout(timer); }
}
function safeName(imgUrl, mime) {
  let base = 'news-photo';
  try { base = decodeURIComponent(path.basename(new URL(imgUrl).pathname)).replace(/\.[a-z0-9]{2,5}$/i, ''); } catch (e) {}
  base = base.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 50) || 'news-photo';
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' }[mime] || 'jpg';
  return base + '.' + ext;
}
async function sendImageToApp(target, imgUrl, pageUrl) {
  if (!INPUT_ID[target]) throw new Error('bad target');
  const { buf, mime } = await fetchImage(imgUrl, pageUrl);
  const wc = views[target].webContents;
  if (!loaded[target]) { loaded[target] = true; await wc.loadURL('tfapp://' + target + '/index.html'); }
  const code = '(async()=>{try{' +
    'const inp=document.getElementById(' + JSON.stringify(INPUT_ID[target]) + ');if(!inp)return "noinput";' +
    'let blob=await (await fetch("data:' + mime + ';base64,' + buf.toString('base64') + '")).blob();' +
    'let name=' + JSON.stringify(safeName(imgUrl, mime)) + ';' +
    'if(!/^image\\/(png|jpeg|webp|gif)$/.test(blob.type)){const bm=await createImageBitmap(blob);const c=document.createElement("canvas");c.width=bm.width;c.height=bm.height;c.getContext("2d").drawImage(bm,0,0);blob=await new Promise(r=>c.toBlob(r,"image/png"));name=name.replace(/\\.[a-z0-9]+$/i,".png");}' +
    'const f=new File([blob],name,{type:blob.type});const dt=new DataTransfer();dt.items.add(f);inp.files=dt.files;' +
    'inp.dispatchEvent(new Event("change",{bubbles:true}));return "ok";}catch(e){return "err"}})()';
  const res = await wc.executeJavaScript(code, true);
  if (res !== 'ok') throw new Error(res);
}
async function pickImage(target, imgUrl, pageUrl) {
  say('ছবি আনা হচ্ছে…');
  try {
    await sendImageToApp(target, imgUrl, pageUrl);
    say('ছবি ' + (target === 'post' ? 'পোস্ট মেকারে' : 'নিউজ স্টুডিওতে') + ' চলে গেছে ✓');
  } catch (e) {
    say('এই ছবিটি আনা যায়নি। অন্য ছবি চেষ্টা করুন');
  }
}

/* ---------- window ---------- */
function makeView(name, preload, extra) {
  const v = new WebContentsView({
    webPreferences: Object.assign({
      partition: PARTS[name], contextIsolation: true, sandbox: true, nodeIntegration: false,
      webSecurity: true, allowRunningInsecureContent: false, spellcheck: false,
      preload: preload ? path.join(__dirname, preload) : undefined
    }, extra || {})
  });
  views[name] = v;
  win.contentView.addChildView(v);
  const wc = v.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    if (name === 'paper' && isHttpUrl(url)) { setImmediate(() => wc.loadURL(url)); }
    else if (isHttpUrl(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (e, url) => {
    if (name === 'paper') { if (!isHttpUrl(url)) e.preventDefault(); }
    else if (name === 'bar') { e.preventDefault(); }
    else if (!url.startsWith('tfapp://' + name + '/')) { e.preventDefault(); if (isHttpUrl(url)) shell.openExternal(url); }
  });
  wc.on('will-attach-webview', (e) => e.preventDefault());
  return v;
}

function createWindow() {
  win = new BaseWindow({ width: 1366, height: 820, minWidth: 980, minHeight: 600, title: 'TF Media Studio',
    icon: path.join(__dirname, 'logo.png'), backgroundColor: '#0e1a3a', show: false });
  makeView('bar', 'bar-preload.js', { backgroundThrottling: false });
  makeView('news', 'app-preload.js', { backgroundThrottling: false });
  makeView('post', 'app-preload.js', { backgroundThrottling: false });
  makeView('paper', 'paper-preload.js', { backgroundThrottling: true });
  for (const t of TABS) views[t].setVisible(false);
  views.bar.webContents.loadFile(path.join(__dirname, 'bar.html'));
  win.on('resize', layout);
  win.on('closed', () => { win = null; });

  // Paper browser events
  const pw = views.paper.webContents;
  for (const ev of ['did-navigate', 'did-navigate-in-page', 'did-stop-loading']) pw.on(ev, pushState);
  pw.on('did-finish-load', () => { if (paperPicking) pw.send('tf:pick-mode', true); });
  pw.on('context-menu', (e, p) => {
    if (p.mediaType === 'image' && isHttpUrl(p.srcURL)) {
      Menu.buildFromTemplate([
        { label: 'এই ছবি পোস্ট মেকারে পাঠান', click: () => pickImage('post', p.srcURL, pw.getURL()) },
        { label: 'এই ছবি নিউজ স্টুডিওতে পাঠান', click: () => pickImage('news', p.srcURL, pw.getURL()) }
      ]).popup();
    } else if (p.linkURL && isHttpUrl(p.linkURL)) {
      Menu.buildFromTemplate([{ label: 'এই লিংক খুলুন', click: () => pw.loadURL(p.linkURL) }]).popup();
    }
  });

  let first = 'news';
  try { const j = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'last-tab.json'), 'utf8')); if (TABS.includes(j.tab)) first = j.tab; } catch (e) {}
  views.bar.webContents.once('did-finish-load', () => { layout(); showTab(first); win.show(); });
  layout();

  if (process.env.TF_PICKTEST === '1') setTimeout(pickTest, 2500); else if (SELFTEST) selfTest();
}

/* ---------- IPC (only from our own bar / paper views) ---------- */
function from(e, name) { return views[name] && e.sender === views[name].webContents; }
ipcMain.on('tf:switch', (e, tab) => { if (from(e, 'bar')) showTab(String(tab)); });
ipcMain.on('tf:paper-go', (e, url) => {
  if (!from(e, 'bar')) return;
  let u = String(url || '').trim();
  if (!u) return;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
  if (isHttpUrl(u)) views.paper.webContents.loadURL(u);
});
ipcMain.on('tf:paper-cmd', (e, cmd) => {
  if (!from(e, 'bar')) return;
  const pw = views.paper.webContents;
  if (cmd === 'back' && pw.navigationHistory.canGoBack()) pw.navigationHistory.goBack();
  else if (cmd === 'forward' && pw.navigationHistory.canGoForward()) pw.navigationHistory.goForward();
  else if (cmd === 'reload') pw.reload();
  else if (cmd === 'home') pw.loadURL(PAPERS[0][1]);
});
ipcMain.on('tf:pick-mode', (e, on) => { if (from(e, 'bar')) setPicking(!!on); });
ipcMain.on('tf:pick-target', (e, t) => { if (from(e, 'bar') && INPUT_ID[t]) { pickTarget = t; pushState(); } });
ipcMain.on('tf:show-file', (e, p) => { if (from(e, 'bar') && typeof p === 'string') shell.showItemInFolder(p); });
ipcMain.on('tf:picked', (e, d) => {
  if (!from(e, 'paper') || !d || typeof d.src !== 'string') return;
  pickImage(pickTarget, d.src, String(d.page || ''));
});
ipcMain.on('tf:pick-exit', (e) => { if (from(e, 'paper')) setPicking(false); });

/* ---------- start ---------- */
protocol.registerSchemesAsPrivileged([{ scheme: 'tfapp', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    for (const n of ['news', 'post']) { const ses = session.fromPartition(PARTS[n]); registerProtocol(ses); setupAppSession(ses); }
    setupPaperSession(session.fromPartition(PARTS.paper));
    createWindow();
    const sc = (wc, input) => { /* keyboard shortcuts */
      if (input.type !== 'keyDown' || !input.control) return;
      const i = ['1', '2', '3'].indexOf(input.key);
      if (i >= 0) { showTab(TABS[i]); }
    };
    for (const t of Object.keys(views)) views[t].webContents.on('before-input-event', (e, inp) => sc(null, inp));
    app.on('window-all-closed', () => app.quit());
  });
}

async function pickTest() {
  const out = (...a) => console.log('[PICKTEST]', ...a);
  const pw = views.paper.webContents, post = views.post.webContents;
  showTab('post'); await new Promise(r => setTimeout(r, 4000));
  await post.executeJavaScript("window.__got=null;document.getElementById('cardFile').addEventListener('change',e=>{const f=e.target.files[0];window.__got=f?{n:f.name,t:f.type,s:f.size}:null},true);1");
  showTab('paper'); pw.loadURL('http://127.0.0.1:8099/t.html'); await new Promise(r => setTimeout(r, 2500));
  pickTarget = 'post'; setPicking(true); await new Promise(r => setTimeout(r, 600));
  pw.sendInputEvent({ type: 'mouseMove', x: 150, y: 120 }); await new Promise(r => setTimeout(r, 300));
  pw.sendInputEvent({ type: 'mouseDown', x: 150, y: 120, button: 'left', clickCount: 1 });
  pw.sendInputEvent({ type: 'mouseUp', x: 150, y: 120, button: 'left', clickCount: 1 });
  await new Promise(r => setTimeout(r, 3000));
  out('url-after-click', pw.getURL());
  out('app-received', JSON.stringify(await post.executeJavaScript('window.__got')));
  fs.writeFileSync('/tmp/shots/tf-paper.png', (await win.contentView.children[0].webContents.capturePage()).toPNG());
  app.exit(0);
}
/* ---------- self test (used only by the build checks, never by users) ---------- */
function selfTest() {
  const out = (...a) => console.log('[SELFTEST]', ...a);
  for (const t of ['news', 'post']) {
    views[t].webContents.on('console-message', (e) => {
      const lvl = e.level || e.severity; if (lvl === 'error' || lvl === 3) out(t, 'console-error:', String(e.message).slice(0, 300));
    });
    views[t].webContents.on('render-process-gone', (e, d) => out(t, 'CRASH', d.reason));
  }
  for (const t of ['news', 'post', 'bar']) {
    views[t].webContents.on('did-finish-load', () => out(t, 'loaded', views[t].webContents.getURL()));
    views[t].webContents.on('did-fail-load', (e, c, d, u) => out(t, 'FAILLOAD', c, d, u));
    views[t].webContents.on('preload-error', (e, p, err) => out(t, 'PRELOAD-ERR', String(err)));
  }
  setTimeout(async () => {
    out('start');
    for (const t of ['news', 'post']) {
      showTab(t);
      await new Promise(r => setTimeout(r, 6000));
      const info = await views[t].webContents.executeJavaScript('({title:document.title,len:document.body.innerText.length,inputs:!!document.getElementById(' + JSON.stringify(INPUT_ID[t]) + ')})');
      out(t, JSON.stringify(info));
      const img = await views[t].webContents.capturePage();
      fs.writeFileSync(path.join(process.env.TF_SHOT_DIR || '/tmp', 'tf-' + t + '.png'), img.toPNG());
    }
    showTab('paper');
    await new Promise(r => setTimeout(r, 4000));
    fs.writeFileSync(path.join(process.env.TF_SHOT_DIR || '/tmp', 'tf-bar.png'), (await views.bar.webContents.capturePage()).toPNG());
    out('done'); app.exit(0);
  }, 2500);
}
