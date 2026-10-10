package top.boluo66.lightnote;

import android.content.Context;
import android.content.SharedPreferences;

final class PrivacyConsentStore {
    private static final String PREFERENCES_NAME = "light_note_privacy_consent";
    private static final String KEY_ACCEPTED_VERSION = "accepted_version";
    private static final String KEY_ACCEPTED_AT = "accepted_at";

    private PrivacyConsentStore() {
    }

    static boolean isAccepted(Context context) {
        return LegalDocuments.PRIVACY_POLICY_VERSION.equals(
            preferences(context).getString(KEY_ACCEPTED_VERSION, "")
        );
    }

    static void accept(Context context) {
        preferences(context)
            .edit()
            .putString(KEY_ACCEPTED_VERSION, LegalDocuments.PRIVACY_POLICY_VERSION)
            .putLong(KEY_ACCEPTED_AT, System.currentTimeMillis())
            .apply();
    }

    static void clear(Context context) {
        if (BuildConfig.HUAWEI_PUSH) {
            context.getSharedPreferences("native_notification_sync", Context.MODE_PRIVATE).edit().remove("huawei_offered").remove("huawei_all_offered").remove("huawei_release_offered").putBoolean("allowed", false).commit();
            context.getSharedPreferences("huawei_push_account", Context.MODE_PRIVATE).edit().putBoolean("consent", false).commit();
            try {
                Class.forName("top.boluo66.lightnote.HuaweiPushAccount").getMethod("handle", Context.class, String.class).invoke(null, context, "clear");
            } catch (ReflectiveOperationException ignored) { }
        }
        if (BuildConfig.HUAWEI_PUSH_PROBE) {
            try {
                Class.forName("top.boluo66.lightnote.HuaweiPushProbe")
                    .getMethod("revoke", Context.class).invoke(null, context);
            } catch (ReflectiveOperationException ignored) {
                // Withdrawal must always clear consent even when the diagnostic module is unavailable.
            }
        }
        preferences(context).edit().clear().apply();
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE);
    }
}
