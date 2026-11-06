// Runs the end-to-end check of TF Media Studio on a clean, throw-away profile (Windows or Linux).
// Usage: npm run test:e2e        (Linux needs xvfb-run; Windows runs it directly)
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.env.TF_OUT || join(root, 'test', 'out');
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'tfms-test-'));
const electron = join(root, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
if (!existsSync(electron)) {   // npm can skip Electron's own download step; fetch it now
  spawnSync(process.execPath, [join(root, 'node_modules', 'electron', 'install.js')], { stdio: 'inherit', cwd: join(root, 'node_modules', 'electron') });
}
if (!existsSync(electron)) { console.error('electron is not installed (run npm ci)'); process.exit(2); }
const env = Object.assign({}, process.env, {
  TF_SELFTEST: '1', TF_OUT: out,
  TF_TEST_SCRIPT: join(root, 'test', 'e2e.js'), TF_TEST_PRELOAD: join(root, 'test', 'dialogs-preload.js'),
  TF_TEST_FEED: pathToFileURL(join(out, 'feed.json')).href, TF_TEST_PROFILE: profile
});
delete env.ELECTRON_RUN_AS_NODE;
const args = [electron, '--no-sandbox', root];
const [cmd, argv] = process.platform === 'linux' ? ['xvfb-run', ['-a', '-s', '-screen 0 1440x900x24', ...args]] : [args[0], args.slice(1)];
const p = spawn(cmd, argv, { env, stdio: ['ignore', 'pipe', 'pipe'] });
const noise = /dbus|Fontconfig|gpu_|GPU|viz_|ERROR:bus|NODE_OPTION|ALSA|alsa|ssl_client_socket|Failed to load URL|trace-warnings/;
const pass = (d) => String(d).split('\n').filter((l) => l.trim() && !noise.test(l)).forEach((l) => console.log(l));
p.stdout.on('data', pass); p.stderr.on('data', pass);
const kill = setTimeout(() => { console.error('TIMEOUT: test took too long'); p.kill(); }, 15 * 60 * 1000);
p.on('close', (code) => { clearTimeout(kill); try { rmSync(profile, { recursive: true, force: true }); } catch (e) {} process.exit(code == null ? 1 : code); });
