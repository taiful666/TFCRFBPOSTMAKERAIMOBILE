// Bing News public RSS: how many items with count=, how big are thumbnails with w=, and how many of our missing photos it matches.
const NEWS = await (await fetch('https://raw.githubusercontent.com/taiful666/TFCRFBPOSTMAKERAIMOBILE/live-news/news.json?t=' + Date.now())).json();
const HOSTS = { jamuna: 'jamuna.tv', jugantor: 'jugantor.com', samakal: 'samakal.com', kalerkantho: 'kalerkantho.com', bdpratidin: 'bd-pratidin.com', ittefaq: 'ittefaq.com.bd', ekattor: 'ekattor.tv', deshrupantor: 'deshrupantor.com', manabzamin: 'mzamin.com', inqilab: 'dailyinqilab.com', jagonews: 'jagonews24.com', kalbela: 'kalbela.com' };
const UA = { 'User-Agent': 'TF-NewsCard/1.0 (news reader app)' };
const dec = s => s.replace(/&amp;/g, '&');
const key = u => { try { const x = new URL(u); return (x.hostname.replace(/^www\./, '') + decodeURIComponent(x.pathname)).replace(/\/+$/, '').toLowerCase(); } catch { return u; } };
const tkey = s => String(s || '').replace(/[^\p{L}\p{N}]+/gu, '').slice(0, 40);
function jpegSize(buf) { const b = new Uint8Array(buf); for (let i = 2; i < b.length - 9;) { if (b[i] !== 0xFF) { i++; continue; } const m = b[i + 1]; const len = (b[i + 2] << 8) | b[i + 3]; if (m >= 0xC0 && m <= 0xC3) return ((b[i + 7] << 8) | b[i + 8]) + 'x' + ((b[i + 5] << 8) | b[i + 6]); i += 2 + len; } return '?'; }
let tested = false;
for (const [id, h] of Object.entries(HOSTS)) {
  const miss = (NEWS.sources[id]?.items || []).filter(o => !o.img);
  const mk = new Set(miss.map(o => key(o.link))), mt = new Set(miss.map(o => tkey(o.title)));
  const found = new Map();
  for (const q of ['site:' + h, h]) for (const extra of ['', '&count=100']) {
    const r = await fetch('https://www.bing.com/news/search?q=' + encodeURIComponent(q) + '&format=rss&qft=sortbydate%3d%221%22' + extra, { headers: UA });
    const txt = await r.text(); const items = txt.match(/<item>[\s\S]*?<\/item>/g) || [];
    let n = 0;
    for (const it of items) {
      const img = (it.match(/<News:Image>([^<]+)/i) || [])[1]; if (!img) continue;
      const link = dec((it.match(/<link>([^<]+)/) || [])[1] || ''); let real = ''; try { real = new URL(link).searchParams.get('url') || link; } catch {}
      const title = dec((it.match(/<title>([^<]+)/) || [])[1] || '');
      if (mk.has(key(real)) || mt.has(tkey(title))) { found.set(key(real) + tkey(title), dec(img)); n++; }
    }
    console.log(id.padEnd(13), (q.startsWith('site') ? 'site' : 'kw  ') + (extra ? ' c100' : '     '), 'items', String(items.length).padStart(3), 'matched-missing', n);
    if (!tested && found.size) {
      tested = true; const u = [...found.values()][0].replace(/^http:/, 'https:');
      for (const w of ['', '&w=1200', '&w=1200&h=675&c=7']) { const ir = await fetch(u + w); const ab = await ir.arrayBuffer(); console.log('   thumb', w || '(plain)', ir.status, ir.headers.get('content-type'), (ab.byteLength >> 10) + 'KB', jpegSize(ab)); }
    }
    await new Promise(r => setTimeout(r, 700));
  }
  console.log('  => missing', miss.length, 'now found', found.size);
}
