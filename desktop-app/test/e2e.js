'use strict';
/* End-to-end check of TF Media Studio (build checks only — never part of the installed app).
   Runs the real app, clicks through it like a user and checks what is on screen and on disk.
   Start with:  npm run test:e2e   (Linux needs xvfb-run; see test/run-e2e.sh) */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { session } = require('electron');

const OUT = process.env.TF_OUT || path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? '  PASS ' : '  FAIL ') + name + (detail !== undefined && !ok ? '  →  ' + JSON.stringify(detail).slice(0, 400) : ''));
}

/* ---------- a small fake newspaper on this PC ---------- */
const STORIES = [
  ['sports', 'ক্রিকেটে বাংলাদেশের দারুণ জয়, সিরিজ নিশ্চিত', 'টাইগাররা আজ শেষ ওয়ানডেতে ছয় উইকেটে জিতে সিরিজ নিশ্চিত করেছে।'],
  ['politics', 'নির্বাচন নিয়ে বিএনপির নতুন ঘোষণা', 'দলটির মহাসচিব আজ সংবাদ সম্মেলনে নির্বাচনের প্রস্তুতি নিয়ে কথা বলেন।'],
  ['world', 'গাজায় যুদ্ধবিরতি নিয়ে জাতিসংঘের আহ্বান', 'জাতিসংঘ মহাসচিব দ্রুত যুদ্ধবিরতির আহ্বান জানিয়েছেন।'],
  ['business', 'ডলারের দাম আবার বাড়ল, বাজারে চাপ', 'খোলা বাজারে ডলারের দাম আবার বেড়েছে, আমদানিকারকেরা চাপে।'],
  ['crime', 'রাজধানীতে ডাকাতির ঘটনায় তিনজন গ্রেপ্তার', 'পুলিশ জানিয়েছে, রাতভর অভিযানে তিনজনকে গ্রেপ্তার করা হয়েছে।'],
  ['weather', 'আগামী তিন দিন বৃষ্টির সম্ভাবনা', 'আবহাওয়া অফিস বলছে, দেশের বেশির ভাগ এলাকায় বৃষ্টি হতে পারে।']
];
function startServer() {
  return new Promise((res) => {
    const srv = http.createServer((req, rsp) => {
      const u = new URL(req.url, 'http://x');
      const m = /^\/img\/p(\d)\.jpg$/.exec(u.pathname);
      if (m) { rsp.writeHead(200, { 'Content-Type': 'image/jpeg' }); return rsp.end(fs.readFileSync(path.join(__dirname, 'fixtures', 'p' + m[1] + '.jpg'))); }
      const base = 'http://127.0.0.1:' + srv.address().port;
      const a = /^\/news\/[a-z]+\/(\d+)-story$/.exec(u.pathname);
      rsp.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      if (a) {
        const i = +a[1], [cat, title, lead] = STORIES[i];
        const para = (lead + ' ').repeat(6);
        return rsp.end(`<!doctype html><html><head><meta charset="utf-8"><title>${title} | টেস্ট পত্রিকা</title>
<meta property="og:title" content="${title}"><meta property="og:image" content="${base}/img/p${i + 1}.jpg"><meta property="og:site_name" content="টেস্ট পত্রিকা">
<meta property="article:published_time" content="2026-11-06T08:00:00+06:00"></head><body><header><a href="/">হোম</a></header>
<article><h1>${title}</h1><img src="/img/p${i + 1}.jpg" width="960" height="540"><p>${para}</p><p>${para}</p><p>বিস্তারিত পরে জানানো হবে। ${cat}</p></article></body></html>`);
      }
      // home page of the paper
      rsp.end(`<!doctype html><html><head><meta charset="utf-8"><title>টেস্ট পত্রিকা</title><style>body{font-family:sans-serif;background:#fff}.c{display:inline-block;width:300px;margin:10px;vertical-align:top}img{width:300px;height:170px}</style></head><body><h1>টেস্ট পত্রিকা</h1>
${STORIES.map(([cat, t], i) => `<div class="c"><a href="/news/${cat}/${i}-story"><img src="/img/p${i + 1}.jpg"><h3>${t}</h3></a></div>`).join('')}
<div class="c"><a href="/about">আমাদের সম্পর্কে</a></div></body></html>`);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}
function feedFor(port) {
  const base = 'http://127.0.0.1:' + port;
  const now = Date.now();
  return { updated: new Date(now).toISOString(), sources: { prothomalo: { items: STORIES.map(([cat, t, lead], i) => ({ title: t, link: `${base}/news/${cat}/${i}-story`, img: `${base}/img/p${i + 1}.jpg`, desc: lead, date: new Date(now - i * 60000).toISOString() })) } } };
}

module.exports = async (T) => {
  const { app, views } = T;
  const ev = (n, js, ms) => Promise.race([views[n].webContents.executeJavaScript(js, true), sleep(ms || 15000).then(() => { throw new Error('timeout in ' + n + ': ' + js.slice(0, 90)); })]);
  const shot = async (n, f) => { try { const im = await views[n].webContents.capturePage(); fs.writeFileSync(path.join(OUT, f), im.toPNG()); } catch (e) {} };
  const until = async (fn, ms, step) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 15000)) { try { const v = await fn(); if (v) return v; } catch (e) {} await sleep(step || 250); } return null; };
  const dialogs = [];
  for (const n of ['news', 'post', 'home', 'hub']) views[n].webContents.on('console-message', (e) => {
    const m = String(e.message || '');
    if (/^\[DIALOG/.test(m)) { dialogs.push(n + ': ' + m); console.log('    (' + n + ') ' + m.slice(0, 160)); }
    else if (e.level === 'error' || e.level === 3) console.log('    [' + n + ' error] ' + m.slice(0, 220));
  });
  const newsState = () => ev('news', `({pid:localStorage.getItem('tfms_pid')||'',script:document.getElementById('script').value,raw:document.getElementById('rawText').value,ans:(document.getElementById('wrAns')||{}).value||'',scenes:scenes.length,gal:GALLERY.length,start:!!document.getElementById('tfStart'),aspect:settings.aspect,pane:localStorage.getItem('tfx_pane'),groups:(settings.newsGroups||[]).length})`);
  const homeCards = () => ev('home', `[...document.querySelectorAll('.p')].map(p=>({id:p.dataset.id,name:p.querySelector('.nm')&&p.querySelector('.nm').textContent}))`);
  const waitNewsIdle = () => until(async () => !T.switching && !views.news.webContents.isLoading() && await ev('news', '!!window.__tfDesk&&document.readyState==="complete"'), 30000);

  let srv;
  try {
    srv = await startServer();
    const port = srv.address().port, base = 'http://127.0.0.1:' + port;
    fs.writeFileSync(path.join(OUT, 'feed.json'), JSON.stringify(feedFor(port)));
    console.log('fake paper on', base);
    await until(() => ev('hub', "!!document.getElementById('ref')"));
    await ev('hub', "document.getElementById('ref').click()");

    /* 1. home */
    await until(() => ev('home', "document.querySelectorAll('.c').length===6"));
    await shot('home', '01-home.png');
    check('home shows 6 create buttons', await ev('home', "document.querySelectorAll('.c').length") === 6);
    check('app opens on the home screen', T.activeTab === 'home');

    /* 2. new news video from home → clean editor + start screen */
    await ev('home', "document.querySelector('[data-k=video]').click()");
    await waitNewsIdle();
    let s = await until(async () => { const x = await newsState(); return x.start ? x : null; }, 8000) || await newsState();
    await shot('news', '02-new-project.png');
    check('home → নিউজ ভিডিও opens the editor', T.activeTab === 'news');
    check('new project is empty', !s.script && !s.raw && !s.ans && s.scenes === 0 && s.gal === 0, s);
    check('new project shows the start screen', s.start, s);
    check('new project is 16:9', s.aspect === '16:9', s.aspect);

    /* 3. "নিজের খবর লিখুন" → write, Gemini flow (copy → paste answer → apply) */
    await ev('news', "document.querySelector('#tfStart [data-a=write]').click()");
    await sleep(300);
    check('start screen closes after a choice', !(await newsState()).start);
    check('write own news focuses the news box', await ev('news', "document.activeElement&&document.activeElement.id"), 'rawText');
    await ev('news', `(()=>{const r=document.getElementById('rawText');r.value='ঢাকায় আজ মেট্রোরেলের নতুন স্টেশন চালু হয়েছে। যাত্রীরা খুশি।';r.dispatchEvent(new Event('input'));
      document.querySelector('#wrMode [data-m=app]').click();return 1})()`);
    check('Gemini (app) steps are shown', await ev('news', "!document.getElementById('wrApp').classList.contains('hidden')"));
    await ev('news', `(()=>{const a=document.getElementById('wrAns');a.value='# মেট্রোরেলের নতুন স্টেশন\\nঢাকায় আজ মেট্রোরেলের নতুন একটি স্টেশন চালু হয়েছে।\\nযাত্রীরা বলছেন, এতে যাতায়াত অনেক সহজ হবে।';a.dispatchEvent(new Event('input'));document.getElementById('wrApplyW').click();return 1})()`);
    s = await until(async () => { const x = await newsState(); return x.scenes > 0 ? x : null; }, 10000) || await newsState();
    await shot('news', '03-gemini-applied.png');
    check('pasting the Gemini answer builds the scenes', s.scenes > 0 && /মেট্রোরেল/.test(s.script), s);
    const p1 = await T.autosaveNews();
    check('project 1 is saved', !!p1, p1);

    /* 4. "নতুন প্রজেক্ট" inside the editor → resets right here */
    await ev('news', "[...document.querySelectorAll('#tfTopBtns .tbtn')].find(b=>b.textContent.trim()==='নতুন প্রজেক্ট').click()");
    await sleep(500); await waitNewsIdle();
    s = await until(async () => { const x = await newsState(); return x.start ? x : null; }, 8000) || await newsState();
    await shot('news', '04-new-in-editor.png');
    check('নতুন প্রজেক্ট stays in the editor (does not jump to home)', T.activeTab === 'news', T.activeTab);
    check('নতুন প্রজেক্ট clears everything', !s.script && !s.raw && !s.ans && s.scenes === 0 && s.gal === 0 && s.pid !== p1, s);
    check('নতুন প্রজেক্ট shows the start screen', s.start);
    check('project 1 is still in the home list', T.listProjects().some((p) => p.id === p1));

    /* 5. start screen → পত্রিকা থেকে খবর নিন → news picker */
    await ev('news', "document.querySelector('#tfStart [data-a=paper]').click()");
    await sleep(600);
    let hs = T.state();
    check('পত্রিকা থেকে খবর নিন opens the news picker', T.activeTab === 'hub' && hs.sub === 'live', { tab: T.activeTab, sub: hs.sub });
    check('picker back button says প্রজেক্টে ফিরুন', hs.back === 'প্রজেক্টে ফিরুন', hs.back);
    await until(() => ev('hub', "document.querySelectorAll('#list .item').length>=6"), 15000);
    await shot('hub', '05-picker.png');
    check('live headlines are listed', await ev('hub', "document.querySelectorAll('#list .item').length") >= 6);
    check('send button says প্রজেক্টে নিন', await ev('hub', "document.getElementById('gvT').textContent") === 'প্রজেক্টে নিন');
    const cats = await ev('hub', "[...document.querySelectorAll('#cats .chip')].map(b=>b.textContent)");
    check('category buttons are shown', cats.includes('খেলাধুলা') && cats.includes('রাজনীতি') && cats.includes('আন্তর্জাতিক'), cats);
    await ev('hub', "[...document.querySelectorAll('#cats .chip')].find(b=>b.textContent==='খেলাধুলা').click()");
    const sportN = await ev('hub', "document.querySelectorAll('#list .item').length");
    check('খেলাধুলা shows only sports news', sportN === 1, sportN);
    await shot('hub', '06-category.png');
    await ev('hub', "document.querySelector('#cats .chip').click()");
    await ev('hub', "(()=>{const q=document.getElementById('q');q.value='ডলার';q.dispatchEvent(new Event('input'));return 1})()");
    check('search finds a story', await ev('hub', "document.querySelectorAll('#list .item').length") === 1);
    await ev('hub', "(()=>{const q=document.getElementById('q');q.value='';q.dispatchEvent(new Event('input'));return 1})()");

    // back without picking → the same project
    await ev('hub', "document.getElementById('back').click()"); await sleep(400);
    check('প্রজেক্টে ফিরুন goes back to the project', T.activeTab === 'news');
    const pidBefore = (await newsState()).pid;
    await ev('news', "[...document.querySelectorAll('#tfTopBtns .tbtn')].find(b=>b.textContent.includes('পত্রিকা থেকে খবর')).click()"); await sleep(500);
    check('top button পত্রিকা থেকে খবর opens the picker', T.activeTab === 'hub');

    // pick 5 and send to the project
    for (let i = 0; i < 5; i++) { await ev('hub', `document.querySelectorAll('#list .item')[${i}].click()`); await sleep(150); }
    check('5 news in the basket', T.basket.length === 5, T.basket.length);
    await until(() => T.basket.every((b) => b.text && b.text.length > 250), 30000);
    check('full stories are read in the background', T.basket.every((b) => b.text && b.text.length > 250), T.basket.map((b) => (b.text || '').length));
    await shot('hub', '07-picked.png');
    await ev('hub', "document.getElementById('gv').click()");
    s = await until(async () => { const x = await newsState(); return x.raw && x.gal >= 5 ? x : null; }, 40000) || await newsState();
    await sleep(800); s = await newsState();
    await shot('news', '08-news-in-project.png');
    check('news land in the SAME project', s.pid === pidBefore || (!pidBefore && !!s.pid), { pidBefore, now: s.pid });
    check('5 news texts are in the news box', (s.raw.match(/খবর [১২৩৪৫]:/g) || []).length === 5, s.raw.slice(0, 300));
    check('5 news photos are in the library', s.gal === 5, s.gal);
    check('Gemini mode: script waits for the Gemini answer', !s.script.trim() && s.scenes === 0, { script: s.script.slice(0, 80), scenes: s.scenes });
    check('basket is empty after sending', T.basket.length === 0, T.basket.length);
    check('copy-for-Gemini step is highlighted', await ev('news', "document.getElementById('wrCopy').classList.contains('tfPulse')"));
    // paste a Gemini answer for the bulletin
    await ev('news', `(()=>{const a=document.getElementById('wrAns');a.value='# আজকের শিরোনাম\\n- ক্রিকেটে বাংলাদেশের জয়\\n- ডলারের দাম বাড়ল\\n\\n# ক্রিকেটে বাংলাদেশের জয়\\nটাইগাররা সিরিজ নিশ্চিত করেছে।\\n\\n# ডলারের দাম বাড়ল\\nবাজারে চাপ বাড়ছে।';a.dispatchEvent(new Event('input'));document.getElementById('wrApplyW').click();return 1})()`);
    s = await until(async () => { const x = await newsState(); return x.scenes > 0 ? x : null; }, 10000) || await newsState();
    await shot('news', '09-bulletin.png');
    check('Gemini answer for 5 news builds the video', s.scenes > 0, s.scenes);
    const p2 = await T.autosaveNews();
    check('project 2 saved with its photos', p2 && fs.existsSync(path.join(T.projDir(), p2 + '.media', 'manifest.json')) && JSON.parse(fs.readFileSync(path.join(T.projDir(), p2 + '.media', 'manifest.json'))).gallery.length === 5, p2);

    /* 6. open project 1 from home → only project 1's things */
    T.showTab('home'); await sleep(800);
    await shot('home', '10-home-two-projects.png');
    let cards = await homeCards();
    check('home lists both projects', cards.length === 2 && cards.some((c) => c.id === p1) && cards.some((c) => c.id === p2), cards);
    check('project names come from the news', cards.find((c) => c.id === p1).name === 'মেট্রোরেলের নতুন স্টেশন', cards);
    await ev('home', `document.querySelector('.p[data-id="${p1}"]').click()`);
    await sleep(500); await waitNewsIdle();
    s = await newsState();
    check('opening project 1 shows project 1', s.pid === p1 && /মেট্রোরেল/.test(s.script) && s.gal === 0 && !/খবর ১/.test(s.raw), { pid: s.pid, gal: s.gal, raw: s.raw.slice(0, 60) });
    check('opened project has its scenes', s.scenes > 0);
    check('opened project shows no start screen', !s.start);
    T.showTab('home'); await sleep(500);
    await ev('home', `document.querySelector('.p[data-id="${p2}"]').click()`);
    await sleep(500); await waitNewsIdle(); await sleep(1500);
    s = await newsState();
    await shot('news', '11-project2-reopened.png');
    check('opening project 2 brings back its 5 photos and news', s.pid === p2 && s.gal === 5 && (s.raw.match(/খবর [১২৩৪৫]:/g) || []).length === 5 && s.scenes > 0, { pid: s.pid, gal: s.gal, scenes: s.scenes });
    check('photo groups (news 1..5) kept', s.groups === 5, s.groups);

    /* 7. from the home screen: লাইভ খবর → pick 2 → ভিডিও বানান → a NEW project (project 2 untouched) */
    T.showTab('home'); await sleep(400);
    await ev('home', "document.querySelector('[data-k=live]').click()"); await sleep(500);
    hs = T.state();
    check('from home the picker says হোমে ফিরুন / ভিডিও বানান', hs.back === 'হোমে ফিরুন' && await ev('hub', "document.getElementById('gvT').textContent") === 'ভিডিও বানান', hs.back);
    await ev('hub', "document.querySelectorAll('#list .item')[5].click()"); await sleep(150);
    await ev('hub', "document.querySelectorAll('#list .item')[4].click()"); await sleep(150);
    await ev('hub', "document.getElementById('gv').click()");
    s = await until(async () => { if (T.switching || views.news.webContents.isLoading()) return null; const x = await newsState(); return x.pid !== p2 && x.gal >= 2 && x.raw ? x : null; }, 60000) || await newsState();
    check('news picked from home make a new project', s.pid !== p2 && s.gal === 2 && (s.raw.match(/খবর [১২]:/g) || []).length === 2, { pid: s.pid, gal: s.gal });
    check('no start screen when news were already picked', !s.start);
    const p3 = await T.autosaveNews();
    const j2 = JSON.parse(fs.readFileSync(path.join(T.projDir(), p2 + '.json'), 'utf8'));
    check('project 2 was not touched', (j2.raw.match(/খবর [১২৩৪৫]:/g) || []).length === 5, j2.raw.slice(0, 80));
    check('three projects now', T.listProjects().length === 3, T.listProjects().length);

    /* 8. newspaper browser: click a story to collect it, ad-block + back button */
    T.showTab('home'); await sleep(300);
    await ev('home', "document.querySelector('[data-k=paper]').click()"); await sleep(400);
    hs = T.state();
    check('পত্রিকা opens the newspaper browser with picking on', T.activeTab === 'hub' && hs.sub === 'paper' && hs.picking, hs);
    await ev('hub', `(()=>{const u=document.getElementById('url');u.value=${JSON.stringify(base + '/')};u.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));return 1})()`);
    await until(() => views.paper.webContents.getURL().startsWith(base) && !views.paper.webContents.isLoading(), 15000);
    await sleep(800);
    await shot('paper', '12-paper.png');
    console.log('    paper pick css:', await ev('paper', "!!document.getElementById('__tf_pick_css')"), 'state picking:', T.state().picking);
    const r = await ev('paper', "(()=>{const el=document.querySelectorAll('.c a')[2];el.scrollIntoView({block:'center',inline:'center'});const a=el.getBoundingClientRect();return [Math.round(a.left+40),Math.round(a.top+40),innerWidth,innerHeight]})()");
    console.log('    click at', JSON.stringify(r)); await sleep(300);
    views.paper.webContents.sendInputEvent({ type: 'mouseMove', x: r[0], y: r[1] }); await sleep(100);
    views.paper.webContents.sendInputEvent({ type: 'mouseDown', x: r[0], y: r[1], button: 'left', clickCount: 1 });
    views.paper.webContents.sendInputEvent({ type: 'mouseUp', x: r[0], y: r[1], button: 'left', clickCount: 1 });
    let how = 'mouse';
    if (!await until(() => T.basket.length === 1, 8000)) {
      // some test machines do not turn simulated mouse presses into a click; send the click event itself
      how = 'dom-click';
      views.paper.webContents.focus();
      await ev('paper', `(()=>{const [x,y]=${JSON.stringify(r.slice(0, 2))};const el=document.elementFromPoint(x,y);if(!el)return 'none';el.dispatchEvent(new MouseEvent('click',{clientX:x,clientY:y,bubbles:true,cancelable:true,button:0}));return el.tagName})()`);
      await until(() => T.basket.length === 1, 30000);
    }
    console.log('    paper click path:', how, 'basket:', T.basket.length);
    if (!T.basket.length) { const d = await T.collectStory(base + '/news/world/2-story', '', ''); console.log('    direct collect result:', JSON.stringify(d)); }
    check('clicking a story in the paper collects it with text and photo', T.basket.length === 1 && T.basket[0].text.length > 250 && /p3\.jpg/.test(T.basket[0].img), T.basket[0]);
    check('the paper page did not navigate away while picking', views.paper.webContents.getURL() === base + '/', views.paper.webContents.getURL());
    await shot('hub', '13-collected.png');
    await ev('hub', "document.getElementById('back').click()"); await sleep(300);
    check('back from the paper goes home', T.activeTab === 'home');

    /* 9. reel from the basket → post app reel studio */
    T.showTab('hub'); await sleep(300);
    await ev('hub', "document.getElementById('gr').click()");
    await until(() => T.activeTab === 'post', 30000); await sleep(1500);
    await shot('post', '14-reel.png');
    check('রিল বানান opens the reel studio with the news', T.activeTab === 'post' && T.basket.length === 0, { tab: T.activeTab, basket: T.basket.length });

    /* 10. right-click photo → video library (this was broken: an unknown name stopped it) */
    T.showTab('home'); await sleep(200);
    await ev('home', `document.querySelector('.p[data-id="${p3}"]').click()`); await sleep(400); await waitNewsIdle(); await sleep(800);
    const g0 = (await newsState()).gal;
    let err = null; try { await T.sendImageToApp('news', base + '/img/p6.jpg', base + '/'); } catch (e) { err = e.message; }
    await sleep(1500);
    check('right-click "send photo to video library" works', !err && (await newsState()).gal === g0 + 1, { err, before: g0, after: (await newsState()).gal });

    /* 11. rename + delete in home */
    T.showTab('home'); await sleep(400);
    await ev('home', `document.querySelector('.p[data-id="${p1}"] [data-a=ren]').click()`);
    await ev('home', "(()=>{const i=document.querySelector('input.rn');i.value='আমার মেট্রো ভিডিও';i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));return 1})()");
    await sleep(500);
    check('rename works', (await homeCards()).find((c) => c.id === p1).name === 'আমার মেট্রো ভিডিও');
    await T.autosaveNews(); await sleep(300);
    check('rename survives autosave', JSON.parse(fs.readFileSync(path.join(T.projDir(), p1 + '.json'), 'utf8')).name === 'আমার মেট্রো ভিডিও');
    await ev('home', `document.querySelector('.p[data-id="${p1}"] [data-a=del]').click()`); await sleep(150);
    await ev('home', `document.querySelector('.p[data-id="${p1}"] [data-a=del2]').click()`); await sleep(500);
    check('delete removes the project and its files', !(await homeCards()).some((c) => c.id === p1) && !fs.existsSync(path.join(T.projDir(), p1 + '.json')));

    /* 12. home "শর্টস ভিডিও" → 9:16 */
    await ev('home', "document.querySelector('[data-k=short]').click()"); await sleep(400); await waitNewsIdle();
    s = await until(async () => { const x = await newsState(); return x.start ? x : null; }, 8000) || await newsState();
    check('শর্টস ভিডিও starts a clean 9:16 project', s.aspect === '9:16' && !s.raw && s.gal === 0 && s.start, s);
    await ev('news', "document.querySelector('#tfStart [data-r=\"16:9\"]').click()");
    check('size can be changed on the start screen', (await newsState()).aspect === '16:9');
    await ev('news', "document.getElementById('tfStart').click()"); // click outside closes
    check('clicking outside closes the start screen', !(await newsState()).start);
    const before = T.listProjects().length; await T.autosaveNews();
    check('an empty project is not added to the list', T.listProjects().length === before);

    /* 13. fast export (FFmpeg) of a short video in this project */
    if (!process.env.TF_SKIP_EXPORT) {
      await ev('news', `(()=>{const s=document.getElementById('script');s.value='# পরীক্ষার খবর\\nএটা একটা ছোট পরীক্ষা।\\nভিডিও ঠিকমতো তৈরি হচ্ছে কিনা দেখা হচ্ছে।';s.dispatchEvent(new Event('input'));build(false);settings.res=720;try{setRes(720)}catch(e){};return 1})()`);
      const dl = path.join(app.getPath('downloads'), 'TF Media Studio');
      const had = fs.existsSync(dl) ? fs.readdirSync(dl).filter((f) => f.endsWith('.mp4')).length : 0;
      ev('news', 'exportVideo()', 5000).catch(() => {});
      const got = await until(() => fs.existsSync(dl) && fs.readdirSync(dl).filter((f) => f.endsWith('.mp4')).length > had, 420000, 1000);
      const f = got && fs.readdirSync(dl).filter((x) => x.endsWith('.mp4')).map((x) => path.join(dl, x))[0];
      check('video export makes an MP4', !!f && fs.statSync(f).size > 50000, f);
      check('export overlay closes when done', await until(() => ev('news', "document.getElementById('exOv').classList.contains('hidden')"), 10000));
    }

    /* 14. dialogs: nothing should have popped up by itself */
    const bad = dialogs.filter((d) => !/খবর বসানো হয়েছে/.test(d));
    check('no unexpected pop-up dialogs', bad.length === 0, bad);
  } catch (e) {
    check('test run finished without crashing', false, e && e.stack);
  } finally {
    try { srv && srv.close(); } catch (e) {}
    const fail = results.filter((r) => !r.ok);
    console.log('\nRESULT: ' + (results.length - fail.length) + '/' + results.length + ' passed');
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
    app.exit(fail.length ? 1 : 0);
  }
};
