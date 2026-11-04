package top.boluo66.lightnote;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.provider.Settings;
import java.io.IOException;
import java.util.UUID;
import org.json.JSONObject;

/** One local installation epoch and account-scoped receipts; no web credentials. */
final class NativePushInstallation {
    private static final String PREFS = "native_push_installation";
    private final Context context;
    private final SharedPreferences prefs;
    NativePushInstallation(Context context) {
        this.context = context.getApplicationContext();
        prefs = this.context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
    private String accountKey(String owner) { return NativePushIdentity.digest(owner); }
    synchronized JSONObject describe(String owner, String token, String appId) throws Exception {
        NativePushDiagnostics.Stage stage = NativePushDiagnostics.Stage.PRIVACY;
        try {
            if (!PrivacyConsentStore.isAccepted(context)) throw new IOException("PUSH_CONSENT_REQUIRED");
            stage = NativePushDiagnostics.Stage.IDENTITY;
            if (appId == null || appId.isEmpty()) throw new IOException("PUSH_APP_ID_UNAVAILABLE");
            String account = accountKey(owner);
            String tokenHash = NativePushIdentity.digest(token);
            String identityScope = account + ":" + NativePushIdentity.digest(appId);
            stage = NativePushDiagnostics.Stage.INSTALLATION_READ;
            String id = prefs.getString("installation_id", "");
            if (id.isEmpty()) id = UUID.randomUUID().toString();
            long revision = prefs.getLong("revision:" + account, 0);
            if (!tokenHash.equals(prefs.getString("token_hash:" + account, ""))) revision++;
            stage = NativePushDiagnostics.Stage.REVISION;
            if (revision < 1 || revision >= 9007199254740991L) throw new IOException("PUSH_REVISION_INVALID");
            stage = NativePushDiagnostics.Stage.INSTALLATION_READ;
            String key = prefs.getString("device_key:" + identityScope, "");
            String kind = prefs.getString("identity_kind:" + identityScope, "installation");
            stage = NativePushDiagnostics.Stage.IDENTITY;
            if (key.isEmpty()) {
                String platformId;
                try { platformId = Settings.Secure.getString(context.getContentResolver(), Settings.Secure.ANDROID_ID); }
                catch (RuntimeException ignored) { platformId = null; }
                key = NativePushIdentity.key(platformId, id, owner, context.getPackageName(), appId);
                kind = NativePushIdentity.usablePlatformId(platformId) ? "scoped" : "installation";
            }
            // Keep the first identity for this installation even if a compatibility layer
            // temporarily stops exposing its scoped ID on a later foreground check.
            stage = NativePushDiagnostics.Stage.INSTALLATION_WRITE;
            if (!prefs.edit().putString("installation_id", id).putLong("revision:" + account, revision)
                .putString("token_hash:" + account, tokenHash).putString("device_key:" + identityScope, key)
                .putString("identity_kind:" + identityScope, kind).commit()) throw new IOException("PUSH_STORAGE_FAILED");
            stage = NativePushDiagnostics.Stage.DESCRIPTION;
            return new JSONObject().put("id", id).put("revision", revision)
                .put("key", key).put("identityKind", kind)
                .put("packageName", context.getPackageName()).put("pushAppId", appId)
                .put("deviceLabel", Build.MODEL == null ? "Android" : Build.MODEL.substring(0, Math.min(96, Build.MODEL.length())).replaceAll("[\\p{Cntrl}]", " "));
        } catch (Exception error) {
            throw NativePushDiagnostics.failure(stage, error);
        }
    }
    synchronized JSONObject read(String owner) throws Exception {
        String raw = prefs.getString("binding:" + accountKey(owner), "");
        return raw.isEmpty() ? null : new JSONObject(raw);
    }
    synchronized boolean save(String owner, JSONObject binding, String installationId, long revision) throws Exception {
        if (!installationId.equals(prefs.getString("installation_id", ""))
            || revision != prefs.getLong("revision:" + accountKey(owner), 0)) return false;
        if (binding == null || !owner.equals(binding.optString("userId"))
            || !binding.optString("id").matches("[a-fA-F0-9-]{36}")
            || !binding.optString("generation").matches("[a-fA-F0-9-]{36}")) throw new IOException("PUSH_BINDING_INVALID");
        JSONObject receipt = new JSONObject().put("id", binding.getString("id"))
            .put("generation", binding.getString("generation")).put("userId", owner);
        if (!prefs.edit().putString("binding:" + accountKey(owner), receipt.toString()).commit())
            throw new IOException("PUSH_STORAGE_FAILED");
        return true;
    }
    synchronized void remove(String owner, JSONObject binding) throws Exception {
        JSONObject current = read(owner);
        if (current == null || binding == null || !current.optString("id").equals(binding.optString("id"))
            || !current.optString("generation").equals(binding.optString("generation"))) return;
        if (!prefs.edit().remove("binding:" + accountKey(owner)).commit()) throw new IOException("PUSH_STORAGE_FAILED");
    }
    synchronized void advance(String owner) {
        if (owner == null || owner.isEmpty()) return;
        String account = accountKey(owner);
        prefs.edit().putLong("revision:" + account, prefs.getLong("revision:" + account, 0) + 1)
            .remove("token_hash:" + account).commit();
    }
}
