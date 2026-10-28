/*
 * Browser test for the Multi-news Reel: video recording, save, share and photo cards.
 *
 * Run:  node tests/reel-mobile.test.js
 * Needs: the "playwright" package with a Chromium build (npm i -D playwright && npx playwright install chromium).
 *
 * It opens index.html in Chromium with an Android phone profile (Pixel 7), blocks all outside
 * network traffic, and serves a TEST COPY of the page that exposes the reel's internals on
 * window.__rl (the real index.html is not changed). Web Share is replaced by a fake so every
 * outcome (success, cancel, refused, unsupported, error) can be checked.
 *
 * NOTE: this is desktop Chromium pretending to be a phone. It checks the code paths, file
 * formats and downloads, but it is not a replacement for a final check on a real Android phone.
 */
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'https://app.test';
const HOOK_AFTER = "document.addEventListener('keydown', e => { if(e.key === 'Escape' && RL.open && !RL.busy) rlClose(); });";
const HOOK = "\nwindow.__rl = { RL, rlOpen, rlMake, rlCardsGo, rlFile, rlMime, rlMimeList, rlShareBatch, download };\n";

let failures = 0, passes = 0;
function check(name, ok, info) {
  if (ok) { passes++; console.log('  PASS  ' + name); }
  else { failures++; console.log('  FAIL  ' + name + (info !== undefined ? '  →  ' + JSON.stringify(info) : '')); }
}

function testHtml() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  if (html.split(HOOK_AFTER).length !== 2) throw new Error('test hook anchor not found in index.html');
  return html.replace(HOOK_AFTER, HOOK_AFTER + HOOK);
}

// fake Web Share; window.__shareMode decides what happens
const FAKE_SHARE = `
  window.__shareMode = 'ok'; window.__shared = [];
  window.__installShare = mode => {
    window.__shareMode = mode;
    if (mode === 'none') { try { delete Navigator.prototype.share; delete Navigator.prototype.canShare; } catch (e) {}
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true }); return; }
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: d => !!(d && d.files && d.files.length) });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async d => {
      const m = window.__shareMode;
      if (m === 'abort') throw new DOMException('cancelled', 'AbortError');
      if (m === 'denied') throw new DOMException('no activation', 'NotAllowedError');
      if (m === 'error') throw new DOMException('boom', 'DataError');
      if (d.files.length > 10) throw new DOMException('too many files', 'NotAllowedError');   // like Chrome
      window.__shared.push(d.files.map(f => ({ name: f.name, type: f.type, size: f.size })));
    } });
  };
  window.__installShare('ok');
  // remember every blob: URL handed out, so the test can check it is still alive later
  window.__urls = [];
  const cou = URL.createObjectURL.bind(URL);
  URL.createObjectURL = b => { const u = cou(b); window.__urls.push(u); return u; };
`;

// optional: pretend this browser cannot record MP4 (like Firefox / older Chrome)
const NO_MP4 = `
  const its = MediaRecorder.isTypeSupported.bind(MediaRecorder);
  MediaRecorder.isTypeSupported = m => /mp4/.test(m) ? false : its(m);
`;
// optional: the first format is "supported" but the constructor refuses it (seen on some Android builds)
const CTOR_REFUSES_FIRST = `
  const MR = window.MediaRecorder; let first = true;
  window.MediaRecorder = function (s, o) { if (first && o && o.mimeType) { first = false; throw new DOMException('nope', 'NotSupportedError'); } return new MR(s, o); };
  window.MediaRecorder.prototype = MR.prototype; window.MediaRecorder.isTypeSupported = MR.isTypeSupported.bind(MR);
`;

