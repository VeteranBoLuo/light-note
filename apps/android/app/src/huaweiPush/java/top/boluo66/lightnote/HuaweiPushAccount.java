package top.boluo66.lightnote;

import android.content.Context;
import android.content.SharedPreferences;
import com.huawei.hms.aaid.HmsInstanceId;
import com.huawei.hms.api.HuaweiApiAvailability;
import java.util.concurrent.atomic.AtomicBoolean;

/** Business consent and revocation survive process death. Never stores web authentication. */
public final class HuaweiPushAccount {
    private static final AtomicBoolean revoking = new AtomicBoolean();
    private static long lastAttempt;
    public static synchronized String handle(Context context, String action) {
        Context app = context.getApplicationContext();
        SharedPreferences state = app.getSharedPreferences("huawei_push_account", Context.MODE_PRIVATE);
        if ("support".equals(action)) {
            if (!PrivacyConsentStore.isAccepted(app)) return "unknown";
            SharedPreferences probe = HuaweiPushProbe.prefs(app);
            boolean confirmed = probe.getBoolean("capability_confirmed", false);
            boolean registered = !probe.getString("token", "").isEmpty() || confirmed;
            if (registered) {
                if (!confirmed) probe.edit().putBoolean("capability_confirmed", true).apply();
                return NativePushSupport.resolve(true, null);
            }
            try {
                // Local availability check only: no AGConnect initialization or token request.
                return NativePushSupport.resolve(false,
                    HuaweiApiAvailability.getInstance().isHuaweiMobileServicesAvailable(app));
            } catch (RuntimeException ignored) { return "unknown"; }
        }
        if ("allow".equals(action)) state.edit().putBoolean("consent", true).apply();
        if ("clear".equals(action)) {
            if (!state.getBoolean("revoke_pending", false) && !HuaweiPushProbe.prefs(app).getBoolean("allowed", false)
                && HuaweiPushProbe.prefs(app).getString("token", "").isEmpty()) return "";
            state.edit().putBoolean("revoke_pending", true).commit();
            HuaweiPushProbe.prefs(app).edit().remove("token").putBoolean("allowed", false).commit();
        }
        if (state.getBoolean("revoke_pending", false)) {
            if (revoking.compareAndSet(false, true)) HuaweiPushProbe.WORK.execute(() -> {
                try {
                    HuaweiPushProbe.initialize(app);
                    HmsInstanceId.getInstance(app).deleteToken(HuaweiPushProbe.appId(app), "HCM");
                    state.edit().putBoolean("revoke_pending", false).commit();
                } catch (Exception ignored) {
                    // Retry on the next foreground bind. Never reuse a token whose revocation is pending.
                } finally { revoking.set(false); }
            });
            return "";
        }
        if (!PrivacyConsentStore.isAccepted(app) || !state.getBoolean("consent", false)) return "";
        String token = HuaweiPushProbe.prefs(app).getString("token", "");
        if (token.isEmpty() && System.currentTimeMillis() - lastAttempt > 60_000) {
            lastAttempt = System.currentTimeMillis();
            HuaweiPushProbe.register(app);
        }
        return token;
    }
}
