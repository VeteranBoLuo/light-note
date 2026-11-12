package top.boluo66.lightnote;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.SystemClock;
import android.view.MotionEvent;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class LargeUploadSelectionTest {
    public static class Probe {
        final CountDownLatch ready = new CountDownLatch(1), selected = new CountDownLatch(1), metadata = new CountDownLatch(1);
        volatile String result = "";
        volatile String size = "";
        @JavascriptInterface public void ready() { ready.countDown(); }
        @JavascriptInterface public void result(String value) { result = value; selected.countDown(); }
        @JavascriptInterface public void metadata(String value) { size = value; metadata.countDown(); }
    }
    @Test public void actualEightGiBContentUriReturnsAndReadsMiddleSlice() throws Exception {
        Instrumentation i = InstrumentationRegistry.getInstrumentation(); Context context = i.getTargetContext();
        PrivacyConsentStore.accept(context);
        MainActivity activity = (MainActivity) i.startActivitySync(new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        Field field = MainActivity.class.getDeclaredField("webView"); field.setAccessible(true);
        WebView web = (WebView) field.get(activity); Probe probe = new Probe();
        Uri uri = Uri.parse("content://top.boluo66.lightnote.bigfilefixture/large.bin");
        CountDownLatch opened = new CountDownLatch(1);
        Instrumentation.ActivityMonitor monitor = new Instrumentation.ActivityMonitor() {
            @Override public Instrumentation.ActivityResult onStartActivity(Intent intent) {
                if (!Intent.ACTION_CHOOSER.equals(intent.getAction()) && !Intent.ACTION_GET_CONTENT.equals(intent.getAction())) return null;
                opened.countDown();
                return new Instrumentation.ActivityResult(Activity.RESULT_OK, new Intent().setData(uri));
            }
        };
        i.addMonitor(monitor);
        try {
            i.runOnMainSync(() -> {
                web.addJavascriptInterface(probe, "BigFileProbe");
                web.setWebViewClient(new WebViewClient());
                web.loadDataWithBaseURL("https://boluo66.top/large-upload-test", "<!doctype html><meta name='viewport' content='width=device-width,initial-scale=1'><style>html,body{margin:0}button{width:100vw;height:100vh}</style><input type=file hidden><button onclick=\"document.querySelector('input').click()\">Choose test file</button><script>document.querySelector('input').onchange=async e=>{try{let f=e.target.files[0];BigFileProbe.metadata(''+f.size);let b=new Uint8Array(await f.slice(Math.floor(f.size/2),Math.floor(f.size/2)+1).arrayBuffer());BigFileProbe.result(f.size+':'+b[0]);}catch(e){BigFileProbe.result('error:'+e.name)}};BigFileProbe.ready();</script>", "text/html", "UTF-8", null);
            });
            assertTrue(probe.ready.await(5, TimeUnit.SECONDS));
            int[] center = new int[2];
            i.runOnMainSync(() -> {
                try { Method hide = MainActivity.class.getDeclaredMethod("hideLaunchOverlay"); hide.setAccessible(true); hide.invoke(activity); }
                catch (Exception e) { throw new RuntimeException(e); }
                try { Field cover = MainActivity.class.getDeclaredField("launchOverlay"); cover.setAccessible(true);
                    View view = (View) cover.get(activity); view.animate().cancel(); view.setVisibility(View.GONE);
                } catch (Exception e) { throw new RuntimeException(e); }
                web.getLocationOnScreen(center); center[0] += web.getWidth()/2; center[1] += web.getHeight()/2;
            });
            i.waitForIdleSync();
            long now = SystemClock.uptimeMillis();
            i.sendPointerSync(MotionEvent.obtain(now,now,MotionEvent.ACTION_DOWN,center[0],center[1],0));
            i.sendPointerSync(MotionEvent.obtain(now,now+40,MotionEvent.ACTION_UP,center[0],center[1],0));
            assertTrue("Real chooser should open", opened.await(5,TimeUnit.SECONDS));
            assertTrue("Large file metadata should return", probe.metadata.await(10,TimeUnit.SECONDS));
            assertEquals(String.valueOf(LargeUploadFixtureProvider.SIZE), probe.size);
            assertTrue("Middle slice should read without loading all 8GiB", probe.selected.await(10,TimeUnit.SECONDS));
            assertEquals(LargeUploadFixtureProvider.SIZE + ":73", probe.result);
        } finally {
            i.removeMonitor(monitor); context.getContentResolver().delete(uri,null,null); i.runOnMainSync(activity::finish);
        }
    }
}
