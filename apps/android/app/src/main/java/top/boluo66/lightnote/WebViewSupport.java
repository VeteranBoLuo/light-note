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
import android.provider.CalendarContract;
import android.provider.MediaStore;
import android.provider.Settings;
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

    /**
     * 下载完成后询问用户是否打开该文件。
     *
     * 完成广播是用 application context 注册的，弹不了对话框（AlertDialog 要 Activity），
     * 所以把这一步交回界面：MainActivity 在前台时登记自己，退到后台就取消登记 ——
     * 用户已经切走了还硬弹一个对话框是打扰，而且此时 startActivity 也不该由我们发起。
     */
    interface DownloadOpenPrompt {
        void promptOpen(long downloadId, String fileName);
    }

    private static volatile DownloadOpenPrompt downloadOpenPrompt;

    static void setDownloadOpenPrompt(DownloadOpenPrompt prompt) {
        downloadOpenPrompt = prompt;
    }
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
                    /*
                     * 日历文件下载完就地问一句「要不要导入」。
                     *
                     * 只落到「下载」目录是不够用的：用户不知道文件在哪，找到了还得自己选
                     * 「用日历打开」，中间掉队的人很多（菠萝在鸿蒙 6 + 卓易通上实测的原话）。
                     * 按扩展名判断而不是让网页传标记：文件名是我们自己生成并由服务端清洗过的，
                     * 判断可靠，而且顺带覆盖所有产出 .ics 的路径。
                     */
                    DownloadOpenPrompt prompt = downloadOpenPrompt;
                    if (prompt != null && fileName.toLowerCase(Locale.ROOT).endsWith(".ics")) {
                        prompt.promptOpen(downloadId, fileName);
                    }
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
        /*
         * UA 里除了版本号，还带上系统当前是深色还是浅色。
         *
         * 为什么非得走 UA：网页在「跟随系统」模式下要在首屏渲染前就定好主题，而 UA 是唯一
         * 在页面第一行脚本求值前就已经可用的通道 —— evaluateJavascript 注入总是晚于它。
         *
         * 为什么不能让网页自己用 prefers-color-scheme：那个媒体查询只反映宿主主题的
         * isLightTheme，并且在旧 WebView 上会被 setForceDark(FORCE_DARK_OFF) 钉死成 light，
         * 与系统开关无关。实测鸿蒙兼容层里它就一直是 light，导致「跟随系统」永远浅色。
         * 框架层的 uiMode 才是可靠来源（见 WindowInsetsSupport.isNightMode）。
         *
         * UA 是创建时的一次性快照，运行中切换系统深色不会更新它 —— 那种情况由
         * MainActivity.onConfigurationChanged 主动推给网页。
         */
        settings.setUserAgentString(
            settings.getUserAgentString()
                + " LightNoteAndroid/" + BuildConfig.VERSION_NAME
                + " LightNoteSystemTheme/" + systemThemeName(webView.getContext())
                // 能力标记不能靠 versionName 推断：Debug 与当前正式版可能同号，而旧壳不认识通知桥。
                // 网页只在看到这个标记时展示 Root 灰度设置并发送 notifications.* 消息。
                + " LightNoteNativeNotifications/1"
        );
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        // setBuiltInZoomControls(false) 只关掉缩放控件那套内置机制,useWideViewPort 打开时
        // 双指缩放实测仍然生效 —— 真正的总开关是 setSupportZoom,见 disablePageZoom。
        webView.setBackgroundColor(Color.TRANSPARENT);
        webView.setNestedScrollingEnabled(true);
        webView.setOverScrollMode(WebView.OVER_SCROLL_IF_CONTENT_SCROLLS);

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);
    }

    /** 系统主题名，与网页侧 data-theme 用同一套字面量（night / day），省掉两边的映射。 */
    static String systemThemeName(Context context) {
        return WindowInsetsSupport.isNightMode(context) ? "night" : "day";
    }

    /**
     * 把系统主题变化推给网页。
     *
     * Manifest 里声明了 configChanges 含 uiMode，切换系统深色时 Activity 不会重建，
     * WebView 的 UA 也就停留在启动时的快照上，只能由原生主动通知。
     * 网页那边只在用户选了「跟随系统」时才据此换肤（见 utils/systemTheme.ts）。
     *
     * 深浅色由调用方以 boolean 传入，这里不自己去读 Configuration：在
     * onConfigurationChanged 回调的那一刻，Activity 的 Resources 可能还持有旧配置，
     * 回调参数 newConfig 才是权威值。之前这里接 Context 自行读取，结果推给网页的是
     * 切换「前」的主题 —— 表现为运行中切换系统深浅色时界面毫无反应、重启 App 才生效。
     */
    static void notifySystemThemeChanged(WebView webView, boolean nightMode) {
        if (webView == null) {
            return;
        }
        webView.evaluateJavascript(
            "window.__lightNoteAndroidSystemTheme&&window.__lightNoteAndroidSystemTheme('"
                + (nightMode ? "night" : "day")
                + "');",
            null
        );
    }

    /**
     * 关掉整页缩放。只给轻笺自己的主壳用 —— 应用界面被双指放大后固定定位的顶栏/底栏会错位,
     * 想看大字走「设置 - 界面缩放」。内嵌浏览器(InAppBrowserActivity)和站外弹窗刻意不调:
     * 那里装的是别人的网页,缩放是基本的阅读能力。
     * 页面侧的 viewport(user-scalable=no)是同一件事的第一道防线,这里是 WebView 层的兜底 ——
     * 系统「强制启用缩放」之类的辅助设置能盖掉 viewport,但盖不掉 setSupportZoom(false)。
     */
    static void disablePageZoom(WebView webView) {
        WebSettings settings = webView.getSettings();
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
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

    /**
     * 正式版继续全局禁止 HTTP 明文流量，只对已确认同时支持 HTTPS 的分享短链做确定性升级。
     * 这既兼容历史书签，也避免为修一个站点而放宽整个 App 的网络安全策略。
     */
    static String upgradeKnownHttpsUrl(String value) {
        if (isBlank(value)) {
            return value == null ? "" : value.trim();
        }
        String trimmed = value.trim();
        try {
            URI uri = new URI(trimmed);
            String scheme = uri.getScheme();
            String host = uri.getHost();
            if (!"http".equalsIgnoreCase(scheme) || host == null) {
                return trimmed;
            }
            String normalizedHost = host.toLowerCase(Locale.ROOT);
            boolean isXiaohongshuShortLink =
                "xhslink.cn".equals(normalizedHost)
                    || "www.xhslink.cn".equals(normalizedHost)
                    || "xhslink.com".equals(normalizedHost)
                    || "www.xhslink.com".equals(normalizedHost);
            if (!isXiaohongshuShortLink) {
                return trimmed;
            }
            return "https:" + trimmed.substring(trimmed.indexOf(':') + 1);
        } catch (URISyntaxException error) {
            return trimmed;
        }
    }

    static boolean isCleartextHttpUrl(String value) {
        if (isBlank(value)) {
            return false;
        }
        try {
            URI uri = new URI(value.trim());
            return "http".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null;
        } catch (URISyntaxException error) {
            return false;
        }
    }

    /** 未知 HTTP 站点不放宽 WebView 明文策略，交给系统浏览器处理。 */
    static boolean openExternalWebUrl(Activity activity, String url) {
        if (!isHttpUrl(url)) {
            showCannotOpenLink(activity);
            return true;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url.trim()));
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
        String normalizedUrl = upgradeKnownHttpsUrl(url);
        if (!isHttpUrl(normalizedUrl)) {
            showCannotOpenLink(activity);
            return;
        }
        if (isCleartextHttpUrl(normalizedUrl)) {
            openExternalWebUrl(activity, normalizedUrl);
            return;
        }
        Intent intent = new Intent(activity, InAppBrowserActivity.class);
        intent.putExtra(EXTRA_URL, normalizedUrl);
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

    /*
     * 应用内浏览页专用：这里打开的是外部站点,网页那边不会替我们说话,blob/data 这类落不了盘的
     * 地址必须由原生给一句提示,否则用户点了完全没反应。
     *
     * 轻笺自己的页面走下面带 suggestedFileName / progressListener 的重载,那条链路的非 http
     * 地址一律静默 —— 网页层已经会如实提示(见 web/utils/fileDelivery.ts 的 'unavailable'),
     * 原生再弹一次就成了同一件事两个说法,而且一个说失败一个说成功。
     */
    static void download(Context context, String url, String userAgent, String contentDisposition, String mimeType) {
        if (!isHttpUrl(url)) {
            Toast.makeText(context, R.string.download_failed, Toast.LENGTH_SHORT).show();
            return;
        }
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
            /*
             * 静默返回,不弹「无法开始下载」。
             *
             * 走到这里的只会是轻笺自己页面里的 blob:/data: —— WebView 确实会把它们交给
             * DownloadListener,但 DownloadManager 只收 http(s)。这种情况网页层自己知道、
             * 也会给出可操作的提示(改用「加入日历」、换手机浏览器…),原生再弹一句系统 Toast
             * 只会和网页提示打架:用户同时看到「无法开始下载」和网页的说法,不知道信哪个。
             * enqueue 真失败(下面的 catch)仍然要弹 —— 那种失败网页无从得知。
             */
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

    /**
     * 应用内更新的安装结果。
     * NEED_PERMISSION 与其它失败必须分开：前者能靠跳设置页救回来，后者只能退回手动安装。
     */
    enum ApkInstallOutcome {
        OK,
        NEED_PERMISSION,
        NOT_FOUND,
        FAILED
    }

    /**
     * 把已下载完成的轻笺安装包交给系统安装器。
     *
     * 只接受本应用经 DownloadManager 下载、且原始地址在轻笺官方域名下的文件：DownloadManager
     * 按 uid 隔离，别的应用的 downloadId 在这里本来就查不到，再加一道来源域名校验，网页侧即使
     * 被诱导发来任意 downloadId 也装不了非轻笺的包。
     *
     * 用 getUriForDownloadedFile 而不是直接读 COLUMN_LOCAL_URI：后者可能是 file:// 路径，
     * Android 7+ 把它递给其它应用会抛 FileUriExposedException，前者给的是可共享的 content URI。
     *
     * 拉起的是系统安装确认页，装不装仍由用户在系统界面上决定，这里没有静默安装能力。
     */
    static ApkInstallOutcome installDownloadedApk(Activity activity, long downloadId) {
        if (downloadId < 0) {
            return ApkInstallOutcome.NOT_FOUND;
        }
        // API 26 起未授权「安装未知应用」时 startActivity 会被系统直接拒绝，先问再走
        if (!activity.getPackageManager().canRequestPackageInstalls()) {
            return ApkInstallOutcome.NEED_PERMISSION;
        }

        DownloadManager manager =
            (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) {
            return ApkInstallOutcome.FAILED;
        }
        if (!isLightNoteUrl(downloadSourceUrl(manager, downloadId))) {
            return ApkInstallOutcome.NOT_FOUND;
        }

        try {
            Uri contentUri = manager.getUriForDownloadedFile(downloadId);
            if (contentUri == null) {
                return ApkInstallOutcome.NOT_FOUND;
            }
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(contentUri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(intent);
            return ApkInstallOutcome.OK;
        } catch (Exception error) {
            return ApkInstallOutcome.FAILED;
        }
    }

    /** 下载记录里的原始请求地址，用于确认这个包确实来自轻笺官网。 */
    private static String downloadSourceUrl(DownloadManager manager, long downloadId) {
        DownloadManager.Query query = new DownloadManager.Query().setFilterById(downloadId);
        try (Cursor cursor = manager.query(query)) {
            if (cursor == null || !cursor.moveToFirst()) {
                return "";
            }
            int uriColumn = cursor.getColumnIndex(DownloadManager.COLUMN_URI);
            return uriColumn >= 0 ? String.valueOf(cursor.getString(uriColumn)) : "";
        } catch (RuntimeException error) {
            return "";
        }
    }

    /**
     * 打开系统的「允许安装未知应用」授权页。
     * 带上本应用的包名直达自己那一项;个别 ROM 没有这个页面时退回应用详情页,再不行就放弃,
     * 由网页侧提示用户手动安装。
     */
    static boolean openUnknownAppSourcesSettings(Activity activity) {
        Uri packageUri = Uri.parse("package:" + activity.getPackageName());
        Intent manageSources =
            new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, packageUri);
        try {
            activity.startActivity(manageSources);
            return true;
        } catch (Exception ignored) {
            // 继续尝试应用详情页
        }
        try {
            activity.startActivity(
                new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, packageUri)
            );
            return true;
        } catch (Exception error) {
            return false;
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

    /*
     * 把待办递给系统日历的「新建事件」页。
     *
     * 为什么用 ACTION_INSERT 而不是自己往 CalendarContract 写:直接写需要 WRITE_CALENDAR
     * 危险权限,而权限清单是对外公示并已随 App 备案的(见 apps/web/src/config/androidRelease.ts
     * 与 docs/android/p4-compliance-audit.md),多一个危险权限就要走合规复审。ACTION_INSERT
     * 由系统日历自己完成写入,零新增权限,用户还能在保存前改。
     *
     * 代价:intent 没有「提前多少分钟提醒」的标准 extra,提醒得用户在日历页自己选。
     * 需要带上提醒的场景仍然走 .ics 文件(VALARM 在文件里),两条路并存。
     */
    /**
     * 用系统里能处理该类型的应用打开一个已下载完成的文件（日历文件就是「导入日历」那一步）。
     *
     * 地址必须走 `getUriForDownloadedFile` 拿 content:// —— 我们把文件落在公共「下载」目录，
     * 直接甩 file:// 在 API 24+ 会触发 FileUriExposedException；content:// 配
     * FLAG_GRANT_READ_URI_PERMISSION 才能让日历应用读到。
     *
     * MIME 显式传入而不是只靠 getMimeTypeForDownloadedFile：部分机型对 .ics 猜成
     * application/octet-stream，那样系统就不会把日历应用列为候选。
     */
    static boolean openDownloadedFile(Activity activity, long downloadId, String mimeType) {
        if (activity == null || downloadId < 0) {
            return false;
        }
        try {
            DownloadManager manager =
                (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
            if (manager == null) {
                return false;
            }
            Uri uri = manager.getUriForDownloadedFile(downloadId);
            if (uri == null) {
                return false;
            }
            String resolved = isBlank(mimeType)
                ? manager.getMimeTypeForDownloadedFile(downloadId)
                : mimeType;
            Intent intent = new Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, isBlank(resolved) ? "*/*" : resolved)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            activity.startActivity(intent);
            return true;
        } catch (Exception error) {
            // 主要是 ActivityNotFoundException（没有能处理这个类型的应用）
            return false;
        }
    }

    static boolean insertCalendarEvent(
        Activity activity,
        String title,
        String description,
        String location,
        long beginTime,
        long endTime
    ) {
        if (activity == null || beginTime <= 0L) {
            return false;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_INSERT)
                .setData(CalendarContract.Events.CONTENT_URI)
                .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, beginTime);
            if (endTime > beginTime) {
                intent.putExtra(CalendarContract.EXTRA_EVENT_END_TIME, endTime);
            }
            if (!isBlank(title)) {
                intent.putExtra(CalendarContract.Events.TITLE, title);
            }
            if (!isBlank(description)) {
                intent.putExtra(CalendarContract.Events.DESCRIPTION, description);
            }
            if (!isBlank(location)) {
                intent.putExtra(CalendarContract.Events.EVENT_LOCATION, location);
            }
            /*
             * 故意不做 resolveActivity 预检:Android 11 起的包可见性会让它在日历应用确实存在时
             * 也返回 null,预检等于把能用的机型判成不支持。直接 start,没有日历应用时
             * ActivityNotFoundException 会告诉我们,网页据此回落到 .ics。
             */
            activity.startActivity(intent);
            return true;
        } catch (Exception error) {
            // 主要就是 ActivityNotFoundException(机型没有日历应用);其余异常同样只能算失败
            return false;
        }
    }
}
