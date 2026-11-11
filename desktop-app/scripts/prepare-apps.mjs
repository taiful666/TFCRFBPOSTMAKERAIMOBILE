// Copies the two web apps into ./apps so the desktop app can run them offline.
// SRC_POST = TFCRFBPOSTMAKERAIMOBILE repo folder, SRC_NEWS = TF-NEWS-STUDIO repo folder.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = join(root, 'apps');
const SRC_POST = resolve(process.env.SRC_POST || join(root, '..', 'tfcrfbpostmakeraimobile'));
const SRC_NEWS = resolve(process.env.SRC_NEWS || join(root, '..', 'tf-news-studio'));

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'post'), { recursive: true });
mkdirSync(join(out, 'news'), { recursive: true });

// ---- POST app (TF FB Reels & Post Maker) ----
let post = readFileSync(join(SRC_POST, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
// Use a bundled copy of Readability instead of the CDN, so it also works offline.
const tag = /<script[^>]*src="https:\/\/cdn\.jsdelivr\.net\/npm\/@mozilla\/readability@0\.5\.0\/Readability\.js"[^>]*><\/script>/;
if (!tag.test(post)) throw new Error('Readability tag not found in post app');
post = post.replace(tag, '<script src="Readability.js"></script>');
// Bundle the Google fonts the post app asks for (Noto Serif Bengali, Tiro Bangla) so Bangla text never breaks offline.
post = post.replace(/<link[^>]*fonts\.googleapis\.com[^>]*>\s*/g, '').replace(/<link[^>]*fonts\.gstatic\.com[^>]*>\s*/g, '');
post = post.replace('</head>', '<link rel="stylesheet" href="fonts/extra-fonts.css">\n</head>');
// Desktop: let the shell hand a collected story to the app's own card / reel code.
const mustReplace = (src, a, b) => { if (!src.includes(a)) throw new Error('post app changed, cannot find: ' + a); return src.replace(a, b); };
post = mustReplace(post, 'window.TFCR = { cardBlob,', 'window.TFCR = { nwPick, cardBlob,');
post = mustReplace(post, 'window.TFPapers = { open: ppOpen,', 'window.TFPapers = { itemObj: ppItemObj, open: ppOpen,');

// Desktop: fast offline reel render. Every frame is drawn straight away (no waiting for real time), the music is mixed offline,
// and the bundled FFmpeg makes the MP4. Any problem before it starts falls back to the normal real-time recorder.
post = mustReplace(post, "    // c) record in real time\n", `    // c0) desktop fast render (FFmpeg)
    let fastDone = false;
    if(window.tfShell && window.tfShell.render){
      const FR = window.tfShell.render; let began = false;
      try{
        if(await FR.available()){
          const cv0 = $('rlCanvas'), ctx0 = cv0.getContext('2d'), fps0 = 30, tot0 = R.tl.total, N0 = Math.max(1, Math.ceil(tot0 * fps0));
          let wav0 = null;
          if(RL.music !== 'none' || R.vo){                    // music and/or the voice-over
            const sr0 = 44100, oc0 = new OfflineAudioContext(2, Math.ceil(tot0 * sr0), sr0);
            const px0 = new Proxy(oc0, { get(t0, k){ if(k === 'currentTime') return 1e6; const v = Reflect.get(t0, k, t0); return typeof v === 'function' ? v.bind(t0) : v; } });
            const stop0 = RL.music !== 'none' ? rlAudio(px0, oc0.destination, R, 0) : null;
            if(RL.music === 'none' && R.vo) rlSfx(px0, oc0.destination, R, 0);
            if(typeof voPlay === 'function') voPlay(px0, oc0.destination, R, 0);   // the voice itself (was missing: only the music dipped)
            const buf0 = await oc0.startRendering(); try{ if(stop0) stop0(); }catch(e){}
            const len0 = buf0.length, dv0 = new DataView(new ArrayBuffer(44 + len0 * 4)), ws0 = (o, s) => { for(let i = 0; i < s.length; i++) dv0.setUint8(o + i, s.charCodeAt(i)); };
            ws0(0, 'RIFF'); dv0.setUint32(4, 36 + len0 * 4, true); ws0(8, 'WAVE'); ws0(12, 'fmt '); dv0.setUint32(16, 16, true); dv0.setUint16(20, 1, true); dv0.setUint16(22, 2, true);
            dv0.setUint32(24, sr0, true); dv0.setUint32(28, sr0 * 4, true); dv0.setUint16(32, 4, true); dv0.setUint16(34, 16, true); ws0(36, 'data'); dv0.setUint32(40, len0 * 4, true);
            const c0 = buf0.getChannelData(0), c1 = buf0.getChannelData(Math.min(1, buf0.numberOfChannels - 1)); let off0 = 44;
            for(let i = 0; i < len0; i++){ dv0.setInt16(off0, Math.max(-1, Math.min(1, c0[i])) * 32767, true); dv0.setInt16(off0 + 2, Math.max(-1, Math.min(1, c1[i])) * 32767, true); off0 += 4; }
            wav0 = dv0.buffer;
          }
          const st0 = await FR.start({ w: cv0.width, h: cv0.height, fps: fps0, wav: wav0, name: 'TF-News-Reel' });
          if(st0 && st0.ok){
            began = true; const tStart = performance.now(), pend0 = []; let chain0 = Promise.resolve(), ci0 = -1;
            for(let f = 0; f < N0; f++){
              if(RL.cancel){ throw new Error('cancel'); }
              const tt0 = Math.min(f / fps0, tot0 - 0.001);
              const seg0 = R.tl.segs.find(s => tt0 < s.s + s.d), c = seg0 && seg0.k === 'card' ? seg0.i : seg0 && seg0.k === 'outro' ? n - 1 : 0;
              if(c !== ci0){ ci0 = c; if(many){ for(const [i, bm] of R.bmp){ if(i < c - 1 || i > c + 2){ R.bmp.delete(i); if(bm && bm.close) try{ bm.close(); }catch(e){} } } await Promise.all([c, c + 1, c + 2].map(want)); } }
              rlFrame(ctx0, R, tt0);
              const enc0 = new Promise(r => cv0.toBlob(r, 'image/jpeg', 0.92)).then(b => b.arrayBuffer());
              chain0 = chain0.then(() => enc0).then(b => FR.frame(b)); pend0.push(chain0);
              if(pend0.length >= 8) await pend0.shift();
              if(f % 6 === 0){ prog(tf('rlRec', { a: nwNum(Math.floor(tt0)), b: nwNum(Math.round(tot0)) }), tt0 / tot0); await sleep(0); }
            }
            await Promise.all(pend0);
            const fin = await FR.finish({ bytes: true }); began = false;
            if(!fin || !fin.ok || !fin.bytes) throw new Error('empty');
            const blobF = new Blob([fin.bytes], { type: 'video/mp4' });
            if(RL.url) URL.revokeObjectURL(RL.url);
            RL.blob = blobF; RL.url = URL.createObjectURL(blobF);
            v.src = RL.url; rlShowVideo(true);
            if(typeof rlAfterExport === 'function') rlAfterExport(); else try{ v.currentTime = 0; v.play().catch(() => {}); }catch(e){}
            RL.vidStyle = st; RL.style = rlNewStyle(RL.style); toast(t('rlDone'));
            fastDone = true;
          }
        }
      }catch(e){
        if(began){ try{ await FR.cancel(); }catch(x){} }
        if(e && e.message === 'cancel') throw e;
        console.warn('fast reel render failed, using the real-time recorder', e);
      }
    }
    if(fastDone) return;
    // c) record in real time
`);
writeFileSync(join(out, 'post', 'index.html'), post);
copyFileSync(join(root, 'node_modules', '@mozilla', 'readability', 'Readability.js'), join(out, 'post', 'Readability.js'));
if (existsSync(join(SRC_POST, 'fonts'))) {
  mkdirSync(join(out, 'post', 'fonts'), { recursive: true });
  for (const f of readdirSync(join(SRC_POST, 'fonts'))) copyFileSync(join(SRC_POST, 'fonts', f), join(out, 'post', 'fonts', f));
}

mkdirSync(join(out, 'post', 'fonts'), { recursive: true });
const fontSets = [
  ['Noto Serif Bengali', '@fontsource/noto-serif-bengali', 'noto-serif-bengali', [400, 700], ['bengali', 'latin']],
  ['Tiro Bangla', '@fontsource/tiro-bangla', 'tiro-bangla', [400], ['bengali', 'latin']]
];
const range = { bengali: 'U+0951-0952,U+0964-0965,U+0980-09FE,U+1CF7,U+200C-200D,U+20B9,U+25CC', latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD' };
let css = '';
for (const [fam, pkg, base, weights, subsets] of fontSets) {
  for (const w of weights) for (const sub of subsets) {
    const fn = `${base}-${sub}-${w}-normal.woff2`;
    copyFileSync(join(root, 'node_modules', pkg, 'files', fn), join(out, 'post', 'fonts', fn));
    css += `@font-face{font-family:'${fam}';font-style:normal;font-weight:${w};font-display:swap;src:url(${fn}) format('woff2');unicode-range:${range[sub]}}\n`;
  }
}
writeFileSync(join(out, 'post', 'fonts', 'extra-fonts.css'), css);

// ---- NEWS app (TF News Studio) ----
let news = readFileSync(join(SRC_NEWS, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
// Desktop: a fresh start (or "reset all") must stay empty. The sample story appears only when the user presses "ডেমো".
news = mustReplace(news, "$('#script').value=s||SAMPLE;", "$('#script').value=s||'';");
// ...and an empty new project opens quietly (no "স্ক্রিপ্ট খালি" pop-up on start).
news = mustReplace(news, "setCanvas();await fontsReady;build(true);requestAnimationFrame(tick);", "setCanvas();await fontsReady;if($('#script').value.trim())build(true);requestAnimationFrame(tick);");
// Desktop: hand the voice/music timeline helpers (private to the app's studio block) to the fast export engine.
news = mustReplace(news, "$('#exportBtn').onclick=()=>exportVideo();", "window.TFX={get TL(){return TL},vo,voicePos,vOutT,mSeg};$('#exportBtn').onclick=()=>exportVideo();");
writeFileSync(join(out, 'news', 'index.html'), news);
console.log('apps ready:', out);
