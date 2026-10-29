import dns from 'node:dns/promises';
const UA = 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
for (const h of ['images.prothomalo.com', 'www.prothomalo.com', 'media.prothomalo.com', 'gumlet.assettype.com', 'images.assettype.com']) {
  try { console.log(h, JSON.stringify(await dns.resolve4(h)), JSON.stringify(await dns.resolveCname(h).catch(e => e.code))); } catch (e) { console.log(h, 'DNS ERR', e.code); }
}
const NEWS = await (await fetch('https://raw.githubusercontent.com/taiful666/TFCRFBPOSTMAKERAIMOBILE/live-news/news.json?t=' + Date.now())).json();
const o = NEWS.sources.prothomalo.items.find(x => x.img);
console.log('\nimg', o.img);
try { const r = await fetch(o.img, { headers: { 'User-Agent': UA } }); console.log('direct', r.status, r.headers.get('content-type')); } catch (e) { console.log('direct ERR', e.message, e.cause && (e.cause.code + ' ' + e.cause.message)); }
const p = await (await fetch(o.link, { headers: { 'User-Agent': UA } })).text();
console.log('\npage og:image:', (p.match(/property="og:image"\s+content="([^"]+)/) || p.match(/og:image"[^>]*content="([^"]+)/) || [])[1]);
const hosts = {}; for (const m of p.matchAll(/https?:\/\/([a-z0-9.-]+)\/[^"'\s]*\.(?:jpe?g|png|webp|avif)/gi)) hosts[m[1]] = (hosts[m[1]] || 0) + 1;
console.log('image hosts in page:', JSON.stringify(hosts));
for (const m of [...p.matchAll(/"(https?:\/\/[^"]*(?:assettype|gumlet|imgix|prothomalo)[^"]*\.(?:jpe?g|png|webp|avif)[^"]*)"/gi)].slice(0, 4)) console.log('  ', m[1].slice(0, 200));
const tryU = async (n, u) => { try { const r = await fetch(u, { headers: { 'User-Agent': UA } }); const b = await r.arrayBuffer(); console.log(n, r.status, r.headers.get('content-type'), b.byteLength); } catch (e) { console.log(n, 'ERR', e.cause && e.cause.code); } };
const path = o.img.replace(/^https?:\/\/[^/]+\//, '');
await tryU('gumlet.assettype', 'https://gumlet.assettype.com/' + path);
await tryU('images.assettype', 'https://images.assettype.com/' + path);
await tryU('wsrv-assettype', 'https://wsrv.nl/?url=' + encodeURIComponent('https://gumlet.assettype.com/' + path) + '&w=800&output=jpg');
