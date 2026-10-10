package top.boluo66.lightnote;

import android.content.Context;
import android.content.SharedPreferences;
import com.huawei.agconnect.AGConnectInstance;
import com.huawei.agconnect.config.AGConnectServicesConfig;
import com.huawei.hms.aaid.HmsInstanceId;
import com.huawei.hms.api.HuaweiApiAvailability;
import com.huawei.hms.common.ApiException;
import com.huawei.hms.push.HmsMessaging;
import java.io.InputStream;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicBoolean;

/** Device-only probe. No account binding, token upload, business notifications or custom keep-alive. */
public final class HuaweiPushProbe {
    static final String PREFS = "light_note_huawei_probe";
    static final ExecutorService WORK = Executors.newSingleThreadExecutor();
    private static boolean initialized;
    private static final AtomicBoolean registering = new AtomicBoolean();
    private static final AtomicBoolean revoking = new AtomicBoolean();
    static SharedPreferences prefs(Context context) { return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    static boolean allowed(Context context) {
        return PrivacyConsentStore.isAccepted(context) && prefs(context).getBoolean("allowed", false);
    }
    static void status(Context context, String message) { prefs(context).edit().putString("status", message).apply(); }
    static synchronized void initialize(Context context) throws Exception {
        if (initialized) return;
        try (InputStream input = context.getAssets().open("agconnect-services.json")) {
            AGConnectServicesConfig.fromContext(context).overlayWith(input);
            // overlayWith stores a lazy stream. Force config parsing before closing the asset.
            String configuredAppId = appId(context);
            if (configuredAppId == null || configuredAppId.isEmpty()) throw new IllegalStateException("Missing app ID");
            AGConnectInstance.initialize(context);
        }
        HmsMessaging.getInstance(context).setAutoInitEnabled(false);
        initialized = true;
    }
    static String appId(Context context) {
        return AGConnectServicesConfig.fromContext(context).getString("client/app_id");
    }
    static void register(Context context) {
        final Context app = context.getApplicationContext();
        if (!PrivacyConsentStore.isAccepted(app) || revoking.get() || !registering.compareAndSet(false, true)) return;
        prefs(app).edit().putBoolean("allowed", true).remove("token").remove("hms_status")
            .putString("status", "正在检查 HMS 并申请 Token…").apply();
        WORK.execute(() -> {
            String stage = "SDK 初始化";
            try {
                if (!allowed(app)) return;
                initialize(app);
                stage = "HMS 检测";
                int availability = HuaweiApiAvailability.getInstance().isHuaweiMobileServicesAvailable(app);
                prefs(app).edit().putInt("hms_status", availability).apply();
                // Compatibility runtimes may expose a working token bridge despite the availability result.
                // Keep both observations; only a real non-empty token counts as registration success.
                stage = "Token 申请";
                String token = HmsInstanceId.getInstance(app).getToken(appId(app), "HCM");
                if (!allowed(app)) return;
                if (token != null && !token.isEmpty()) saveToken(app, token);
                else if (prefs(app).getString("token", "").isEmpty()) status(app, "请求已返回，等待华为 Token 回调。若长时间无结果，请记录 HMS 状态码后反馈。");
            } catch (Exception error) {
                if (allowed(app)) status(app, stage + "未成功：" + errorCode(error) + "。这不代表系统通知权限被拒绝。");
            } finally {
                registering.set(false);
            }
        });
    }
    static void saveToken(Context context, String token) {
        if (!allowed(context) || token == null || token.isEmpty()) return;
        prefs(context).edit().putString("token", token).putString("status", "Token 注册成功；尚未验证远程通知送达。").apply();
    }
    static String errorCode(Exception error) {
        if (error instanceof ApiException) return Integer.toString(((ApiException) error).getStatusCode());
        // Never include exception messages or argument values; only code locations are diagnostic-safe.
        StackTraceElement[] trace = error.getStackTrace();
        String location = trace.length == 0 ? "" : "（" + trace[0].getClassName()
            + "." + trace[0].getMethodName() + ":" + trace[0].getLineNumber() + "）";
        return error.getClass().getSimpleName() + location;
    }
    public static void revoke(Context context) {
        final Context app = context.getApplicationContext();
        if (!revoking.compareAndSet(false, true)) return;
        boolean wasAllowed = prefs(app).getBoolean("allowed", false);
        prefs(app).edit().clear().putString("status", "本机测试已停止。正在撤销华为 Token…").apply();
        if (!wasAllowed) { status(app, "尚未启用华为推送测试。"); revoking.set(false); return; }
        WORK.execute(() -> {
            try {
                initialize(app);
                HmsInstanceId.getInstance(app).deleteToken(appId(app), "HCM");
                status(app, "华为 Token 已撤销，测试已停止。");
            } catch (Exception error) {
                status(app, "本机测试已停止，但远端 Token 撤销未确认：" + errorCode(error)
                    + "。请在系统设置关闭此测试包的通知，联网后重新注册并停止测试以重试撤销。");
            } finally {
                revoking.set(false);
            }
        });
    }
}
