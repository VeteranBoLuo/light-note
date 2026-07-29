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
        preferences(context).edit().clear().apply();
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE);
    }
}
