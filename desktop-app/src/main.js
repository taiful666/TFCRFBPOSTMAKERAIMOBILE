'use strict';
/* TF Media Studio — main process.
   One window, three places:  খবর (mother place: live headlines + newspaper browser + basket),
   ভিডিও (TF News Studio) and পোস্ট ও রিল (TF FB Reels & Post Maker).
   Security: contextIsolation + sandbox on, no node in pages, apps served only from the bundled folder (tfapp://),
   pages cannot open other windows, permissions denied except what the apps need, cookies are never sent from app pages. */

const { app, BaseWindow, WebContentsView, session, protocol, net, ipcMain, shell, Menu, nativeImage, safeStorage, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { extract, cleanUrl } = require('./extract');

const SELFTEST = !app.isPackaged && process.env.TF_SELFTEST === '1'; // build checks only, never in the installed app
const APPS_DIR = path.join(__dirname, '..', 'apps');
const BAR_H = 56;
const HUB_TOP_LIVE = 52, HUB_TOP_PAPER = 100, BASKET_W = 340;
const MAX_IMG = 30 * 1024 * 1024;
const TABS = ['home', 'hub', 'news', 'post'];
const PARTS = { home: 'tf-home', bar: 'tf-bar', hub: 'tf-hub', news: 'persist:tf-news', post: 'persist:tf-post', paper: 'persist:tf-paper' };
const INPUT_ID = { post: 'cardFile', news: 'galFiles' };
const NW_FEED = 'https://raw.githubusercontent.com/taiful666/TFCRFBPOSTMAKERAIMOBILE/live-news/news.json';
const NW_SRC = { prothomalo: 'প্রথম আলো', jamuna: 'যমুনা টিভি', kalbela: 'কালবেলা', bdnews24: 'বিডিনিউজ২৪', jugantor: 'যুগান্তর', kalerkantho: 'কালের কণ্ঠ', samakal: 'সমকাল', somoy: 'সময় টিভি', jagonews: 'জাগো নিউজ', dailystarbn: 'ডেইলি স্টার বাংলা', ittefaq: 'ইত্তেফাক', bdpratidin: 'বাংলাদেশ প্রতিদিন', rtv: 'আরটিভি', channel24: 'চ্যানেল ২৪', ekattor: 'একাত্তর টিভি', ntv: 'এনটিভি', channeli: 'চ্যানেল আই', dhakapost: 'ঢাকা পোস্ট', banglatribune: 'বাংলা ট্রিবিউন', banglanews24: 'বাংলানিউজ২৪', risingbd: 'রাইজিংবিডি', ajkerpatrika: 'আজকের পত্রিকা', deshrupantor: 'দেশ রূপান্তর', nayadiganta: 'নয়া দিগন্ত', manabzamin: 'মানবজমিন', inqilab: 'ইনকিলাব', bbcbangla: 'বিবিসি বাংলা', dailystar: 'দ্য ডেইলি স্টার', google: 'গুগল নিউজ' };
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
let activeTab = 'home';
let returnTab = 'home';
let hubSub = 'live';
let picking = false;
let adblock = true;
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings() { try { const j = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); if (typeof j.adblock === 'boolean') adblock = j.adblock; } catch (e) {} }
function saveSettings() { try { fs.writeFileSync(settingsFile(), JSON.stringify({ adblock })); } catch (e) {} }
const AD_HOSTS = ['doubleclick.net','googlesyndication.com','googleadservices.com','adservice.google.com','pagead2.googlesyndication.com','googletagservices.com','google-analytics.com','googletagmanager.com','adnxs.com','taboola.com','outbrain.com','criteo.com','criteo.net','pubmatic.com','rubiconproject.com','openx.net','adsrvr.org','amazon-adsystem.com','moatads.com','scorecardresearch.com','quantserve.com','facebook.net','connect.facebook.net','hotjar.com','clarity.ms','mgid.com','revcontent.com','popads.net','propellerads.com','adsterra.com','exoclick.com','onesignal.com','zedo.com','smartadserver.com','teads.tv','adform.net','yieldmo.com','sharethrough.com','media.net','casalemedia.com','indexww.com','lijit.com','sovrn.com','2mdn.net','serving-sys.com','adroll.com','chartbeat.com','chartbeat.net','ads-twitter.com','analytics.tiktok.com','ads.pubmatic.com','bidswitch.net','contextweb.com','gumgum.com','inmobi.com','adcolony.com','vdo.ai','vidazoo.com','dable.io','adskeeper.com','ad.gt','richaudience.com','tynt.com','sitescout.com','yandex.ru','mc.yandex.ru'];
function isAdUrl(u) {
  try { const x = new URL(u); const h = x.hostname.toLowerCase();
    if (AD_HOSTS.some((d) => h === d || h.endsWith('.' + d))) return true;
    return /^(ads?|adserver|adservice|banner|banners|track|tracking|stats)\./.test(h) || /\/(ads?|adserve|banners?)\/.*\.(js|gif|png|jpg)(\?|$)/i.test(x.pathname);
  } catch (e) { return false; }
}
let basket = [];
const loaded = {};
let liveCache = { at: 0, data: null };

/* ---------- helpers ---------- */
const keyOf = (u) => { try { const x = new URL(u); return (x.hostname.replace(/^www\d?\./, '') + x.pathname.replace(/\/+$/, '')).toLowerCase(); } catch (e) { return String(u || ''); } };
function isHttpUrl(u) { try { const p = new URL(u); return p.protocol === 'http:' || p.protocol === 'https:'; } catch (e) { return false; } }
function isBlockedHost(host) {
  host = String(host || '').toLowerCase();
  if (SELFTEST && host === '127.0.0.1') return false; // build checks only
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (host === '[::1]' || host.startsWith('[fe80') || host.startsWith('[fc') || host.startsWith('[fd')) return true;
  const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) { const a = +m[1], b = +m[2]; if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return true; }
  return false;
}
const alive = (v) => v && !v.webContents.isDestroyed();
function srcNameOf(link, site) {
  let h = ''; try { h = new URL(link).hostname.replace(/^www\d?\./, ''); } catch (e) {}
  const map = { 'prothomalo.com': 'প্রথম আলো', 'kalbela.com': 'কালবেলা', 'jugantor.com': 'যুগান্তর', 'kalerkantho.com': 'কালের কণ্ঠ', 'samakal.com': 'সমকাল', 'ittefaq.com.bd': 'ইত্তেফাক', 'bd-pratidin.com': 'বাংলাদেশ প্রতিদিন', 'dailynayadiganta.com': 'নয়া দিগন্ত', 'ajkerpatrika.com': 'আজকের পত্রিকা', 'deshrupantor.com': 'দেশ রূপান্তর', 'bdnews24.com': 'বিডিনিউজ২৪', 'dhakapost.com': 'ঢাকা পোস্ট', 'jagonews24.com': 'জাগো নিউজ', 'banglanews24.com': 'বাংলানিউজ২৪', 'risingbd.com': 'রাইজিংবিডি', 'banglatribune.com': 'বাংলা ট্রিবিউন', 'jamuna.tv': 'যমুনা টিভি', 'somoynews.tv': 'সময় টিভি', 'rtvonline.com': 'আরটিভি', 'ntvbd.com': 'এনটিভি', 'channel24bd.tv': 'চ্যানেল ২৪', 'ekattor.tv': 'একাত্তর টিভি', 'thedailystar.net': 'দ্য ডেইলি স্টার' };
  for (const k of Object.keys(map)) if (h === k || h.endsWith('.' + k)) return map[k];
  return site || h;
}

