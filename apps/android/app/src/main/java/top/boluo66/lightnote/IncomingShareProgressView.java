package top.boluo66.lightnote;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

/** 网页尚未就绪也能看到接收进度；只占顶部小块区域，随网页主题同步。 */
final class IncomingShareProgressView extends LinearLayout {
    private final TextView title;
    private final TextView detail;

    IncomingShareProgressView(Context context) {
        super(context);
        setOrientation(HORIZONTAL);
        setGravity(Gravity.CENTER_VERTICAL);
        setPadding(dp(16), dp(12), dp(16), dp(12));
        setVisibility(GONE);
        setClickable(true);
        setElevation(dp(4));

        ProgressBar spinner = new ProgressBar(context);
        spinner.setIndeterminateTintList(ColorStateList.valueOf(context.getColor(R.color.brand_primary)));
        addView(spinner, new LinearLayout.LayoutParams(dp(24), dp(24)));

        LinearLayout text = new LinearLayout(context);
        text.setOrientation(VERTICAL);
        LinearLayout.LayoutParams textParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        textParams.leftMargin = dp(12);
        addView(text, textParams);
        title = new TextView(context);
        title.setText(R.string.share_receiving);
        title.setTextSize(15);
        title.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        text.addView(title);
        detail = new TextView(context);
        detail.setTextSize(13);
        text.addView(detail);

        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP);
        params.setMargins(dp(16), dp(12), dp(16), 0);
        setLayoutParams(params);
        ViewCompat.setOnApplyWindowInsetsListener(this, (view, windowInsets) -> {
            Insets safeArea = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            FrameLayout.LayoutParams layout = (FrameLayout.LayoutParams) getLayoutParams();
            layout.setMargins(safeArea.left + dp(16), safeArea.top + dp(12), safeArea.right + dp(16), 0);
            setLayoutParams(layout);
            return windowInsets;
        });
    }

    void showProgress(IncomingShareStore.Progress progress) {
        if (progress.result != null) {
            setVisibility(GONE);
            return;
        }
        detail.setText(progress.total > 0
            ? getContext().getString(R.string.share_receiving_files, progress.processed, progress.total)
            : getContext().getString(R.string.share_receiving_content));
        boolean opening = getVisibility() != VISIBLE;
        setVisibility(VISIBLE);
        bringToFront();
        if (opening) announceForAccessibility(title.getText());
    }

    void applyTheme(boolean night) {
        int textColor = getContext().getColor(night ? R.color.file_chooser_text_night : R.color.file_chooser_text_day);
        title.setTextColor(textColor);
        detail.setTextColor(textColor);
        GradientDrawable background = new GradientDrawable();
        background.setColor(getContext().getColor(night ? R.color.back_hint_background_night : R.color.back_hint_background_day));
        background.setCornerRadius(dp(12));
        background.setStroke(dp(1), getContext().getColor(R.color.brand_primary));
        setBackground(background);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
