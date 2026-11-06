'use strict';
// Newspaper browser helper. While "বাছাই" is ON, the story under the mouse gets a gold frame and one click
// collects it (headline, full text and photo come automatically). When it is OFF the site works normally.
const { ipcRenderer } = require('electron');
let on = false, box = null, tip = null, tipTimer = null;

const BASE2 = new Set(['com', 'co', 'org', 'net', 'gov', 'edu', 'ac']);
function baseDomain(h) {
  const p = String(h || '').toLowerCase().split('.'); if (p.length <= 2) return p.join('.');
  return (BASE2.has(p[p.length - 2]) ? p.slice(-3) : p.slice(-2)).join('.');
}
const BAD = /\/(tag|tags|category|categories|topic|topics|author|authors|search|login|signin|subscribe|about|contact|advertise|privacy|terms|archive|epaper|e-paper)(\/|$|\?)/i;
function articleLike(href) {
  try {
    const u = new URL(href, location.href);
    if (!/^https?:$/.test(u.protocol)) return false;
    if (baseDomain(u.hostname) !== baseDomain(location.hostname)) return false;
    if (u.pathname === '/' || u.pathname === '') return false;
    if (u.href.split('#')[0] === location.href.split('#')[0]) return false;
    if (BAD.test(u.pathname)) return false;
    const segs = u.pathname.split('/').filter(Boolean);
    return segs.length >= 2 || u.pathname.length >= 12 || /\d{4,}/.test(u.pathname);
  } catch (e) { return false; }
}
function bgUrl(el) {
  try { const m = getComputedStyle(el).backgroundImage.match(/url\((['"]?)(.*?)\1\)/); return m ? m[2] : ''; } catch (e) { return ''; }
}
function bestFromSrcset(s) {
  let best = '', bw = -1;
  String(s || '').split(',').forEach((p) => { const t = p.trim().split(/\s+/); if (!t[0]) return; const w = parseFloat(t[1]) || 1; if (w > bw) { bw = w; best = t[0]; } });
  return best;
}
function imgUrl(img) {
  const lazy = img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('data-lazy-src') || img.getAttribute('data-srcset');
  let u = img.currentSrc || img.src || '';
  if (!u || /^data:/.test(u) || /\.svg(\?|$)/i.test(u)) u = lazy ? (lazy.includes(' ') ? bestFromSrcset(lazy) : lazy) : u;
  const ss = img.getAttribute('srcset'); if (ss) { const b = bestFromSrcset(ss); if (b) u = b; }
  try { return new URL(u, location.href).href; } catch (e) { return ''; }
}
function imgWithin(root) {
  const im = root.querySelector && root.querySelector('img');
  if (im) { const u = imgUrl(im); if (u) return u; }
  const all = root.querySelectorAll ? root.querySelectorAll('*') : [];
  for (let i = 0; i < Math.min(all.length, 40); i++) { const b = bgUrl(all[i]); if (b) { try { return new URL(b, location.href).href; } catch (e) {} } }
  return '';
}
function storyAt(x, y) {
  const els = document.elementsFromPoint(x, y);
  for (const el of els) {
    if (el === box || el === tip) continue;
    const a = el.closest && el.closest('a[href]');
    if (a && articleLike(a.href)) return mk(a, el);
  }
  // a picture or block with no link of its own: look for the story link in the same card
  for (const el of els) {
    if (el === box || el === tip || !el.closest) continue;
    let c = el, n = 0;
    while (c && c !== document.body && n < 5) {
      const links = [...c.querySelectorAll('a[href]')].filter((a) => articleLike(a.href));
      const uniq = new Set(links.map((a) => a.href.split('#')[0]));
      if (uniq.size === 1) return mk(links[0], c);
      if (uniq.size > 1) break;
      c = c.parentElement; n++;
    }
  }
  return null;
}
function mk(a, el) {
  const card = a.closest('article,li') || a;
  let title = (a.getAttribute('title') || a.innerText || a.textContent || '').replace(/\s+/g, ' ').trim();
  if (title.length < 8) { const h = card.querySelector('h1,h2,h3,h4'); if (h) title = (h.innerText || h.textContent || '').replace(/\s+/g, ' ').trim(); }
  if (title.length < 8) { const im = a.querySelector('img') || card.querySelector('img'); if (im) title = (im.getAttribute('alt') || '').trim(); }
  const rect = (a.getBoundingClientRect().width * a.getBoundingClientRect().height < 400 ? el : a).getBoundingClientRect();
  return { a, href: a.href, title: title.slice(0, 220), img: imgWithin(a) || imgWithin(card), rect };
}

function ensureBox() {
  if (box) return box;
  box = document.createElement('div');
  box.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;border:3px solid #f5bd3c;box-shadow:0 0 0 2px rgba(0,0,0,.45),0 0 18px rgba(245,189,60,.7);border-radius:6px;display:none';
  (document.documentElement || document).appendChild(box);
  return box;
}
function hide() { if (box) box.style.display = 'none'; }
function show(r) {
  const b = ensureBox(); b.style.display = 'block';
  b.style.left = Math.max(0, r.left) + 'px'; b.style.top = Math.max(0, r.top) + 'px';
  b.style.width = Math.max(8, r.width - 6) + 'px'; b.style.height = Math.max(8, r.height - 6) + 'px';
}
function say(msg, x, y, ok) {
  if (!tip) {
    tip = document.createElement('div');
    tip.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;padding:8px 14px;border-radius:999px;font:600 14px "Noto Sans Bengali","Nirmala UI",sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.45);display:none';
    (document.documentElement || document).appendChild(tip);
  }
  tip.textContent = msg;
  tip.style.background = ok === false ? '#b3261e' : (ok ? '#1fb6a6' : '#0e1a3a');
  tip.style.color = ok ? '#06231f' : '#fff';
  if (ok === false) tip.style.color = '#fff';
  tip.style.left = Math.min(innerWidth - 240, Math.max(8, x + 14)) + 'px';
  tip.style.top = Math.min(innerHeight - 50, Math.max(8, y + 14)) + 'px';
  tip.style.display = 'block';
  clearTimeout(tipTimer);
  if (ok !== undefined) tipTimer = setTimeout(() => { tip.style.display = 'none'; }, 2200);
}

let lastXY = [0, 0];
document.addEventListener('mousemove', (e) => {
  if (!on) return; lastXY = [e.clientX, e.clientY];
  const s = storyAt(e.clientX, e.clientY);
  if (s) show(s.rect); else hide();
}, true);
function block(e) {
  if (!on) return;
  const s = storyAt(e.clientX, e.clientY);
  if (!s) return; // menus, ads and other links work normally
  e.preventDefault(); e.stopImmediatePropagation();
  if (e.type === 'click') {
    say('খবর আনা হচ্ছে…', e.clientX, e.clientY);
    if (box) { box.style.background = 'rgba(245,189,60,.3)'; setTimeout(() => { if (box) box.style.background = ''; }, 300); }
    ipcRenderer.send('tf:collect', { href: s.href, title: s.title, img: s.img });
  }
}
['click', 'mousedown', 'mouseup', 'auxclick', 'dblclick'].forEach((t) => document.addEventListener(t, block, true));
document.addEventListener('keydown', (e) => { if (on && e.key === 'Escape') ipcRenderer.send('tf:pick-exit'); }, true);
window.addEventListener('scroll', hide, true);

ipcRenderer.on('tf:collect-result', (e, r) => { if (r && r.msg) say(r.msg, lastXY[0], lastXY[1], !!r.ok); });
ipcRenderer.on('tf:pick-mode', (e, v) => {
  on = !!v;
  let st = document.getElementById('__tf_pick_css');
  if (on && !st) {
    st = document.createElement('style'); st.id = '__tf_pick_css'; st.textContent = '*{cursor:copy !important}';
    (document.head || document.documentElement).appendChild(st);
  } else if (!on) { if (st) st.remove(); hide(); if (tip) tip.style.display = 'none'; }
});

// ---- cosmetic ad hiding ----
const AD_CSS = 'ins.adsbygoogle,[id^="google_ads"],[id^="div-gpt-ad"],[class*="adsbygoogle"],iframe[src*="doubleclick"],iframe[src*="googlesyndication"],iframe[id^="google_ads"],[class~="ad"],[class~="ads"],[class~="advert"],[class~="advertisement"],[class*="ad-slot"],[class*="adslot"],[class*="ad-container"],[class*="ad-wrapper"],[class*="banner-ad"],[class*="sticky-ad"],[id*="advert"],[class*="dfp"],[class*="taboola"],[id*="taboola"],[class*="outbrain"],[class*="popup-ad"],[class*="floating-ad"],[class*="ad_box"],[class*="adbox"],[class*="addvert"]{display:none !important;visibility:hidden !important;height:0 !important;min-height:0 !important}';
function setAds(v) {
  let st = document.getElementById('__tf_ad_css');
  if (v && !st) { st = document.createElement('style'); st.id = '__tf_ad_css'; st.textContent = AD_CSS; (document.head || document.documentElement).appendChild(st); }
  else if (!v && st) st.remove();
}
ipcRenderer.on('tf:adblock', (e, v) => setAds(!!v));