/* ---------- state → bar & hub ---------- */
function hubState() {
  const pv = alive(views.paper) ? views.paper.webContents : null;
  return {
    sub: hubSub, picking, adblock, basket, back: returnTab === 'news' ? 'ভিডিওতে ফিরুন' : returnTab === 'post' ? 'পোস্ট ও রিলে ফিরুন' : 'হোমে ফিরুন', papers: PAPERS,
    url: pv ? pv.getURL() : '',
    canBack: !!(pv && pv.navigationHistory.canGoBack()),
    canFwd: !!(pv && pv.navigationHistory.canGoForward())
  };
}
function pushState() {
  if (alive(views.bar)) views.bar.webContents.send('tf:state', { tab: activeTab, count: basket.length });
  if (alive(views.hub)) views.hub.webContents.send('hub:state', hubState());
}
function say(msg, extra) {
  if (alive(views.bar)) views.bar.webContents.send('tf:toast', Object.assign({ msg }, extra || {}));
}
function hubSay(msg, ms) { if (alive(views.hub)) views.hub.webContents.send('hub:toast', { msg, ms }); }
function layout() {
  if (!win) return;
  const [w, h] = win.getContentSize();
  const bodyH = Math.max(0, h - BAR_H);
  views.bar.setBounds({ x: 0, y: 0, width: w, height: BAR_H });
  for (const t of TABS) views[t].setBounds({ x: 0, y: BAR_H, width: w, height: bodyH });
  const top = hubSub === 'paper' ? HUB_TOP_PAPER : HUB_TOP_LIVE;
  views.paper.setBounds({ x: 0, y: BAR_H + top, width: Math.max(0, w - BASKET_W), height: Math.max(0, bodyH - top) });
}
function applyVisibility() {
  for (const t of TABS) views[t].setVisible(t === activeTab);
  views.paper.setVisible(activeTab === 'hub' && hubSub === 'paper');
}
function loadApp(tab) {
  if (loaded[tab]) return;
  loaded[tab] = true;
  views[tab].webContents.loadURL('tfapp://' + tab + '/index.html');
}
function showTab(tab) {
  if (!TABS.includes(tab)) return;
  if (tab === 'hub' && activeTab !== 'hub') returnTab = activeTab;
  if (activeTab === 'news' && tab !== 'news') autosaveNews().catch(() => {});
  activeTab = tab;
  if (tab === 'home') pushHome();
  if (tab === 'hub') { if (hubSub === 'paper' && !loaded.paper) { loaded.paper = true; views.paper.webContents.loadURL(PAPERS[0][1]); } }
  else if (tab !== 'home') loadApp(tab);
  applyVisibility(); layout();
  (tab === 'hub' && hubSub === 'paper' ? views.paper : views[tab]).webContents.focus();
  if (tab !== 'hub' && picking) setPicking(false);
  if (tab === 'hub' && hubSub === 'paper' && !picking) setPicking(true);
  pushState();
}
function setSub(sub) {
  if (!['live', 'paper'].includes(sub)) return;
  hubSub = sub;
  if (sub === 'paper' && !loaded.paper) { loaded.paper = true; views.paper.webContents.loadURL(PAPERS[0][1]); }
  if (sub !== 'paper' && picking) setPicking(false);
  if (sub === 'paper' && !picking) setPicking(true);
  applyVisibility(); layout(); pushState();
}
function setAdblock(on) {
  adblock = !!on; saveSettings();
  if (alive(views.paper)) { views.paper.webContents.send('tf:adblock', adblock); views.paper.webContents.reload(); }
  pushState();
}
function setPicking(on) {
  picking = !!on;
  if (alive(views.paper)) views.paper.webContents.send('tf:pick-mode', picking);
  pushState();
}

/* ---------- basket ---------- */
const basketFile = () => path.join(app.getPath('userData'), 'basket.json');
function loadBasket() { try { const j = JSON.parse(fs.readFileSync(basketFile(), 'utf8')); if (Array.isArray(j)) basket = j.filter((x) => x && isHttpUrl(x.link)).slice(0, 60); } catch (e) {} }
function saveBasket() { try { fs.writeFileSync(basketFile(), JSON.stringify(basket)); } catch (e) {} }
function normItem(x) {
  if (!x || typeof x !== 'object' || !isHttpUrl(x.link) || typeof x.title !== 'string') return null;
  const t = (v, n) => String(v == null ? '' : v).slice(0, n);
  const date = typeof x.date === 'number' ? x.date : (x.date ? Date.parse(x.date) || 0 : 0);
  return {
    title: t(x.title, 300).replace(/\s+/g, ' ').trim(), link: t(x.link, 2000),
    img: isHttpUrl(x.img) ? t(x.img, 2000) : '', desc: t(x.desc, 600), text: t(x.text, 20000),
    srcName: t(x.srcName, 80), src: t(x.src, 40), date
  };
}
function addToBasket(raw) {
  const it = normItem(raw);
  if (!it || !it.title) return { ok: false, msg: 'এই খবরটি যোগ করা যায়নি' };
  const k = keyOf(it.link);
  const ex = basket.find((b) => keyOf(b.link) === k);
  if (ex) {
    if (it.text && !ex.text) { Object.assign(ex, { text: it.text, img: it.img || ex.img, desc: it.desc || ex.desc }); saveBasket(); pushState(); }
    return { ok: true, msg: 'এই খবর আগেই যোগ করা আছে' };
  }
  if (basket.length >= 60) return { ok: false, msg: 'সর্বোচ্চ ৬০টি খবর রাখা যায়' };
  basket.push(it); saveBasket(); pushState();
  return { ok: true, msg: 'খবর যোগ হয়েছে ✓' };
}

