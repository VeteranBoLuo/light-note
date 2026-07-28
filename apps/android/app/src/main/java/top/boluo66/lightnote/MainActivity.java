package top.boluo66.lightnote;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
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

    private WebView webView;
    private ProgressBar progressBar;
    private LinearLayout errorView;
    private TextView errorTitleView;
    private TextView errorMessageView;
    private Button errorActionButton;
    private FrameLayout rootView;
    private FrameLayout launchOverlay;
    private FrameLayout fileChooserOverlay;
    private TextView fileChooserStatusView;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraOutputUri;
    private Runnable pendingFileChooserLaunch;
    private boolean launchOverlayHidden;
    private boolean unsupportedWebView;
    private final Runnable launchTimeout = this::hideLaunchOverlay;
    private final Runnable fileChooserReadyFallback = this::hideFileChooserOverlay;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(createContentView());
        if (WebViewSupport.isUnsupportedWebView(webView)) {
            showUnsupportedWebView();
            return;
        }
        configureWebView();
        launchOverlay.postDelayed(launchTimeout, 10_000);

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(WebViewSupport.HOME_URL);
        }
    }

    private View createContentView() {
        rootView = new FrameLayout(this);
        rootView.setBackgroundColor(getColor(R.color.brand_primary));

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

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);
        progressBar.setProgressTintList(getColorStateList(R.color.brand_primary));
        FrameLayout.LayoutParams progressParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dp(3)
        );
        progressParams.gravity = Gravity.TOP;
        content.addView(progressBar, progressParams);

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

        View statusBarBackground = new View(this);
        statusBarBackground.setBackgroundColor(getColor(R.color.brand_primary));
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
        WindowInsetsSupport.apply(
            this,
            rootView,
            content,
            statusBarBackground
        );
        return rootView;
    }

    private FrameLayout createLaunchOverlay() {
        FrameLayout overlay = new FrameLayout(this);
        overlay.setBackgroundColor(getColor(R.color.brand_primary));
        overlay.setClickable(true);

        LinearLayout center = new LinearLayout(this);
        center.setOrientation(LinearLayout.VERTICAL);
        center.setGravity(Gravity.CENTER);

        ImageView icon = new ImageView(this);
        // 启动页只展示透明品牌前景。自适应桌面图标还包含一层方形背景，
        // 部分鸿蒙 Android 兼容层在普通 ImageView 中不会套用启动器蒙版，会露出方角。
        icon.setImageResource(R.drawable.ic_launcher_foreground);
        icon.setScaleType(ImageView.ScaleType.FIT_CENTER);
        center.addView(icon, new LinearLayout.LayoutParams(dp(96), dp(96)));

        TextView appName = new TextView(this);
        appName.setText(R.string.app_name);
        appName.setTextColor(Color.WHITE);
        appName.setTextSize(22);
        appName.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams appNameParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        appNameParams.topMargin = dp(14);
        center.addView(appName, appNameParams);

        ProgressBar loading = new ProgressBar(this);
        loading.setIndeterminateTintList(getColorStateList(android.R.color.white));
        LinearLayout.LayoutParams loadingParams =
            new LinearLayout.LayoutParams(dp(28), dp(28));
        loadingParams.gravity = Gravity.CENTER_HORIZONTAL;
        loadingParams.topMargin = dp(22);
        center.addView(loading, loadingParams);

        FrameLayout.LayoutParams centerParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        centerParams.gravity = Gravity.CENTER;
        overlay.addView(center, centerParams);
        return overlay;
    }

    private FrameLayout createFileChooserOverlay() {
        FrameLayout overlay = new FrameLayout(this);
        overlay.setBackgroundColor(getColor(R.color.brand_primary));
        overlay.setClickable(true);

        LinearLayout center = new LinearLayout(this);
        center.setOrientation(LinearLayout.VERTICAL);
        center.setGravity(Gravity.CENTER);
        center.setPadding(dp(28), dp(28), dp(28), dp(28));

        ProgressBar loading = new ProgressBar(this);
        loading.setIndeterminateTintList(getColorStateList(android.R.color.white));
        LinearLayout.LayoutParams loadingParams =
            new LinearLayout.LayoutParams(dp(36), dp(36));
        loadingParams.gravity = Gravity.CENTER_HORIZONTAL;
        center.addView(loading, loadingParams);

        fileChooserStatusView = new TextView(this);
        fileChooserStatusView.setText(R.string.file_chooser_opening);
        fileChooserStatusView.setTextColor(Color.WHITE);
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
                progressBar.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                hideLaunchOverlay();
                progressBar.setVisibility(View.GONE);
            }

            @Override
            public void onPageCommitVisible(WebView view, String url) {
                hideLaunchOverlay();
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
            public void onProgressChanged(WebView view, int newProgress) {
                progressBar.setProgress(newProgress);
                progressBar.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
            }

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
            })
            .start();
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
        progressBar.setVisibility(View.GONE);
        errorView.setVisibility(View.VISIBLE);
    }

    private void showUnsupportedWebView() {
        unsupportedWebView = true;
        errorTitleView.setText(R.string.webview_too_old_title);
        errorMessageView.setText(R.string.webview_too_old_message);
        errorActionButton.setText(R.string.close_app);
        hideLaunchOverlay();
        progressBar.setVisibility(View.GONE);
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
        launchOverlay.animate()
            .alpha(0f)
            .setDuration(180)
            .withEndAction(() -> {
                launchOverlay.setVisibility(View.GONE);
                launchOverlay.setAlpha(1f);
                if (rootView != null) {
                    rootView.setBackgroundColor(getColor(R.color.page_background));
                }
            })
            .start();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (unsupportedWebView) {
            super.onBackPressed();
        } else if (errorView.getVisibility() == View.VISIBLE) {
            errorView.setVisibility(View.GONE);
            webView.loadUrl(WebViewSupport.HOME_URL);
        } else if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        cancelPendingFileChooserLaunch();
        if (launchOverlay != null) {
            launchOverlay.removeCallbacks(launchTimeout);
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
