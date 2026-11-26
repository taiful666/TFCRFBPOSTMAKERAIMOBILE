package com.taiful.tfnewscraft;

/*
 * TF FB Reels & Post Maker — native picture picker (used for the page logo).
 *
 * Some phones (for example Samsung S20 FE with Android's new photo picker) hand the chosen
 * picture back to the web page in a way the page cannot read, so the logo never arrives.
 * This plugin opens the phone's own picker, reads the chosen file natively and returns its
 * bytes (base64) to the page. The original file is returned as it is (PNG transparency, SVG,
 * HEIC ... kept); very large photos are shrunk on the phone to at most 1600 px first.
 */

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.ImageDecoder;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

@CapacitorPlugin(name = "TFPicker")
public class TFPickerPlugin extends Plugin {

    private static final int KEEP_ORIGINAL_MAX = 12 * 1024 * 1024;   // up to 12 MB: send the file exactly as it is
    private static final int READ_MAX = 80 * 1024 * 1024;
    private static final int SHRINK_TO = 1600;

    @PluginMethod
    public void pickImage(PluginCall call) {
        try {
            Intent i = new Intent(Intent.ACTION_GET_CONTENT);
            i.setType("image/*");
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, false);
            startActivityForResult(call, i, "picked");
        } catch (Exception e) {
            call.reject("open: " + e.getMessage());
        }
    }

    @ActivityCallback
    private void picked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        Uri uri = data != null ? data.getData() : null;
        if (uri == null && data != null && data.getClipData() != null && data.getClipData().getItemCount() > 0) uri = data.getClipData().getItemAt(0).getUri();
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
            JSObject r = new JSObject();
            r.put("cancelled", true);
            call.resolve(r);
            return;
        }
        final Uri u = uri;
        new Thread(() -> {
            try {
                ContentResolver cr = getContext().getContentResolver();
                String mime = cr.getType(u);
                String name = nameOf(cr, u);
                byte[] bytes = readAll(cr, u);
                if (bytes.length == 0) throw new Exception("empty file");
                if (bytes.length > KEEP_ORIGINAL_MAX) {
                    byte[] small = shrink(cr, u, bytes);
                    if (small != null) { bytes = small; mime = "image/png"; name = (name == null ? "logo" : name.replaceAll("\\.[^.]+$", "")) + ".png"; }
                }
                JSObject r = new JSObject();
                r.put("data", Base64.encodeToString(bytes, Base64.NO_WRAP));
                r.put("mime", mime == null ? "" : mime);
                r.put("name", name == null ? "logo" : name);
                r.put("size", bytes.length);
                call.resolve(r);
            } catch (Throwable e) {
                call.reject("read: " + e.getMessage());
            }
        }).start();
    }

    private String nameOf(ContentResolver cr, Uri u) {
        try (Cursor c = cr.query(u, new String[]{ OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignored) {}
        String p = u.getLastPathSegment();
        return p == null ? null : p;
    }

    private byte[] readAll(ContentResolver cr, Uri u) throws Exception {
        try (InputStream in = cr.openInputStream(u)) {
            if (in == null) throw new Exception("cannot open");
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[64 * 1024];
            int n, total = 0;
            while ((n = in.read(buf)) > 0) {
                total += n;
                if (total > READ_MAX) throw new Exception("too large");
                out.write(buf, 0, n);
            }
            return out.toByteArray();
        }
    }

    /** big photo → at most 1600 px PNG (keeps transparency); null if the phone cannot decode it */
    private byte[] shrink(ContentResolver cr, Uri u, byte[] bytes) {
        try {
            Bitmap bm = null;
            if (Build.VERSION.SDK_INT >= 28) {
                ImageDecoder.Source src = ImageDecoder.createSource(cr, u);
                bm = ImageDecoder.decodeBitmap(src, (decoder, info, s) -> {
                    int w = info.getSize().getWidth(), h = info.getSize().getHeight(), m = Math.max(w, h);
                    if (m > SHRINK_TO) decoder.setTargetSize(Math.max(1, w * SHRINK_TO / m), Math.max(1, h * SHRINK_TO / m));
                    decoder.setAllocator(ImageDecoder.ALLOCATOR_SOFTWARE);
                });
            } else {
                BitmapFactory.Options o = new BitmapFactory.Options();
                o.inJustDecodeBounds = true;
                BitmapFactory.decodeByteArray(bytes, 0, bytes.length, o);
                int s = 1, m = Math.max(o.outWidth, o.outHeight);
                while (m / (s * 2) >= SHRINK_TO) s *= 2;
                o = new BitmapFactory.Options();
                o.inSampleSize = s;
                bm = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, o);
            }
            if (bm == null) return null;
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            bm.compress(Bitmap.CompressFormat.PNG, 100, out);
            bm.recycle();
            return out.toByteArray();
        } catch (Throwable e) {
            return null;
        }
    }
}
