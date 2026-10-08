package top.boluo66.lightnote;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

/** Fixed, non-privileged destination; never accepts a URL or account/token from an external Intent. */
public final class HuaweiPushClickActivity extends Activity {
    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        Intent target = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (BuildConfig.HUAWEI_PUSH) target.putExtra("native_notification_owner", getSharedPreferences("native_notification_sync", MODE_PRIVATE).getString("owner", ""));
        else target.putExtra("huawei_probe_center", true);
        startActivity(target);
        finish();
    }
}
