'use strict';
// Newspaper browser helper: when "ছবি বাছাই" is ON, hovering shows a gold frame around the picture under
// the mouse and one click sends that picture to the chosen app. Nothing else on the page is changed.
const { ipcRenderer } = require('electron');
let on = false, box = null, last = null;

function ensureBox() {
  if (box) return box;
  box = document.createElement('div');
  box.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;border:3px solid #f5bd3c;box-shadow:0 0 0 2px rgba(0,0,0,.45),0 0 18px rgba(245,189,60,.7);border-radius:6px;display:none;transition:all .05s';
  (document.documentElement || document).appendChild(box);
  return box;
}
function bgUrl(el) {
  try {
    const bg = getComputedStyle(el).backgroundImage;
    const m = bg && bg.match(/url\((['"]?)(.*?)\1\)/);
    return m ? m[2] : '';
  } catch (e) { return ''; }
}
function bestFromSrcset(s) {
  let best = '', bw = -1;
  String(s || '').split(',').forEach((p) => {
    const t = p.trim().split(/\s+/); if (!t[0]) return;
    const w = parseFloat(t[1]) || 1;
    if (w > bw) { bw = w; best = t[0]; }
  });
  return best;
}
function imgUrl(img) {
  const lazy = img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('data-lazy-src') || img.getAttribute('data-srcset');
  let u = img.currentSrc || img.src || '';
  if (!u || /^data:/.test(u) || /\.svg(\?|$)/i.test(u)) u = (lazy ? (lazy.includes(' ') ? bestFromSrcset(lazy) : lazy) : u);
  const ss = img.getAttribute('srcset');
  if (ss) { const b = bestFromSrcset(ss); if (b) u = b; }
  try { return new URL(u, location.href).href; } catch (e) { return ''; }
}
function findImage(x, y) {
  const els = document.elementsFromPoint(x, y);
  for (const el of els) {
    if (el === box) continue;
    if (el.tagName === 'IMG') { const u = imgUrl(el); if (u) return { el, url: u }; }
    if (el.tagName === 'PICTURE') { const im = el.querySelector('img'); if (im) { const u = imgUrl(im); if (u) return { el, url: u }; } }
    const b = bgUrl(el);
    if (b) { try { return { el, url: new URL(b, location.href).href }; } catch (e) {} }
  }
  return null;
}
function hide() { if (box) box.style.display = 'none'; last = null; }
function show(el) {
  const r = el.getBoundingClientRect(), b = ensureBox();
  b.style.display = 'block';
  b.style.left = r.left + 'px'; b.style.top = r.top + 'px';
  b.style.width = Math.max(0, r.width - 6) + 'px'; b.style.height = Math.max(0, r.height - 6) + 'px';
}
document.addEventListener('mousemove', (e) => {
  if (!on) return;
  const f = findImage(e.clientX, e.clientY);
  if (f) { last = f; show(f.el); } else hide();
}, true);
function block(e) {
  if (!on) return;
  const f = findImage(e.clientX, e.clientY);
  if (!f) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (e.type === 'click') {
    ipcRenderer.send('tf:picked', { src: f.url, page: location.href });
    if (box) { box.style.background = 'rgba(245,189,60,.35)'; setTimeout(() => { if (box) box.style.background = ''; }, 250); }
  }
}
['click', 'mousedown', 'mouseup', 'auxclick'].forEach((t) => document.addEventListener(t, block, true));
document.addEventListener('keydown', (e) => { if (on && e.key === 'Escape') ipcRenderer.send('tf:pick-exit'); }, true);
window.addEventListener('scroll', hide, true);

ipcRenderer.on('tf:pick-mode', (e, v) => {
  on = !!v;
  let st = document.getElementById('__tf_pick_css');
  if (on && !st) {
    st = document.createElement('style'); st.id = '__tf_pick_css';
    st.textContent = '*{cursor:crosshair !important}';
    (document.head || document.documentElement).appendChild(st);
  } else if (!on && st) { st.remove(); hide(); }
});