async function newPage(browser, extraInit) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'], acceptDownloads: true, serviceWorkers: 'block', locale: 'bn-BD' });
  const html = testHtml();
  await ctx.route('**/*', route => {
    const u = new URL(route.request().url());
    if (u.origin !== ORIGIN) return route.abort();
    const p = u.pathname === '/' ? '/index.html' : u.pathname;
    if (p === '/index.html') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
    const f = path.join(ROOT, p);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return route.fulfill({ status: 200, path: f });
    return route.fulfill({ status: 404, body: '' });
  });
  await ctx.addInitScript(FAKE_SHARE + (extraInit || ''));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(ORIGIN + '/', { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__rl, null, { timeout: 15000 });
  return { ctx, page, errors };
}

// put n stories (with generated photos) into the reel and open it
async function loadStories(page, n, music) {
  await page.evaluate(({ n, music }) => {
    const R = window.__rl.RL;
    const photo = i => { const c = document.createElement('canvas'); c.width = 800; c.height = 500; const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 800, 500); g.addColorStop(0, `hsl(${i * 37 % 360},70%,45%)`); g.addColorStop(1, `hsl(${(i * 37 + 120) % 360},70%,25%)`);
      x.fillStyle = g; x.fillRect(0, 0, 800, 500); x.fillStyle = '#fff'; x.font = 'bold 120px sans-serif'; x.fillText('#' + (i + 1), 300, 300); return c.toDataURL('image/jpeg', 0.85); };
    R.sel = new Map(); R.items = []; R.cardFiles = null;
    for (let i = 0; i < n; i++) {
      const o = { link: 'https://example.com/news/' + i, title: 'পরীক্ষামূলক খবর নম্বর ' + (i + 1) + ' — test story ' + (i + 1), src: { bn: 'উদাহরণ', en: 'Example', d: 'example.com' }, date: new Date(), img: photo(i) };
      R.sel.set(o.link, o);
    }
    R.music = music; R.secs = 1;
    window.__rl.rlOpen();
  }, { n, music });
}

const toastText = page => page.evaluate(() => document.getElementById('toast').textContent);

async function makeVideo(page) {
  await page.evaluate(() => window.__rl.rlMake());
  return page.evaluate(() => { const R = window.__rl.RL; return R.blob ? { size: R.blob.size, type: R.blob.type, name: window.__rl.rlFile().name } : null; });
}

