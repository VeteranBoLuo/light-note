package top.boluo66.lightnote;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

public final class PrivacyConsentActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (PrivacyConsentStore.isAccepted(this)) {
            openMainExperience();
            return;
        }
        setContentView(createContentView());
    }

    private View createContentView() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(getColor(R.color.brand_primary));

        ScrollView scrollView = new ScrollView(this);
        scrollView.setFillViewport(true);
        scrollView.setBackgroundColor(getColor(R.color.page_background));
        scrollView.setClipToPadding(false);

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER_HORIZONTAL);
        content.setPadding(dp(28), dp(28), dp(28), dp(32));
        scrollView.addView(content, new ScrollView.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ));
        root.addView(scrollView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        ImageView icon = new ImageView(this);
        icon.setImageResource(R.drawable.ic_launcher_foreground);
        icon.setScaleType(ImageView.ScaleType.FIT_CENTER);
        content.addView(icon, new LinearLayout.LayoutParams(dp(76), dp(76)));

        TextView title = createText(
            R.string.privacy_consent_title,
            24,
            getColor(R.color.text_primary)
        );
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        title.setGravity(Gravity.CENTER);
        content.addView(title, topMarginParams(dp(12)));

        TextView reviewBadge = createText(
            R.string.privacy_consent_review_badge,
            12,
            getColor(R.color.brand_primary)
        );
        reviewBadge.setGravity(Gravity.CENTER);
        reviewBadge.setPadding(dp(10), dp(4), dp(10), dp(4));
        reviewBadge.setBackground(roundedBackground(
            Color.rgb(239, 238, 255),
            getColor(R.color.brand_primary),
            999,
            1
        ));
        content.addView(reviewBadge, topMarginParams(dp(10)));

        TextView summary = createText(
            R.string.privacy_consent_summary,
            15,
            getColor(R.color.text_primary)
        );
        summary.setGravity(Gravity.START);
        summary.setLineSpacing(0f, 1.35f);
        content.addView(summary, matchWidthTopMarginParams(dp(22)));

        TextView points = createText(
            R.string.privacy_consent_points,
            14,
            Color.rgb(75, 79, 92)
        );
        points.setLineSpacing(dp(3), 1.25f);
        points.setPadding(dp(16), dp(14), dp(16), dp(14));
        points.setBackground(roundedBackground(
            Color.rgb(247, 247, 252),
            Color.rgb(226, 227, 235),
            14,
            1
        ));
        content.addView(points, matchWidthTopMarginParams(dp(16)));

        LinearLayout documentActions = new LinearLayout(this);
        documentActions.setOrientation(LinearLayout.HORIZONTAL);
        documentActions.setGravity(Gravity.CENTER);

        Button privacyPolicy = createActionButton(
            R.string.privacy_policy,
            false
        );
        privacyPolicy.setOnClickListener(view ->
            LegalDocumentActivity.open(
                this,
                LegalDocuments.PRIVACY_POLICY_FILE,
                R.string.privacy_policy
            )
        );
        documentActions.addView(privacyPolicy, weightedButtonParams());

        Button userAgreement = createActionButton(
            R.string.user_agreement,
            false
        );
        userAgreement.setOnClickListener(view ->
            LegalDocumentActivity.open(
                this,
                LegalDocuments.USER_AGREEMENT_FILE,
                R.string.user_agreement
            )
        );
        LinearLayout.LayoutParams agreementParams = weightedButtonParams();
        agreementParams.leftMargin = dp(10);
        documentActions.addView(userAgreement, agreementParams);
        content.addView(documentActions, matchWidthTopMarginParams(dp(18)));

        TextView notice = createText(
            R.string.privacy_consent_notice,
            12,
            Color.rgb(101, 105, 118)
        );
        notice.setLineSpacing(0f, 1.25f);
        content.addView(notice, matchWidthTopMarginParams(dp(16)));

        Button accept = createActionButton(
            R.string.agree_and_continue,
            true
        );
        accept.setOnClickListener(view -> {
            PrivacyConsentStore.accept(this);
            openMainExperience();
        });
        content.addView(accept, matchWidthTopMarginParams(dp(20)));

        Button decline = createActionButton(
            R.string.decline_and_exit,
            false
        );
        decline.setOnClickListener(view -> {
            Toast.makeText(
                this,
                R.string.privacy_declined,
                Toast.LENGTH_LONG
            ).show();
            finishAndRemoveTask();
        });
        content.addView(decline, matchWidthTopMarginParams(dp(10)));

        View statusBarBackground = new View(this);
        statusBarBackground.setBackgroundColor(getColor(R.color.brand_primary));
        FrameLayout.LayoutParams statusBarParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            0
        );
        statusBarParams.gravity = Gravity.TOP;
        root.addView(statusBarBackground, statusBarParams);
        WindowInsetsSupport.apply(
            this,
            root,
            scrollView,
            statusBarBackground
        );
        return root;
    }

    private void openMainExperience() {
        Intent intent = new Intent(this, MainActivity.class);
        startActivity(intent);
        finish();
    }

    private TextView createText(int textResource, int sizeSp, int color) {
        TextView view = new TextView(this);
        view.setText(textResource);
        view.setTextSize(sizeSp);
        view.setTextColor(color);
        return view;
    }

    private Button createActionButton(int textResource, boolean primary) {
        Button button = new Button(this);
        button.setText(textResource);
        button.setTextSize(14);
        button.setAllCaps(false);
        button.setMinHeight(dp(48));
        button.setPadding(dp(14), dp(8), dp(14), dp(8));
        button.setTextColor(primary ? Color.WHITE : getColor(R.color.brand_primary));
        button.setBackground(roundedBackground(
            primary ? getColor(R.color.brand_primary) : Color.WHITE,
            getColor(R.color.brand_primary),
            12,
            primary ? 0 : 1
        ));
        return button;
    }

    private GradientDrawable roundedBackground(
        int fillColor,
        int strokeColor,
        int radiusDp,
        int strokeDp
    ) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(fillColor);
        drawable.setCornerRadius(dp(radiusDp));
        if (strokeDp > 0) {
            drawable.setStroke(dp(strokeDp), strokeColor);
        }
        return drawable;
    }

    private LinearLayout.LayoutParams topMarginParams(int topMargin) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        params.topMargin = topMargin;
        return params;
    }

    private LinearLayout.LayoutParams matchWidthTopMarginParams(int topMargin) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        params.topMargin = topMargin;
        return params;
    }

    private LinearLayout.LayoutParams weightedButtonParams() {
        return new LinearLayout.LayoutParams(
            0,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            1f
        );
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
