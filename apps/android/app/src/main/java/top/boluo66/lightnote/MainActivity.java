package top.boluo66.lightnote;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Canvas;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.SystemClock;
import android.provider.MediaStore;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.SafeBrowsingResponseCompat;
import androidx.webkit.WebResourceErrorCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewClientCompat;
import androidx.webkit.WebViewFeature;

import java.io.File;
import java.io.IOException;

import org.json.JSONException;
import org.json.JSONObject;

public final class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 1001;
    private static final long FILE_CHOOSER_LAUNCH_DELAY_MS = 64;
    private static final long FILE_CHOOSER_READY_FALLBACK_MS = 3_000;
    private static final long LAUNCH_TIMEOUT_MS = 10_000;
    private static final long WEB_APP_READY_FALLBACK_MS = 1_500;
    private static final long BACK_TO_DESKTOP_CONFIRM_WINDOW_MS = 2_000;
    private static final String THEME_OBSERVER_SCRIPT =
        "(function(){"
            + "try{"
            + "var root=document.documentElement;"
            + "var read=function(){"
            + "return root.getAttribute('data-theme')==='night'?'night':'day';"
            + "};"
            + "var send=function(){"
            + "var theme=read();"
            + "if(window.LightNoteAndroid"
            + "&&typeof window.LightNoteAndroid.postMessage==='function'){"
            + "window.LightNoteAndroid.postMessage(JSON.stringify({"
            + "type:'theme.changed',theme:theme"
            + "}));"
            + "}"
            + "return theme;"
            + "};"
            + "if(window.__lightNoteAndroidThemeObserver){"
            + "window.__lightNoteAndroidThemeObserver.disconnect();"
            + "}"
            + "window.__lightNoteAndroidThemeObserver=new MutationObserver(send);"
            + "window.__lightNoteAndroidThemeObserver.observe(root,{"
            + "attributes:true,attributeFilter:['data-theme']"
            + "});"
            + "return send();"
            + "}catch(error){return '';}"
            + "})();";

    private WebView webView;
    private LinearLayout errorView;
    private TextView errorTitleView;
    private TextView errorMessageView;
    private Button errorActionButton;
    private FrameLayout rootView;
    private View statusBarBackground;
    private FrameLayout launchOverlay;
    private FrameLayout fileChooserOverlay;
    private LinearLayout backToDesktopHint;
    private TextView backHintTitleView;
    private ProgressBar fileChooserProgressView;
    private TextView fileChooserStatusView;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraOutputUri;
    private Runnable pendingFileChooserLaunch;
    private boolean launchOverlayHidden;
    private boolean unsupportedWebView;
    private boolean resolvedNightTheme;
    private boolean backNavigationPending;
    private long lastRootBackPressedAt;
    private int backHintAnimationGeneration;
    private OnBackInvokedCallback backInvokedCallback;
    private final Runnable launchTimeout = this::hideLaunchOverlay;
    private final Runnable webAppReadyFallback = this::hideLaunchOverlay;
    private final Runnable fileChooserReadyFallback = this::hideFileChooserOverlay;
    private final Runnable hideBackToDesktopHintTask = this::hideBackToDesktopHint;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (!PrivacyConsentStore.isAccepted(this)) {
            startActivity(new Intent(this, PrivacyConsentActivity.class));
            finish();
            return;
        }
        registerSystemBackCallback();
        resolvedNightTheme = WindowInsetsSupport.isNightMode(this);
        setContentView(createContentView());
        if (WebViewSupport.isUnsupportedWebView(webView)) {
            showUnsupportedWebView();
            return;
        }
        configureWebView();
        launchOverlay.postDelayed(launchTimeout, LAUNCH_TIMEOUT_MS);

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(WebViewSupport.HOME_URL);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // singleTask 从桌面恢复时只更新启动 Intent，保留现有 WebView、路由和滚动状态。
        setIntent(intent);
    }

    private void registerSystemBackCallback() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return;
        }
        backInvokedCallback = this::handleBackNavigation;
        getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
            OnBackInvokedDispatcher.PRIORITY_DEFAULT,
            backInvokedCallback
        );
    }

    private View createContentView() {
        rootView = new FrameLayout(this);
        rootView.setBackgroundColor(getColor(R.color.splash_background));

        FrameLayout content = new FrameLayout(this);
        content.setBackgroundColor(getColor(R.color.page_background));
        rootView.addView(content, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        webView = new WebView(this);
        content.addView(webView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        errorView = new LinearLayout(this);
        errorView.setOrientation(LinearLayout.VERTICAL);
        errorView.setGravity(Gravity.CENTER);
        errorView.setPadding(dp(32), dp(32), dp(32), dp(32));
        errorView.setBackgroundColor(getColor(R.color.page_background));

        errorTitleView = new TextView(this);
        errorTitleView.setText(R.string.network_error_title);
        errorTitleView.setTextColor(getColor(R.color.text_primary));
        errorTitleView.setTextSize(20);
        errorTitleView.setGravity(Gravity.CENTER);
        errorView.addView(errorTitleView);

        errorMessageView = new TextView(this);
        errorMessageView.setText(R.string.network_error_message);
        errorMessageView.setTextColor(getColor(R.color.text_primary));
        errorMessageView.setTextSize(14);
        errorMessageView.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams messageParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        messageParams.topMargin = dp(10);
        errorView.addView(errorMessageView, messageParams);

        errorActionButton = new Button(this);
        errorActionButton.setText(R.string.retry);
        errorActionButton.setOnClickListener(view -> {
            if (unsupportedWebView) {
                finish();
                return;
            }
            errorView.setVisibility(View.GONE);
            webView.reload();
        });
        LinearLayout.LayoutParams retryParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        retryParams.topMargin = dp(20);
        errorView.addView(errorActionButton, retryParams);

        errorView.setVisibility(View.GONE);
        content.addView(errorView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        statusBarBackground = new View(this);
        statusBarBackground.setBackgroundColor(getColor(R.color.page_background));
        FrameLayout.LayoutParams statusBarParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            0
        );
        statusBarParams.gravity = Gravity.TOP;
        rootView.addView(statusBarBackground, statusBarParams);

        launchOverlay = createLaunchOverlay();
        rootView.addView(launchOverlay, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        fileChooserOverlay = createFileChooserOverlay();
        fileChooserOverlay.setVisibility(View.GONE);
        rootView.addView(fileChooserOverlay, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        backToDesktopHint = createBackToDesktopHint();
        rootView.addView(backToDesktopHint, createBackToDesktopHintLayoutParams());
        applyBackToDesktopHintInsets();
        WindowInsetsSupport.apply(
            this,
            rootView,
            content,
            statusBarBackground
        );
        return rootView;
    }

    private LinearLayout createBackToDesktopHint() {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.HORIZONTAL);
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setPadding(dp(18), dp(10), dp(18), dp(10));
        card.setElevation(0f);
        card.setVisibility(View.GONE);
        card.setAlpha(0f);
        card.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES);

        backHintTitleView = new TextView(this);
        backHintTitleView.setText(R.string.back_to_desktop_hint_title);
        backHintTitleView.setTextSize(14);
        backHintTitleView.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        backHintTitleView.setIncludeFontPadding(false);
        backHintTitleView.setGravity(Gravity.CENTER);
        backHintTitleView.setTranslationY(-dp(1));
        backHintTitleView.setMaxLines(1);
        card.addView(backHintTitleView, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        applyBackToDesktopHintTheme(card);
        return card;
    }

    private FrameLayout.LayoutParams createBackToDesktopHintLayoutParams() {
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        params.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
        params.leftMargin = dp(14);
        params.rightMargin = dp(14);
        params.bottomMargin = dp(86);
        return params;
    }

    private void applyBackToDesktopHintInsets() {
        ViewCompat.setOnApplyWindowInsetsListener(backToDesktopHint, (view, windowInsets) -> {
            Insets safeArea = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars()
                    | WindowInsetsCompat.Type.displayCutout()
            );
            ViewGroup.LayoutParams rawParams = view.getLayoutParams();
            if (rawParams instanceof FrameLayout.LayoutParams) {
                FrameLayout.LayoutParams params = (FrameLayout.LayoutParams) rawParams;
                params.leftMargin = safeArea.left + dp(14);
                params.rightMargin = safeArea.right + dp(14);
                params.bottomMargin = safeArea.bottom + dp(86);
                view.setLayoutParams(params);
            }
            return windowInsets;
        });
    }

    private GradientDrawable roundedBackground(int color, int radiusDp) {
        GradientDrawable background = new GradientDrawable();
        background.setColor(color);
        background.setCornerRadius(dp(radiusDp));
        return background;
    }

    private void applyBackToDesktopHintTheme() {
        applyBackToDesktopHintTheme(backToDesktopHint);
    }

    private void applyBackToDesktopHintTheme(LinearLayout card) {
        if (card == null) return;
        int titleColor = getColor(
            resolvedNightTheme ? R.color.back_hint_title_night : R.color.back_hint_title_day
        );
        if (resolvedNightTheme) {
            card.setPadding(dp(18), dp(10), dp(18), dp(10));
            card.setLayerType(View.LAYER_TYPE_NONE, null);
            card.setElevation(dp(2));
            card.setBackground(roundedBackground(getColor(R.color.back_hint_background_night), 999));
        } else {
            // 使用单层模糊投影并向下轻移，避免默认 elevation 的黑色底边和同心光圈。
            card.setPadding(dp(26), dp(18), dp(26), dp(20));
            card.setElevation(0f);
            card.setLayerType(View.LAYER_TYPE_SOFTWARE, null);
            card.setBackground(new SoftPillDrawable());
        }
        if (backHintTitleView != null) backHintTitleView.setTextColor(titleColor);
    }

    private final class SoftPillDrawable extends Drawable {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final RectF pillBounds = new RectF();
        private int drawableAlpha = 255;

        @Override
        public void draw(Canvas canvas) {
            pillBounds.set(
                getBounds().left + dp(9),
                getBounds().top + dp(6),
                getBounds().right - dp(9),
                getBounds().bottom - dp(11)
            );
            paint.setColor(getColor(R.color.back_hint_background_day));
            paint.setAlpha(drawableAlpha);
            paint.setShadowLayer(dp(9), 0f, dp(3), 0x28707580);
            float radius = pillBounds.height() / 2f;
            canvas.drawRoundRect(pillBounds, radius, radius, paint);
            paint.clearShadowLayer();
        }

        @Override
        public void setAlpha(int alpha) {
            drawableAlpha = alpha;
            invalidateSelf();
        }

        @Override
        public void setColorFilter(ColorFilter colorFilter) {
            paint.setColorFilter(colorFilter);
            invalidateSelf();
        }

        @Override
        public int getOpacity() {
            return PixelFormat.TRANSLUCENT;
        }
    }

    private void showBackToDesktopHint() {
        if (backToDesktopHint == null || rootView == null) return;
        rootView.removeCallbacks(hideBackToDesktopHintTask);
        backHintAnimationGeneration++;
        backToDesktopHint.animate().cancel();
        applyBackToDesktopHintTheme();
        backToDesktopHint.bringToFront();
        backToDesktopHint.setVisibility(View.VISIBLE);
        backToDesktopHint.setAlpha(0f);
        backToDesktopHint.setTranslationY(dp(14));
        backToDesktopHint.animate()
            .alpha(1f)
            .translationY(0f)
            .setDuration(190)
            .start();
        backToDesktopHint.announceForAccessibility(
            getString(R.string.back_to_desktop_hint_accessibility)
        );
        rootView.postDelayed(hideBackToDesktopHintTask, BACK_TO_DESKTOP_CONFIRM_WINDOW_MS);
    }

    private void hideBackToDesktopHint() {
        if (backToDesktopHint == null || backToDesktopHint.getVisibility() != View.VISIBLE) return;
        int animationGeneration = ++backHintAnimationGeneration;
        backToDesktopHint.animate().cancel();
        backToDesktopHint.animate()
            .alpha(0f)
            .translationY(dp(8))
            .setDuration(150)
            .withEndAction(() -> {
                if (animationGeneration != backHintAnimationGeneration) return;
                backToDesktopHint.setVisibility(View.GONE);
                backToDesktopHint.setTranslationY(0f);
            })
            .start();
    }

    private void hideBackToDesktopHintImmediately() {
        if (rootView != null) rootView.removeCallbacks(hideBackToDesktopHintTask);
        if (backToDesktopHint == null) return;
        backHintAnimationGeneration++;
        backToDesktopHint.animate().cancel();
        backToDesktopHint.setVisibility(View.GONE);
        backToDesktopHint.setAlpha(0f);
        backToDesktopHint.setTranslationY(0f);
    }

    private FrameLayout createLaunchOverlay() {
        FrameLayout overlay = new FrameLayout(this);
        overlay.setBackgroundColor(getColor(R.color.splash_background));
        overlay.setClickable(true);
        overlay.setImportantForAccessibility(
            View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
        );

        // 系统启动页和应用等待页共用同一份“图标 + 轻笺”成品资源及尺寸，
        // WebView 就绪前画面保持静止，切换阶段不会再发生位移或缩放。
        ImageView brand = new ImageView(this);
        brand.setImageResource(R.drawable.ic_splash_mark);
        brand.setScaleType(ImageView.ScaleType.FIT_CENTER);

        FrameLayout.LayoutParams brandParams = new FrameLayout.LayoutParams(
            dp(288),
            dp(288)
        );
        brandParams.gravity = Gravity.CENTER;
        overlay.addView(brand, brandParams);
        return overlay;
    }

    private FrameLayout createFileChooserOverlay() {
        FrameLayout overlay = new FrameLayout(this);
        overlay.setBackgroundColor(getFileChooserBackgroundColor());
        overlay.setClickable(true);

        LinearLayout center = new LinearLayout(this);
        center.setOrientation(LinearLayout.VERTICAL);
        center.setGravity(Gravity.CENTER);
        center.setPadding(dp(28), dp(28), dp(28), dp(28));

        fileChooserProgressView = new ProgressBar(this);
        fileChooserProgressView.setIndeterminateTintList(
            getColorStateList(R.color.brand_primary)
        );
        LinearLayout.LayoutParams loadingParams =
            new LinearLayout.LayoutParams(dp(36), dp(36));
        loadingParams.gravity = Gravity.CENTER_HORIZONTAL;
        center.addView(fileChooserProgressView, loadingParams);

        fileChooserStatusView = new TextView(this);
        fileChooserStatusView.setText(R.string.file_chooser_opening);
        fileChooserStatusView.setTextColor(getFileChooserTextColor());
        fileChooserStatusView.setTextSize(15);
        fileChooserStatusView.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams textParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        textParams.topMargin = dp(18);
        center.addView(fileChooserStatusView, textParams);

        FrameLayout.LayoutParams centerParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        centerParams.gravity = Gravity.CENTER;
        overlay.addView(center, centerParams);
        return overlay;
    }

    private void configureWebView() {
        WebViewSupport.configure(webView, true);
        configureTrustedWebMessages();
        webView.setWebViewClient(new WebViewClientCompat() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return routeMainUrl(request.getUrl().toString());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return routeMainUrl(url);
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                errorView.setVisibility(View.GONE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                syncWebTheme(view, url);
                scheduleLaunchFallback();
            }

            @Override
            public void onReceivedError(
                WebView view,
                WebResourceRequest request,
                WebResourceErrorCompat error
            ) {
                if (request.isForMainFrame()) {
                    showLoadError();
                }
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, android.net.http.SslError error) {
                handler.cancel();
                showLoadError();
                Toast.makeText(MainActivity.this, R.string.ssl_error, Toast.LENGTH_LONG).show();
            }

            @Override
            public void onSafeBrowsingHit(
                WebView view,
                WebResourceRequest request,
                int threatType,
                SafeBrowsingResponseCompat response
            ) {
                if (!WebViewSupport.backToSafety(MainActivity.this, response)) {
                    super.onSafeBrowsingHit(view, request, threatType, response);
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                WebView view,
                ValueCallback<Uri[]> callback,
                FileChooserParams params
            ) {
                return openFileChooser(callback, params);
            }

            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, android.os.Message resultMsg) {
                WebView popup = new WebView(MainActivity.this);
                WebViewSupport.configure(popup, false);
                popup.setWebViewClient(new WebViewClientCompat() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView popupView, WebResourceRequest request) {
                        openPopupUrl(request.getUrl().toString());
                        popupView.destroy();
                        return true;
                    }

                    @Override
                    public boolean shouldOverrideUrlLoading(WebView popupView, String url) {
                        openPopupUrl(url);
                        popupView.destroy();
                        return true;
                    }

                    @Override
                    public void onSafeBrowsingHit(
                        WebView popupView,
                        WebResourceRequest request,
                        int threatType,
                        SafeBrowsingResponseCompat response
                    ) {
                        if (!WebViewSupport.backToSafety(MainActivity.this, response)) {
                            super.onSafeBrowsingHit(
                                popupView,
                                request,
                                threatType,
                                response
                            );
                        }
                    }
                });
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(popup);
                resultMsg.sendToTarget();
                return true;
            }
        });

        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) ->
            WebViewSupport.download(this, url, userAgent, contentDisposition, mimeType)
        );
    }

    private void configureTrustedWebMessages() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            return;
        }
        WebViewCompat.addWebMessageListener(
            webView,
            "LightNoteAndroid",
            WebViewSupport.trustedWebMessageOrigins(),
            (view, message, sourceOrigin, isMainFrame, replyProxy) -> {
                if (!isMainFrame) {
                    return;
                }
                handleTrustedWebMessage(view, message);
            }
        );
    }

    private void handleTrustedWebMessage(WebView sourceView, WebMessageCompat message) {
        try {
            JSONObject payload = new JSONObject(message.getData());
            String messageType = payload.optString("type");
            if ("download".equals(messageType)) {
                String url = payload.optString("url");
                String fileName = payload.optString("fileName");
                runOnUiThread(() ->
                    WebViewSupport.download(
                        MainActivity.this,
                        url,
                        sourceView.getSettings().getUserAgentString(),
                        null,
                        null,
                        fileName
                    )
                );
            } else if ("privacyConsent.withdraw".equals(messageType)) {
                runOnUiThread(this::restartForPrivacyConsent);
            } else if ("legal.open".equals(messageType)) {
                String document = payload.optString("document");
                if (LegalDocuments.PRIVACY_POLICY_FILE.equals(document)) {
                    runOnUiThread(() ->
                        LegalDocumentActivity.open(
                            MainActivity.this,
                            document,
                            R.string.privacy_policy
                        )
                    );
                } else if (LegalDocuments.USER_AGREEMENT_FILE.equals(document)) {
                    runOnUiThread(() ->
                        LegalDocumentActivity.open(
                            MainActivity.this,
                            document,
                            R.string.user_agreement
                        )
                    );
                }
            } else if ("app.ready".equals(messageType)) {
                runOnUiThread(this::hideLaunchOverlay);
            } else if ("theme.changed".equals(messageType)) {
                String theme = payload.optString("theme");
                runOnUiThread(() -> applyWebTheme(theme));
            }
        } catch (JSONException error) {
            // 受信页面发来的未知/损坏消息不执行任何原生操作。
        }
    }

    private void restartForPrivacyConsent() {
        PrivacyConsentStore.clear(this);
        Intent intent = new Intent(this, PrivacyConsentActivity.class);
        intent.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK
        );
        startActivity(intent);
        finish();
    }

    private void syncWebTheme(WebView sourceView, String url) {
        if (!WebViewSupport.isLightNoteUrl(url)) {
            return;
        }
        sourceView.evaluateJavascript(THEME_OBSERVER_SCRIPT, result -> {
            if ("\"night\"".equals(result)) {
                applyWebTheme("night");
            } else if ("\"day\"".equals(result)) {
                applyWebTheme("day");
            }
        });
    }

    private void applyWebTheme(String theme) {
        if (!"day".equals(theme) && !"night".equals(theme)) {
            return;
        }
        resolvedNightTheme = "night".equals(theme);
        applyFileChooserOverlayTheme();
        applyBackToDesktopHintTheme();
        if (launchOverlayHidden) {
            applyResolvedWebTheme();
        }
    }

    private void applyResolvedWebTheme() {
        int backgroundColor = getColor(
            resolvedNightTheme
                ? R.color.system_bar_night
                : R.color.system_bar_day
        );
        if (rootView != null) {
            rootView.setBackgroundColor(backgroundColor);
        }
        if (webView != null) {
            webView.setBackgroundColor(backgroundColor);
        }
        if (statusBarBackground != null && rootView != null) {
            WindowInsetsSupport.applySystemBarTheme(
                this,
                rootView,
                statusBarBackground,
                resolvedNightTheme
            );
        }
    }

    private boolean routeMainUrl(String url) {
        if (WebViewSupport.isLightNoteUrl(url) || WebViewSupport.isGitHubUrl(url)) {
            return false;
        }
        if (WebViewSupport.isHttpUrl(url)) {
            WebViewSupport.openInAppBrowser(this, url);
            return true;
        }
        return WebViewSupport.openSystemIntent(this, url);
    }

    private void openPopupUrl(String url) {
        if (WebViewSupport.isLightNoteUrl(url)) {
            webView.loadUrl(url);
        } else if (WebViewSupport.isHttpUrl(url)) {
            WebViewSupport.openInAppBrowser(this, url);
        } else {
            WebViewSupport.openSystemIntent(this, url);
        }
    }

    private boolean openFileChooser(ValueCallback<Uri[]> callback, WebChromeClient.FileChooserParams params) {
        cancelPendingFileChooserLaunch();
        if (fileCallback != null) {
            fileCallback.onReceiveValue(null);
        }
        fileCallback = callback;
        showFileChooserOverlay(R.string.file_chooser_opening);

        Intent fileIntent;
        try {
            fileIntent = params.createIntent();
        } catch (Exception error) {
            fileIntent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            fileIntent.addCategory(Intent.CATEGORY_OPENABLE);
            fileIntent.setType("*/*");
        }
        fileIntent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE);

        Intent chooser = Intent.createChooser(fileIntent, getString(R.string.app_name));
        Intent cameraIntent = createCameraIntent();
        if (cameraIntent != null && acceptsImages(params.getAcceptTypes())) {
            chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{cameraIntent});
        }

        pendingFileChooserLaunch = () -> {
            pendingFileChooserLaunch = null;
            if (fileCallback != callback || isFinishing() || isDestroyed()) {
                return;
            }
            try {
                startActivityForResult(chooser, FILE_CHOOSER_REQUEST);
            } catch (Exception error) {
                callback.onReceiveValue(null);
                if (fileCallback == callback) {
                    fileCallback = null;
                }
                cameraOutputUri = null;
                hideFileChooserOverlay();
                Toast.makeText(this, R.string.cannot_open_link, Toast.LENGTH_SHORT).show();
            }
        };
        rootView.postDelayed(pendingFileChooserLaunch, FILE_CHOOSER_LAUNCH_DELAY_MS);
        return true;
    }

    private Intent createCameraIntent() {
        Intent cameraIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        if (cameraIntent.resolveActivity(getPackageManager()) == null) {
            return null;
        }
        try {
            File directory = getExternalFilesDir(Environment.DIRECTORY_PICTURES);
            if (directory == null) {
                return null;
            }
            File image = File.createTempFile("light-note-", ".jpg", directory);
            cameraOutputUri = FileProvider.getUriForFile(
                this,
                BuildConfig.APPLICATION_ID + ".files",
                image
            );
            cameraIntent.putExtra(MediaStore.EXTRA_OUTPUT, cameraOutputUri);
            cameraIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            return cameraIntent;
        } catch (IOException error) {
            cameraOutputUri = null;
            return null;
        }
    }

    private boolean acceptsImages(String[] acceptTypes) {
        if (acceptTypes == null || acceptTypes.length == 0) {
            return true;
        }
        for (String type : acceptTypes) {
            if (WebViewSupport.isBlank(type) || "*/*".equals(type) || type.startsWith("image/")) {
                return true;
            }
        }
        return false;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST) {
            return;
        }
        cancelPendingFileChooserLaunch();
        if (fileCallback == null) {
            hideFileChooserOverlay();
            return;
        }
        showFileChooserOverlay(
            resultCode == RESULT_OK
                ? R.string.file_chooser_processing
                : R.string.file_chooser_returning
        );

        Uri[] result = null;
        if (resultCode == RESULT_OK) {
            if (data == null || (data.getData() == null && data.getClipData() == null)) {
                if (cameraOutputUri != null) {
                    result = new Uri[]{cameraOutputUri};
                }
            } else if (data.getClipData() != null) {
                ClipData clipData = data.getClipData();
                result = new Uri[clipData.getItemCount()];
                for (int index = 0; index < clipData.getItemCount(); index += 1) {
                    result[index] = clipData.getItemAt(index).getUri();
                }
            } else if (data.getData() != null) {
                result = new Uri[]{data.getData()};
            }
        }

        fileCallback.onReceiveValue(result);
        fileCallback = null;
        cameraOutputUri = null;
        hideFileChooserOverlayWhenWebViewReady();
    }

    private void showFileChooserOverlay(int statusTextResource) {
        if (fileChooserOverlay == null) {
            return;
        }
        applyFileChooserOverlayTheme();
        WindowInsetsSupport.applySystemBarTheme(
            this,
            rootView,
            statusBarBackground,
            resolvedNightTheme
        );
        fileChooserOverlay.removeCallbacks(fileChooserReadyFallback);
        fileChooserOverlay.animate().cancel();
        fileChooserOverlay.setAlpha(1f);
        fileChooserOverlay.setVisibility(View.VISIBLE);
        fileChooserOverlay.bringToFront();
        fileChooserStatusView.setText(statusTextResource);
    }

    private void hideFileChooserOverlayWhenWebViewReady() {
        if (fileChooserOverlay == null || webView == null) {
            hideFileChooserOverlay();
            return;
        }
        fileChooserOverlay.removeCallbacks(fileChooserReadyFallback);
        fileChooserOverlay.postDelayed(
            fileChooserReadyFallback,
            FILE_CHOOSER_READY_FALLBACK_MS
        );
        webView.postVisualStateCallback(
            System.nanoTime(),
            new WebView.VisualStateCallback() {
                @Override
                public void onComplete(long requestId) {
                    fileChooserOverlay.postDelayed(
                        MainActivity.this::hideFileChooserOverlay,
                        220
                    );
                }
            }
        );
    }

    private void hideFileChooserOverlay() {
        if (
            fileChooserOverlay == null
                || fileChooserOverlay.getVisibility() != View.VISIBLE
        ) {
            return;
        }
        fileChooserOverlay.removeCallbacks(fileChooserReadyFallback);
        fileChooserOverlay.animate()
            .alpha(0f)
            .setDuration(140)
            .withEndAction(() -> {
                fileChooserOverlay.setVisibility(View.GONE);
                fileChooserOverlay.setAlpha(1f);
                applyResolvedWebTheme();
            })
            .start();
    }

    private int getFileChooserBackgroundColor() {
        return getColor(
            resolvedNightTheme
                ? R.color.file_chooser_background_night
                : R.color.file_chooser_background_day
        );
    }

    private int getFileChooserTextColor() {
        return getColor(
            resolvedNightTheme
                ? R.color.file_chooser_text_night
                : R.color.file_chooser_text_day
        );
    }

    private void applyFileChooserOverlayTheme() {
        if (fileChooserOverlay != null) {
            fileChooserOverlay.setBackgroundColor(getFileChooserBackgroundColor());
        }
        if (fileChooserStatusView != null) {
            fileChooserStatusView.setTextColor(getFileChooserTextColor());
        }
        if (fileChooserProgressView != null) {
            fileChooserProgressView.setIndeterminateTintList(
                getColorStateList(R.color.brand_primary)
            );
        }
    }

    private void cancelPendingFileChooserLaunch() {
        if (rootView != null && pendingFileChooserLaunch != null) {
            rootView.removeCallbacks(pendingFileChooserLaunch);
        }
        pendingFileChooserLaunch = null;
    }

    private void showLoadError() {
        unsupportedWebView = false;
        errorTitleView.setText(R.string.network_error_title);
        errorMessageView.setText(R.string.network_error_message);
        errorActionButton.setText(R.string.retry);
        hideLaunchOverlay();
        errorView.setVisibility(View.VISIBLE);
    }

    private void showUnsupportedWebView() {
        unsupportedWebView = true;
        errorTitleView.setText(R.string.webview_too_old_title);
        errorMessageView.setText(R.string.webview_too_old_message);
        errorActionButton.setText(R.string.close_app);
        hideLaunchOverlay();
        errorView.setVisibility(View.VISIBLE);
    }

    private void hideLaunchOverlay() {
        if (
            launchOverlayHidden
                || launchOverlay == null
                || launchOverlay.getVisibility() != View.VISIBLE
        ) {
            return;
        }
        launchOverlayHidden = true;
        launchOverlay.removeCallbacks(launchTimeout);
        launchOverlay.removeCallbacks(webAppReadyFallback);
        launchOverlay.animate()
            .alpha(0f)
            .setDuration(180)
            .withEndAction(() -> {
                launchOverlay.setVisibility(View.GONE);
                launchOverlay.setAlpha(1f);
                applyResolvedWebTheme();
            })
            .start();
    }

    private void scheduleLaunchFallback() {
        if (
            launchOverlayHidden
                || launchOverlay == null
                || launchOverlay.getVisibility() != View.VISIBLE
        ) {
            return;
        }
        // 兼容尚未包含 app.ready 通知的旧网页缓存和旧部署版本。
        // 新网页会在首个路由页面完成绘制后立即通过受信通道撤掉封面。
        launchOverlay.removeCallbacks(webAppReadyFallback);
        launchOverlay.postDelayed(
            webAppReadyFallback,
            WEB_APP_READY_FALLBACK_MS
        );
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        handleBackNavigation();
    }

    private void handleBackNavigation() {
        if (backNavigationPending) {
            return;
        }
        if (unsupportedWebView) {
            finish();
        } else if (errorView.getVisibility() == View.VISIBLE) {
            errorView.setVisibility(View.GONE);
            webView.loadUrl(WebViewSupport.HOME_URL);
        } else {
            backNavigationPending = true;
            webView.evaluateJavascript(
                "(function(){try{return Boolean(window.history.state&&window.history.state.__lnMobileOverlayId)?'overlay':document.documentElement.dataset.lightNotePrimaryRoot==='true'?'root':'page';}catch(error){return 'page';}})();",
                state -> {
                    backNavigationPending = false;
                    if ("\"root\"".equals(state)) {
                        confirmMoveTaskToBackground();
                    } else if (webView.canGoBack()) {
                        lastRootBackPressedAt = 0L;
                        hideBackToDesktopHintImmediately();
                        webView.goBack();
                    } else {
                        confirmMoveTaskToBackground();
                    }
                }
            );
        }
    }

    private void confirmMoveTaskToBackground() {
        long now = SystemClock.elapsedRealtime();
        if (lastRootBackPressedAt > 0L
            && now - lastRootBackPressedAt <= BACK_TO_DESKTOP_CONFIRM_WINDOW_MS) {
            lastRootBackPressedAt = 0L;
            hideBackToDesktopHintImmediately();
            // 只把任务移到后台；singleTask 桌面入口会恢复同一实例和 WebView 状态。
            moveTaskToBack(true);
            return;
        }
        lastRootBackPressedAt = now;
        showBackToDesktopHint();
    }

    @Override
    protected void onDestroy() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && backInvokedCallback != null) {
            getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backInvokedCallback);
            backInvokedCallback = null;
        }
        cancelPendingFileChooserLaunch();
        if (launchOverlay != null) {
            launchOverlay.removeCallbacks(launchTimeout);
            launchOverlay.removeCallbacks(webAppReadyFallback);
        }
        if (fileChooserOverlay != null) {
            fileChooserOverlay.removeCallbacks(fileChooserReadyFallback);
        }
        if (fileCallback != null) {
            fileCallback.onReceiveValue(null);
            fileCallback = null;
        }
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
        }
        super.onDestroy();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