/* ---------- live feed ---------- */
async function fetchLive(force) {
  if (!force && liveCache.data && Date.now() - liveCache.at < 4 * 60 * 1000) return liveCache.data;
  const r = await net.fetch(NW_FEED + '?t=' + Math.floor(Date.now() / 60000), { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  const seen = new Set(), items = [];
  Object.entries(j.sources || {}).forEach(([id, s]) => (s.items || []).forEach((it) => {
    if (!it || !it.title || !isHttpUrl(it.link)) return;
    const k = keyOf(it.link); if (seen.has(k)) return; seen.add(k);
    const d = it.date ? Date.parse(it.date) : 0;
    items.push({
      title: String(it.title).replace(/\s+/g, ' ').trim(), link: it.link,
      img: isHttpUrl(it.img) ? String(it.img).replace('//images.prothomalo.com/', '//media.prothomalo.com/') : '',
      desc: String(it.desc || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600),
      date: isNaN(d) ? 0 : d, src: id, srcName: id === 'google' && it.gsrc ? String(it.gsrc) : (NW_SRC[id] || id)
    });
  }));
  items.sort((a, b) => (b.date || 0) - (a.date || 0));
  liveCache = { at: Date.now(), data: { items, names: NW_SRC, updated: j.updated ? Date.parse(j.updated) : Date.now() } };
  return liveCache.data;
}

/* ---------- sessions (network rules) ---------- */
const CHROME = process.versions.chrome;
const UA = () => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + CHROME + ' Safari/537.36';
function setupAppSession(ses) {
  ses.setUserAgent(UA());
  const filter = { urls: ['http://*/*', 'https://*/*'] };
  // The apps are our own bundled code: they may read any news site directly (no slow public proxies), but no cookies are ever sent.
  ses.webRequest.onBeforeSendHeaders(filter, (d, cb) => {
    const h = d.requestHeaders;
    try {
      const o = new URL(d.url).origin;
      delete h.Cookie; delete h.cookie;
      h.Referer = o + '/'; if (h.Origin) h.Origin = o;
      delete h['Sec-Fetch-Site']; delete h['Sec-Fetch-Mode']; delete h['Sec-Fetch-Dest'];
    } catch (e) {}
    cb({ requestHeaders: h });
  });
  ses.webRequest.onHeadersReceived(filter, (d, cb) => {
    const h = d.responseHeaders || {};
    for (const k of Object.keys(h)) { const lk = k.toLowerCase(); if (lk.startsWith('access-control-') || lk === 'set-cookie' || lk === 'cross-origin-resource-policy') delete h[k]; }
    h['Access-Control-Allow-Origin'] = ['*']; h['Access-Control-Allow-Methods'] = ['GET, POST, PUT, DELETE, OPTIONS']; h['Access-Control-Allow-Headers'] = ['*'];
    cb({ responseHeaders: h, statusLine: d.method === 'OPTIONS' ? 'HTTP/1.1 200 OK' : d.statusLine });
  });
  const allowed = new Set(['media', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'audioCapture', 'videoCapture']);
  ses.setPermissionRequestHandler((wc, perm, cb, det) => { let ok = false; try { ok = allowed.has(perm) && new URL(det.requestingUrl || wc.getURL()).protocol === 'tfapp:'; } catch (e) {} cb(ok); });
  ses.setPermissionCheckHandler((wc, perm, origin) => allowed.has(perm) && String(origin).startsWith('tfapp:'));
  ses.on('will-download', (e, item) => handleDownload(item));
}
function setupPaperSession(ses) {
  ses.setUserAgent(UA());
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (d, cb) => {
    if (adblock && d.resourceType !== 'mainFrame' && isAdUrl(d.url)) return cb({ cancel: true });
    cb({});
  });
  ses.setPermissionRequestHandler((wc, perm, cb) => cb(false));
  ses.setPermissionCheckHandler(() => false);
  ses.on('will-download', (e) => e.preventDefault());
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
    item.once('done', (e, state) => { if (state === 'completed') say('সেভ হয়েছে: ' + path.basename(p), { folder: p }); else say('সেভ করা যায়নি'); });
  } catch (e) { item.cancel(); say('সেভ করা যায়নি'); }
}

/* ---------- serving the bundled apps and safe thumbnails ---------- */
const CSP_APP = "default-src 'self' blob: data:; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src * data: blob:; media-src * data: blob:; connect-src * data: blob:; font-src 'self' data: blob:; worker-src 'self' blob:; frame-src 'self' blob: data:; object-src 'none'; base-uri 'self'; form-action 'none'";
function registerAppProtocol(ses) {
  ses.protocol.handle('tfapp', async (req) => {
    try {
      const u = new URL(req.url);
      if (!['post', 'news'].includes(u.hostname)) return new Response('Not found', { status: 404 });
      const root = path.join(APPS_DIR, u.hostname);
      let rel = decodeURIComponent(u.pathname); if (rel === '/' || rel === '') rel = '/index.html';
      const file = path.normalize(path.join(root, rel));
      if (!file.startsWith(root + path.sep)) return new Response('Forbidden', { status: 403 });
      const r = await net.fetch(pathToFileURL(file).toString());
      const h = new Headers(r.headers); h.set('Content-Security-Policy', CSP_APP); h.set('X-Content-Type-Options', 'nosniff');
      return new Response(r.body, { status: r.status, headers: h });
    } catch (e) { return new Response('Not found', { status: 404 }); }
  });
}
const thumbCache = new Map();
function registerThumbProtocol(ses) {
  ses.protocol.handle('tfimg', async (req) => {
    try {
      const u = new URL(req.url).searchParams.get('u');
      if (!isHttpUrl(u) || isBlockedHost(new URL(u).hostname)) return new Response('', { status: 400 });
      if (thumbCache.has(u)) { const c = thumbCache.get(u); return new Response(c.buf, { headers: { 'Content-Type': c.type, 'Cache-Control': 'max-age=3600' } }); }
      const { buf, mime } = await fetchImage(u, new URL(u).origin + '/');
      if (thumbCache.size > 200) thumbCache.delete(thumbCache.keys().next().value);
      thumbCache.set(u, { buf, type: mime });
      return new Response(buf, { headers: { 'Content-Type': mime, 'Cache-Control': 'max-age=3600' } });
    } catch (e) { return new Response('', { status: 404 }); }
  });
}

