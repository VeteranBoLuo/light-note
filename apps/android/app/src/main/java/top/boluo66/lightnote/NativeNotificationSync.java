package top.boluo66.lightnote;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.service.notification.StatusBarNotification;
import androidx.core.app.NotificationCompat;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Iterator;

/** Foreground WebView delivery only. No remote push credentials or native authentication storage. */
final class NativeNotificationSync {
    private static final String CHANNEL = "light_note_notification_center";
    private static final String TAG_PREFIX = "light-note-center:";
    private final Activity activity;
    private final SharedPreferences prefs;
    private final NotificationManager manager;
    private String owner = "";
    private String epoch = "";
    private String openOwner = "";

    NativeNotificationSync(Activity activity) {
        this.activity = activity;
        prefs = activity.getSharedPreferences("native_notification_sync", Activity.MODE_PRIVATE);
        manager = activity.getSystemService(NotificationManager.class);
    }
    void pageChanged() { epoch = ""; }
    void open(Intent intent) {
        openOwner = intent == null ? "" : intent.getStringExtra("native_notification_owner");
        if (openOwner == null) openOwner = "";
    }
    void clear() {
        owner = ""; epoch = ""; openOwner = "";
        prefs.edit().remove("owner").remove("since").remove("seen").apply();
        clearVisible();
    }
    private void clearVisible() {
        if (manager == null) return;
        try {
            for (StatusBarNotification item : manager.getActiveNotifications()) {
                if (item.getTag() != null && item.getTag().startsWith(TAG_PREFIX)) manager.cancel(item.getTag(), item.getId());
            }
        } catch (RuntimeException ignored) {
            // A compatibility-layer notification failure must never block logout or privacy withdrawal.
        }
    }

    private boolean enabled() {
        return prefs.getBoolean("allowed", false) && manager != null && manager.areNotificationsEnabled()
            && (Build.VERSION.SDK_INT < 33 || activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED)
            && manager.getNotificationChannel(CHANNEL) != null
            && manager.getNotificationChannel(CHANNEL).getImportance() != NotificationManager.IMPORTANCE_NONE;
    }
    private void offerPermission() {
        if (prefs.getBoolean("offered", false)) return;
        prefs.edit().putBoolean("offered", true).apply();
        new AlertDialog.Builder(activity).setTitle("开启通知同步测试")
            .setMessage("将轻笺通知中心的新消息显示到手机通知栏。此测试版仅在 App 页面运行时同步，关闭 App 后不保证送达。系统通知不显示消息正文。")
            .setPositiveButton("允许通知", (d, w) -> {
                prefs.edit().putBoolean("allowed", true).apply();
                if (Build.VERSION.SDK_INT >= 33 && activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
                    activity.requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 2311);
            }).setNegativeButton("暂不开启", (d, w) -> prefs.edit().putBoolean("allowed", false).apply()).show();
    }
    JSONObject handle(JSONObject request) throws Exception {
        JSONObject reply = new JSONObject().put("token", request.optString("token")).put("ok", false);
        if (!BuildConfig.NOTIFICATION_SYNC || !PrivacyConsentStore.isAccepted(activity)) return reply;
        String action = request.optString("action");
        if ("clear".equals(action)) { clear(); return reply.put("ok", true); }
        String requestedOwner = request.optString("owner");
        String requestedEpoch = request.optString("epoch");
        if (requestedOwner.isEmpty() || requestedOwner.length() > 64 || requestedEpoch.isEmpty() || requestedEpoch.length() > 100) return reply;
        if ("bind".equals(action)) {
            if (!requestedOwner.equals(prefs.getString("owner", ""))) {
                // Keep a pending click only if it belongs to the newly authenticated account.
                clearVisible();
                prefs.edit().remove("since").remove("seen").putString("owner", requestedOwner).apply();
            }
            owner = requestedOwner; epoch = requestedEpoch;
            manager.createNotificationChannel(new NotificationChannel(CHANNEL, "轻笺通知中心", NotificationManager.IMPORTANCE_HIGH));
            offerPermission();
        }
        if (!owner.equals(requestedOwner) || !epoch.equals(requestedEpoch)) return reply;
        if ("deliver".equals(action)) {
            String since = request.optString("since");
            if (!since.matches("\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}\\.\\d{6}")) return reply;
            String savedSince = prefs.getString("since", "");
            if (!savedSince.isEmpty() && !savedSince.equals(since)) return reply;
            if (!enabled()) return reply;
            JSONArray items = request.optJSONArray("items");
            if (items == null || items.length() > 100) return reply;
            JSONObject seen = new JSONObject(prefs.getString("seen", "{}"));
            long now = System.currentTimeMillis();
            Iterator<String> keys = seen.keys();
            while (keys.hasNext()) if (now - seen.optLong(keys.next()) > 48L * 60 * 60 * 1000) keys.remove();
            java.util.ArrayList<StatusBarNotification> active = new java.util.ArrayList<>();
            for (StatusBarNotification item : manager.getActiveNotifications())
                if (item.getTag() != null && item.getTag().startsWith(TAG_PREFIX)) active.add(item);
            active.sort(java.util.Comparator.comparingLong(StatusBarNotification::getPostTime));
            java.util.ArrayDeque<String> visible = new java.util.ArrayDeque<>();
            for (StatusBarNotification item : active) visible.addLast(item.getTag());
            try {
                for (int i = 0; i < items.length(); i++) {
                    String id = items.getJSONObject(i).optString("id");
                    if (!id.matches("[a-fA-F0-9-]{36}")) return reply;
                    if (seen.has(id)) continue;
                    Intent intent = new Intent(activity, MainActivity.class).putExtra("native_notification_owner", owner)
                        .setAction("lightnote.notification." + id).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
                    PendingIntent click = PendingIntent.getActivity(activity, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                    // Keep the newest 20 visible reminders; all records remain in the notification center.
                    while (visible.size() >= 20) manager.cancel(visible.removeFirst(), 0);
                    manager.notify(TAG_PREFIX + id, 0, new NotificationCompat.Builder(activity, CHANNEL)
                        .setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("轻笺有新通知")
                        .setContentText("点击打开通知中心").setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                        .setOnlyAlertOnce(true).setContentIntent(click).setAutoCancel(true).build());
                    seen.put(id, now);
                    visible.remove(TAG_PREFIX + id);
                    visible.addLast(TAG_PREFIX + id);
                }
            } finally {
                // Preserve successful IDs even when a later notification in this batch fails.
                if (!prefs.edit().putString("since", since).putString("seen", seen.toString()).commit())
                    throw new java.io.IOException("Notification receipt persistence failed");
            }
        }
        boolean shouldOpen = "bind".equals(action) && owner.equals(openOwner);
        if ("bind".equals(action)) openOwner = "";
        return reply.put("ok", true).put("enabled", enabled())
            .put("since", prefs.getString("since", "")).put("open", shouldOpen);
    }
}
