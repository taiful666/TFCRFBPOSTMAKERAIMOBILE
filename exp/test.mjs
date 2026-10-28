// Google News search page (public HTML): does it carry a thumbnail per story, and do titles match our photo-less stories?
import { writeFileSync } from 'node:fs';
const NEWS = await (await fetch('https://raw.githubusercontent.com/taiful666/TFCRFBPOSTMAKERAIMOBILE/live-news/news.json?t=' + Date.now())).json();
const HOSTS = { jamuna: 'jamuna.tv', jugantor: 'jugantor.com', samakal: 'samakal.com', kalerkantho: 'kalerkantho.com', bdpratidin: 'bd-pratidin.com', ittefaq: 'ittefaq.com.bd', ekattor: 'ekattor.tv', deshrupantor: 'deshrupantor.com', manabzamin: 'mzamin.com', inqilab: 'dailyinqilab.com', jagonews: 'jagonews24.com', kalbela: 'kalbela.com' };
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', 'Accept-Language': 'bn-BD,bn;q=0.9,en;q=0.8' };
const tkey = s => String(s || '').replace(/&[^;]+;/g, '').replace(/[^\p{L}\p{N}]+/gu, '').slice(0, 40);
let saved = false;
for (const [id, h] of Object.entries(HOSTS)) {
  const miss = (NEWS.sources[id]?.items || []).filter(o => !o.img);
  const mt = new Map(miss.map(o => [tkey(o.title), o]));
  const r = await fetch('https://news.google.com/search?q=' + encodeURIComponent('site:' + h + ' when:2d') + '&hl=bn&gl=BD&ceid=BD:bn', { headers: UA });
  const html = await r.text();
  if (!saved) { writeFileSync('gn.html', html); saved = true; }
  const arts = html.split(/<article\b/).slice(1);
  let withImg = 0, match = 0; const ex = [];
  for (const a of arts) {
    const img = (a.match(/<img[^>]+src="([^"]*\/api\/attachments\/[^"]+)"/) || a.match(/<img[^>]+src="([^"]+)"/) || [])[1];
    const t = (a.match(/<a[^>]+class="[^"]*JtKRv[^"]*"[^>]*>([^<]+)</) || a.match(/aria-label="([^"]+)"/) || [])[1] || '';
    if (img) withImg++;
    if (img && mt.has(tkey(t))) { match++; if (ex.length < 1) ex.push(t.slice(0, 50) + ' | ' + img.slice(0, 120)); }
  }
  console.log(id.padEnd(13), r.status, (html.length >> 10) + 'KB', 'articles', arts.length, 'withImg', withImg, 'missing', miss.length, 'matched', match);
  ex.forEach(e => console.log('   ', e));
  await new Promise(r => setTimeout(r, 1500));
}
