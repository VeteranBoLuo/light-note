package top.boluo66.lightnote;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.service.notification.StatusBarNotification;
import androidx.core.app.NotificationCompat;

/** Opt-in local diagnostic. Android records do not prove HarmonyOS shade delivery. */
public final class NotificationSmokeActivity extends Activity {
    // Separate high-importance diagnostic channel: existing channel importance cannot be upgraded in code.
    private static final String CHANNEL = "light_note_local_smoke_high";
    private static final int PERMISSION_REQUEST = 2308;
    private static final int NOTIFICATION_ID = 2310;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private AlertDialog dialog;
    private boolean delayed;
    private boolean pending;
    private String result = "尚未发送。请下拉通知栏检查，顶部横幅不一定出现。";

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        result = getPreferences(MODE_PRIVATE).getString("last_result", result);
        if (!PrivacyConsentStore.isAccepted(this)) {
            new AlertDialog.Builder(this).setTitle("先打开轻笺")
                .setMessage("请先在轻笺中完成隐私告知，再进行本机通知测试。")
                .setPositiveButton("打开轻笺", (d, w) -> { startActivity(new Intent(this, MainActivity.class)); finish(); })
                .setNegativeButton("取消", (d, w) -> finish()).setOnCancelListener(d -> finish()).show();
            return;
        }
        dialog = new AlertDialog.Builder(this).setTitle("本机通知诊断 v3")
            .setMessage("")
            .setPositiveButton("立即发送", null)
            .setNeutralButton("15 秒后发送", null)
            .setNegativeButton("通知设置", null)
            .setOnCancelListener(d -> finish()).create();
        dialog.setCanceledOnTouchOutside(false);
        dialog.show();
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> { delayed = false; requestOrSend(); });
        dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(v -> { delayed = true; requestOrSend(); });
        dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setOnClickListener(v -> {
            try {
                startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName()));
            } catch (RuntimeException error) {
                record("无法打开通知设置：" + error.getClass().getSimpleName()
                    + "。请手动检查卓易通及鸿蒙系统的通知设置。");
            }
        });
        refresh();
    }
    @Override protected void onResume() { super.onResume(); refresh(); }
    @Override protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (pending) getPreferences(MODE_PRIVATE).edit().putString("last_result", "测试窗口已关闭，等待中的测试已取消。").apply();
        super.onDestroy();
    }
    private void record(String message) {
        result = message;
        getPreferences(MODE_PRIVATE).edit().putString("last_result", message).apply();
        refresh();
    }
    private void refresh() {
        if (dialog == null || isFinishing() || isDestroyed()) return;
        String status;
        try {
            NotificationManager manager = getSystemService(NotificationManager.class);
            NotificationChannel channel = manager == null ? null : manager.getNotificationChannel(CHANNEL);
            status = "Android API：" + Build.VERSION.SDK_INT
                + "\n运行时权限：" + (Build.VERSION.SDK_INT < 33 ? "此版本无需申请" :
                    checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED ? "已允许" : "未允许")
                + "\n应用通知：" + (manager == null ? "服务不可用" : manager.areNotificationsEnabled() ? "已允许" : "已关闭")
                + "\n测试通道：" + (channel == null ? "尚未建立" : "重要性 " + channel.getImportance() + "（0 关闭，3 普通，4 高）");
        } catch (RuntimeException error) {
            status = "读取通知状态失败：" + error.getClass().getSimpleName();
        }
        dialog.setMessage(status + "\n\n最近一次结果：\n" + result
            + "\n\nAndroid 通知记录不代表已展示到鸿蒙通知栏。此测试不验证远程推送。按返回键退出会取消等待中的测试。");
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(!pending);
        dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setEnabled(!pending);
    }
    private void requestOrSend() {
        if (pending) return;
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, PERMISSION_REQUEST);
        } else schedule();
    }
    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(request, permissions, results);
        if (request != PERMISSION_REQUEST) return;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) schedule();
        else record("通知权限未获允许，未发送。请点击通知设置检查。");
    }
    private void schedule() {
        pending = true;
        record(delayed ? "等待 15 秒。可按 Home 返回桌面或锁屏，稍后回到此窗口查看结果。" : "正在发送……");
        if (delayed) handler.postDelayed(this::send, 15000);
        else send();
    }
    private void send() {
        try {
            if (!PrivacyConsentStore.isAccepted(this)) throw new SecurityException();
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager == null) throw new IllegalStateException();
            manager.createNotificationChannel(new NotificationChannel(CHANNEL, "轻笺横幅通知测试", NotificationManager.IMPORTANCE_HIGH));
            NotificationChannel channel = manager.getNotificationChannel(CHANNEL);
            if (!manager.areNotificationsEnabled() || channel == null || channel.getImportance() == NotificationManager.IMPORTANCE_NONE) {
                pending = false;
                record("未发送：应用通知或测试通道未开启。请点击通知设置检查。");
                return;
            }
            Intent intent = new Intent(this, MainActivity.class)
                .putExtra("light_note_notification_smoke", true)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent open = PendingIntent.getActivity(this, NOTIFICATION_ID, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            manager.cancel(NOTIFICATION_ID);
            manager.notify(NOTIFICATION_ID, new NotificationCompat.Builder(this, CHANNEL)
                .setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("轻笺 · 本机测试 v3")
                .setContentText("这是一条测试通知，点击打开通知中心")
                .setContentIntent(open).setAutoCancel(true).build());
            record("notify() 已返回，正在检查 Android 通知记录……");
            handler.postDelayed(() -> {
                pending = false;
                try {
                    boolean found = false;
                    for (StatusBarNotification item : manager.getActiveNotifications()) {
                        if (item.getId() == NOTIFICATION_ID && getPackageName().equals(item.getPackageName())) found = true;
                    }
                    record(found
                        ? "Android 已登记这条通知。请下拉鸿蒙通知栏确认；若仍不可见，需继续排查卓易通展示与外层通知权限。"
                        : "notify() 已返回，但 1 秒后未找到这条通知。可能被系统移除或兼容层未保留，尚不能确认送达。");
                } catch (RuntimeException error) {
                    record("notify() 已返回，但无法读取通知记录：" + error.getClass().getSimpleName());
                }
            }, 1000);
        } catch (RuntimeException error) {
            pending = false;
            record("发送失败：" + error.getClass().getSimpleName() + "。未确认送达。");
        }
    }
}
