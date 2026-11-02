package top.boluo66.lightnote;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.provider.MediaStore;
import android.os.Parcelable;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.lang.reflect.Field;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import static org.junit.Assert.*;

/** Exercise the actual Activity return path, including overlay and callback cleanup. */
@RunWith(AndroidJUnit4.class)
public class FileChooserReturnTest {
    private static Field field(String name) throws Exception {
        Field field = MainActivity.class.getDeclaredField(name);
        field.setAccessible(true);
        return field;
    }

    @Test public void oversizedResultsCancelOnceAndNextSelectionStillWorks() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Context context = instrumentation.getTargetContext();
        PrivacyConsentStore.accept(context);
        MainActivity activity = (MainActivity) instrumentation.startActivitySync(
            new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        Field callback = field("fileCallback");
        Field overlay = field("fileChooserOverlay");
        Field camera = field("cameraOutputUri");
        Field request = field("FILE_CHOOSER_REQUEST");
        try {
            for (int count : new int[]{101, 3000, 100, 1, 0}) {
                ClipData clip = count == 0 ? null : ClipData.newRawUri("photo", uri(0));
                for (int i = 1; i < count; i++) clip.addItem(new ClipData.Item(uri(i)));
                Intent data = new Intent();
                if (clip != null) data.setClipData(clip);
                AtomicInteger calls = new AtomicInteger();
                AtomicReference<Uri[]> received = new AtomicReference<>();
                AtomicReference<Throwable> failure = new AtomicReference<>();
                CountDownLatch hidden = new CountDownLatch(1);
                instrumentation.runOnMainSync(() -> {
                    try {
                        callback.set(activity, (ValueCallback<Uri[]>) values -> {
                            calls.incrementAndGet();
                            received.set(values);
                        });
                        View cover = (View) overlay.get(activity);
                        cover.setVisibility(View.VISIBLE);
                        if (count > 100) cover.getViewTreeObserver().addOnGlobalLayoutListener(
                            new android.view.ViewTreeObserver.OnGlobalLayoutListener() {
                                @Override public void onGlobalLayout() {
                                    if (cover.getVisibility() == View.GONE) {
                                        cover.getViewTreeObserver().removeOnGlobalLayoutListener(this);
                                        hidden.countDown();
                                    }
                                }
                            });
                        activity.onActivityResult(request.getInt(null), count == 0 ? Activity.RESULT_CANCELED : Activity.RESULT_OK, data);
                        assertEquals(1, calls.get());
                        assertNull(callback.get(activity));
                        assertNull(camera.get(activity));
                        if (count > 100 || count == 0) {
                            assertNull(received.get());
                        } else {
                            assertEquals(count, received.get().length);
                            for (int i = 0; i < count; i++) assertEquals(uri(i), received.get()[i]);
                        }
                    } catch (Throwable error) { failure.set(error); }
                });
                if (failure.get() != null) throw new AssertionError("Selection count " + count, failure.get());
                if (count > 100) assertTrue("Overflow cover should finish fading without waiting for WebView", hidden.await(3, TimeUnit.SECONDS));
                // A subsequent UI-thread operation must complete, including after the 3000-item rejection.
                instrumentation.waitForIdleSync();
            }
        } finally { instrumentation.runOnMainSync(activity::finish); }
    }

    @Test public void compatibleChooserOffersBoundedPhotosAndGeneralFiles() throws Exception {
        if (android.os.Build.VERSION.SDK_INT < 33) return;
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Context context = instrumentation.getTargetContext();
        PrivacyConsentStore.accept(context);
        MainActivity activity = (MainActivity) instrumentation.startActivitySync(
            new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        AtomicReference<Intent> launched = new AtomicReference<>();
        CountDownLatch opening = new CountDownLatch(1);
        Instrumentation.ActivityMonitor monitor = new Instrumentation.ActivityMonitor() {
            @Override public Instrumentation.ActivityResult onStartActivity(Intent intent) {
                if (!Intent.ACTION_CHOOSER.equals(intent.getAction())) return null;
                launched.set(intent);
                opening.countDown();
                return new Instrumentation.ActivityResult(Activity.RESULT_CANCELED, null);
            }
        };
        instrumentation.addMonitor(monitor);
        try {
            java.lang.reflect.Method open = MainActivity.class.getDeclaredMethod("openFileChooser", ValueCallback.class, WebChromeClient.FileChooserParams.class);
            open.setAccessible(true);
            WebChromeClient.FileChooserParams params = new WebChromeClient.FileChooserParams() {
                @Override public int getMode() { return MODE_OPEN_MULTIPLE; }
                @Override public String[] getAcceptTypes() { return new String[]{"*/*"}; }
                @Override public boolean isCaptureEnabled() { return false; }
                @Override public CharSequence getTitle() { return "Files"; }
                @Override public String getFilenameHint() { return null; }
                @Override public Intent createIntent() { return new Intent(Intent.ACTION_GET_CONTENT).setType("*/*"); }
            };
            AtomicReference<Throwable> failure = new AtomicReference<>();
            instrumentation.runOnMainSync(() -> {
                try { open.invoke(activity, (ValueCallback<Uri[]>) values -> {}, params); }
                catch (Throwable error) { failure.set(error); }
            });
            if (failure.get() != null) throw new AssertionError(failure.get());
            assertTrue("Chooser should launch", opening.await(3, TimeUnit.SECONDS));
            Intent primary = launched.get().getParcelableExtra(Intent.EXTRA_INTENT);
            assertEquals("*/*", primary.getType());
            assertTrue(primary.getBooleanExtra(Intent.EXTRA_ALLOW_MULTIPLE, false));
            boolean photosFound = false;
            for (Parcelable item : launched.get().getParcelableArrayExtra(Intent.EXTRA_INITIAL_INTENTS)) {
                Intent alternative = (Intent) item;
                if (MediaStore.ACTION_PICK_IMAGES.equals(alternative.getAction())) {
                    photosFound = true;
                    assertEquals(100, alternative.getIntExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, 0));
                }
            }
            assertTrue("System photos should be offered on the API 35 QA emulator", photosFound);
        } finally {
            instrumentation.removeMonitor(monitor);
            instrumentation.runOnMainSync(activity::finish);
        }
    }

    private static Uri uri(int index) {
        return Uri.parse("content://top.boluo66.lightnote.sharefixture/photo-" + index);
    }
}
