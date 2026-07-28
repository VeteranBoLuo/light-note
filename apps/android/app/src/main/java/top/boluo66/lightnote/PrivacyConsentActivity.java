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
import android.widget.TextView;
import android.widget.Toast;

public final class PrivacyConsentActivity extends Activity {
    private static final int BUTTON_PRIMARY = 1;
    private static final int BUTTON_TONAL = 2;
    private static final int BUTTON_SECONDARY = 3;

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

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER_HORIZONTAL);
        content.setBackgroundColor(getColor(R.color.page_background));
        content.setPadding(dp(24), dp(18), dp(24), dp(16));
        root.addView(content, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);

        ImageView icon = new ImageView(this);
        icon.setImageResource(R.drawable.ic_brand_tile);
        icon.setScaleType(ImageView.ScaleType.FIT_CENTER);
        icon.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        header.addView(icon, new LinearLayout.LayoutParams(dp(58), dp(58)));

        LinearLayout headerCopy = new LinearLayout(this);
        headerCopy.setOrientation(LinearLayout.VERTICAL);

        TextView title = createText(
            R.string.privacy_consent_title,
            24,
            getColor(R.color.text_primary)
        );
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        title.setIncludeFontPadding(false);
        headerCopy.addView(title);

        TextView reviewBadge = createText(
            R.string.privacy_consent_review_badge,
            13,
            getColor(R.color.brand_primary)
        );
        reviewBadge.setIncludeFontPadding(false);
        headerCopy.addView(reviewBadge, topMarginParams(dp(5)));

        LinearLayout.LayoutParams headerCopyParams = new LinearLayout.LayoutParams(
            0,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            1f
        );
        headerCopyParams.leftMargin = dp(14);
        header.addView(headerCopy, headerCopyParams);
        content.addView(header);

        TextView summary = createText(
            R.string.privacy_consent_summary,
            14,
            getColor(R.color.privacy_text_secondary)
        );
        summary.setGravity(Gravity.START);
        summary.setLineSpacing(dp(2), 1.2f);
        content.addView(summary, matchWidthTopMarginParams(dp(18)));

        LinearLayout points = new LinearLayout(this);
        points.setOrientation(LinearLayout.VERTICAL);
        points.setPadding(dp(16), dp(14), dp(16), dp(14));
        points.setBackground(roundedBackground(
            getColor(R.color.privacy_surface),
            getColor(R.color.privacy_surface_border),
            18,
            1
        ));
        addPrivacyPoint(points, R.string.privacy_point_data, false);
        addPrivacyPoint(points, R.string.privacy_point_permissions, true);
        addPrivacyPoint(points, R.string.privacy_point_third_party, true);
        content.addView(points, matchWidthTopMarginParams(dp(16)));

        LinearLayout documentActions = new LinearLayout(this);
        documentActions.setOrientation(LinearLayout.HORIZONTAL);
        documentActions.setGravity(Gravity.CENTER);

        Button privacyPolicy = createActionButton(
            R.string.privacy_policy,
            BUTTON_TONAL
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
            BUTTON_TONAL
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
        content.addView(documentActions, matchWidthTopMarginParams(dp(14)));

        View flexibleSpace = new View(this);
        content.addView(flexibleSpace, new LinearLayout.LayoutParams(
            dp(1),
            0,
            1f
        ));

        TextView notice = createText(
            R.string.privacy_consent_notice,
            12,
            getColor(R.color.privacy_text_muted)
        );
        notice.setLineSpacing(dp(1), 1.15f);
        content.addView(notice, matchWidthTopMarginParams(dp(12)));

        Button accept = createActionButton(
            R.string.agree_and_continue,
            BUTTON_PRIMARY
        );
        accept.setOnClickListener(view -> {
            PrivacyConsentStore.accept(this);
            openMainExperience();
        });
        content.addView(accept, matchWidthTopMarginParams(dp(20)));

        Button decline = createActionButton(
            R.string.decline_and_exit,
            BUTTON_SECONDARY
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
            content,
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

    private void addPrivacyPoint(
        LinearLayout container,
        int textResource,
        boolean addTopMargin
    ) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.TOP);

        View marker = new View(this);
        marker.setBackground(roundedBackground(
            getColor(R.color.brand_primary),
            getColor(R.color.brand_primary),
            999,
            0
        ));
        LinearLayout.LayoutParams markerParams =
            new LinearLayout.LayoutParams(dp(6), dp(6));
        markerParams.topMargin = dp(7);
        row.addView(marker, markerParams);

        TextView text = createText(
            textResource,
            13,
            getColor(R.color.privacy_text_secondary)
        );
        text.setLineSpacing(dp(1), 1.15f);
        LinearLayout.LayoutParams textParams = new LinearLayout.LayoutParams(
            0,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            1f
        );
        textParams.leftMargin = dp(10);
        row.addView(text, textParams);

        LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        if (addTopMargin) {
            rowParams.topMargin = dp(10);
        }
        container.addView(row, rowParams);
    }

    private Button createActionButton(int textResource, int style) {
        Button button = new Button(this);
        button.setText(textResource);
        button.setTextSize(14);
        button.setAllCaps(false);
        button.setMinHeight(dp(46));
        button.setMinimumHeight(dp(46));
        button.setMinWidth(0);
        button.setMinimumWidth(0);
        button.setPadding(dp(14), dp(8), dp(14), dp(8));
        button.setGravity(Gravity.CENTER);
        button.setStateListAnimator(null);
        button.setElevation(0f);

        boolean primary = style == BUTTON_PRIMARY;
        boolean tonal = style == BUTTON_TONAL;
        int fillColor = primary
            ? getColor(R.color.brand_primary)
            : tonal
                ? getColor(R.color.privacy_tonal)
                : getColor(R.color.privacy_secondary_button);
        int strokeColor = style == BUTTON_SECONDARY
            ? getColor(R.color.privacy_surface_border)
            : fillColor;
        button.setTextColor(
            primary ? Color.WHITE : getColor(R.color.brand_primary)
        );
        button.setBackground(roundedBackground(
            fillColor,
            strokeColor,
            14,
            style == BUTTON_SECONDARY ? 1 : 0
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
