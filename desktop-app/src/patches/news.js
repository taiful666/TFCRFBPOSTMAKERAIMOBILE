/* Desktop fixes for TF News Studio (this file runs inside the app page, desktop version only). */
(function () {
  if (window.__tfDesk) return; window.__tfDesk = 1;
  const hub = () => { try { window.tfShell && window.tfShell.openHub(); } catch (e) {} };

  // 1) One mother place for collecting news: the "খবর" tab. The app's own newspaper window now opens it.
  try {
    const _g = nwGo;
    nwGo = function (id) { if (id === 'news') { hub(); return; } try { return _g.apply(this, arguments); } catch (e) {} };
  } catch (e) {}

  // 2) Photos that already arrive as data (from the hub) must pass through untouched.
  try {
    const _nb = nwImgBlob;
    nwImgBlob = async function (u) {
      if (/^data:/.test(String(u))) return (await fetch(u)).blob();
      try { const r = await fetch(u); if (r.ok) { const b = await r.blob(); if (/^image\//.test(b.type)) return b; } } catch (e) {}
      return _nb(u);
    };
  } catch (e) {}

  // 3) News numbers: headlines count 1, 2, 3 … one by one; then the full stories count 1, 2, 3 … again.
  try {
    const _l = layout;
    layout = function () {
      _l.apply(this, arguments);
      try {
        let inHead = false, hk = 0, news = 0; const hasHead = scenes.some(s => isHeadSc(s));
        scenes.forEach(sc => {
          if (sc.special) return;
          if (sc.isChapter) {
            if (isHeadSc(sc)) { inHead = true; hk = 0; sc.chapterNo = 1; return; }
            inHead = false; news++; sc.chapterNo = news; return;
          }
          if (inHead) { sc.chapterNo = /এবার বিস্তারিত|বিস্তারিত খবর/.test(sc.text) ? 1 : ++hk; return; }
          sc.chapterNo = Math.max(1, news);
        });
        if (hasHead && typeof G === 'object') G.chapters = Math.max(1, news);
      } catch (e) {}
    };
    if (typeof scenes !== 'undefined' && scenes.length && typeof build === 'function') { try { build(true); } catch (e) {} }
  } catch (e) {}
})();
