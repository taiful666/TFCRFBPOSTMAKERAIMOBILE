// Adds the in-app updater to the generated Android project (run after "npx cap add android").
//  - copies native/TFUpdaterPlugin.java next to MainActivity and registers it
//  - asks Android for the "install updates" permission (the phone still asks the user once)
//  - makes sure the update file in the app's cache can be handed to Android's installer
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(join(here, 'capacitor.config.json'), 'utf8'));
const main = join(here, 'android', 'app', 'src', 'main');
const pkgDir = join(main, 'java', ...cfg.appId.split('.'));
if (cfg.appId !== 'com.taiful.tfnewscraft') throw new Error('appId changed — update the package line in native/TFUpdaterPlugin.java');

copyFileSync(join(here, 'native', 'TFUpdaterPlugin.java'), join(pkgDir, 'TFUpdaterPlugin.java'));

const actPath = join(pkgDir, 'MainActivity.java');
let act = readFileSync(actPath, 'utf8');
if (!act.includes('TFUpdaterPlugin')) {
  if (!/public class MainActivity extends BridgeActivity \{\s*\}/.test(act)) throw new Error('MainActivity is not the default one — add registerPlugin(TFUpdaterPlugin.class) by hand');
  act = act.replace(/public class MainActivity extends BridgeActivity \{\s*\}/,
    'public class MainActivity extends BridgeActivity {\n' +
    '    @Override\n' +
    '    public void onCreate(android.os.Bundle savedInstanceState) {\n' +
    '        registerPlugin(TFUpdaterPlugin.class);\n' +
    '        super.onCreate(savedInstanceState);\n' +
    '    }\n' +
    '}');
  writeFileSync(actPath, act);
}

const manPath = join(main, 'AndroidManifest.xml');
let man = readFileSync(manPath, 'utf8');
if (!man.includes('REQUEST_INSTALL_PACKAGES')) {
  man = man.replace('<uses-permission android:name="android.permission.INTERNET" />',
    '<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />');
  if (!man.includes('REQUEST_INSTALL_PACKAGES')) throw new Error('could not add the install permission');
  writeFileSync(manPath, man);
}
if (!man.includes('androidx.core.content.FileProvider')) throw new Error('FileProvider missing from the manifest');

const fpPath = join(main, 'res', 'xml', 'file_paths.xml');
let fp = existsSync(fpPath) ? readFileSync(fpPath, 'utf8') : '<?xml version="1.0" encoding="utf-8"?>\n<paths xmlns:android="http://schemas.android.com/apk/res/android">\n</paths>';
if (!fp.includes('tf-update')) {
  fp = fp.replace('</paths>', '    <cache-path name="tf_update" path="tf-update/" />\n</paths>');
  writeFileSync(fpPath, fp);
}
console.log('in-app updater added');
