package top.boluo66.lightnote;

import static org.junit.Assert.*;
import android.content.Context;
import android.content.ContextWrapper;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.huawei.agconnect.config.AGConnectServicesConfig;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class HuaweiPushColdStartTest {
    private final Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
    private final String[] stores = {
        "light_note_privacy_consent", "huawei_push_account", "light_note_huawei_probe", "native_push_installation"
    };
    private final Context context = new ContextWrapper(target) {
        @Override public Context getApplicationContext() { return this; }
        @Override public SharedPreferences getSharedPreferences(String name, int mode) {
            return target.getSharedPreferences("huawei_cold_start_test_" + name, mode);
        }
    };

    @Before public void prepare() {
        for (String name : stores) context.getSharedPreferences(name, 0).edit().clear().commit();
        PrivacyConsentStore.accept(context);
        context.getSharedPreferences("huawei_push_account", 0).edit().putBoolean("consent", true).commit();
        HuaweiPushProbe.prefs(context).edit().putString("token", "synthetic-cached-token").commit();
    }

    @After public void cleanup() throws Exception {
        for (String name : stores) context.getSharedPreferences(name, 0).edit().clear().commit();
        // Restore local configuration only; never initialize HMS or request a real token.
        try (InputStream input = target.getAssets().open("agconnect-services.json")) {
            AGConnectServicesConfig config = AGConnectServicesConfig.fromContext(target);
            config.overlayWith(input);
            config.getString("client/app_id");
        }
    }

    @Test public void cachedTokenCanBindBeforeSdkConfigurationIsLoaded() throws Exception {
        AGConnectServicesConfig config = AGConnectServicesConfig.fromContext(context);
        try (InputStream empty = new ByteArrayInputStream("{}".getBytes(StandardCharsets.UTF_8))) {
            config.overlayWith(empty);
            assertNull(config.getString("client/app_id"));
        }
        String manifest = target.getPackageManager().getApplicationInfo(
            target.getPackageName(), PackageManager.GET_META_DATA).metaData.getString("com.huawei.hms.client.appid");
        assertNotNull(manifest);
        assertTrue(manifest.startsWith("appid="));
        String expected = manifest.substring("appid=".length());
        assertTrue(expected.matches("[0-9]+"));

        String token = HuaweiPushAccount.handle(context, "token");
        assertEquals("synthetic-cached-token", token);
        String appId = HuaweiPushAccount.handle(context, "appId");
        JSONObject installation = new NativePushInstallation(context).describe("cold-start-test-owner", token, appId);
        assertEquals(expected, installation.getString("pushAppId"));
        assertEquals(1, installation.getLong("revision"));
        JSONObject repeated = new NativePushInstallation(context).describe("cold-start-test-owner", token, appId);
        assertEquals(installation.getString("id"), repeated.getString("id"));
        assertEquals(installation.getString("key"), repeated.getString("key"));
        assertEquals(1, repeated.getLong("revision"));
        // Reading the public application ID must not initialize the SDK to reuse a cached token.
        assertNull(config.getString("client/app_id"));
    }
}
