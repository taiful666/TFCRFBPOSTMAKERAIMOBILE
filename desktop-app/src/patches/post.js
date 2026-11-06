/* Desktop fixes for TF FB Reels & Post Maker (this file runs inside the app page, desktop version only). */
(function () {
  if (window.__tfDesk) return; window.__tfDesk = 1;
  const hub = () => { try { window.tfShell && window.tfShell.openHub(); } catch (e) {} };
  // One mother place for collecting news: the "খবর" tab. Live news and the newspaper list now open it.
  try { nwOpen = function () { hub(); }; } catch (e) {}
  try { ppOpen = function () { hub(); }; } catch (e) {}
})();
(function () {
  const hub = () => { try { window.tfShell && window.tfShell.openHub(); } catch (e) {} };
  // buttons that were wired before this file ran (home tiles, live-news button, papers tile) → the mother "খবর" tab
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('#liveNewsBtn, .v6quick .qtile.big, .v6quick .rlwide, .v6quick .pptile2');
    if (!b) return;
    e.preventDefault(); e.stopImmediatePropagation(); hub();
  }, true);
})();
(function () {
  // Clean desktop look: no explanation lines under the buttons, and the news entries (live news, multi-news reel, papers)
  // live only in the studio's own "খবর" tab, so they are not repeated here.
  try {
    const st = document.createElement('style');
    st.textContent = '.v6quick .qtile small,.v6quick .qt small,.v6hero p{display:none!important}'
      + '.v6quick .qtile.big,.v6quick .rlwide,.v6quick .pptile2,#liveNewsBtn{display:none!important}';
    document.head.appendChild(st);
    const fix = () => document.querySelectorAll('h1,b,span,div').forEach((el) => {
      if (el.childElementCount === 0 && el.textContent.trim() === 'TF FB Reels & Post Maker') el.textContent = 'পোস্ট ও রিল স্টুডিও';
    });
    fix(); setTimeout(fix, 800);
  } catch (e) {}
})();
