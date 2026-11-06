// TEST ONLY: times a fast export of a small project and reports progress.
const fs = require('fs'), path = require('path');
module.exports = async (T) => {
  const { views, app } = T; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ev = (js) => views.news.webContents.executeJavaScript(js, true);
  views.news.webContents.on('console-message', (e) => { if (e.level >= 2 || /DIALOG|fast/.test(e.message)) console.log('[news]', String(e.message).slice(0, 300)); });
  await views.home.webContents.executeJavaScript("document.querySelector('[data-k=video]').click()");
  await sleep(6000);
  await ev(`(()=>{document.getElementById('tfStart')&&document.getElementById('tfStart').remove();const s=document.getElementById('script');s.value='# পরীক্ষার খবর\\nএটা একটা ছোট পরীক্ষা।\\nভিডিও ঠিকমতো তৈরি হচ্ছে কিনা দেখা হচ্ছে।';s.dispatchEvent(new Event('input'));build(false);settings.res=720;try{setRes(720)}catch(e){};return total})()`).then((t) => console.log('total sec', t));
  const t0 = Date.now(); ev('exportVideo()').catch((e) => console.log('exp err', e.message));
  const dl = app.getPath('downloads');
  for (let i = 0; i < 100; i++) {
    await sleep(3000);
    const txt = await ev("(document.getElementById('exTxt')||{}).textContent+' | hidden='+document.getElementById('exOv').classList.contains('hidden')").catch((e) => 'ERR ' + e.message);
    let files = []; try { files = fs.readdirSync(path.join(dl, 'TF Media Studio')); } catch (e) {}
    console.log(((Date.now() - t0) / 1000).toFixed(0) + 's', txt, files.join(','));
    if (files.some((f) => f.endsWith('.mp4'))) { console.log('MP4 OK', fs.statSync(path.join(dl, 'TF Media Studio', files.find((f) => f.endsWith('.mp4')))).size); break; }
  }
  app.exit(0);
};
