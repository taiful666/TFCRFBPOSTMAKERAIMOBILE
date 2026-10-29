// Copies the web app (index.html in the repo root) into android-app/www
// and adds the Android bridge script at the top of <head>.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const www = join(here, 'www');

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });

let html = readFileSync(join(root, 'index.html'), 'utf8');
const i = html.indexOf('<head>');
if (i < 0) throw new Error('index.html has no <head>');
html = html.slice(0, i + 6) + '\n<script src="native-bridge.js"></script>' + html.slice(i + 6);
writeFileSync(join(www, 'index.html'), html);

copyFileSync(join(here, 'native-bridge.js'), join(www, 'native-bridge.js'));
for (const f of ['manifest.webmanifest', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png']) {
  if (existsSync(join(root, f))) copyFileSync(join(root, f), join(www, f));
}
console.log('www ready');
