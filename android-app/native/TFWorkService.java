package com.taiful.tfnewscraft;

/*
 * Foreground service used while a video is being exported: Android keeps the app running
 * (minimised or screen off), a partial wake lock keeps the CPU awake, and the notification
 * shows the progress. When the video is ready a "video ready" notification opens the app.
 */

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

public class TFWorkService extends Service {

    public static final String ACTION_START = "tf.work.START";
    private static final String CH = "tf_export";
    private static final int ID = 7310, DONE_ID = 7312;

    public static volatile TFWorkService inst = null;
    private PowerManager.WakeLock lock;
    private String title = "ভিডিও তৈরি হচ্ছে";
    private long lastNotify = 0;

    @Override
    public IBinder onBind(Intent intent) { return null; }

    private void channel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null && nm.getNotificationChannel(CH) == null) {
                NotificationChannel c = new NotificationChannel(CH, "ভিডিও তৈরি", NotificationManager.IMPORTANCE_LOW);
                c.setDescription("ভিডিও এক্সপোর্টের অগ্রগতি");
                nm.createNotificationChannel(c);
            }
        }
    }

    private PendingIntent openApp() {
        Intent i = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (i == null) i = new Intent();
        i.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        int fl = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getActivity(this, 0, i, fl);
    }

    private Notification build(int pct, String text, boolean indeterminate) {
        return new NotificationCompat.Builder(this, CH)
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setContentTitle(title + (indeterminate ? "" : " · " + pct + "%"))
            .setContentText(text == null ? "" : text)
            .setOnlyAlertOnce(true)
            .setOngoing(true)
            .setProgress(100, pct, indeterminate)
            .setContentIntent(openApp())
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        inst = this;
        channel();
        if (intent != null) {
            String t = intent.getStringExtra("title");
            if (t != null && !t.isEmpty()) title = t;
        }
        Notification n = build(0, intent != null ? intent.getStringExtra("text") : "", true);
        try {
            if (Build.VERSION.SDK_INT >= 29) ServiceCompat.startForeground(this, ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            else startForeground(ID, n);
        } catch (Throwable e) {
            try { startForeground(ID, n); } catch (Throwable ignored) {}
        }
        if (lock == null) {
            try {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                lock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "tfnewscraft:export");
                lock.setReferenceCounted(false);
                lock.acquire(60L * 60 * 1000);   // at most one hour
            } catch (Throwable ignored) {}
        }
        return START_NOT_STICKY;
    }

    public void progress(int pct, String text) {
        long now = System.currentTimeMillis();
        if (now - lastNotify < 700 && pct < 100) return;
        lastNotify = now;
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(ID, build(Math.max(0, Math.min(100, pct)), text, false));
        } catch (Throwable ignored) {}
    }

    public void finish(boolean done, String doneTitle, String doneText) {
        if (done) {
            try {
                NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                Notification n = new NotificationCompat.Builder(this, CH)
                    .setSmallIcon(android.R.drawable.stat_sys_upload_done)
                    .setContentTitle(doneTitle == null || doneTitle.isEmpty() ? "✅ ভিডিও তৈরি হয়েছে" : doneTitle)
                    .setContentText(doneText == null ? "" : doneText)
                    .setAutoCancel(true)
                    .setContentIntent(openApp())
                    .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                    .build();
                if (nm != null) nm.notify(DONE_ID, n);
            } catch (Throwable ignored) {}
        }
        stopSelf();
    }

    @Override
    public void onDestroy() {
        try { if (lock != null && lock.isHeld()) lock.release(); } catch (Throwable ignored) {}
        lock = null;
        try {
            if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE); else stopForeground(true);
        } catch (Throwable ignored) {}
        if (inst == this) inst = null;
        super.onDestroy();
    }
}
