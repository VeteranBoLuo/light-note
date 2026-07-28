package top.boluo66.lightnote;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
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

                int message = isDownloadSuccessful(context, downloadId)
                    ? R.string.download_completed
                    : R.string.download_failed_named;
                Toast.makeText(
                    context,
                    context.getString(message, fileName),
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

    static void download(Context context, String url, String userAgent, String contentDisposition, String mimeType) {
        download(context, url, userAgent, contentDisposition, mimeType, null);
    }

    static void download(
        Context context,
        String url,
        String userAgent,
        String contentDisposition,
        String mimeType,
        String suggestedFileName
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
            Toast.makeText(context, R.string.download_started, Toast.LENGTH_LONG).show();
        } catch (Exception error) {
            Toast.makeText(context, R.string.download_failed, Toast.LENGTH_SHORT).show();
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
