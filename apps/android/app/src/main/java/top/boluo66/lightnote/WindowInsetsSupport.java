package top.boluo66.lightnote;

import android.app.Activity;
import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Build;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

final class WindowInsetsSupport {
    private WindowInsetsSupport() {
    }

    static void apply(
        Activity activity,
        View root,
        View content,
        View statusBarBackground
    ) {
        Window window = activity.getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        }

        ViewCompat.setOnApplyWindowInsetsListener(root, (view, windowInsets) -> {
            Insets safeArea = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars()
                    | WindowInsetsCompat.Type.displayCutout()
            );
            Insets keyboard = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
            int bottomInset = Math.max(safeArea.bottom, keyboard.bottom);

            updateMargins(
                content,
                safeArea.left,
                safeArea.top,
                safeArea.right,
                bottomInset
            );
            updateStatusBarHeight(statusBarBackground, safeArea.top);
            return windowInsets;
        });
        root.post(() -> {
            applySystemBarTheme(
                activity,
                root,
                statusBarBackground,
                isNightMode(activity)
            );
            ViewCompat.requestApplyInsets(root);
        });
    }

    static boolean isNightMode(Activity activity) {
        int nightMode = activity.getResources().getConfiguration().uiMode
            & Configuration.UI_MODE_NIGHT_MASK;
        return nightMode == Configuration.UI_MODE_NIGHT_YES;
    }

    static void applySystemBarTheme(
        Activity activity,
        View root,
        View statusBarBackground,
        boolean isNight
    ) {
        int backgroundColor = activity.getColor(
            isNight ? R.color.system_bar_night : R.color.system_bar_day
        );
        statusBarBackground.setBackgroundColor(backgroundColor);

        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(activity.getWindow(), root);
        controller.setAppearanceLightStatusBars(!isNight);
        controller.setAppearanceLightNavigationBars(!isNight);
    }

    private static void updateMargins(
        View view,
        int left,
        int top,
        int right,
        int bottom
    ) {
        ViewGroup.LayoutParams rawParams = view.getLayoutParams();
        if (!(rawParams instanceof ViewGroup.MarginLayoutParams)) {
            return;
        }
        ViewGroup.MarginLayoutParams params = (ViewGroup.MarginLayoutParams) rawParams;
        if (
            params.leftMargin == left
                && params.topMargin == top
                && params.rightMargin == right
                && params.bottomMargin == bottom
        ) {
            return;
        }
        params.setMargins(left, top, right, bottom);
        view.setLayoutParams(params);
    }

    private static void updateStatusBarHeight(View statusBarBackground, int height) {
        ViewGroup.LayoutParams params = statusBarBackground.getLayoutParams();
        if (params.height == height) {
            return;
        }
        params.height = height;
        statusBarBackground.setLayoutParams(params);
    }
}
