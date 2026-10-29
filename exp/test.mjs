const UA = 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const NEWS = await (await fetch('https://raw.githubusercontent.com/taiful666/TFCRFBPOSTMAKERAIMOBILE/live-news/news.json?t=' + Date.now())).json();
const items = NEWS.sources.prothomalo.items.filter(o => o.img);
const pick = [...items.filter(o => /\.avif/i.test(o.img)).slice(0, 2), ...items.filter(o => /\.png/i.test(o.img)).slice(0, 1), ...items.filter(o => /\.jpe?g/i.test(o.img)).slice(0, 2)];
async function probe(name, u) {
  try { const r = await fetch(u, { headers: { 'User-Agent': UA, 'Origin': 'https://taiful666.github.io', 'Accept': 'image/avif,image/webp,image/*,*/*' } }); const b = await r.arrayBuffer();
    console.log(`  ${name.padEnd(12)} ${r.status} ${String(r.headers.get('content-type')).padEnd(12)} ${b.byteLength}B acao=${r.headers.get('access-control-allow-origin')}`);
  } catch (e) { console.log(`  ${name.padEnd(12)} ERR ${e.cause && e.cause.code}`); }
}
for (const o of pick) {
  const url = o.img.replace('//images.prothomalo.com/', '//media.prothomalo.com/'); const bare = url.replace(/^https?:\/\//, '');
  console.log('\n=== ' + url);
  await probe('direct', url);
  await probe('direct?jpg', url + '?w=1200&auto=format%2Ccompress&fm=jpg');
  await probe('weserv', 'https://images.weserv.nl/?url=' + encodeURIComponent(bare) + '&w=1600&we&output=jpg&q=85');
  await probe('wsrv', 'https://wsrv.nl/?url=' + encodeURIComponent(url) + '&w=1600&output=jpg&q=85');
}
