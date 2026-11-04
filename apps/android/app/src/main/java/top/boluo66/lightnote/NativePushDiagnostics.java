package top.boluo66.lightnote;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.util.Log;
import android.widget.TextView;
import android.widget.Toast;
import java.io.IOException;
import java.security.NoSuchAlgorithmException;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONException;

/** Fixed diagnostic codes only; never exposes exception text, identifiers or credentials. */
final class NativePushDiagnostics {
    enum Stage {
        PRIVACY("P0", R.string.notification_diagnostic_privacy),
        INSTALLATION_READ("I1", R.string.notification_diagnostic_installation_read),
        REVISION("I2", R.string.notification_diagnostic_revision),
        IDENTITY("I3", R.string.notification_diagnostic_identity),
        INSTALLATION_WRITE("I4", R.string.notification_diagnostic_installation_write),
        DESCRIPTION("I5", R.string.notification_diagnostic_description),
        RECEIPT_READ("R1", R.string.notification_diagnostic_receipt_read),
        RECEIPT_SAVE("R2", R.string.notification_diagnostic_receipt_save),
        RECEIPT_REMOVE("R3", R.string.notification_diagnostic_receipt_remove),
        BIND("B1", R.string.notification_diagnostic_bind),
        DELIVERY("D1", R.string.notification_diagnostic_delivery),
        CLEAR("C1", R.string.notification_diagnostic_clear),
        SETTINGS("S1", R.string.notification_diagnostic_settings),
        BRIDGE("B0", R.string.notification_diagnostic_bridge);

        final String code;
        final int label;
        Stage(String code, int label) { this.code = code; this.label = label; }
    }

    static final class Failure extends IOException {
        final Stage stage;
        final String code;
        private Failure(Stage stage, Exception cause) {
            super("LNP1-" + stage.code + "-" + reason(cause), cause);
            this.stage = stage;
            this.code = getMessage();
        }
    }

    static Failure failure(Stage stage, Exception error) {
        return error instanceof Failure ? (Failure) error : new Failure(stage, error);
    }

    static Stage stageForAction(String action) {
        if (action == null) return Stage.BRIDGE;
        switch (action) {
            case "bind": return Stage.BIND;
            case "receiptRead": return Stage.RECEIPT_READ;
            case "receiptSave": return Stage.RECEIPT_SAVE;
            case "receiptRemove": return Stage.RECEIPT_REMOVE;
            case "deliver": return Stage.DELIVERY;
            case "clear": return Stage.CLEAR;
            case "settings": return Stage.SETTINGS;
            default: return Stage.BRIDGE;
        }
    }

    private static String reason(Exception error) {
        // Compare complete allowlisted messages; unknown exception text never becomes a code.
        if (error instanceof IOException) {
            if ("PUSH_STORAGE_FAILED".equals(error.getMessage())) return "STORE";
            if ("PUSH_REVISION_INVALID".equals(error.getMessage())) return "REV";
            if ("PUSH_CONSENT_REQUIRED".equals(error.getMessage())) return "CONSENT";
            if ("PUSH_BINDING_INVALID".equals(error.getMessage())) return "RECEIPT";
            if ("PUSH_APP_ID_UNAVAILABLE".equals(error.getMessage())) return "APPID";
            return "IO";
        }
        if (error instanceof ClassCastException) return "TYPE";
        if (error instanceof NullPointerException) return "NULL";
        if (error instanceof SecurityException) return "PERM";
        if (error instanceof JSONException) return "JSON";
        if (error instanceof IllegalArgumentException) return "ARG";
        if (error instanceof NoSuchAlgorithmException || error.getCause() instanceof NoSuchAlgorithmException)
            return "CRYPTO";
        if (error instanceof IllegalStateException) return "STATE";
        return "OTHER";
    }

    private final Activity activity;
    private final Set<String> shownCodes = new HashSet<>();
    private AlertDialog dialog;
    private String lastLoggedCode = "";

    NativePushDiagnostics(Activity activity) { this.activity = activity; }

    String report(Stage stage, Exception error) {
        Failure failure = failure(stage, error);
        if (!lastLoggedCode.equals(failure.code)) {
            Log.w("LightNotePush", failure.code);
            lastLoggedCode = failure.code;
        }
        // Only the explicit diagnostic build presents native UI, so an APK alone is sufficient.
        if (!BuildConfig.NOTIFICATION_DIAGNOSTICS || activity.isFinishing() || activity.isDestroyed()
            || shownCodes.contains(failure.code) || (dialog != null && dialog.isShowing())) return failure.code;
        try {
            dialog = new AlertDialog.Builder(activity)
                .setTitle(R.string.notification_diagnostic_title)
                .setMessage(activity.getString(R.string.notification_diagnostic_message,
                    activity.getString(failure.stage.label), failure.code))
                .setNeutralButton(R.string.notification_diagnostic_copy, (d, which) -> copy(failure.code))
                .setPositiveButton(R.string.notification_diagnostic_dismiss, null)
                .create();
            dialog.show();
            TextView message = dialog.findViewById(android.R.id.message);
            if (message != null) message.setTextIsSelectable(true);
            shownCodes.add(failure.code);
        } catch (RuntimeException ignored) {
            // A disappearing activity or unsupported system dialog must not replace the original error.
        }
        return failure.code;
    }

    void reset() {
        shownCodes.clear();
        lastLoggedCode = "";
        try { if (dialog != null) dialog.dismiss(); }
        catch (RuntimeException ignored) { /* A stale window must not block account cleanup. */ }
        dialog = null;
    }

    private void copy(String code) {
        try {
            ClipboardManager clipboard = activity.getSystemService(ClipboardManager.class);
            if (clipboard == null) throw new IllegalStateException();
            clipboard.setPrimaryClip(ClipData.newPlainText(activity.getString(R.string.notification_diagnostic_title), code));
        } catch (RuntimeException ignored) {
            Toast.makeText(activity, R.string.notification_diagnostic_copy_failed, Toast.LENGTH_LONG).show();
        }
    }
}
