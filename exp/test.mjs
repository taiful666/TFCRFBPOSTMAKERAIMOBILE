// Checks how many stories Bing News's public RSS feed lists per newspaper, and whether it carries thumbnails.
const HOSTS = ['jamuna.tv', 'jugantor.com', 'samakal.com', 'kalerkantho.com', 'bd-pratidin.com', 'ittefaq.com.bd', 'ekattor.tv', 'deshrupantor.com', 'mzamin.com', 'dailyinqilab.com', 'jagonews24.com', 'kalbela.com'];
async function get(url, ms = 15000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { signal: c.signal, headers: { 'User-Agent': 'TF-NewsCard/1.0 (news reader app)' } }); return { s: r.status, txt: await r.text() }; }
  catch (e) { return { s: 'ERR ' + e.message, txt: '' }; } finally { clearTimeout(t); }
}
for (const h of HOSTS) {
  for (const q of ['site:' + h, h]) {
    const u = 'https://www.bing.com/news/search?q=' + encodeURIComponent(q) + '&format=rss&qft=sortbydate%3d%221%22';
    const b = await get(u);
    const items = b.txt.match(/<item>[\s\S]*?<\/item>/g) || [];
    const withImg = items.filter(i => /<News:Image>/i.test(i));
    const own = items.filter(i => (i.match(/<link>([^<]+)/) || [])[1]?.includes(h.split('.')[0]));
    console.log(h.padEnd(18), q.startsWith('site') ? 'site' : 'kw  ', b.s, 'items', items.length, 'img', withImg.length, 'ownlink', own.length);
    if (withImg[0]) console.log('   ', (withImg[0].match(/<link>([^<]+)/) || [])[1]?.slice(0, 160), '\n   ', (withImg[0].match(/<News:Image>([^<]+)/i) || [])[1], '\n   ', (withImg[0].match(/<pubDate>([^<]+)/) || [])[1]);
    await new Promise(r => setTimeout(r, 800));
  }
}
