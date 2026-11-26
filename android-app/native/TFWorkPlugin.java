package com.taiful.tfnewscraft;

/*
 * TF FB Reels & Post Maker — keeps a video export running when the app is minimised or the screen is off.
 * start(): starts TFWorkService (a foreground service with a progress notification and a CPU wake lock)
 *          and tells the WebView to keep its full priority while the app is not on screen.
 * update(): moves the notification's progress bar.   stop(): ends it (optionally with a "video ready" note).
 */

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.webkit.WebView;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "TFWork")
public class TFWorkPlugin extends Plugin {

    private void keepWebViewAwake(boolean on) {
        try {
            getActivity().runOnUiThread(() -> {
                try {
                    WebView wv = getBridge().getWebView();
                    if (Build.VERSION.SDK_INT >= 26 && wv != null) {
                        wv.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, !on);
                    }
                    if (wv != null) { if (on) wv.resumeTimers(); }
                } catch (Throwable ignored) {}
            });
        } catch (Throwable ignored) {}
    }

    @PluginMethod
    public void start(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                try { ActivityCompat.requestPermissions(getActivity(), new String[]{ Manifest.permission.POST_NOTIFICATIONS }, 7311); } catch (Throwable ignored) {}
            }
            Intent i = new Intent(getContext(), TFWorkService.class);
            i.setAction(TFWorkService.ACTION_START);
            i.putExtra("title", call.getString("title", "ভিডিও তৈরি হচ্ছে"));
            i.putExtra("text", call.getString("text", ""));
            ContextCompat.startForegroundService(getContext(), i);
            keepWebViewAwake(true);
            call.resolve();
        } catch (Throwable e) {
            call.reject("start: " + e.getMessage());
        }
    }

    @PluginMethod
    public void update(PluginCall call) {
        try {
            TFWorkService s = TFWorkService.inst;
            if (s != null) s.progress(call.getInt("percent", 0), call.getString("text", ""));
            call.resolve();
        } catch (Throwable e) {
            call.resolve();
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try {
            TFWorkService s = TFWorkService.inst;
            if (s != null) s.finish(Boolean.TRUE.equals(call.getBoolean("done", false)), call.getString("title", ""), call.getString("text", ""));
            keepWebViewAwake(false);
            JSObject r = new JSObject();
            r.put("ok", true);
            call.resolve(r);
        } catch (Throwable e) {
            call.resolve();
        }
    }
}
