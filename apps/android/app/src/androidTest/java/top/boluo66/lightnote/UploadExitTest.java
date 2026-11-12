package top.boluo66.lightnote;

import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** 使用真实 WebView 验证显式退出的通知，夹具不访问文件或业务服务。 */
@RunWith(AndroidJUnit4.class)
public class UploadExitTest {
    public static class Probe {
        final CountDownLatch ready = new CountDownLatch(1);
        final AtomicInteger calls = new AtomicInteger();
        final AtomicInteger remaining = new AtomicInteger(-1);
        final CountDownLatch stopped = new CountDownLatch(1);

        @JavascriptInterface public void stopped(int unfinished) {
            remaining.set(unfinished);
            calls.incrementAndGet();
            stopped.countDown();
        }
        @JavascriptInterface public void ready() { ready.countDown(); }
    }

    @Test public void confirmedRootExitNotifiesWebBeforeMovingToBackground() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Context context = instrumentation.getTargetContext();
        PrivacyConsentStore.accept(context);
        MainActivity activity = (MainActivity) instrumentation.startActivitySync(
            new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        Field field = MainActivity.class.getDeclaredField("webView");
        field.setAccessible(true);
        WebView webView = (WebView) field.get(activity);
        Probe probe = new Probe();
        Method exit = MainActivity.class.getDeclaredMethod("confirmMoveTaskToBackground");
        exit.setAccessible(true);
        AtomicReference<Throwable> failure = new AtomicReference<>();
        try {
            instrumentation.runOnMainSync(() -> {
                webView.addJavascriptInterface(probe, "UploadExitProbe");
                webView.stopLoading();
                webView.setWebViewClient(new WebViewClient());
                webView.loadDataWithBaseURL("https://boluo66.top/upload-exit-test",
                    "<!doctype html><script>window.unfinished=3;window.addEventListener('light-note:app-exit',function(){window.unfinished=0;UploadExitProbe.stopped(window.unfinished);});UploadExitProbe.ready();</script>",
                    "text/html", "UTF-8", null);
            });
            assertTrue("Fixture should load", probe.ready.await(5, TimeUnit.SECONDS));
            instrumentation.runOnMainSync(() -> {
                try { exit.invoke(activity); }
                catch (Throwable error) { failure.set(error); }
            });
            assertNull(failure.get());
            assertEquals("The first back press must not stop an upload", 0, probe.calls.get());
            instrumentation.runOnMainSync(() -> {
                try { exit.invoke(activity); }
                catch (Throwable error) { failure.set(error); }
            });
            assertNull(failure.get());
            assertTrue("Confirmed exit should notify the live WebView", probe.stopped.await(5, TimeUnit.SECONDS));
            assertEquals(0, probe.remaining.get());
            assertEquals(1, probe.calls.get());
        } finally {
            instrumentation.runOnMainSync(activity::finish);
        }
    }
}
