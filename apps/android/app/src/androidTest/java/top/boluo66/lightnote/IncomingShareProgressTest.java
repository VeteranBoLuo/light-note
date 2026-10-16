package top.boluo66.lightnote;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.widget.TextView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class IncomingShareProgressTest {
    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();

    private static void main(Runnable action) {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(action);
    }

    private Intent files(String prefix, int count) {
        ArrayList<Uri> uris = new ArrayList<>();
        for (int i = 0; i < count; i++) uris.add(Uri.parse("content://top.boluo66.lightnote.sharefixture/" + prefix + i));
        return new Intent(Intent.ACTION_SEND_MULTIPLE).setType("text/plain")
            .putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris);
    }

    @Test public void startsImmediatelyCountsSkippedAndStopsAtLimit() throws Exception {
        List<IncomingShareStore.Progress> events = new CopyOnWriteArrayList<>();
        CountDownLatch done = new CountDownLatch(1);
        IncomingShareStore.ProgressListener listener = progress -> {
            events.add(progress);
            if (progress.result != null) done.countDown();
        };
        try {
            main(() -> {
                IncomingShareStore.addProgressListener(listener);
                assertEquals(IncomingShareStore.AcceptResult.ACCEPTED, IncomingShareStore.accept(context, files("slow", 102)));
                assertEquals(0, events.get(0).processed);
                assertEquals(102, events.get(0).total);
                assertNull(events.get(0).result);
            });
            assertTrue(done.await(25, TimeUnit.SECONDS));
            assertTrue(events.stream().anyMatch(p -> p.processed > 0 && p.processed < p.total));
            IncomingShareStore.Progress last = events.get(events.size() - 1);
            assertEquals(102, last.processed);
            assertEquals(IncomingShareStore.PrepareResult.READY, last.result);
            org.json.JSONObject share = IncomingShareStore.peek(context).getJSONObject("share");
            assertEquals(100, share.getJSONArray("files").length());
            assertEquals(2, share.getJSONObject("skippedFileCounts").getInt("count_limit"));
        } finally { main(() -> IncomingShareStore.removeProgressListener(listener)); }
    }

    @Test public void replacementAndResubscriptionCannotDeliverOldCompletion() throws Exception {
        List<IncomingShareStore.Progress> events = new CopyOnWriteArrayList<>();
        CountDownLatch done = new CountDownLatch(1);
        IncomingShareStore.ProgressListener listener = progress -> {
            events.add(progress);
            if (progress.result != null) done.countDown();
        };
        try {
            main(() -> {
                IncomingShareStore.accept(context, files("slow-old", 50));
                IncomingShareStore.addProgressListener(listener);
                assertEquals(50, events.get(0).total);
                IncomingShareStore.removeProgressListener(listener);
                IncomingShareStore.accept(context, files("slow-new", 3));
                events.clear();
                IncomingShareStore.addProgressListener(listener);
                assertEquals(3, events.get(0).total);
            });
            assertTrue(done.await(10, TimeUnit.SECONDS));
            assertTrue(events.stream().allMatch(p -> p.total == 3));
            assertEquals(1, events.stream().filter(p -> p.result != null).count());
            assertEquals(3, IncomingShareStore.peek(context).getJSONObject("share").getJSONArray("files").length());
        } finally { main(() -> IncomingShareStore.removeProgressListener(listener)); }
    }

    @Test public void unreadableFilesFinishWithReportAndHideProgressInBothThemes() throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        IncomingShareStore.ProgressListener listener = progress -> {
            if (progress.result != null) done.countDown();
        };
        try {
            main(() -> {
                IncomingShareStore.addProgressListener(listener);
                IncomingShareStore.accept(context, files("broken", 2));
            });
            assertTrue(done.await(10, TimeUnit.SECONDS));
            org.json.JSONObject share = IncomingShareStore.peek(context).getJSONObject("share");
            assertEquals(0, share.getJSONArray("files").length());
            assertEquals(2, share.getJSONObject("skippedFileCounts").getInt("unreadable"));
            main(() -> {
                IncomingShareProgressView view = new IncomingShareProgressView(context);
                for (boolean night : new boolean[]{false, true}) {
                    view.applyTheme(night);
                    view.showProgress(new IncomingShareStore.Progress(1, 12, 58, null));
                    assertEquals(View.VISIBLE, view.getVisibility());
                    android.widget.LinearLayout text = (android.widget.LinearLayout) view.getChildAt(1);
                    assertEquals("已处理 12 / 58 个文件", ((TextView) text.getChildAt(1)).getText().toString());
                    view.showProgress(new IncomingShareStore.Progress(1, 58, 58, IncomingShareStore.PrepareResult.READY));
                    assertEquals(View.GONE, view.getVisibility());
                    view.showProgress(new IncomingShareStore.Progress(2, 0, 0, null));
                    assertEquals("正在准备分享内容", ((TextView) text.getChildAt(1)).getText().toString());
                    view.showProgress(new IncomingShareStore.Progress(2, 0, 0, IncomingShareStore.PrepareResult.UNREADABLE));
                    assertEquals(View.GONE, view.getVisibility());
                }
            });
        } finally { main(() -> IncomingShareStore.removeProgressListener(listener)); }
    }
    @Test public void activityShowsProgressOnColdAndWarmShareAndRestoresAfterRecreation() throws Exception {
        android.app.Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        PrivacyConsentStore.accept(context);
        android.app.Activity activity = null;
        try {
            Intent cold = files("slow-cold", 100).setClass(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity = instrumentation.startActivitySync(cold);
            final android.app.Activity first = activity;
            main(() -> assertEquals(View.VISIBLE, progressView(first).getVisibility()));
            saveScreenshot("share-progress-day.png", first);
            CountDownLatch recreated = new CountDownLatch(1);
            java.util.concurrent.atomic.AtomicReference<android.app.Activity> nextActivity = new java.util.concurrent.atomic.AtomicReference<>();
            androidx.test.runner.lifecycle.ActivityLifecycleCallback callback = (candidate, stage) -> {
                if (candidate instanceof MainActivity && candidate != first && stage == androidx.test.runner.lifecycle.Stage.RESUMED) {
                    nextActivity.set(candidate);
                    recreated.countDown();
                }
            };
            androidx.test.runner.lifecycle.ActivityLifecycleMonitor lifecycle = androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry.getInstance();
            try {
                main(() -> { lifecycle.addLifecycleCallback(callback); first.recreate(); });
                assertTrue("Activity should resume after recreation", recreated.await(10, TimeUnit.SECONDS));
            } finally { main(() -> lifecycle.removeLifecycleCallback(callback)); }
            android.app.Activity restored = nextActivity.get();
            activity = restored;
            final android.app.Activity current = restored;
            main(() -> {
                IncomingShareProgressView view = progressView(current);
                assertEquals(View.VISIBLE, view.getVisibility());
                view.applyTheme(true);
            });
            saveScreenshot("share-progress-night.png", current);
            CountDownLatch done = new CountDownLatch(1);
            IncomingShareStore.ProgressListener listener = progress -> {
                if (progress.total == 3 && progress.result != null) done.countDown();
            };
            try {
                main(() -> {
                    IncomingShareStore.addProgressListener(listener);
                    context.startActivity(files("slow-warm", 3).setClass(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                });
                assertTrue(done.await(10, TimeUnit.SECONDS));
                instrumentation.waitForIdleSync();
                main(() -> assertEquals(View.GONE, progressView(current).getVisibility()));
                assertEquals(3, IncomingShareStore.peek(context).getJSONObject("share").getJSONArray("files").length());
            } finally { main(() -> IncomingShareStore.removeProgressListener(listener)); }
        } finally {
            if (activity != null) { android.app.Activity last = activity; main(last::finish); }
        }
    }

    private IncomingShareProgressView progressView(android.app.Activity activity) {
        return findProgress(activity.getWindow().getDecorView());
    }

    private IncomingShareProgressView findProgress(View view) {
        if (view instanceof IncomingShareProgressView) return (IncomingShareProgressView) view;
        if (view instanceof android.view.ViewGroup) {
            android.view.ViewGroup group = (android.view.ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                IncomingShareProgressView found = findProgress(group.getChildAt(i));
                if (found != null) return found;
            }
        }
        return null;
    }

    private void saveScreenshot(String name, android.app.Activity activity) throws Exception {
        CountDownLatch rendered = new CountDownLatch(1);
        main(() -> activity.getWindow().getDecorView().postOnAnimation(
            () -> activity.getWindow().getDecorView().postOnAnimation(rendered::countDown)));
        assertTrue("Screenshot waits for the updated frame", rendered.await(3, TimeUnit.SECONDS));
        android.graphics.Bitmap screenshot = InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
        assertNotNull(screenshot);
        try (java.io.FileOutputStream output = new java.io.FileOutputStream(new java.io.File(context.getExternalFilesDir(null), name))) {
            screenshot.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, output);
        }
        screenshot.recycle();
    }

}