/* ---------- pictures ---------- */
async function fetchImage(imgUrl, pageUrl) {
  if (!isHttpUrl(imgUrl)) throw new Error('bad url');
  if (isBlockedHost(new URL(imgUrl).hostname)) throw new Error('blocked host');
  const ses = session.fromPartition(PARTS.paper);
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await ses.fetch(imgUrl, { headers: { Referer: isHttpUrl(pageUrl) ? pageUrl : new URL(imgUrl).origin + '/', Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' }, signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    if (Number(r.headers.get('content-length') || 0) > MAX_IMG) throw new Error('too big');
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_IMG || buf.length < 200) throw new Error('bad size');
    const sig = buf.subarray(0, 16); let mime = '';
    if (sig[0] === 0x89 && sig[1] === 0x50) mime = 'image/png';
    else if (sig[0] === 0xff && sig[1] === 0xd8) mime = 'image/jpeg';
    else if (sig.toString('ascii', 0, 4) === 'RIFF' && sig.toString('ascii', 8, 12) === 'WEBP') mime = 'image/webp';
    else if (sig.toString('ascii', 0, 3) === 'GIF') mime = 'image/gif';
    else if (sig.toString('ascii', 4, 12).startsWith('ftypavif')) mime = 'image/avif';
    if (!mime) throw new Error('not an image');
    return { buf, mime };
  } finally { clearTimeout(timer); }
}
// a picture the apps can always use: JPEG/PNG up to 1600 px as data (no hotlink problems); other formats keep their link
async function imageForApp(item) {
  if (!item.img) return '';
  try {
    const { buf, mime } = await fetchImage(item.img, item.link);
    if (mime !== 'image/jpeg' && mime !== 'image/png') return item.img;
    let ni = nativeImage.createFromBuffer(buf);
    if (ni.isEmpty()) return item.img;
    const s = ni.getSize();
    if (Math.max(s.width, s.height) > 1600) ni = ni.resize(s.width >= s.height ? { width: 1600 } : { height: 1600 });
    const out = ni.toJPEG(88);
    if (out.length > 3.5 * 1024 * 1024) return item.img;
    return 'data:image/jpeg;base64,' + out.toString('base64');
  } catch (e) { return item.img; }
}
function safeName(imgUrl, mime) {
  let base = 'news-photo';
  try { base = decodeURIComponent(path.basename(new URL(imgUrl).pathname)).replace(/\.[a-z0-9]{2,5}$/i, ''); } catch (e) {}
  base = base.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 50) || 'news-photo';
  return base + '.' + ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' }[mime] || 'jpg');
}
async function sendImageToApp(target, imgUrl, pageUrl) {
  if (!INPUT_ID[target]) throw new Error('bad target');
  const { buf, mime } = await fetchImage(imgUrl, pageUrl);
  const wc = views[target].webContents;
  if (!loaded[target]) { loadApp(target); await waitLoaded(wc); }
  // news picked from home → a fresh video project (the one open in the editor is saved first, never overwritten)
  if (kind === 'video' && returnTab !== 'news') {
    let empty = false;
    try { empty = !(await wc.executeJavaScript("(document.getElementById('script')||{}).value||''")).trim(); } catch (e) {}
    if (!empty) {
      const reloaded = new Promise((r) => wc.once('did-finish-load', () => setTimeout(r, 1200)));
      await startNewsWith({ script: '', pid: '' });
      await reloaded;
    }
  }
  const code = '(async()=>{try{const inp=document.getElementById(' + JSON.stringify(INPUT_ID[target]) + ');if(!inp)return "noinput";' +
    'let blob=await (await fetch("data:' + mime + ';base64,' + buf.toString('base64') + '")).blob();let name=' + JSON.stringify(safeName(imgUrl, mime)) + ';' +
    'if(!/^image\\/(png|jpeg|webp|gif)$/.test(blob.type)){const bm=await createImageBitmap(blob);const c=document.createElement("canvas");c.width=bm.width;c.height=bm.height;c.getContext("2d").drawImage(bm,0,0);blob=await new Promise(r=>c.toBlob(r,"image/png"));name=name.replace(/\\.[a-z0-9]+$/i,".png");}' +
    'const f=new File([blob],name,{type:blob.type});const dt=new DataTransfer();dt.items.add(f);inp.files=dt.files;inp.dispatchEvent(new Event("change",{bubbles:true}));return "ok";}catch(e){return "err"}})()';
  if ((await wc.executeJavaScript(code, true)) !== 'ok') throw new Error('inject');
}
function waitLoaded(wc) {
  return new Promise((res) => { if (!wc.isLoading() && wc.getURL()) return res(); wc.once('did-finish-load', () => setTimeout(res, 600)); setTimeout(res, 20000); });
}

/* ---------- patches that run inside the two apps (desktop version only) ---------- */
const patchSrc = {};
for (const n of ['news', 'post']) { try { patchSrc[n] = fs.readFileSync(path.join(__dirname, 'patches', n + '.js'), 'utf8'); } catch (e) { patchSrc[n] = ''; } }

/* ---------- send the basket to an app ---------- */
async function sendFromBasket(kind, onlyLink) {
  let list = onlyLink ? basket.filter((b) => keyOf(b.link) === keyOf(onlyLink)) : basket.slice();
  if (!list.length) { hubSay('আগে খবর বেছে নিন'); return; }
  const target = kind === 'video' ? 'news' : 'post';
  hubSay('প্রস্তুত করা হচ্ছে…', 8000);
  const out = []; let idx = 0;
  await Promise.all(Array.from({ length: Math.min(4, list.length) }, async () => {
    while (idx < list.length) { const i = idx++; out[i] = Object.assign({}, list[i], { img: await imageForApp(list[i]) }); }
  }));
  const wc = views[target].webContents;
  if (!loaded[target]) { loadApp(target); await waitLoaded(wc); }
  const payload = JSON.stringify(out.map((x) => ({ title: x.title, link: x.link, img: x.img, desc: x.desc, text: x.text, srcName: x.srcName, date: x.date || 0 })));
  let code;
  if (kind === 'video') {
    code = '(()=>{const L=' + payload + '.map(x=>Object.assign(x,{date:x.date||0}));if(typeof nwUse!=="function")return "missing";nwUse(L);return "ok"})()';
  } else if (kind === 'reel') {
    code = '(()=>{const L=' + payload + '.map(x=>TFPapers.itemObj(Object.assign({},x,{date:x.date?new Date(x.date).toISOString():""})));if(!window.TFReel)return "missing";return window.TFReel.open(L)?"ok":"empty"})()';
  } else {
    code = '(()=>{const x=' + payload + '[0];if(!window.TFCR||!TFCR.nwPick||!window.TFPapers)return "missing";TFCR.nwPick(TFPapers.itemObj(Object.assign({},x,{date:x.date?new Date(x.date).toISOString():""})));return "ok"})()';
  }
  showTab(target);
  try {
    const r = await wc.executeJavaScript(code, true);
    if (r === 'missing') say('এই অংশটি এখন চালু করা যায়নি');
  } catch (e) { say('এই অংশটি এখন চালু করা যায়নি'); }
}

