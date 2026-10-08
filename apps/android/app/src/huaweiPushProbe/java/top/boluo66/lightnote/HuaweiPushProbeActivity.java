package top.boluo66.lightnote;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.widget.Toast;

/** Small native diagnostic, using system dialogs like the existing local notification probe. */
public final class HuaweiPushProbeActivity extends Activity implements SharedPreferences.OnSharedPreferenceChangeListener {
    private AlertDialog dialog;
    private static final int PERMISSION = 2410;
    private static final String CHANNEL = "light_note_huawei_probe";
    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        if (!PrivacyConsentStore.isAccepted(this)) { finish(); return; }
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(new NotificationChannel(CHANNEL, "华为远程推送测试", NotificationManager.IMPORTANCE_HIGH));
        dialog = new AlertDialog.Builder(this).setTitle("华为远程推送诊断")
            .setMessage("").setPositiveButton("注册 Token", null)
            .setNeutralButton("复制 Token", null).setNegativeButton("更多", null)
            .setOnCancelListener(d -> finish()).create();
        dialog.setCanceledOnTouchOutside(false);
        dialog.show();
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> consent());
        dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(v -> copyToken());
        dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setOnClickListener(v -> more());
        HuaweiPushProbe.prefs(this).registerOnSharedPreferenceChangeListener(this);
        refresh();
    }
    private void consent() {
        new AlertDialog.Builder(this).setTitle("启用华为推送测试")
            .setMessage("此测试包将使用华为 Push Kit（华为软件技术有限公司）申请设备推送 Token。SDK 会处理应用信息、设备及系统信息和应用内设备标识符（AAID、Push Token），用于建立远程推送通道。\n\nToken 只保存在本机，不上传轻笺服务器；点击复制后仅用于你授权的华为控制台测试。此包不绑定轻笺账号，只发送无个人内容的测试消息。\n\n注册成功不代表卓易通关闭 App 后能收到通知，仍需真机验证。可在“更多”停止测试。")
            .setPositiveButton("同意并注册", (d,w) -> {
                if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
                    requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, PERMISSION);
                else HuaweiPushProbe.register(this);
            }).setNegativeButton("取消", null)
            .setNeutralButton("SDK 隐私说明", (d,w) -> {
                try { startActivity(new Intent(Intent.ACTION_VIEW,
                    android.net.Uri.parse("https://developer.huawei.com/consumer/cn/doc/development/HMSCore-Guides/sdk-data-security-0000001050042177"))); }
                catch (RuntimeException error) { Toast.makeText(this, "无法打开浏览器，请在电脑查看华为 Push Kit 隐私说明", Toast.LENGTH_LONG).show(); }
            })
            .show();
    }
    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(request, permissions, grants);
        if (request != PERMISSION) return;
        if (grants.length > 0 && grants[0] == PackageManager.PERMISSION_GRANTED && PrivacyConsentStore.isAccepted(this)) HuaweiPushProbe.register(this);
        else { HuaweiPushProbe.status(this, "未允许系统通知，请在通知设置中开启后重新注册。"); refresh(); }
    }
    private void copyToken() {
        String token = HuaweiPushProbe.allowed(this) ? HuaweiPushProbe.prefs(this).getString("token", "") : "";
        if (token.isEmpty()) { Toast.makeText(this, "尚未取得 Token", Toast.LENGTH_SHORT).show(); return; }
        ClipboardManager clipboard = getSystemService(ClipboardManager.class);
        if (clipboard != null) {
            ClipData clip = ClipData.newPlainText("Huawei push test token", token);
            android.os.PersistableBundle extras = new android.os.PersistableBundle();
            extras.putBoolean("android.content.extra.IS_SENSITIVE", true);
            clip.getDescription().setExtras(extras);
            clipboard.setPrimaryClip(clip);
            Toast.makeText(this, "已复制；仅粘贴到华为推送控制台，不要公开分享", Toast.LENGTH_LONG).show();
        }
    }
    private void more() {
        new AlertDialog.Builder(this).setTitle("推送测试")
            .setItems(new String[]{"打开通知中心", "系统通知设置", "停止测试并撤销 Token"}, (d,index) -> {
                if (index == 0) { startActivity(new Intent(this, MainActivity.class).putExtra("huawei_probe_center", true)); finish(); }
                else if (index == 1) {
                    try { startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName())); }
                    catch (RuntimeException error) { Toast.makeText(this, "请手动打开系统通知设置", Toast.LENGTH_LONG).show(); }
                } else HuaweiPushProbe.revoke(this);
            }).show();
    }
    private void refresh() {
        if (dialog == null || isFinishing()) return;
        SharedPreferences prefs = HuaweiPushProbe.prefs(this);
        NotificationManager manager = getSystemService(NotificationManager.class);
        String token = HuaweiPushProbe.allowed(this) ? prefs.getString("token", "") : "";
        dialog.setMessage("仅验证华为官方远程通知，不使用本机延迟通知。\n\n"
            + "Android：" + Build.VERSION.RELEASE + " / API " + Build.VERSION.SDK_INT
            + "\n系统通知：" + (manager != null && manager.areNotificationsEnabled() ? "已允许" : "未允许")
            + "\nHMS 状态码：" + (prefs.contains("hms_status") ? prefs.getInt("hms_status", -1) : "尚未检测")
            + "\nToken：" + (token.isEmpty() ? "未取得" : "已取得（不在页面显示）")
            + "\n\n" + prefs.getString("status", "请点击注册 Token，阅读并同意测试说明。")
            + "\n\n注册成功后，再分别测试退后台、锁屏和划掉 App。系统通知送达需以手机实际显示为准。");
    }
    @Override public void onSharedPreferenceChanged(SharedPreferences prefs, String key) { runOnUiThread(this::refresh); }
    @Override protected void onResume() { super.onResume(); refresh(); }
    @Override protected void onDestroy() {
        HuaweiPushProbe.prefs(this).unregisterOnSharedPreferenceChangeListener(this);
        if (dialog != null) dialog.dismiss();
        super.onDestroy();
    }
}
