package top.boluo66.lightnote;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.webkit.WebView;

/** Only exposes eligibility for optional static downloads, never network identifiers. */
final class PrewarmNetworkSupport {
    private final ConnectivityManager manager;
    private final WebView view;
    private volatile boolean closed;
    private boolean registered;
    private Boolean last;
    private final ConnectivityManager.NetworkCallback callback = new ConnectivityManager.NetworkCallback() {
        @Override public void onAvailable(Network network) { publish(false); }
        @Override public void onLost(Network network) { publish(false); }
        @Override public void onCapabilitiesChanged(Network network, NetworkCapabilities caps) {
            publish(eligible(caps));
        }
    };

    PrewarmNetworkSupport(Context context, WebView view) {
        this.view = view;
        manager = context.getSystemService(ConnectivityManager.class);
        try {
            if (manager != null) {
                manager.registerDefaultNetworkCallback(callback);
                registered = true;
                return; // onCapabilitiesChanged supplies the initial snapshot too.
            }
        } catch (RuntimeException ignored) {}
        publish(false);
    }

    private static boolean eligible(NetworkCapabilities caps) {
        return caps != null
            && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
            && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED);
    }

    private void publish(boolean allowed) {
        view.post(() -> {
            if (closed || !WebViewSupport.isTrustedWebOrigin(view.getUrl())) return;
            if (last != null && last == allowed) return;
            last = allowed;
            view.evaluateJavascript("window.__lightNoteAndroidPrewarmNetwork?.(" + allowed + ")", null);
        });
    }

    void close() {
        closed = true;
        if (registered) {
            try { manager.unregisterNetworkCallback(callback); } catch (RuntimeException ignored) {}
            registered = false;
        }
    }
}
