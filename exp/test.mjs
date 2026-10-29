// Which photo routes work for Prothom Alo images right now?
const NEWS = await (await fetch('https://raw.githubusercontent.com/taiful666/TFCRFBPOSTMAKERAIMOBILE/live-news/news.json?t=' + Date.now())).json();
const items = NEWS.sources.prothomalo.items.filter(o => o.img);
const pick = [...items.filter(o => /\.avif/i.test(o.img)).slice(0, 3), ...items.filter(o => !/\.avif/i.test(o.img)).slice(0, 3)];
const UA = 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
async function probe(name, u, hdr = {}) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), 20000); const t0 = Date.now();
  try {
    const r = await fetch(u, { signal: c.signal, headers: { 'User-Agent': UA, 'Origin': 'https://taiful666.github.io', 'Accept': 'image/avif,image/webp,image/*,*/*', ...hdr } });
    const b = await r.arrayBuffer();
    console.log(`  ${name.padEnd(12)} ${r.status} ${String(r.headers.get('content-type')).padEnd(18)} ${String(b.byteLength).padStart(8)}B acao=${r.headers.get('access-control-allow-origin')} ${Date.now() - t0}ms`);
  } catch (e) { console.log(`  ${name.padEnd(12)} ERR ${e.message}`); } finally { clearTimeout(t); }
}
for (const o of pick) {
  const url = o.img, enc = encodeURIComponent(url), bare = url.replace(/^https?:\/\//, '');
  console.log('\n=== ' + url);
  await probe('direct', url);
  await probe('direct+ref', url, { Referer: 'https://www.prothomalo.com/' });
  await probe('pa?fmt=jpg', url + '?auto=format,compress&fmt=jpeg&w=1200');
  await probe('pa?format', url + '?w=1200&auto=format%2Ccompress&format=jpg');
  await probe('weserv', 'https://images.weserv.nl/?url=' + encodeURIComponent(bare) + '&w=1600&we&output=jpg&q=85');
  await probe('wsrv', 'https://wsrv.nl/?url=' + enc + '&w=1600&output=jpg&q=85');
  await probe('i0.wp', 'https://i0.wp.com/' + bare);
  await probe('statically', 'https://cdn.statically.io/img/' + bare);
  await probe('google', 'https://images1-focus-opensocial.googleusercontent.com/gadgets/proxy?container=focus&refresh=86400&url=' + enc);
  await probe('allorigins', 'https://api.allorigins.win/raw?url=' + enc);
  await probe('corsproxy', 'https://corsproxy.io/?url=' + enc);
  await probe('codetabs', 'https://api.codetabs.com/v1/proxy/?quest=' + enc);
}
