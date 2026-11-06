'use strict';
/* Reads one news article from its web page: headline, full text, main photo, source and date.
   The page is opened in a hidden window (so it works even for sites that build the page with JavaScript),
   with no cookies kept, and images / media / fonts blocked so it is fast. */
const { BrowserWindow, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const PART = 'tf-extract';
let ready = false;
let readabilitySrc = '';

function setup() {
  if (ready) return;
  ready = true;
  try { readabilitySrc = fs.readFileSync(path.join(__dirname, '..', 'apps', 'post', 'Readability.js'), 'utf8'); } catch (e) { readabilitySrc = ''; }
  const ses = session.fromPartition(PART);
  ses.setPermissionRequestHandler((wc, p, cb) => cb(false));
  ses.setPermissionCheckHandler(() => false);
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (d, cb) => {
    cb({ cancel: ['image', 'media', 'font', 'ping'].includes(d.resourceType) });
  });
  ses.on('will-download', (e) => e.preventDefault());
}

const PAGE_SCRIPT = `(function(){
  const out = {title:'',text:'',img:'',desc:'',date:'',site:'',url:location.href,canonical:''};
  const m = (n) => { const e = document.querySelector('meta[property="'+n+'"],meta[name="'+n+'"]'); return e ? (e.getAttribute('content')||'').trim() : ''; };
  const abs = (u) => { try { return u ? new URL(u, location.href).href : ''; } catch(e) { return ''; } };
  out.site = m('og:site_name');
  out.desc = m('og:description') || m('description');
  out.date = m('article:published_time') || m('og:updated_time') || '';
  const can = document.querySelector('link[rel="canonical"]');
  out.canonical = abs((can && can.getAttribute('href')) || m('og:url'));
  let title = m('og:title') || m('twitter:title') || '';
  let body = '';
  let ldImg = '';
  document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    try {
      const walk = (o) => {
        if (!o) return;
        if (Array.isArray(o)) return o.forEach(walk);
        if (typeof o === 'object') {
          if (typeof o.articleBody === 'string' && o.articleBody.length > body.length) body = o.articleBody;
          if (!out.date && typeof o.datePublished === 'string') out.date = o.datePublished;
          if (!ldImg && o.image) { const i = Array.isArray(o.image) ? o.image[0] : o.image; ldImg = typeof i === 'string' ? i : (i && i.url) || ''; }
          if (!title && typeof o.headline === 'string') title = o.headline;
          if (o['@graph']) walk(o['@graph']);
        }
      };
      walk(JSON.parse(s.textContent));
    } catch(e) {}
  });
  body = body.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
  let readImg = '';
  try {
    const art = new Readability(document.cloneNode(true)).parse();
    if (art) {
      if (!title) title = art.title || '';
      if (!out.site) out.site = art.siteName || '';
      const box = document.createElement('div'); box.innerHTML = art.content || '';
      const ps = [];
      box.querySelectorAll('p,h2,h3,li').forEach((p) => { const t = (p.textContent || '').replace(/\\s+/g, ' ').trim(); if (t.length > 25) ps.push(t); });
      const txt = ps.join('\\n\\n');
      if (txt.length > body.length * 0.7 || body.length < 200) body = txt || body;
      let best = 0;
      box.querySelectorAll('img').forEach((im) => {
        const u = im.getAttribute('src') || im.getAttribute('data-src') || im.getAttribute('data-original') || '';
        const w = parseInt(im.getAttribute('width') || '0', 10);
        if (u && !/^data:/.test(u) && !/\\.svg(\\?|$)/i.test(u) && !/logo|icon|sprite|avatar|ads?[-_/]/i.test(u) && (w >= best)) { best = w || best; if (!readImg || w >= best) readImg = u; }
      });
    }
  } catch(e) {}
  out.title = (title || document.title || '').replace(/\\s+/g, ' ').trim();
  out.text = body.replace(/[ \\t]+/g, ' ').replace(/\\n{3,}/g, '\\n\\n').trim().slice(0, 20000);
  out.img = abs(m('og:image') || m('twitter:image') || ldImg || readImg);
  out.desc = out.desc.replace(/\\s+/g, ' ').trim();
  return out;
})()`;

function cleanUrl(u) {
  try {
    const x = new URL(u);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'].forEach((p) => x.searchParams.delete(p));
    x.hash = '';
    return x.href;
  } catch (e) { return u; }
}

async function extract(url, hint) {
  setup();
  hint = hint || {};
  const win = new BrowserWindow({
    show: false, width: 1280, height: 900,
    webPreferences: { partition: PART, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, images: false, webSecurity: true }
  });
  const wc = win.webContents;
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  let data = null;
  try {
    await Promise.race([
      wc.loadURL(url, { userAgent: wc.session.getUserAgent().replace(/\s?Electron\/\S+/, '').replace(/\s?tf-media-studio\/\S+/, '') }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 25000))
    ]).catch(() => {});
    await new Promise((r) => setTimeout(r, 1200)); // let scripts that build the article finish
    if (!wc.isDestroyed()) data = await wc.executeJavaScript(readabilitySrc + '\n' + PAGE_SCRIPT, true);
  } catch (e) { data = null; }
  finally { try { if (!win.isDestroyed()) win.destroy(); } catch (e) {} }

  data = data || {};
  let title = String(data.title || hint.title || '').trim();
  const site = String(data.site || '').trim();
  title = title.replace(/\s*\|\s*[^|]{2,40}$/, '');
  if (site && title.endsWith(site)) title = title.slice(0, -site.length).replace(/[\s|\-–—:]+$/, '');
  title = title.trim() || String(hint.title || '').trim();
  const link = cleanUrl(data.canonical && /^https?:/.test(data.canonical) && new URL(data.canonical).hostname === new URL(url).hostname ? data.canonical : url);
  return {
    title,
    link,
    img: data.img || hint.img || '',
    desc: String(data.desc || '').slice(0, 400) || String(data.text || '').slice(0, 300),
    text: String(data.text || ''),
    site,
    date: data.date || ''
  };
}

module.exports = { extract, cleanUrl };
