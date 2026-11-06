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
let post = readFileSync(join(SRC_POST, 'index.html'), 'utf8');
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
copyFileSync(join(SRC_NEWS, 'index.html'), join(out, 'news', 'index.html'));
console.log('apps ready:', out);
