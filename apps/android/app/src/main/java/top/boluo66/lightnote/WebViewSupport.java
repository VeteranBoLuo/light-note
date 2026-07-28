package top.boluo66.lightnote;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

final class WebViewSupport {
    static final String HOME_URL = BuildConfig.HOME_URL;
    static final String EXTRA_URL = "light_note_url";
    private static final String LIGHT_NOTE_HOST = "boluo66.top";
    private static final String HOME_HOST = hostOf(HOME_URL);

    private WebViewSupport() {
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
        if (value == null) {
            return false;
        }
        String lower = value.toLowerCase(Locale.ROOT);
        return lower.startsWith("https://") || lower.startsWith("http://");
    }

    static boolean openSystemIntent(Activity activity, String url) {
        if (isBlank(url)) {
            return true;
        }

        try {
            Intent intent;
            if (url.startsWith("intent://")) {
                intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                String fallback = intent.getStringExtra("browser_fallback_url");
                try {
                    activity.startActivity(intent);
                    return true;
                } catch (ActivityNotFoundException ignored) {
                    if (fallback != null && isHttpUrl(fallback)) {
                        openInAppBrowser(activity, fallback);
                        return true;
                    }
                    throw ignored;
                }
            }

            intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            activity.startActivity(intent);
        } catch (Exception error) {
            Toast.makeText(activity, R.string.cannot_open_link, Toast.LENGTH_SHORT).show();
        }
        return true;
    }

    static void openInAppBrowser(Activity activity, String url) {
        Intent intent = new Intent(activity, InAppBrowserActivity.class);
        intent.putExtra(EXTRA_URL, url);
        activity.startActivity(intent);
    }

    static void download(Context context, String url, String userAgent, String contentDisposition, String mimeType) {
        if (!isHttpUrl(url)) {
            Toast.makeText(context, R.string.download_failed, Toast.LENGTH_SHORT).show();
            return;
        }

        try {
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            String fileName = URLUtil.guessFileName(url, contentDisposition, mimeType);
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
            manager.enqueue(request);
            Toast.makeText(context, R.string.download_started, Toast.LENGTH_LONG).show();
        } catch (Exception error) {
            Toast.makeText(context, R.string.download_failed, Toast.LENGTH_SHORT).show();
        }
    }

    private static String hostOf(String value) {
        if (!isHttpUrl(value)) {
            return "";
        }
        try {
            String host = new URI(value).getHost();
            return host == null ? "" : host.toLowerCase(Locale.ROOT);
        } catch (URISyntaxException error) {
            return "";
        }
    }

    static boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