/* ---------- collecting a story clicked in the newspaper browser ---------- */
const collecting = new Set();
async function collectStory(href, hintTitle, hintImg) {
  if (!isHttpUrl(href) || isBlockedHost(new URL(href).hostname)) return { ok: false, msg: 'এই লিংক নেওয়া যায়নি' };
  const k = keyOf(href);
  if (basket.some((b) => keyOf(b.link) === k)) return { ok: true, msg: 'এই খবর আগেই যোগ করা আছে' };
  if (collecting.has(k)) return { ok: true, msg: 'খবর আনা হচ্ছে…' };
  collecting.add(k);
  try {
    const a = await extract(href, { title: hintTitle, img: isHttpUrl(hintImg) ? hintImg : '' });
    if (!a.title && !a.text) return { ok: false, msg: 'এই পাতা থেকে খবর পড়া যায়নি' };
    const r = addToBasket({ title: a.title, link: a.link, img: a.img, desc: a.desc, text: a.text, srcName: srcNameOf(a.link, a.site), date: a.date });
    return { ok: r.ok, msg: r.ok ? (r.msg === 'খবর যোগ হয়েছে ✓' ? 'যোগ হয়েছে ✓ ' + (a.img ? '(ছবিসহ)' : '(ছবি পাওয়া যায়নি)') : r.msg) : r.msg };
  } catch (e) { return { ok: false, msg: 'এই খবর আনা যায়নি' }; }
  finally { collecting.delete(k); }
}

/* ---------- window ---------- */
function makeView(name, preload, extra) {
  const v = new WebContentsView({
    webPreferences: Object.assign({
      partition: PARTS[name], contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true,
      allowRunningInsecureContent: false, spellcheck: false, preload: preload ? path.join(__dirname, preload) : undefined
    }, extra || {})
  });
  views[name] = v;
  win.contentView.addChildView(v);
  const wc = v.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    if (name === 'paper' && isHttpUrl(url)) setImmediate(() => wc.loadURL(url));
    else if (isHttpUrl(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (e, url) => {
    if (name === 'paper') { if (!isHttpUrl(url)) e.preventDefault(); }
    else if (name === 'bar' || name === 'hub') e.preventDefault();
    else if (!url.startsWith('tfapp://' + name + '/')) { e.preventDefault(); if (isHttpUrl(url)) shell.openExternal(url); }
  });
  wc.on('will-attach-webview', (e) => e.preventDefault());
  return v;
}

function createWindow() {
  win = new BaseWindow({ width: 1366, height: 820, minWidth: 1040, minHeight: 620, title: 'TF Media Studio', icon: path.join(__dirname, 'logo.png'), backgroundColor: '#0a1330', show: false });
  makeView('bar', 'bar-preload.js', { backgroundThrottling: false });
  makeView('home', 'home-preload.js', { backgroundThrottling: false });
  makeView('news', 'app-preload.js', { backgroundThrottling: false });
  makeView('post', 'app-preload.js', { backgroundThrottling: false });
  makeView('hub', 'hub-preload.js', { backgroundThrottling: false });
  makeView('paper', 'paper-preload.js', { backgroundThrottling: true });
  applyVisibility();
  views.bar.webContents.loadFile(path.join(__dirname, 'bar.html'));
  views.hub.webContents.loadFile(path.join(__dirname, 'hub.html'));
  views.home.webContents.loadFile(path.join(__dirname, 'home.html'));
  win.on('resize', layout);
  win.on('closed', () => { win = null; });
  let closing = false;   // save the open video project before the window goes away
  win.on('close', (e) => {
    if (closing || !loaded.news) return;
    e.preventDefault(); closing = true;
    Promise.race([autosaveNews(), new Promise((r) => setTimeout(r, 4000))]).catch(() => {}).finally(() => { if (win) win.close(); });
  });
  setInterval(() => { if (activeTab === 'news') autosaveNews().catch(() => {}); }, 60000);

  for (const n of ['news', 'post']) views[n].webContents.on('did-finish-load', () => { if (patchSrc[n]) views[n].webContents.executeJavaScript(patchSrc[n]).catch(() => {}); });

  const pw = views.paper.webContents;
  for (const ev of ['did-navigate', 'did-navigate-in-page', 'did-stop-loading']) pw.on(ev, pushState);
  pw.on('did-finish-load', () => { if (picking) pw.send('tf:pick-mode', true); pw.send('tf:adblock', adblock); });
  pw.on('context-menu', (e, p) => {
    if (p.mediaType === 'image' && isHttpUrl(p.srcURL)) {
      Menu.buildFromTemplate([
        { label: 'এই ছবি পোস্ট ও রিল মেকারে পাঠান', click: () => sendImageToApp('post', p.srcURL, pw.getURL()).then(() => hubSay('ছবি চলে গেছে ✓')).catch(() => hubSay('ছবিটি আনা যায়নি')) },
        { label: 'এই ছবি ভিডিওর ছবি-লাইব্রেরিতে পাঠান', click: () => sendImageToApp('news', p.srcURL, pw.getURL()).then(() => hubSay('ছবি চলে গেছে ✓')).catch(() => hubSay('ছবিটি আনা যায়নি')) }
      ]).popup();
    } else if (p.linkURL && isHttpUrl(p.linkURL)) {
      Menu.buildFromTemplate([{ label: 'এই লিংক খুলুন', click: () => pw.loadURL(p.linkURL) }]).popup();
    }
  });

  let ready = 0;   // every start opens on the clean home screen
  const go = () => { if (++ready === 3) { layout(); showTab('home'); win.show(); } };
  views.bar.webContents.once('did-finish-load', go);
  views.hub.webContents.once('did-finish-load', go);
  views.home.webContents.once('did-finish-load', go);
  layout();
  if (SELFTEST && process.env.TF_TEST_SCRIPT) setTimeout(() => require(process.env.TF_TEST_SCRIPT)({ app, views, autosaveNews, listProjects, showTab, setSub, setPicking, addToBasket, collectStory, sendFromBasket, get basket() { return basket; }, state: hubState }), 2500);
}

/* ---------- IPC (only from our own views) ---------- */
const from = (e, name) => views[name] && e.sender === views[name].webContents;
ipcMain.on('tf:switch', (e, tab) => {
  tab = String(tab);
  if (from(e, 'bar') || ((tab === 'hub' || tab === 'home') && (from(e, 'news') || from(e, 'post')))) showTab(tab);
});
ipcMain.on('hub:back', (e) => { if (from(e, 'hub')) showTab(TABS.includes(returnTab) && returnTab !== 'hub' ? returnTab : 'home'); });
ipcMain.on('tf:show-file', (e, p) => { if (from(e, 'bar') && typeof p === 'string') shell.showItemInFolder(p); });
ipcMain.handle('hub:state', (e) => (from(e, 'hub') ? hubState() : null));
ipcMain.handle('hub:live', async (e, force) => { if (!from(e, 'hub')) return null; try { return await fetchLive(force); } catch (err) { return null; } });
ipcMain.on('hub:sub', (e, s) => { if (from(e, 'hub')) setSub(String(s)); });
ipcMain.on('hub:adblock', (e, on) => { if (from(e, 'hub')) setAdblock(!!on); });
ipcMain.on('hub:pick', (e, on) => { if (from(e, 'hub')) setPicking(!!on); });
ipcMain.on('hub:paper-go', (e, url) => {
  if (!from(e, 'hub')) return;
  let u = String(url || '').trim(); if (!u) return;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
  if (isHttpUrl(u)) views.paper.webContents.loadURL(u);
});
ipcMain.on('hub:paper-cmd', (e, cmd) => {
  if (!from(e, 'hub')) return;
  const pw = views.paper.webContents;
  if (cmd === 'back' && pw.navigationHistory.canGoBack()) pw.navigationHistory.goBack();
  else if (cmd === 'forward' && pw.navigationHistory.canGoForward()) pw.navigationHistory.goForward();
  else if (cmd === 'reload') pw.reload();
});
ipcMain.handle('hub:add', (e, item) => (from(e, 'hub') ? addToBasket(item) : null));
ipcMain.handle('hub:remove', (e, link) => { if (!from(e, 'hub')) return null; const k = keyOf(link); basket = basket.filter((b) => keyOf(b.link) !== k); saveBasket(); pushState(); return true; });
ipcMain.handle('hub:clear', (e) => { if (!from(e, 'hub')) return null; basket = []; saveBasket(); pushState(); return true; });
ipcMain.handle('hub:send', async (e, kind, link) => {
  if (!from(e, 'hub') || !['video', 'reel', 'card'].includes(kind)) return null;
  await sendFromBasket(kind, link || ''); return true;
});
ipcMain.on('tf:collect', async (e, d) => {
  if (!from(e, 'paper') || !d || typeof d.href !== 'string') return;
  const r = await collectStory(d.href, String(d.title || ''), String(d.img || ''));
  if (alive(views.paper)) views.paper.webContents.send('tf:collect-result', r);
  hubSay(r.msg);
});
ipcMain.on('tf:pick-exit', (e) => { if (from(e, 'paper')) setPicking(false); });



/* ---------- projects (video projects, saved on this PC) ---------- */
const projDir = () => { const d = path.join(app.getPath('userData'), 'projects'); fs.mkdirSync(d, { recursive: true }); return d; };
const validPid = (id) => typeof id === 'string' && /^[a-z0-9]{6,32}$/.test(id);
const newPid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
function listProjects() {
  const out = [];
  try {
    for (const f of fs.readdirSync(projDir())) {
      if (!/\.json$/.test(f)) continue;
      try {
        const j = JSON.parse(fs.readFileSync(path.join(projDir(), f), 'utf8'));
        if (!validPid(j.id)) continue;
        let thumb = '';
        try { thumb = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(projDir(), j.id + '.jpg')).toString('base64'); } catch (e) {}
        out.push({ id: j.id, name: j.name, aspect: j.aspect, updated: j.updated, scenes: j.scenes || 0, voice: fs.existsSync(path.join(projDir(), j.id + '.voice')), thumb });
      } catch (e) {}
    }
  } catch (e) {}
  return out.sort((a, b) => b.updated - a.updated).slice(0, 200);
}
function pushHome() { if (alive(views.home)) views.home.webContents.send('home:state', { projects: listProjects(), basket: basket.length }); }
const SNAP_JS = `(async()=>{try{save()}catch(e){}
  const s=document.getElementById('script').value||'';let th='';
  try{const c=document.createElement('canvas');const w=360;c.width=w;c.height=Math.max(1,Math.round(w*cv.height/cv.width));c.getContext('2d').drawImage(cv,0,0,c.width,c.height);th=c.toDataURL('image/jpeg',.72)}catch(e){}
  let voice=null;try{if(hasAudio&&audioEl.src){const b=await (await fetch(audioEl.src)).blob();if(b.size<200*1024*1024)voice={type:b.type||'audio/wav',data:new Uint8Array(await b.arrayBuffer())};}}catch(e){}
  return {pid:localStorage.getItem('tfms_pid')||'',script:s,set:localStorage.getItem('tfx_set')||'',ovr:localStorage.getItem('tfx_ovr')||'',
    aspect:(typeof settings!=='undefined'&&settings.aspect)||'16:9',thumb:th,scenes:(typeof scenes!=='undefined'?scenes.length:0),voice};})()`;
