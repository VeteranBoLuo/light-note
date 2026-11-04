package top.boluo66.lightnote;

import static org.junit.Assert.*;
import android.app.Activity;
import android.app.Instrumentation;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.ContextWrapper;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.view.accessibility.AccessibilityNodeInfo;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.lang.reflect.Proxy;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class NativePushDiagnosticsTest {
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private final Context target = instrumentation.getTargetContext();
    private final SharedPreferences prefs = target.getSharedPreferences("notification_diagnostic_test", 0);
    private final SharedPreferences privacy = target.getSharedPreferences("notification_diagnostic_privacy_test", 0);
    private final String owner = "notification-diagnostic-test";
    private final Context context = new ContextWrapper(target) {
        @Override public Context getApplicationContext() { return this; }
        @Override public SharedPreferences getSharedPreferences(String name, int mode) {
            if (name.equals("native_push_installation")) return prefs;
            if (name.equals("light_note_privacy_consent")) return privacy;
            return super.getSharedPreferences(name, mode);
        }
    };

    @Before public void prepare() {
        assertTrue(prefs.edit().clear().commit());
        assertTrue(privacy.edit().clear().putString("accepted_version", LegalDocuments.PRIVACY_POLICY_VERSION).commit());
    }
    @After public void cleanup() {
        prefs.edit().clear().commit();
        privacy.edit().clear().commit();
    }

    @Test public void preservesInstallationIdentityAndRevisionAcrossChecksAndReloads() throws Exception {
        JSONObject first = new NativePushInstallation(context).describe(owner, "test-token", "123");
        JSONObject reload = new NativePushInstallation(context).describe(owner, "test-token", "123");
        assertEquals(first.getString("id"), reload.getString("id"));
        assertEquals(first.getString("key"), reload.getString("key"));
        assertEquals(1, reload.getLong("revision"));
        assertEquals(2, new NativePushInstallation(context).describe(owner, "rotated-test-token", "123").getLong("revision"));
    }

    @Test public void identifiesWrongStoredTypesWithoutDeletingInstallationState() throws Exception {
        String key = "revision:" + NativePushIdentity.digest(owner);
        prefs.edit().putString(key, "old-invalid-type").commit();
        try {
            new NativePushInstallation(context).describe(owner, "test-token", "123");
            fail("A corrupt stored type must report a failure");
        } catch (NativePushDiagnostics.Failure failure) {
            assertEquals("LNP1-I1-TYPE", failure.code);
            assertEquals("old-invalid-type", prefs.getString(key, ""));
        }
    }

    @Test public void missingApplicationIdFailsBeforeCreatingInstallationState() throws Exception {
        for (String appId : new String[]{null, ""}) {
            try {
                new NativePushInstallation(context).describe(owner, "test-token", appId);
                fail("A missing application ID must not produce an identity");
            } catch (NativePushDiagnostics.Failure failure) {
                assertEquals("LNP1-I3-APPID", failure.code);
                assertTrue(prefs.getAll().isEmpty());
            }
        }
    }

    @Test public void distinguishesInvalidRevisionsFromFailedWrites() throws Exception {
        prefs.edit().putLong("revision:" + NativePushIdentity.digest(owner), -10).commit();
        try {
            new NativePushInstallation(context).describe(owner, "test-token", "123");
            fail("An invalid revision must not be accepted");
        } catch (NativePushDiagnostics.Failure failure) {
            assertEquals("LNP1-I2-REV", failure.code);
        }
        prefs.edit().clear().commit();
        SharedPreferences blocked = (SharedPreferences) Proxy.newProxyInstance(
            SharedPreferences.class.getClassLoader(), new Class[]{SharedPreferences.class}, (proxy, method, args) -> {
                if (!method.getName().equals("edit")) return method.invoke(prefs, args);
                SharedPreferences.Editor editor = prefs.edit();
                return Proxy.newProxyInstance(SharedPreferences.Editor.class.getClassLoader(),
                    new Class[]{SharedPreferences.Editor.class}, (editProxy, editMethod, editArgs) -> {
                        if (editMethod.getName().equals("commit")) return false;
                        Object value = editMethod.invoke(editor, editArgs);
                        return value == editor ? editProxy : value;
                    });
            });
        Context blockedContext = new ContextWrapper(context) {
            @Override public Context getApplicationContext() { return this; }
            @Override public SharedPreferences getSharedPreferences(String name, int mode) {
                return name.equals("native_push_installation") ? blocked : super.getSharedPreferences(name, mode);
            }
        };
        try {
            new NativePushInstallation(blockedContext).describe(owner, "test-token", "123");
            fail("A failed commit must prevent registration");
        } catch (NativePushDiagnostics.Failure failure) {
            assertEquals("LNP1-I4-STORE", failure.code);
            assertFalse(prefs.contains("installation_id"));
        }
    }

    @Test public void dialogCopiesOnlyTheCodeAndDoesNotRepeatOnAutomaticChecks() throws Exception {
        // Attach accessibility before opening the window so its first state change is observed.
        instrumentation.getUiAutomation();
        Intent intent = new Intent(target, LegalDocumentActivity.class)
            .putExtra("legal_document", LegalDocuments.USER_AGREEMENT_FILE)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        Activity activity = instrumentation.startActivitySync(intent);
        NativePushDiagnostics diagnostics = new NativePushDiagnostics(activity);
        String code = "LNP1-I1-TYPE";
        try {
            instrumentation.runOnMainSync(() -> assertEquals(code, diagnostics.report(
                NativePushDiagnostics.Stage.INSTALLATION_READ, new ClassCastException("private token and account"))));
            instrumentation.waitForIdleSync();
            List<AccessibilityNodeInfo> titles = nodes(target.getString(R.string.notification_diagnostic_title));
            if (!BuildConfig.NOTIFICATION_DIAGNOSTICS) {
                assertTrue(titles.isEmpty());
                return;
            }
            assertFalse(titles.isEmpty());
            assertFalse(nodes(code).isEmpty());
            assertTrue(nodes("private token and account").isEmpty());
            saveScreenshot(activity);
            String copyLabel = target.getString(R.string.notification_diagnostic_copy);
            AccessibilityNodeInfo copyButton = nodes(copyLabel).stream()
                .filter(node -> copyLabel.contentEquals(node.getText()) && node.isClickable())
                .findFirst().orElse(null);
            assertNotNull(copyButton);
            CountDownLatch copied = new CountDownLatch(1);
            ClipboardManager clipboard = activity.getSystemService(ClipboardManager.class);
            ClipboardManager.OnPrimaryClipChangedListener listener = copied::countDown;
            instrumentation.runOnMainSync(() -> clipboard.addPrimaryClipChangedListener(listener));
            try {
                assertTrue(copyButton.performAction(AccessibilityNodeInfo.ACTION_CLICK));
                assertTrue("Copy waits for the actual clipboard change", copied.await(3, TimeUnit.SECONDS));
            } finally {
                instrumentation.runOnMainSync(() -> clipboard.removePrimaryClipChangedListener(listener));
            }
            instrumentation.getUiAutomation().waitForIdle(100, 3000);
            instrumentation.waitForIdleSync();
            instrumentation.runOnMainSync(() -> {
                assertNotNull(clipboard.getPrimaryClip());
                assertEquals(code, clipboard.getPrimaryClip().getItemAt(0).getText().toString());
                diagnostics.report(NativePushDiagnostics.Stage.INSTALLATION_READ, new ClassCastException("another private value"));
            });
            instrumentation.waitForIdleSync();
            assertTrue(nodes(target.getString(R.string.notification_diagnostic_title)).isEmpty());
            instrumentation.runOnMainSync(() -> {
                diagnostics.reset();
                diagnostics.report(NativePushDiagnostics.Stage.INSTALLATION_READ, new ClassCastException("private retry details"));
            });
            instrumentation.waitForIdleSync();
            assertFalse(nodes(target.getString(R.string.notification_diagnostic_title)).isEmpty());
        } finally {
            instrumentation.runOnMainSync(() -> { diagnostics.reset(); activity.finish(); });
        }
    }

    private List<AccessibilityNodeInfo> nodes(String text) throws Exception {
        long deadline = android.os.SystemClock.uptimeMillis() + 3000;
        AccessibilityNodeInfo root;
        do {
            instrumentation.getUiAutomation().waitForIdle(100, 3000);
            root = instrumentation.getUiAutomation().getRootInActiveWindow();
        } while (root == null && android.os.SystemClock.uptimeMillis() < deadline);
        assertNotNull(root);
        return root.findAccessibilityNodeInfosByText(text);
    }
    private void saveScreenshot(Activity activity) throws Exception {
        CountDownLatch frame = new CountDownLatch(1);
        instrumentation.runOnMainSync(() -> activity.getWindow().getDecorView().postOnAnimation(
            () -> activity.getWindow().getDecorView().postOnAnimation(frame::countDown)));
        assertTrue(frame.await(3, TimeUnit.SECONDS));
        boolean dark = (activity.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
            == Configuration.UI_MODE_NIGHT_YES;
        Bitmap bitmap = instrumentation.getUiAutomation().takeScreenshot();
        assertNotNull(bitmap);
        File path = new File(target.getExternalFilesDir(null), "notification-diagnostic-" + (dark ? "dark" : "light") + ".png");
        try (FileOutputStream out = new FileOutputStream(path)) { bitmap.compress(Bitmap.CompressFormat.PNG, 100, out); }
        bitmap.recycle();
    }
}
