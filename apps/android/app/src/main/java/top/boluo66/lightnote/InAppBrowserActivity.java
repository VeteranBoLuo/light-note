package top.boluo66.lightnote;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.SslErrorHandler;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

public final class InAppBrowserActivity extends Activity {
    private WebView webView;
    private ProgressBar progressBar;
    private TextView titleView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(97, 92, 237));
        setContentView(createContentView());
        configureWebView();

        String url = getIntent().getStringExtra(WebViewSupport.EXTRA_URL);
        if (!WebViewSupport.isHttpUrl(url)) {
            finish();
            return;
        }
        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(url);
        }
    }

    private View createContentView() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(getColor(R.color.page_background));

        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(8), 0, dp(8), 0);
        toolbar.setBackgroundColor(getColor(R.color.brand_primary));

        TextView back = createToolbarAction(R.string.browser_back);
        back.setOnClickListener(view -> {
            if (webView.canGoBack()) {
                webView.goBack();
            } else {
                finish();
            }
        });
        toolbar.addView(back);

        titleView = new TextView(this);
        titleView.setText(R.string.browser_title);
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(15);
        titleView.setGravity(Gravity.CENTER);
        titleView.setSingleLine(true);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(0, dp(52), 1);
        toolbar.addView(titleView, titleParams);

        TextView close = createToolbarAction(R.string.browser_close);
        close.setOnClickListener(view -> finish());
        toolbar.addView(close);
        root.addView(toolbar, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dp(52)
        ));

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);
        progressBar.setProgressTintList(getColorStateList(R.color.brand_primary));
        root.addView(progressBar, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dp(3)
        ));

        webView = new WebView(this);
        root.addView(webView, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            0,
            1
        ));
        return root;
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

    private void configureWebView() {
        WebViewSupport.configure(webView, false);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (WebViewSupport.isHttpUrl(url)) {
                    return false;
                }
                return WebViewSupport.openSystemIntent(InAppBrowserActivity.this, url);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (WebViewSupport.isHttpUrl(url)) {
                    return false;
                }
                return WebViewSupport.openSystemIntent(InAppBrowserActivity.this, url);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                titleView.setText(WebViewSupport.isBlank(view.getTitle())
                    ? getString(R.string.browser_title)
                    : view.getTitle());
                progressBar.setVisibility(View.GONE);
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, android.net.http.SslError error) {
                handler.cancel();
                Toast.makeText(InAppBrowserActivity.this, R.string.ssl_error, Toast.LENGTH_LONG).show();
            }
        });
        webView.setWebChromeClient(new android.webkit.WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progressBar.setProgress(newProgress);
                progressBar.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
            }
        });
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) ->
            WebViewSupport.download(this, url, userAgent, contentDisposition, mimeType)
        );
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
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