let saving = null;
async function autosaveNews() {
  if (!loaded.news || !alive(views.news) || views.news.webContents.isLoading()) return null;
  if (saving) return saving;
  saving = (async () => {
    const wc = views.news.webContents;
    const d = await wc.executeJavaScript(SNAP_JS);
    if (!d || typeof d.script !== 'string' || !d.script.trim()) return null;
    let id = validPid(d.pid) ? d.pid : newPid();
    if (id !== d.pid) await wc.executeJavaScript(`localStorage.setItem('tfms_pid',${JSON.stringify(id)})`);
    const head = (d.script.split('\n').find((l) => /^\s*#/.test(l) && !/শিরোনাম\s*$/.test(l)) || d.script.split('\n').find((l) => l.trim()) || '').replace(/^[\s#]+/, '').trim();
    const name = (head || 'নতুন প্রজেক্ট').slice(0, 90);
    const set = (() => { try { const o = JSON.parse(d.set || '{}'); delete o.pexelsKey; delete o.ckey; return o; } catch (e) { return {}; } })();
    const rec = { id, name, aspect: String(d.aspect || '16:9').slice(0, 8), updated: Date.now(), scenes: +d.scenes || 0, script: d.script, set, ovr: String(d.ovr || '') };
    fs.writeFileSync(path.join(projDir(), id + '.json'), JSON.stringify(rec));
    const m = /^data:image\/jpeg;base64,(.+)$/.exec(d.thumb || ''); if (m) fs.writeFileSync(path.join(projDir(), id + '.jpg'), Buffer.from(m[1], 'base64'));
    const vp = path.join(projDir(), id + '.voice');
    if (d.voice && d.voice.data) fs.writeFileSync(vp, Buffer.concat([Buffer.from(JSON.stringify({ type: String(d.voice.type).slice(0, 40) }) + '\n'), Buffer.from(d.voice.data)]));
    else { try { fs.rmSync(vp, { force: true }); } catch (e) {} }
    return id;
  })().finally(() => { saving = null; pushHome(); });
  return saving;
}
function newsReady() {
  return new Promise((res) => {
    if (!loaded.news) { loadApp('news'); }
    const wc = views.news.webContents;
    if (!wc.isLoading() && wc.getURL().startsWith('tfapp://news')) return setTimeout(res, 50);
    wc.once('did-finish-load', () => setTimeout(res, 400));
  });
}
let pendingVoice = null;
async function startNewsWith(state) {   // state: {script,set,ovr,pid,aspect}
  await newsReady();
  try { await autosaveNews(); } catch (e) {}
  const wc = views.news.webContents;
  await wc.executeJavaScript(`(()=>{const A=${JSON.stringify(state)};
    try{const ta=document.getElementById('script');if(ta)ta.value=A.script||'';}catch(e){}
    try{if(typeof overrides!=='undefined')overrides={};}catch(e){}
    let cur={};try{cur=JSON.parse(localStorage.getItem('tfx_set')||'{}')}catch(e){}
    const keep={pexelsKey:cur.pexelsKey,ckey:cur.ckey};
    let st=A.set?Object.assign({},A.set):Object.assign({},cur);
    if(!A.set){st.newsGroups=[];delete st.tl;}
    if(A.aspect)st.aspect=A.aspect;Object.keys(keep).forEach(k=>{if(keep[k]!=null)st[k]=keep[k];});
    localStorage.setItem('tfx_set',JSON.stringify(st));localStorage.setItem('tfx_script',A.script||'');
    if(A.ovr)localStorage.setItem('tfx_ovr',A.ovr);else localStorage.removeItem('tfx_ovr');
    localStorage.setItem('tfms_pid',A.pid||'');sessionStorage.setItem('tf13asked','1');window.__tfReloading=1;setTimeout(()=>location.reload(),30);return 1;})()`);
}
function voiceFor(id) {
  try {
    const buf = fs.readFileSync(path.join(projDir(), id + '.voice'));
    const nl = buf.indexOf(10); const meta = JSON.parse(buf.subarray(0, nl).toString());
    return { type: /^audio\/[\w.+-]+$/.test(meta.type) ? meta.type : 'audio/wav', data: buf.subarray(nl + 1) };
  } catch (e) { return null; }
}
ipcMain.handle('home:state', (e) => (from(e, 'home') ? { projects: listProjects(), basket: basket.length } : null));
ipcMain.handle('home:new', async (e, kind) => {
  if (!from(e, 'home')) return false;
  kind = String(kind);
  if (kind === 'video' || kind === 'short') {
    showTab('news');
    await startNewsWith({ script: '', pid: '', aspect: kind === 'short' ? '9:16' : '16:9' });
    return true;
  }
  if (kind === 'card') { showTab('post'); return true; }
  if (kind === 'live' || kind === 'reel') { setSub('live'); showTab('hub'); return true; }
  if (kind === 'paper') { setSub('paper'); showTab('hub'); return true; }
  return false;
});
ipcMain.handle('home:open', async (e, id) => {
  if (!from(e, 'home') || !validPid(id)) return false;
  let j; try { j = JSON.parse(fs.readFileSync(path.join(projDir(), id + '.json'), 'utf8')); } catch (err) { return false; }
  showTab('news');
  pendingVoice = voiceFor(id);
  await startNewsWith({ script: String(j.script || ''), set: j.set && typeof j.set === 'object' ? j.set : null, ovr: String(j.ovr || ''), pid: id, aspect: j.aspect });
  return true;
});
ipcMain.handle('home:resume', async (e) => { if (!from(e, 'home')) return false; showTab('news'); return true; });
ipcMain.handle('home:remove', async (e, id) => {
  if (!from(e, 'home') || !validPid(id)) return false;
  for (const ext of ['.json', '.jpg', '.voice']) { try { fs.rmSync(path.join(projDir(), id + ext), { force: true }); } catch (err) {} }
  if (loaded.news && alive(views.news)) {   // the project open in the editor is the one removed → editor starts clean next time
    try { const cur = await views.news.webContents.executeJavaScript("localStorage.getItem('tfms_pid')||''"); if (cur === id) await views.news.webContents.executeJavaScript("localStorage.setItem('tfms_pid','')"); } catch (err) {}
  }
  pushHome(); return true;
});
ipcMain.handle('home:rename', (e, id, name) => {
  if (!from(e, 'home') || !validPid(id)) return false;
  name = String(name || '').replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, 90); if (!name) return false;
  const f = path.join(projDir(), id + '.json');
  try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); j.name = name; j.renamed = true; fs.writeFileSync(f, JSON.stringify(j)); } catch (err) { return false; }
  pushHome(); return true;
});
ipcMain.handle('home:import', async (e) => {
  if (!from(e, 'home')) return false;
  const r = await dialog.showOpenDialog(win, { title: 'প্রজেক্ট ফাইল খুলুন', properties: ['openFile'], filters: [{ name: 'TF প্রজেক্ট', extensions: ['json'] }] });
  if (r.canceled || !r.filePaths[0]) return false;
  try {
    const st = fs.statSync(r.filePaths[0]); if (st.size > 30 * 1024 * 1024) return false;
    const d = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
    if (d.app !== 'tf-explainer-studio' || typeof d.script !== 'string') return false;
    const set = d.settings && typeof d.settings === 'object' ? d.settings : null; if (set) { delete set.pexelsKey; delete set.ckey; }
    showTab('news');
    await startNewsWith({ script: d.script, set, ovr: typeof d.overrides === 'object' ? JSON.stringify(d.overrides) : '', pid: newPid(), aspect: set && set.aspect });
    return true;
  } catch (err) { return false; }
});
ipcMain.handle('home:current', async (e) => {
  if (!from(e, 'home') || !loaded.news || !alive(views.news)) return null;
  try { return await views.news.webContents.executeJavaScript("(document.getElementById('script')||{}).value?localStorage.getItem('tfms_pid')||'new':''"); } catch (err) { return null; }
});
// voice of an opened project goes back into the editor once the page has loaded
ipcMain.handle('news:save', async (e) => { if (!from(e, 'news')) return null; try { return await autosaveNews(); } catch (err) { return null; } });
ipcMain.handle('news:pending-voice', (e) => { if (!from(e, 'news')) return null; const v = pendingVoice; pendingVoice = null; return v; });

