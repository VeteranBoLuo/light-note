package top.boluo66.lightnote;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.core.content.ContextCompat;
import androidx.webkit.SafeBrowsingResponseCompat;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.io.OutputStream;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class WebViewSupport {
    static final String HOME_URL = BuildConfig.HOME_URL;
    static final String EXTRA_URL = "light_note_url";
    private static final int MINIMUM_CHROMIUM_MAJOR_VERSION = 87;
    private static final String LIGHT_NOTE_HOST = "boluo66.top";
    private static final String HOME_HOST = hostOf(HOME_URL);
    private static final Pattern CHROMIUM_VERSION_PATTERN =
        Pattern.compile("\\bChrome/(\\d+)(?:\\.|\\b)", Pattern.CASE_INSENSITIVE);
    private static final AtomicBoolean SAFE_BROWSING_START_REQUESTED =
        new AtomicBoolean(false);
    private static final AtomicBoolean DOWNLOAD_RECEIVER_REGISTERED =
        new AtomicBoolean(false);
    private static final Map<Long, String> PENDING_DOWNLOADS =
        new ConcurrentHashMap<>();
    private static final BroadcastReceiver DOWNLOAD_COMPLETION_RECEIVER =
        new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (!DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction())) {
                    return;
                }
                long downloadId = intent.getLongExtra(
                    DownloadManager.EXTRA_DOWNLOAD_ID,
                    -1L
                );
                String fileName = PENDING_DOWNLOADS.remove(downloadId);
                if (fileName == null) {
                    return;
                }

                /*
                 * 成功不再弹系统 Toast：网页侧自己有「下载中 → 已完成」的进度条和提示
                 * （见 web 的 AndroidDownloadProgress.vue 与各调用方的 message），
                 * 两套一起出现就是同一件事说两遍。
                 *
                 * 失败仍然弹：进度轮询有 30 分钟上限，超时之后网页那边收不到终态，
                 * 而下载失败是必须让人知道的，系统广播是这里最可靠的兜底。
                 */
                if (isDownloadSuccessful(context, downloadId)) {
                    return;
                }
                Toast.makeText(
                    context,
                    context.getString(R.string.download_failed_named, fileName),
                    Toast.LENGTH_LONG
                ).show();
            }
        };

    private WebViewSupport() {
    }

    static boolean isUnsupportedWebView(WebView webView) {
        String userAgent = webView.getSettings().getUserAgentString();
        if (isBlank(userAgent)) {
            return false;
        }
        Matcher matcher = CHROMIUM_VERSION_PATTERN.matcher(userAgent);
        if (!matcher.find()) {
            // 厂商自定义 WebView 可能不暴露 Chromium 版本，不能在无法确认时误拦截。
            return false;
        }
        try {
            int majorVersion = Integer.parseInt(matcher.group(1));
            return majorVersion > 0 && majorVersion < MINIMUM_CHROMIUM_MAJOR_VERSION;
        } catch (NumberFormatException error) {
            return false;
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    static void configure(WebView webView, boolean allowMultipleWindows) {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setTextZoom(100);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSupportMultipleWindows(allowMultipleWindows);
        settings.setJavaScriptCanOpenWindowsAutomatically(allowMultipleWindows);
        enableSafeBrowsing(webView, settings);
        disableAutomaticDarkening(settings);
        settings.setUserAgentString(
            settings.getUserAgentString() + " LightNoteAndroid/" + BuildConfig.VERSION_NAME
        );
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        webView.setBackgroundColor(Color.TRANSPARENT);
        webView.setNestedScrollingEnabled(true);
        webView.setOverScrollMode(WebView.OVER_SCROLL_IF_CONTENT_SCROLLS);

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);
    }

    private static void enableSafeBrowsing(WebView webView, WebSettings settings) {
        if (WebViewFeature.isFeatureSupported(WebViewFeature.SAFE_BROWSING_ENABLE)) {
            WebSettingsCompat.setSafeBrowsingEnabled(settings, true);
        }
        if (
            WebViewFeature.isFeatureSupported(WebViewFeature.START_SAFE_BROWSING)
                && SAFE_BROWSING_START_REQUESTED.compareAndSet(false, true)
        ) {
            WebViewCompat.startSafeBrowsing(
                webView.getContext().getApplicationContext(),
                started -> {
                    if (!Boolean.TRUE.equals(started)) {
                        SAFE_BROWSING_START_REQUESTED.set(false);
                    }
                }
            );
        }
    }

    static boolean backToSafety(
        Activity activity,
        SafeBrowsingResponseCompat response
    ) {
        if (
            !WebViewFeature.isFeatureSupported(
                WebViewFeature.SAFE_BROWSING_RESPONSE_BACK_TO_SAFETY
            )
        ) {
            return false;
        }
        response.backToSafety(true);
        Toast.makeText(
            activity,
            R.string.unsafe_page_blocked,
            Toast.LENGTH_LONG
        ).show();
        return true;
    }

    @SuppressWarnings("deprecation")
    private static void disableAutomaticDarkening(WebSettings settings) {
        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(settings, false);
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            settings.setForceDark(WebSettings.FORCE_DARK_OFF);
        }
    }

    static boolean isLightNoteUrl(String value) {
        String host = hostOf(value);
        return LIGHT_NOTE_HOST.equals(host)
            || host.endsWith("." + LIGHT_NOTE_HOST)
            || (!isBlank(HOME_HOST) && HOME_HOST.equals(host));
    }

    static boolean isGitHubUrl(String value) {
        String host = hostOf(value);
        return "github.com".equals(host) || host.endsWith(".github.com");
    }

    static boolean isHttpUrl(String value) {
        if (isBlank(value)) {
            return false;
        }
        try {
            URI uri = new URI(value.trim());
            String scheme = uri.getScheme();
            String host = uri.getHost();
            return scheme != null
                && host != null
                && (
                    "https".equalsIgnoreCase(scheme)
                        || "http".equalsIgnoreCase(scheme)
                );
        } catch (URISyntaxException error) {
            return false;
        }
    }

    static boolean openSystemIntent(Activity activity, String url) {
        if (isBlank(url)) {
            return true;
        }

        try {
            Uri uri = Uri.parse(url.trim());
            String scheme = uri.getScheme();
            if (scheme == null) {
                showCannotOpenLink(activity);
                return true;
            }
            String normalizedScheme = scheme.toLowerCase(Locale.ROOT);

            if ("intent".equals(normalizedScheme)) {
                openSafeIntentFallback(activity, url);
                return true;
            }

            Intent intent;
            if ("tel".equals(normalizedScheme)) {
                intent = new Intent(Intent.ACTION_DIAL, uri);
            } else if ("mailto".equals(normalizedScheme)) {
                intent = new Intent(Intent.ACTION_SENDTO, uri);
            } else if ("geo".equals(normalizedScheme)) {
                intent = new Intent(Intent.ACTION_VIEW, uri);
            } else {
                showCannotOpenLink(activity);
                return true;
            }
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            intent.setComponent(null);
            intent.setSelector(null);
            intent.setPackage(null);
            activity.startActivity(intent);
        } catch (Exception error) {
            showCannotOpenLink(activity);
        }
        return true;
    }

    private static void openSafeIntentFallback(Activity activity, String url) {
        try {
            Intent parsedIntent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
            String fallback = parsedIntent.getStringExtra("browser_fallback_url");
            if (isHttpUrl(fallback)) {
                openInAppBrowser(activity, fallback);
                return;
            }
        } catch (URISyntaxException ignored) {
            // Invalid intent URLs fail closed below.
        }
        showCannotOpenLink(activity);
    }

    private static void showCannotOpenLink(Activity activity) {
        Toast.makeText(
            activity,
            R.string.cannot_open_link,
            Toast.LENGTH_SHORT
        ).show();
    }

    static void openInAppBrowser(Activity activity, String url) {
        if (!isHttpUrl(url)) {
            showCannotOpenLink(activity);
            return;
        }
        Intent intent = new Intent(activity, InAppBrowserActivity.class);
        intent.putExtra(EXTRA_URL, url);
        activity.startActivity(intent);
    }

    /*
     * 下载进度回传。
     *
     * 系统 DownloadManager 的进度只出现在通知栏，App 界面里看不到，所以这里轮询
     * DownloadManager.query 把进度推回 WebView，让网页能画自己的进度条。
     * 不改下载通道本身 —— DownloadManager 的大文件、后台续传、系统集成都要保留
     * （网页侧用 XHR 取 blob 再存的做法在 WebView 里存不下来，见 BViewer 的注释）。
     */
    interface DownloadProgressListener {
        /** @return false 表示接收方（WebView）已失效，轮询应当停止 */
        boolean onProgress(String payloadJson);
    }

    private static final long DOWNLOAD_PROGRESS_INTERVAL_MS = 500L;
    /** 兜底上限：下载卡住又迟迟不进终态时，不该让轮询一直转下去 */
    private static final long DOWNLOAD_PROGRESS_MAX_DURATION_MS = 30L * 60L * 1000L;

    static void download(Context context, String url, String userAgent, String contentDisposition, String mimeType) {
        download(context, url, userAgent, contentDisposition, mimeType, null, null);
    }

    static void download(
        Context context,
        String url,
        String userAgent,
        String contentDisposition,
        String mimeType,
        String suggestedFileName
    ) {
        download(context, url, userAgent, contentDisposition, mimeType, suggestedFileName, null);
    }

    static void download(
        Context context,
        String url,
        String userAgent,
        String contentDisposition,
        String mimeType,
        String suggestedFileName,
        DownloadProgressListener progressListener
    ) {
        if (!isHttpUrl(url)) {
            Toast.makeText(context, R.string.download_failed, Toast.LENGTH_SHORT).show();
            return;
        }

        try {
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            String fileName = sanitizeFileName(suggestedFileName);
            if (isBlank(fileName)) {
                fileName = sanitizeFileName(URLUtil.guessFileName(url, contentDisposition, mimeType));
            }
            if (isBlank(fileName)) {
                fileName = "light-note-download";
            }
            request.setTitle(fileName);
            request.setDescription(context.getString(R.string.app_name));
            if (!isBlank(mimeType)) {
                request.setMimeType(mimeType);
            }
            request.setAllowedOverMetered(true);
            request.setAllowedOverRoaming(true);
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            if (!isBlank(userAgent)) {
                request.addRequestHeader("User-Agent", userAgent);
            }
            String cookies = CookieManager.getInstance().getCookie(url);
            if (!isBlank(cookies)) {
                request.addRequestHeader("Cookie", cookies);
            }
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
            }

            DownloadManager manager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
            if (manager == null) {
                throw new IllegalStateException("DownloadManager unavailable");
            }
            boolean canReportCompletion = ensureDownloadCompletionReceiver(context);
            long downloadId = manager.enqueue(request);
            if (canReportCompletion) {
                PENDING_DOWNLOADS.put(downloadId, fileName);
            }
            if (progressListener != null) {
                watchDownloadProgress(context, downloadId, fileName, progressListener);
            }
            // 「已开始下载」交给网页提示：这里再弹一次系统 Toast 就成了重复播报。
            // enqueue 本身失败（下面的 catch）仍要弹 —— 那种失败网页无从得知。
        } catch (Exception error) {
            Toast.makeText(context, R.string.download_failed, Toast.LENGTH_SHORT).show();
        }
    }

    /**
     * 轮询一个下载任务的进度并推给网页，直到进入终态、接收方失效或超过兜底上限。
     * 只持有 applicationContext，不碰 Activity，避免 Handler 拖住已销毁的界面。
     */
    /* ===== 图片保存（base64 直写相册） ===== */

    enum ImageSaveOutcome {
        OK,
        /** 系统版本太低（无 MediaStore 免权限写入）或数据不是可识别的图片 data URL */
        UNSUPPORTED,
        FAILED
    }

    interface ImageSaveCallback {
        void onDone(ImageSaveOutcome outcome);
    }

    /** data URL 上限。头像通常几十到几百 KB；给足余量同时挡住异常大的输入。 */
    private static final int MAX_IMAGE_DATA_URL_LENGTH = 12 * 1024 * 1024;
    private static final Pattern IMAGE_DATA_URL_PATTERN =
        Pattern.compile("^data:(image/[a-zA-Z0-9.+-]+);base64,(.+)$", Pattern.DOTALL);

    /**
     * 把 `data:image/*;base64,` 写进相册。
     *
     * 只支持 Android 10（Q）及以上：Q 之后往 MediaStore 写自己创建的图片不需要任何存储权限，
     * 而 Q 以下要 WRITE_EXTERNAL_STORAGE —— 轻笺的 Manifest 刻意不申请存储权限，
     * 不值得为这个功能引入一个敏感权限和一整套运行时授权流程，低版本直接回 UNSUPPORTED，
     * 由网页提示改用浏览器保存。
     *
     * 解码和写盘放在后台线程：几百 KB 的 base64 解码加 IO 不该卡住 WebView 所在的主线程。
     */
    static void saveImageAsync(Context context, String dataUrl, String suggestedFileName, ImageSaveCallback callback) {
        Context appContext = context.getApplicationContext();
        new Thread(() -> callback.onDone(saveImage(appContext, dataUrl, suggestedFileName)), "ln-image-save").start();
    }

    private static ImageSaveOutcome saveImage(Context appContext, String dataUrl, String suggestedFileName) {
        if (isBlank(dataUrl) || dataUrl.length() > MAX_IMAGE_DATA_URL_LENGTH) {
            return ImageSaveOutcome.UNSUPPORTED;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            return ImageSaveOutcome.UNSUPPORTED;
        }
        Matcher matcher = IMAGE_DATA_URL_PATTERN.matcher(dataUrl);
        if (!matcher.matches()) {
            return ImageSaveOutcome.UNSUPPORTED;
        }
        String mimeType = matcher.group(1);
        byte[] bytes;
        try {
            bytes = Base64.decode(matcher.group(2), Base64.DEFAULT);
        } catch (IllegalArgumentException error) {
            return ImageSaveOutcome.FAILED;
        }
        if (bytes.length == 0) {
            return ImageSaveOutcome.FAILED;
        }

        String fileName = sanitizeFileName(suggestedFileName);
        if (isBlank(fileName)) {
            fileName = "light-note-image";
        }

        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DISPLAY_NAME, fileName);
        values.put(MediaStore.Images.Media.MIME_TYPE, mimeType);
        // 单独放一个子目录，用户在相册里好找，也不会和别的应用混在一起
        values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/LightNote");
        values.put(MediaStore.Images.Media.IS_PENDING, 1);

        ContentResolver resolver = appContext.getContentResolver();
        Uri target = null;
        try {
            target = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
            if (target == null) {
                return ImageSaveOutcome.FAILED;
            }
            try (OutputStream output = resolver.openOutputStream(target)) {
                if (output == null) {
                    throw new IOException("openOutputStream returned null");
                }
                output.write(bytes);
            }
            // 清掉 IS_PENDING 之后其它应用才能看见这张图
            ContentValues done = new ContentValues();
            done.put(MediaStore.Images.Media.IS_PENDING, 0);
            resolver.update(target, done, null, null);
            return ImageSaveOutcome.OK;
        } catch (Exception error) {
            // 写一半失败要把占位记录删掉，否则相册里留一条打不开的空图
            if (target != null) {
                try {
                    resolver.delete(target, null, null);
                } catch (Exception ignored) {
                    // 清理失败无能为力，不掩盖原始错误
                }
            }
            return ImageSaveOutcome.FAILED;
        }
    }

    private static void watchDownloadProgress(
        Context context,
        long downloadId,
        String fileName,
        DownloadProgressListener listener
    ) {
        Context appContext = context.getApplicationContext();
        DownloadManager manager =
            (DownloadManager) appContext.getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) {
            return;
        }
        Handler handler = new Handler(Looper.getMainLooper());
        long startedAt = SystemClock.elapsedRealtime();
        handler.post(new Runnable() {
            @Override
            public void run() {
                DownloadProgress progress = queryDownloadProgress(manager, downloadId);
                // 查不到记录（用户在系统下载管理里删了）也要给网页一个终态，
                // 否则界面上的进度条会永远停在「下载中」。
                String status = progress == null ? STATUS_FAILED : progress.status;
                long bytesDownloaded = progress == null ? 0L : progress.bytesDownloaded;
                long totalBytes = progress == null ? -1L : progress.totalBytes;
                String payload = progressPayload(downloadId, fileName, status, bytesDownloaded, totalBytes);
                boolean receiverAlive = payload == null || listener.onProgress(payload);
                boolean finished = STATUS_SUCCESS.equals(status) || STATUS_FAILED.equals(status);
                if (!receiverAlive || finished) {
                    return;
                }
                if (SystemClock.elapsedRealtime() - startedAt > DOWNLOAD_PROGRESS_MAX_DURATION_MS) {
                    return;
                }
                handler.postDelayed(this, DOWNLOAD_PROGRESS_INTERVAL_MS);
            }
        });
    }

    private static final String STATUS_SUCCESS = "success";
    private static final String STATUS_FAILED = "failed";

    private static final class DownloadProgress {
        final String status;
        final long bytesDownloaded;
        /** -1 表示服务器没给 Content-Length，进度未知 */
        final long totalBytes;

        DownloadProgress(String status, long bytesDownloaded, long totalBytes) {
            this.status = status;
            this.bytesDownloaded = bytesDownloaded;
            this.totalBytes = totalBytes;
        }
    }

    private static DownloadProgress queryDownloadProgress(DownloadManager manager, long downloadId) {
        DownloadManager.Query query = new DownloadManager.Query().setFilterById(downloadId);
        try (Cursor cursor = manager.query(query)) {
            if (cursor == null || !cursor.moveToFirst()) {
                return null;
            }
            int statusColumn = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
            int soFarColumn = cursor.getColumnIndex(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR);
            int totalColumn = cursor.getColumnIndex(DownloadManager.COLUMN_TOTAL_SIZE_BYTES);
            int status = statusColumn >= 0 ? cursor.getInt(statusColumn) : DownloadManager.STATUS_FAILED;
            long soFar = soFarColumn >= 0 ? cursor.getLong(soFarColumn) : 0L;
            long total = totalColumn >= 0 ? cursor.getLong(totalColumn) : -1L;
            return new DownloadProgress(downloadStatusName(status), soFar, total);
        } catch (RuntimeException error) {
            return null;
        }
    }

    private static String downloadStatusName(int status) {
        switch (status) {
            case DownloadManager.STATUS_SUCCESSFUL:
                return STATUS_SUCCESS;
            case DownloadManager.STATUS_FAILED:
                return STATUS_FAILED;
            case DownloadManager.STATUS_PAUSED:
                return "paused";
            case DownloadManager.STATUS_PENDING:
                return "pending";
            default:
                return "running";
        }
    }

    private static String progressPayload(
        long downloadId,
        String fileName,
        String status,
        long bytesDownloaded,
        long totalBytes
    ) {
        int percent = totalBytes > 0
            ? (int) Math.max(0L, Math.min(100L, bytesDownloaded * 100L / totalBytes))
            : -1;
        // 服务器没给 Content-Length 时进度一路未知，成功后仍要收口到 100%
        if (STATUS_SUCCESS.equals(status)) {
            percent = 100;
        }
        try {
            JSONObject payload = new JSONObject();
            payload.put("id", String.valueOf(downloadId));
            payload.put("fileName", fileName == null ? "" : fileName);
            payload.put("status", status);
            payload.put("bytesDownloaded", bytesDownloaded);
            payload.put("totalBytes", totalBytes);
            payload.put("percent", percent);
            return payload.toString();
        } catch (JSONException error) {
            return null;
        }
    }

    private static boolean ensureDownloadCompletionReceiver(Context context) {
        if (!DOWNLOAD_RECEIVER_REGISTERED.compareAndSet(false, true)) {
            return true;
        }
        try {
            ContextCompat.registerReceiver(
                context.getApplicationContext(),
                DOWNLOAD_COMPLETION_RECEIVER,
                new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
                ContextCompat.RECEIVER_EXPORTED
            );
            return true;
        } catch (RuntimeException error) {
            DOWNLOAD_RECEIVER_REGISTERED.set(false);
            // 完成提示属于增强反馈；个别厂商若禁止动态注册，仍应保留系统下载与系统通知。
            return false;
        }
    }

    private static boolean isDownloadSuccessful(Context context, long downloadId) {
        DownloadManager manager =
            (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) {
            return false;
        }
        DownloadManager.Query query = new DownloadManager.Query()
            .setFilterById(downloadId);
        try (Cursor cursor = manager.query(query)) {
            if (cursor == null || !cursor.moveToFirst()) {
                return false;
            }
            int statusColumn = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
            return statusColumn >= 0
                && cursor.getInt(statusColumn) == DownloadManager.STATUS_SUCCESSFUL;
        } catch (RuntimeException error) {
            return false;
        }
    }

    static Set<String> trustedWebMessageOrigins() {
        LinkedHashSet<String> origins = new LinkedHashSet<>();
        origins.add("https://" + LIGHT_NOTE_HOST);
        String homeOrigin = originOf(HOME_URL);
        if (!isBlank(homeOrigin)) {
            origins.add(homeOrigin);
        }
        return origins;
    }

    private static String sanitizeFileName(String value) {
        if (isBlank(value)) {
            return "";
        }
        String decoded = Uri.decode(value).trim();
        return decoded.replaceAll("[\\\\/:*?\"<>|]", "_");
    }

    private static String originOf(String value) {
        if (!isHttpUrl(value)) {
            return "";
        }
        try {
            URI uri = new URI(value.trim());
            String scheme = uri.getScheme().toLowerCase(Locale.ROOT);
            String host = uri.getHost().toLowerCase(Locale.ROOT);
            int port = uri.getPort();
            return scheme + "://" + host + (port >= 0 ? ":" + port : "");
        } catch (URISyntaxException error) {
            return "";
        }
    }

    private static String hostOf(String value) {
        if (!isHttpUrl(value)) {
            return "";
        }
        try {
            String host = new URI(value.trim()).getHost();
            return host == null ? "" : host.toLowerCase(Locale.ROOT);
        } catch (URISyntaxException error) {
            return "";
        }
    }

    static boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
