// What does the reader service (r.jina.ai, already used by the app) return for stories that ended up without a photo?
const NEWS = await (await fetch('https://raw.githubusercontent.com/taiful666/TFCRFBPOSTMAKERAIMOBILE/live-news/news.json?t=' + Date.now())).json();
const IDS = ['jamuna', 'samakal', 'ittefaq', 'ekattor', 'inqilab', 'deshrupantor', 'bdpratidin', 'jugantor', 'kalerkantho', 'manabzamin'];
for (const id of IDS) {
  const o = (NEWS.sources[id]?.items || []).find(x => !x.img && !/news\.google/.test(x.link) && !/topic|page=/.test(x.link));
  if (!o) { console.log(id, 'no sample'); continue; }
  for (const accept of ['application/json']) {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 30000);
    try {
      const r = await fetch('https://r.jina.ai/' + o.link, { signal: c.signal, headers: { 'Accept': accept, 'X-With-Images-Summary': 'true', 'X-Timeout': '20' } });
      const txt = await r.text(); let j = {}; try { j = JSON.parse(txt); } catch {}
      const d = j.data || {};
      console.log('\n=== ' + id, r.status, o.link.slice(0, 90));
      console.log('  title:', String(d.title || '').slice(0, 80));
      console.log('  meta keys:', Object.keys(d.metadata || {}).slice(0, 20).join(','));
      console.log('  og:image:', (d.metadata || {})['og:image'], '| tw:', (d.metadata || {})['twitter:image']);
      console.log('  images:', Object.values(d.images || {}).slice(0, 4).join('  '));
      console.log('  content head:', String(d.content || txt).replace(/\s+/g, ' ').slice(0, 300));
    } catch (e) { console.log(id, 'ERR', e.message); } finally { clearTimeout(t); }
    await new Promise(r => setTimeout(r, 4000));
  }
}