/* ---------- API keys: one encrypted store for both apps ---------- */
// Keys stay on this PC only, encrypted with Windows (DPAPI) via safeStorage. Both apps read the same keys.
const KEY_NAMES = ['gemini', 'claude', 'cartesia'];
const vaultFile = () => path.join(app.getPath('userData'), 'keys.bin');
function readVault() {
  try {
    const b = fs.readFileSync(vaultFile());
    const txt = safeStorage.isEncryptionAvailable() && b[0] !== 123 ? safeStorage.decryptString(b) : b.toString('utf8');
    const j = JSON.parse(txt); return { v: j.v || {}, seen: j.seen || {} };
  } catch (e) { return { v: {}, seen: {} }; }
}
function writeVault(o) {
  const txt = JSON.stringify(o);
  try { fs.writeFileSync(vaultFile(), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(txt) : Buffer.from(txt), { mode: 0o600 }); } catch (e) {}
}
ipcMain.on('keys:get', (e) => { e.returnValue = fromApp(e) ? readVault() : { v: {}, seen: {} }; });
ipcMain.on('keys:set', (e, name, value) => {
  if (!fromApp(e) || !KEY_NAMES.includes(name)) return;
  value = String(value || '').trim(); if (value.length > 400 || /\s/.test(value)) return;
  const o = readVault(); if (value) o.v[name] = value; else delete o.v[name]; o.seen[name] = true; writeVault(o);
  const other = from(e, 'news') ? 'post' : 'news';   // keep the other app's copy in step
  if (loaded[other] && alive(views[other])) views[other].webContents.send('keys:changed', name, value);
});

