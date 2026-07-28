package top.boluo66.lightnote;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

public final class LegalDocumentActivity extends Activity {
    private static final String EXTRA_DOCUMENT = "legal_document";
    private static final String EXTRA_TITLE = "legal_title";
    private static final String ASSET_ORIGIN = "https://appassets.androidplatform.net";
    private static final String ASSET_PREFIX = "/assets/legal/";

    private WebView webView;
    private TextView titleView;

    static void open(
        Context context,
        String document,
        int titleResource
    ) {
        if (!LegalDocuments.isAllowedDocument(document)) {
            return;
        }
        Intent intent = new Intent(context, LegalDocumentActivity.class);
        intent.putExtra(EXTRA_DOCUMENT, document);
        intent.putExtra(EXTRA_TITLE, titleResource);
        context.startActivity(intent);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String document = getIntent().getStringExtra(EXTRA_DOCUMENT);
        if (!LegalDocuments.isAllowedDocument(document)) {
            Toast.makeText(
                this,
                R.string.legal_document_unavailable,
                Toast.LENGTH_SHORT
            ).show();
            finish();
            return;
        }
        int titleResource = getIntent().getIntExtra(
            EXTRA_TITLE,
            R.string.legal_document_title
        );
        setContentView(createContentView(titleResource));
        configureWebView();
        webView.loadUrl(ASSET_ORIGIN + ASSET_PREFIX + document);
    }

    private View createContentView(int titleResource) {
        FrameLayout outerRoot = new FrameLayout(this);
        outerRoot.setBackgroundColor(getColor(R.color.page_background));

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setBackgroundColor(getColor(R.color.page_background));
        outerRoot.addView(content, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(8), 0, dp(8), 0);
        toolbar.setBackgroundColor(getColor(R.color.brand_primary));

        TextView back = createToolbarAction(R.string.browser_back);
        back.setOnClickListener(view -> {
            if (webView != null && webView.canGoBack()) {
                webView.goBack();
            } else {
                finish();
            }
        });
        toolbar.addView(back);

        titleView = new TextView(this);
        titleView.setText(titleResource);
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(15);
        titleView.setGravity(Gravity.CENTER);
        titleView.setSingleLine(true);
        toolbar.addView(titleView, new LinearLayout.LayoutParams(0, dp(52), 1));

        TextView close = createToolbarAction(R.string.browser_close);
        close.setOnClickListener(view -> finish());
        toolbar.addView(close);
        content.addView(toolbar, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dp(52)
        ));

        webView = new WebView(this);
        content.addView(webView, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            0,
            1
        ));

        View statusBarBackground = new View(this);
        statusBarBackground.setBackgroundColor(getColor(R.color.brand_primary));
        FrameLayout.LayoutParams statusBarParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            0
        );
        statusBarParams.gravity = Gravity.TOP;
        outerRoot.addView(statusBarBackground, statusBarParams);
        WindowInsetsSupport.apply(
            this,
            outerRoot,
            content,
            statusBarBackground
        );
        return outerRoot;
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(false);
        settings.setDomStorageEnabled(false);
        settings.setDatabaseEnabled(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setBlockNetworkLoads(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
            .addPathHandler(
                "/assets/",
                new WebViewAssetLoader.AssetsPathHandler(this)
            )
            .build();
        webView.setWebViewClient(new WebViewClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(
                WebView view,
                WebResourceRequest request
            ) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(
                WebView view,
                WebResourceRequest request
            ) {
                if (isAllowedAssetUrl(request.getUrl())) {
                    return false;
                }
                return WebViewSupport.openSystemIntent(
                    LegalDocumentActivity.this,
                    request.getUrl().toString()
                );
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (isAllowedAssetUrl(Uri.parse(url))) {
                    return false;
                }
                return WebViewSupport.openSystemIntent(
                    LegalDocumentActivity.this,
                    url
                );
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (url.endsWith("/" + LegalDocuments.PRIVACY_POLICY_FILE)) {
                    titleView.setText(R.string.privacy_policy);
                } else if (url.endsWith("/" + LegalDocuments.USER_AGREEMENT_FILE)) {
                    titleView.setText(R.string.user_agreement);
                }
            }
        });
    }

    private boolean isAllowedAssetUrl(Uri uri) {
        return "https".equalsIgnoreCase(uri.getScheme())
            && "appassets.androidplatform.net".equalsIgnoreCase(uri.getHost())
            && uri.getPath() != null
            && uri.getPath().startsWith(ASSET_PREFIX);
    }

    private TextView createToolbarAction(int textResource) {
        TextView action = new TextView(this);
        action.setText(textResource);
        action.setTextColor(Color.WHITE);
        action.setTextSize(15);
        action.setGravity(Gravity.CENTER);
        action.setPadding(dp(12), 0, dp(12), 0);
        action.setMinWidth(dp(64));
        return action;
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
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
