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

  // 4) Demo only on request: a small "ডেমো" button above the script box.
  try {
    const ta = document.getElementById('script');
    if (ta && !document.getElementById('tfDemoBtn')) {
      const b = document.createElement('button');
      b.id = 'tfDemoBtn'; b.type = 'button'; b.textContent = 'ডেমো';
      b.style.cssText = 'margin:0 0 8px;padding:5px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.25);background:transparent;color:inherit;font:inherit;font-size:13px;cursor:pointer';
      b.onclick = () => {
        if (ta.value.trim() && !confirm('এখনকার লেখা মুছে ডেমো খবর বসাবেন?')) return;
        ta.value = SAMPLE; ta.dispatchEvent(new Event('input', { bubbles: true }));
        try { save(); } catch (e) {} try { build(true); } catch (e) {}
      };
      ta.parentNode.insertBefore(b, ta);
    }
  } catch (e) {}
  // 5) Fast, professional export: every frame is drawn offline (no waiting for real time), voice + music + sound effects are
  //    mixed offline with ducking, then the bundled FFmpeg makes an MP4 with levelled loudness. Falls back to the old recorder.
  try {
    const R = window.tfShell && window.tfShell.render;
    const X = () => window.TFX;
    const _exp = exportVideo;
    const sfxAt = (type, t0) => {
      if (type === 'whoosh') noiseHit(t0, .14, .5, .34, 'bandpass', 300, 2600, 1.1);
      else if (type === 'pop') tone(520, 1150, t0, .005, .28, .1);
      else if (type === 'ding') { tone(1320, 0, t0, .005, .18, .7); tone(1980, 0, t0, .005, .08, .5); }
      else if (type === 'hit') { tone(130, 42, t0, .005, .9, .6); noiseHit(t0, .003, .4, .25, 'lowpass', 900, 200); }
      else if (type === 'sting') { [[880, 0], [660, .13], [990, .26]].forEach(([f, d]) => tone(f, 0, t0 + d, .005, .22, .32, 'triangle')); noiseHit(t0, .002, .25, .2, 'highpass', 3000); }
      else if (type === 'chime') { [660, 880, 1320].forEach((f, i) => tone(f, 0, t0 + i * .12, .005, .2, .8)); }
      else if (type === 'soft') noiseHit(t0, .1, .16, .22, 'bandpass', 600, 1900, 1);
      else if (type === 'riser') noiseHit(t0, .6, .35, .15, 'bandpass', 200, 4000, 2);
    };
    const decode = async (oc, url) => { const ab = await (await fetch(url)).arrayBuffer(); return oc.decodeAudioData(ab); };
    async function mixAudio() {
      const { TL, vo, voicePos, vOutT, mSeg } = X();
      const sr = 44100, oc = new OfflineAudioContext(2, Math.max(sr, Math.ceil(total * sr)), sr);
      const bus = oc.createGain(); bus.connect(oc.destination);
      let any = false, voiceBuf = null;
      if (hasAudio && audioEl.src) {
        try {
          voiceBuf = await decode(oc, audioEl.src);
          const src = oc.createBufferSource(); src.buffer = voiceBuf; src.connect(bus);
          const o = vo(), a = TL.vIn || 0, b = vOutT(), when = Math.max(0, o + a), off = when - o;
          if (b - off > .05) { src.start(when, off, b - off); any = true; }
        } catch (e) { voiceBuf = null; }
      }
      if (hasMusic && musicEl.src && +settings.musicVol > 0) {
        try {
          const mb = await decode(oc, musicEl.src);
          const src = oc.createBufferSource(); src.buffer = mb;
          const [a, b] = mSeg(), o = TL.mOff || 0, len = b - a;
          const g = oc.createGain(); g.gain.value = 0; src.connect(g); g.connect(bus);
          // voice activity (loudness in 50 ms windows) → music ducks under speech, like the live preview
          const win = .05; let act = [];
          if (voiceBuf) {
            const ch = voiceBuf.getChannelData(0), n = Math.floor(ch.length / (voiceBuf.sampleRate * win));
            const w = Math.floor(voiceBuf.sampleRate * win);
            for (let i = 0; i < n; i++) { let sum = 0; for (let k = 0; k < w; k += 4) { const v = ch[i * w + k]; sum += v * v; } act.push(Math.sqrt(sum / (w / 4))); }
          }
          const speakAt = (p) => { const i = Math.floor(p / win); for (let k = i - 2; k <= i + 1; k++) if (act[k] > .012) return true; return false; };
          const base = +settings.musicVol || 0, clampf = (x) => Math.max(0, Math.min(1, x));
          for (let t = 0; t <= total + .05; t += .033) {
            const sc = scenes[sceneAt(Math.min(t, total - .001))], big = sc && (sc.special || sc.isChapter);
            const vAct = voicePos(t) != null; let tgt, tc = .3;
            if (vAct) { if (settings.duck !== false && speakAt(t - vo()) && !big) { tgt = base * .22; tc = .06; } else tgt = base * (big ? 1 : .7); }
            else tgt = base * (big ? 1.1 : .85);
            tgt *= clampf((t - o) / .8) * clampf((total - t) / 2.5);
            g.gain.setTargetAtTime(Math.min(1, tgt), t, tc);
          }
          if (TL.mLoop) { src.loop = true; src.loopStart = a; src.loopEnd = b; src.start(Math.max(0, o), a); }
          else src.start(Math.max(0, o), a, len);
          src.stop(total + .1); any = true;
        } catch (e) { console.error('music mix', e); }
      }
      if (settings.sfx) {
        const keep = { actx, sfxGain, noiseBuf };
        try {
          buildEvents(); actx = oc; noiseBuf = null;
          const sg = oc.createGain(); sg.gain.value = +settings.sfxVol; sg.connect(bus); sfxGain = sg;
          EVENTS.forEach(([t, type]) => { sfxAt(type, Math.max(0, t) + .01); any = true; });
        } catch (e) { console.error('sfx mix', e); }
        finally { actx = keep.actx; sfxGain = keep.sfxGain; noiseBuf = keep.noiseBuf; }
      }
      if (!any) return null;
      const out = await oc.startRendering();
      return await toWav(out).arrayBuffer();
    }
    async function fastExport() {
      const fps = 30, N = Math.max(1, Math.ceil(total * fps));
      try { await document.fonts.ready; } catch (e) {}
      pause();
      const ov = document.getElementById('exOv'), bar = document.getElementById('exBar'), txt = document.getElementById('exTxt');
      let cancelled = false; const cbtn = document.getElementById('exCancel');
      ov.classList.remove('hidden'); bar.style.width = '0%'; txt.textContent = 'শব্দ তৈরি হচ্ছে…';
      cbtn.onclick = () => { cancelled = true; };
      const _T = T; exporting = { finish() {}, fast: true };
      let started = false;
      try {
        await new Promise((r) => setTimeout(r, 30));
        const wav = await mixAudio();
        const st = await R.start({ w: cv.width, h: cv.height, fps, wav, name: (settings.brand || 'TF-News').replace(/[^\wঀ-৿-]+/g, '-') + '-' + settings.aspect.replace(':', 'x') + '-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') });
        if (!st || !st.ok) throw Object.assign(new Error((st && st.msg) || 'engine'), { engine: true });
        started = true;
        const t0 = performance.now(), pend = []; let chain = Promise.resolve();
        for (let f = 0; f < N; f++) {
          if (cancelled) throw Object.assign(new Error('cancel'), { cancelled: true });
          T = Math.min(f / fps, Math.max(0, total - .001)); resetEv(T);
          renderAt(T);
          // the picture is captured right now; encoding and sending run in the background while the next frame is drawn (order is kept)
          const enc = new Promise((r) => cv.toBlob(r, 'image/jpeg', .92)).then((b) => b.arrayBuffer());
          chain = chain.then(() => enc).then((b) => R.frame(b));
          pend.push(chain);
          if (pend.length >= 8) await pend.shift();
          if (f % 6 === 0) {
            const done = f / N, el = (performance.now() - t0) / 1000, rate = f / Math.max(.1, el);
            bar.style.width = (done * 100).toFixed(1) + '%';
            txt.textContent = 'ভিডিও তৈরি হচ্ছে… ' + toBn(Math.round(done * 100)) + '%' + (f > 30 ? ' · বাকি ' + toBn(Math.ceil((N - f) / rate)) + ' সেকেন্ড' : '');
            await new Promise((r) => setTimeout(r, 0));
          }
        }
        await Promise.all(pend);
        txt.textContent = 'ফাইল তৈরি শেষ হচ্ছে…'; bar.style.width = '100%';
        const fin = await R.finish(); started = false;
        if (!fin || !fin.ok) throw new Error((fin && fin.msg) || 'finish');
        return true;
      } catch (e) {
        if (started) { try { await R.cancel(); } catch (x) {} }
        throw e;
      } finally {
        exporting = null; T = _T; dirty = true; ov.classList.add('hidden');
      }
    }
    exportVideo = async function () {
      if (!scenes.length || !R || !X() || GALLERY.some((g) => g.kind === 'video')) return _exp.apply(this, arguments);
      let ok = false; try { ok = await R.available(); } catch (e) {}
      if (!ok) return _exp.apply(this, arguments);
      try { await fastExport(); }
      catch (e) {
        if (e && e.cancelled) return;
        console.error('fast export', e);
        if (e && e.engine) return _exp.apply(this, arguments);
        alert('ভিডিও বানানো যায়নি: ' + ((e && e.message) || 'অজানা ত্রুটি') + '\nআবার চেষ্টা করুন।');
      }
    };
  } catch (e) { console.error('fast export patch', e); }
  // 6) News sent from the "খবর" tab become a finished video draft straight away: headlines first, then the full stories, photos in place.
  //    (Before, the text only landed in a box and the user had to go through the Gemini copy/paste steps.) AI modes stay available by hand.
  try {
    const _nu = nwUse;
    nwUse = async function (list) {
      const r = await _nu.apply(this, arguments);
      try {
        const modeBtn = document.querySelector('#wrMode button.on');
        const apiMode = modeBtn && modeBtn.dataset.m === 'api';
        const raw = document.getElementById('rawText');
        if (r !== false && !apiMode && raw && raw.value.trim()) {
          const b = document.getElementById('wrRawW');
          if (b) { b.click(); }
          else if (typeof window.tfRawToScript === 'function') {
            const sc = document.getElementById('script');
            sc.value = window.tfEnsureHeads ? window.tfEnsureHeads(window.tfRawToScript(raw.value)) : window.tfRawToScript(raw.value);
            sc.dispatchEvent(new Event('input', { bubbles: true })); build(false); try { save(); } catch (e) {}
          }
          try { if (typeof window.tfShowPane === 'function') window.tfShowPane('script'); } catch (e) {}
        }
      } catch (e) { console.error('auto build', e); }
      return r;
    };
  } catch (e) {}
  // 7) Desktop project flow: "নতুন" goes to the home screen (where a new project is chosen), the save button keeps the project
  //    in the home screen's project list, and an opened project gets its voice back.
  try {
    freshStart = async function () { try { window.tfShell.openHome(); } catch (e) {} };
    document.querySelectorAll('.freshStart').forEach((b) => { b.onclick = () => freshStart(); });
    const _sp = saveProject;
    saveProject = async function () {
      try { const r = await window.tfShell.saveProject(); if (r) { if (typeof toast === 'function') toast('প্রজেক্ট সেভ হয়েছে — হোম স্ক্রিনে পাবেন', 'ok'); else alert('প্রজেক্ট সেভ হয়েছে'); return; } }
      catch (e) {}
      return _sp.apply(this, arguments);
    };
    const top = document.getElementById('projSave'); if (top) top.onclick = () => saveProject();
    document.querySelectorAll('#tfTopBtns .tbtn').forEach((b) => {
      const t = b.textContent.trim();
      if (t === 'নতুন') { b.lastChild.textContent = 'নতুন প্রজেক্ট'; b.onclick = () => freshStart(); }
      if (t === 'সেভ') { b.onclick = () => saveProject(); b.title = 'প্রজেক্ট সেভ করুন'; }
    });
    (async () => {
      const v = await window.tfShell.pendingVoice();
      if (!v || !v.data) return;
      const inp = document.getElementById('audioFile'); if (!inp) return;
      const ext = /mpeg|mp3/.test(v.type) ? 'mp3' : /webm/.test(v.type) ? 'webm' : /ogg/.test(v.type) ? 'ogg' : 'wav';
      const f = new File([v.data], 'voice.' + ext, { type: v.type });
      const dt = new DataTransfer(); dt.items.add(f); inp.files = dt.files;
      if (!scenes.length && document.getElementById('script').value.trim()) { try { build(true); } catch (e) {} }
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    })().catch(() => {});
  } catch (e) { console.error('project flow', e); }

  // 8) Clean look inside the combined app: the shell already shows the brand, so the editor's own logo/name row is hidden.
  try {
    const st = document.createElement('style');
    st.textContent = '#tfTop .brand{display:none!important}';
    document.head.appendChild(st);
  } catch (e) {}
})();