/* ---------- fast render engine (FFmpeg) ---------- */
// The apps draw every frame themselves (deterministic) and hand them over here; FFmpeg turns them into an MP4
// together with the mixed audio. This is several times faster than recording in real time and never drops frames.
let ffmpegBin = null;
function getFfmpeg() {
  if (ffmpegBin !== null) return ffmpegBin;
  ffmpegBin = '';
  try {
    let p = require('ffmpeg-static');
    if (p) { p = p.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1'); if (fs.existsSync(p)) ffmpegBin = p; }
  } catch (e) {}
  if (!ffmpegBin && SELFTEST && process.env.TF_FFMPEG) ffmpegBin = process.env.TF_FFMPEG;
  return ffmpegBin;
}
let job = null;
function cleanJob() { if (!job) return; const d = job.dir; job = null; try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {} }
const fromApp = (e) => from(e, 'news') || from(e, 'post');
ipcMain.handle('render:available', (e) => (fromApp(e) ? !!getFfmpeg() : false));
ipcMain.handle('render:start', async (e, o) => {
  if (!fromApp(e) || !o || typeof o !== 'object') return { ok: false };
  if (job) return { ok: false, msg: 'আরেকটি ভিডিও তৈরি হচ্ছে' };
  const bin = getFfmpeg(); if (!bin) return { ok: false, msg: 'রেন্ডার ইঞ্জিন পাওয়া যায়নি' };
  const w = Math.round(+o.w), h = Math.round(+o.h), fps = Math.round(+o.fps);
  if (!(w >= 16 && w <= 4096 && h >= 16 && h <= 4096 && fps >= 1 && fps <= 60)) return { ok: false, msg: 'ভিডিওর মাপ ঠিক নয়' };
  const wav = o.wav ? Buffer.from(o.wav) : null;
  if (wav && wav.length > 900 * 1024 * 1024) return { ok: false, msg: 'অডিও অনেক বড়' };
  try {
    const dir = fs.mkdtempSync(path.join(app.getPath('temp'), 'tfms-'));
    const out = path.join(dir, 'out.mp4'), wavPath = path.join(dir, 'audio.wav');
    if (wav) fs.writeFileSync(wavPath, wav);
    const args = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', 'pipe:0'];
    if (wav) args.push('-i', wavPath);
    args.push('-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-r', String(fps), '-g', String(fps * 2));
    if (wav) args.push('-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest'); else args.push('-an');
    args.push('-movflags', '+faststart', out);
    const proc = spawn(bin, args, { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
    const j = { proc, dir, out, err: '', name: String(o.name || 'video').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').slice(0, 100) || 'video' };
    j.done = new Promise((res) => { proc.on('close', (code) => res(code)); proc.on('error', () => res(-1)); });
    proc.stderr.on('data', (d) => { j.err = (j.err + d).slice(-1500); });
    proc.stdin.on('error', () => {});
    job = j;
    return { ok: true };
  } catch (err) { return { ok: false, msg: 'শুরু করা যায়নি' }; }
});
ipcMain.handle('render:frame', async (e, buf) => {
  if (!fromApp(e) || !job) return false;
  const b = Buffer.from(buf); if (b.length > 40 * 1024 * 1024) return false;
  const st = job.proc.stdin;
  if (st.destroyed || !st.writable) return false;
  if (!st.write(b)) await new Promise((res) => { const f = () => res(); st.once('drain', f); st.once('close', f); });
  return true;
});
ipcMain.handle('render:finish', async (e, opts) => {
  if (!fromApp(e) || !job) return { ok: false };
  const j = job;
  try { j.proc.stdin.end(); } catch (err) {}
  const code = await j.done;
  if (code !== 0 || !fs.existsSync(j.out)) { const m = j.err; cleanJob(); return { ok: false, msg: 'ভিডিও বানানো যায়নি' + (m ? ' (' + m.split('\n').pop().slice(0, 120) + ')' : '') }; }
  if (opts && opts.bytes === true) {                       // the app wants the finished file itself (reel preview / share)
    try { const data = fs.readFileSync(j.out); cleanJob(); return { ok: true, bytes: data }; } catch (err) { cleanJob(); return { ok: false, msg: 'ফাইল পড়া যায়নি' }; }
  }
  try {
    const dir = path.join(app.getPath('downloads'), 'TF Media Studio'); fs.mkdirSync(dir, { recursive: true });
    const dest = uniquePath(dir, j.name.replace(/\.mp4$/i, '') + '.mp4');
    try { fs.renameSync(j.out, dest); } catch (err) { fs.copyFileSync(j.out, dest); }
    cleanJob();
    say('ভিডিও সেভ হয়েছে: ' + path.basename(dest), { folder: dest });
    return { ok: true, path: dest };
  } catch (err) { cleanJob(); return { ok: false, msg: 'ফাইল সেভ করা যায়নি' }; }
});
ipcMain.handle('render:cancel', (e) => { if (!fromApp(e) || !job) return false; try { job.proc.kill(); } catch (err) {} cleanJob(); return true; });

/* ---------- start ---------- */
protocol.registerSchemesAsPrivileged([
  { scheme: 'tfapp', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  { scheme: 'tfimg', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
]);
if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    loadBasket(); loadSettings();
    try { const t = app.getPath('temp'); for (const d of fs.readdirSync(t)) if (/^tfms-/.test(d)) fs.rmSync(path.join(t, d), { recursive: true, force: true }); } catch (e) {}   // leftovers of an interrupted render
    for (const n of ['news', 'post']) { const ses = session.fromPartition(PARTS[n]); registerAppProtocol(ses); setupAppSession(ses); }
    registerThumbProtocol(session.fromPartition(PARTS.hub));
    setupPaperSession(session.fromPartition(PARTS.paper));
    createWindow();
    for (const t of Object.keys(views)) views[t].webContents.on('before-input-event', (e, inp) => {
      if (inp.type !== 'keyDown' || !inp.control) return;
      const i = ['1', '2', '3'].indexOf(inp.key); if (i >= 0) showTab(TABS[i]);
    });
    app.on('window-all-closed', () => app.quit());
  });
}
