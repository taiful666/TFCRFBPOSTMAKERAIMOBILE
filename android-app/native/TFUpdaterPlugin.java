package com.taiful.tfnewscraft;

/*
 * TF FB Reels & Post Maker — in-app updater.
 * Downloads the new APK inside the app (in the background, with progress), checks it
 * (same app, newer version, SHA-256 from the Releases page), then opens Android's own
 * "Update" screen. No browser, no GitHub page.
 *
 * Android rules: an app can never install itself silently. The first time, the phone asks
 * once to "Allow from this source"; the app opens that setting by itself and continues the
 * install automatically when you come back.
 */

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;

@CapacitorPlugin(name = "TFUpdater")
public class TFUpdaterPlugin extends Plugin {

    private static final long MAX_BYTES = 400L * 1024 * 1024;
    private volatile boolean busy = false;
    private volatile boolean waitingPermission = false;

    private File dir() { File d = new File(getContext().getCacheDir(), "tf-update"); if (!d.exists()) d.mkdirs(); return d; }
    private File apk() { return new File(dir(), "update.apk"); }

    private long myVersion() {
        try {
            PackageInfo pi = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            return Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
        } catch (Exception e) { return 0; }
    }

    /** version of a downloaded APK, or -1 if it is not a valid update for this app */
    private long apkVersion(File f) {
        try {
            PackageManager pm = getContext().getPackageManager();
            PackageInfo pi = pm.getPackageArchiveInfo(f.getAbsolutePath(), 0);
            if (pi == null || !getContext().getPackageName().equals(pi.packageName)) return -1;
            return Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
        } catch (Exception e) { return -1; }
    }

    private boolean canInstall() {
        return Build.VERSION.SDK_INT < 26 || getContext().getPackageManager().canRequestPackageInstalls();
    }

    private static String sha256(File f) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(f)) {
            byte[] b = new byte[65536]; int n;
            while ((n = in.read(b)) > 0) md.update(b, 0, n);
        }
        StringBuilder sb = new StringBuilder();
        for (byte x : md.digest()) sb.append(String.format(Locale.ROOT, "%02x", x));
        return sb.toString();
    }

    /** only GitHub's own download hosts, only https */
    private static boolean allowed(URL u) {
        if (!"https".equalsIgnoreCase(u.getProtocol())) return false;
        String h = u.getHost().toLowerCase(Locale.ROOT);
        return h.equals("github.com") || h.equals("api.github.com") || h.endsWith(".githubusercontent.com");
    }

    @PluginMethod
    public void info(PluginCall call) {
        long mine = myVersion();
        File f = apk();
        long ready = f.exists() ? apkVersion(f) : -1;
        if (f.exists() && ready <= mine) { f.delete(); ready = -1; }      // old / finished update: clean up
        JSObject r = new JSObject();
        r.put("version", mine);
        r.put("canInstall", canInstall());
        r.put("readyVersion", ready);
        r.put("busy", busy);
        call.resolve(r);
    }

    @PluginMethod
    public void download(final PluginCall call) {
        final String url = call.getString("url", "");
        final String want = call.getString("sha256", "").trim().toLowerCase(Locale.ROOT);
        final long build = call.getLong("build", 0L);
        if (busy) { call.reject("busy"); return; }
        busy = true;
        new Thread(() -> {
            File tmp = new File(dir(), "update.part"), out = apk();
            try {
                // already downloaded earlier (e.g. the install screen was closed)? use it again
                if (out.exists() && apkVersion(out) > myVersion() && (build <= 0 || apkVersion(out) >= build)
                        && (want.isEmpty() || want.equals(sha256(out)))) {
                    JSObject r = new JSObject(); r.put("cached", true); r.put("version", apkVersion(out)); call.resolve(r); return;
                }
                URL u = new URL(url);
                HttpURLConnection c = null;
                for (int hop = 0; hop < 8; hop++) {
                    if (!allowed(u)) throw new Exception("blocked host");
                    c = (HttpURLConnection) u.openConnection();
                    c.setInstanceFollowRedirects(false);
                    c.setConnectTimeout(20000);
                    c.setReadTimeout(60000);
                    c.setRequestProperty("Accept", "application/octet-stream");
                    c.setRequestProperty("User-Agent", "TF-FB-Reels-Post-Maker-Updater");
                    int code = c.getResponseCode();
                    if (code >= 300 && code < 400) {
                        String loc = c.getHeaderField("Location"); c.disconnect();
                        if (loc == null) throw new Exception("redirect");
                        u = new URL(u, loc); c = null; continue;
                    }
                    if (code != 200) throw new Exception("HTTP " + code);
                    break;
                }
                if (c == null) throw new Exception("too many redirects");
                long total = c.getContentLengthLong();
                if (total > MAX_BYTES) throw new Exception("too big");
                long got = 0, lastSent = 0;
                try (InputStream in = c.getInputStream(); OutputStream os = new FileOutputStream(tmp)) {
                    byte[] b = new byte[65536]; int n;
                    while ((n = in.read(b)) > 0) {
                        os.write(b, 0, n); got += n;
                        if (got > MAX_BYTES) throw new Exception("too big");
                        long now = System.currentTimeMillis();
                        if (now - lastSent > 250) {
                            lastSent = now;
                            JSObject p = new JSObject(); p.put("received", got); p.put("total", total);
                            notifyListeners("updateProgress", p);
                        }
                    }
                } finally { c.disconnect(); }
                if (total > 0 && got != total) throw new Exception("incomplete");
                if (!want.isEmpty() && !want.equals(sha256(tmp))) throw new Exception("checksum");
                long v = apkVersion(tmp);
                if (v < 0) throw new Exception("not this app");
                if (v <= myVersion()) throw new Exception("not newer");
                if (out.exists()) out.delete();
                if (!tmp.renameTo(out)) throw new Exception("save");
                JSObject r = new JSObject(); r.put("cached", false); r.put("version", v); r.put("bytes", got);
                call.resolve(r);
            } catch (Exception e) {
                tmp.delete();
                call.reject(String.valueOf(e.getMessage()));
            } finally {
                busy = false;
            }
        }).start();
    }

    @PluginMethod
    public void install(PluginCall call) {
        File f = apk();
        if (!f.exists() || apkVersion(f) <= myVersion()) { call.reject("no update file"); return; }
        if (!canInstall()) {
            waitingPermission = true;
            try {
                Intent s = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
                s.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(s);
            } catch (Exception e) { waitingPermission = false; call.reject("settings"); return; }
            JSObject r = new JSObject(); r.put("status", "permission"); call.resolve(r);
            return;
        }
        try { launch(f); } catch (Exception e) { call.reject("installer"); return; }
        JSObject r = new JSObject(); r.put("status", "installing"); call.resolve(r);
    }

    private void launch(File f) {
        Context ctx = getContext();
        Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", f);
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setDataAndType(uri, "application/vnd.android.package-archive");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx.startActivity(i);
    }

    /** back from the "Allow from this source" screen: carry on with the install by itself */
    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        if (!waitingPermission) return;
        waitingPermission = false;
        JSObject r = new JSObject();
        if (canInstall() && apk().exists()) {
            try { launch(apk()); r.put("state", "installing"); }
            catch (Exception e) { r.put("state", "failed"); }
        } else r.put("state", "denied");
        notifyListeners("updateState", r);
    }
}