async function videoInfo(page) {
  return page.evaluate(() => new Promise(res => {
    const v = document.getElementById('rlVideo');
    const done = () => res({ w: v.videoWidth, h: v.videoHeight, dur: v.duration, err: v.error && v.error.code, t: v.currentTime });
    v.muted = true;
    if (v.readyState >= 1) { v.play().catch(() => {}); setTimeout(done, 1200); }
    else { v.onloadedmetadata = () => { v.play().catch(() => {}); setTimeout(done, 1200); }; v.onerror = done; setTimeout(done, 5000); }
  }));
}

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'], env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } })   // UTF-8 so Bangla file names survive;
  const dlDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-dl-'));
  try {
    // ---------------------------------------------------------------- 1) normal browser, with music
    console.log('\n[1] Reel with 3 stories + music (browser picks its best format)');
    {
      const { ctx, page, errors } = await newPage(browser);
      const fmt = await page.evaluate(() => ({ list: window.__rl.rlMimeList(true), pick: window.__rl.rlMime(true) }));
      console.log('      supported formats:', fmt.list.join(' | ') || '(none)');
      await loadStories(page, 3, 'beat');
      const v = await makeVideo(page);
      check('video was made', !!v && v.size > 10000, v);
      const ext = v && v.name.split('.').pop();
      check('file extension matches real format', v && ((/mp4/.test(v.type) && ext === 'mp4') || (/webm/.test(v.type) && ext === 'webm')), v);
      check('blob type is the recorder\'s type', v && fmt.pick && v.type === fmt.pick.split(';')[0], { v, pick: fmt.pick });
      const vi = await videoInfo(page);
      check('preview video decodes (720×1280)', vi.w === 720 && vi.h === 1280 && !vi.err, vi);
      check('preview video plays', vi.t > 0, vi);

      // save → real download with the right name/size; blob URL still alive after 5 s
      const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#rlSave')]);
      const saved = path.join(dlDir, dl.suggestedFilename()); await dl.saveAs(saved);
      check('save downloads the file with the right name', dl.suggestedFilename() === v.name, dl.suggestedFilename());
      check('downloaded size equals video size', fs.statSync(saved).size === v.size, { disk: fs.statSync(saved).size, blob: v.size });
      check('save toast does not falsely say "saved"', /ডাউনলোড শুরু/.test(await toastText(page)), await toastText(page));
      await page.waitForTimeout(5500);
      const alive = await page.evaluate(async () => { const u = window.__urls[window.__urls.length - 1]; try { const r = await fetch(u); return (await r.blob()).size; } catch (e) { return -1; } });
      check('download link is still alive after 5 s (old code revoked at 4 s)', alive === v.size, alive);

      // share: success
      await page.click('#rlShare'); await page.waitForTimeout(300);
      let sh = await page.evaluate(() => window.__shared.slice(-1)[0]);
      check('share sends 1 file with the real name and type', sh && sh.length === 1 && /^TF-News-Reel-.*\.(mp4|webm)$/.test(sh[0].name) && sh[0].name.split('.').pop() === v.name.split('.').pop() && sh[0].type === v.type, sh);
      check('share success toast', /শেয়ার করা হয়েছে/.test(await toastText(page)), await toastText(page));

      // share: user cancels → no download, cancel message
      await page.evaluate(() => window.__installShare('abort'));
      let gotDl = false; const onDl = () => { gotDl = true; }; page.on('download', onDl);
      await page.click('#rlShare'); await page.waitForTimeout(500);
      check('cancel: message shown, nothing downloaded', /বাতিল/.test(await toastText(page)) && !gotDl, await toastText(page));
      // share: refused (tap too old) → ask to tap again, no download
      await page.evaluate(() => window.__installShare('denied'));
      await page.click('#rlShare'); await page.waitForTimeout(500);
      check('refused: asks to tap again, nothing downloaded', /আবার শেয়ার চাপুন/.test(await toastText(page)) && !gotDl, await toastText(page));
      page.off('download', onDl);
      // share: real error → falls back to download, says so
      await page.evaluate(() => window.__installShare('error'));
      const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#rlShare')]);
      check('error: falls back to download with same name', dl2.suggestedFilename().split('.').pop() === v.name.split('.').pop() && /^TF-News-Reel-/.test(dl2.suggestedFilename()), dl2.suggestedFilename());
      check('error: tells the user sharing failed', /শেয়ার করা যায়নি/.test(await toastText(page)), await toastText(page));
      // share: no Web Share at all → download fallback
      await page.evaluate(() => window.__installShare('none'));
      const [dl3] = await Promise.all([page.waitForEvent('download'), page.click('#rlShare')]);
      check('unsupported: falls back to download', dl3.suggestedFilename().split('.').pop() === v.name.split('.').pop() && /^TF-News-Reel-/.test(dl3.suggestedFilename()), dl3.suggestedFilename());
      check('unsupported: explains sharing is not available', /সরাসরি শেয়ার করা যায় না/.test(await toastText(page)), await toastText(page));
      check('no page errors', errors.length === 0, errors);
      await ctx.close();
    }

    // ---------------------------------------------------------------- 2) browser without MP4 recording
    console.log('\n[2] Browser that cannot record MP4, no music');
    {
      const { ctx, page, errors } = await newPage(browser, NO_MP4);
      await loadStories(page, 2, 'none');
      const v = await makeVideo(page);
      check('video made as WebM', v && v.type === 'video/webm', v);
      check('WebM file gets .webm extension (not renamed to .mp4)', v && /\.webm$/.test(v.name), v);
      check('user is told it is WebM', /WebM/.test(await toastText(page)), await toastText(page));
      const vi = await videoInfo(page);
      check('WebM preview decodes', vi.w === 720 && !vi.err, vi);
      check('no page errors', errors.length === 0, errors);
      await ctx.close();
    }

    // ---------------------------------------------------------------- 3) recorder refuses first format
    console.log('\n[3] Recorder refuses the first format → falls back');
    {
      const { ctx, page, errors } = await newPage(browser, CTOR_REFUSES_FIRST);
      await loadStories(page, 2, 'none');
      const v = await makeVideo(page);
      check('video still made with a fallback format', v && v.size > 5000, v);
      check('extension matches fallback format', v && v.name.endsWith('.' + (/mp4/.test(v.type) ? 'mp4' : 'webm')), v);
      check('no page errors', errors.length === 0, errors);
      await ctx.close();
    }

    // ---------------------------------------------------------------- 4) photo cards
    console.log('\n[4] 12 photo cards: save all, share in batches of 10');
    {
      const { ctx, page, errors } = await newPage(browser);
      await loadStories(page, 12, 'none');
      // share: first tap makes cards and shares the first 10, second tap the last 2
      await page.evaluate(() => window.__rl.rlCardsGo(true));
      let shared = await page.evaluate(() => window.__shared);
      check('first share sends 10 cards (Chrome limit)', shared.length === 1 && shared[0].length === 10, shared.map(s => s.length));
      check('tells user to tap again for the rest', /বাকি ২টির/.test(await toastText(page)), await toastText(page));
      await page.evaluate(() => window.__rl.rlCardsGo(true));
      shared = await page.evaluate(() => window.__shared);
      check('second share sends the other 2', shared.length === 2 && shared[1].length === 2, shared.map(s => s.length));
      const names = shared.flat().map(f => f.name);
      check('all 12 different cards shared, in order', new Set(names).size === 12 && names.every((n, i) => n.includes('-' + String(i + 1).padStart(2, '0') + ' ')), names);

      // every card is a full 1080×1080 image with real content (not blank)
      const cards = await page.evaluate(async () => {
        const out = [];
        for (const f of window.__rl.RL.cardFiles) {
          const bm = await createImageBitmap(f); const c = document.createElement('canvas'); c.width = 64; c.height = 64;
          const x = c.getContext('2d'); x.drawImage(bm, 0, 0, 64, 64); const d = x.getImageData(0, 0, 64, 64).data;
          const set = new Set(); for (let i = 0; i < d.length; i += 4 * 7) set.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4));
          out.push({ w: bm.width, h: bm.height, colours: set.size, type: f.type });
        }
        return out;
      });
      check('12 cards, each 1080×1080', cards.length === 12 && cards.every(c => c.w === 1080 && c.h === 1080), cards);
      check('no blank cards', cards.every(c => c.colours > 20), cards.map(c => c.colours));

      // save all → 12 downloads
      const got = [];
      page.on('download', d => got.push(d.suggestedFilename()));
      await page.evaluate(() => window.__rl.rlCardsGo(false));
      await page.waitForTimeout(1500);
      check('save all downloads all 12 cards', got.length === 12 && new Set(got).size === 12, got);

      // sharing not available → falls back to downloads
      got.length = 0;
      await page.evaluate(() => window.__installShare('none'));
      await page.evaluate(() => window.__rl.rlCardsGo(true));
      await page.waitForTimeout(1500);
      check('share unsupported → downloads all 12 instead', got.length === 12, got.length);
      check('no page errors', errors.length === 0, errors);
      await ctx.close();
    }

    // ---------------------------------------------------------------- 5) rest of the app still loads
    console.log('\n[5] Regression: page loads, shared download helper');
    {
      const { ctx, page, errors } = await newPage(browser);
      const r = await page.evaluate(async () => {
        const before = document.title;
        const b = new Blob(['hello'], { type: 'text/plain' });
        const res = window.__rl.download(b, 'x.txt');           // shared helper used by the article / card exports
        return { before, res };
      });
      check('global download() helper still works for other features', r.res === 'started', r);
      check('no page errors on load', errors.length === 0, errors);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
