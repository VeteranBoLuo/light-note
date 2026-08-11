package top.boluo66.lightnote;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.service.notification.StatusBarNotification;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

final class NativeNotificationManager {
    private static final String GENERAL_BADGE_CHANNEL = "light_note_general_badge_v1";
    private static final String GENERAL_NO_BADGE_CHANNEL = "light_note_general_no_badge_v1";
    private static final String CHAT_CHANNEL = "light_note_chat_targeted_v1";
    private static final int GENERAL_NOTIFICATION_ID = 41_001;

    private final Context context;
    private final NotificationManagerCompat manager;
    private boolean enabled = true;
    private String lastGeneralChannel;

    NativeNotificationManager(Context context) {
        this.context = context.getApplicationContext();
        this.manager = NotificationManagerCompat.from(context);
        createChannels();
    }

    private void createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager systemManager = context.getSystemService(NotificationManager.class);
        if (systemManager == null) return;

        NotificationChannel generalBadge = new NotificationChannel(
            GENERAL_BADGE_CHANNEL,
            context.getString(R.string.notification_channel_general),
            NotificationManager.IMPORTANCE_DEFAULT
        );
        generalBadge.setDescription(context.getString(R.string.notification_channel_general_description));
        generalBadge.setShowBadge(true);
        systemManager.createNotificationChannel(generalBadge);

        NotificationChannel generalNoBadge = new NotificationChannel(
            GENERAL_NO_BADGE_CHANNEL,
            context.getString(R.string.notification_channel_general_no_badge),
            NotificationManager.IMPORTANCE_DEFAULT
        );
        generalNoBadge.setDescription(context.getString(R.string.notification_channel_general_description));
        generalNoBadge.setShowBadge(false);
        systemManager.createNotificationChannel(generalNoBadge);

        NotificationChannel chat = new NotificationChannel(
            CHAT_CHANNEL,
            context.getString(R.string.notification_channel_chat),
            NotificationManager.IMPORTANCE_DEFAULT
        );
        chat.setDescription(context.getString(R.string.notification_channel_chat_description));
        // 聊天室定向提醒只进通知栏，永远不参与桌面 App 图标数字角标。
        chat.setShowBadge(false);
        systemManager.createNotificationChannel(chat);
    }

    void configure(boolean enabled) {
        this.enabled = enabled;
        if (!enabled) clearAll();
    }

    void syncGeneral(int unreadCount, String title, String content, String path, boolean badgeEnabled, boolean alert) {
        if (!enabled || unreadCount <= 0) {
            manager.cancel(GENERAL_NOTIFICATION_ID);
            lastGeneralChannel = null;
            return;
        }
        if (!canPostNotifications()) return;
        String channelId = badgeEnabled ? GENERAL_BADGE_CHANNEL : GENERAL_NO_BADGE_CHANNEL;
        // Android 不允许同一个活动通知原地切换 channel；只有角标偏好改变时才取消重建，
        // 普通未读数同步始终原地更新，避免桌面角标闪烁和重复响铃。
        if (lastGeneralChannel != null && !lastGeneralChannel.equals(channelId)) {
            manager.cancel(GENERAL_NOTIFICATION_ID);
        }
        lastGeneralChannel = channelId;
        String body = nonEmpty(content, context.getString(R.string.notification_unread_count, unreadCount));
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(nonEmpty(title, context.getString(R.string.notification_default_title)))
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(contentIntent(path, GENERAL_NOTIFICATION_ID))
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setNumber(unreadCount)
            .setBadgeIconType(NotificationCompat.BADGE_ICON_SMALL)
            .setOnlyAlertOnce(!alert)
            // 首次基线、跨端已读和轮询补偿只校准通知与角标，绝不能被当成一条“新通知”响铃。
            .setSilent(!alert);
        if (unreadCount > 1) builder.setSubText(context.getString(R.string.notification_unread_count, unreadCount));
        notifySafely(GENERAL_NOTIFICATION_ID, builder.build());
    }

    void postChat(String externalId, String title, String content, String path) {
        if (!enabled || isEmpty(externalId) || !canPostNotifications()) return;
        int notificationId = chatNotificationId(externalId);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHAT_CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(nonEmpty(title, context.getString(R.string.notification_chat_title)))
            .setContentText(nonEmpty(content, ""))
            .setStyle(new NotificationCompat.BigTextStyle().bigText(nonEmpty(content, "")))
            .setContentIntent(contentIntent(path, notificationId))
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setNumber(0)
            .setBadgeIconType(NotificationCompat.BADGE_ICON_NONE);
        notifySafely(notificationId, builder.build());
    }

    void cancelChat(String externalId) {
        if (isEmpty(externalId)) return;
        manager.cancel(chatNotificationId(externalId));
    }

    void clearChat() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
        NotificationManager systemManager = context.getSystemService(NotificationManager.class);
        if (systemManager == null) return;
        for (StatusBarNotification active : systemManager.getActiveNotifications()) {
            if (CHAT_CHANNEL.equals(active.getNotification().getChannelId())) {
                systemManager.cancel(active.getTag(), active.getId());
            }
        }
    }

    void clearAll() {
        manager.cancel(GENERAL_NOTIFICATION_ID);
        manager.cancelAll();
        lastGeneralChannel = null;
    }

    private PendingIntent contentIntent(String path, int requestCode) {
        Intent intent = new Intent(context, MainActivity.class)
            .setAction("top.boluo66.lightnote.OPEN_NOTIFICATION")
            .putExtra(MainActivity.EXTRA_NOTIFICATION_PATH, safePath(path))
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private boolean canPostNotifications() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
            || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
    }

    @SuppressLint("MissingPermission")
    private void notifySafely(int notificationId, Notification notification) {
        if (!canPostNotifications()) return;
        try {
            manager.notify(notificationId, notification);
        } catch (SecurityException ignored) {
            // 权限可能在检查后、实际投递前被系统或用户撤销；原生提醒是附加能力，静默降级即可。
        }
    }

    private static String safePath(String path) {
        String value = path == null ? "" : path.trim();
        return value.startsWith("/") && !value.startsWith("//") && value.length() <= 2048 ? value : "/notifications";
    }

    private static int chatNotificationId(String externalId) {
        return 50_000 + Math.floorMod(externalId.hashCode(), 900_000);
    }

    private static String nonEmpty(String value, String fallback) {
        return isEmpty(value) ? fallback : value;
    }

    private static boolean isEmpty(String value) {
        return value == null || value.trim().isEmpty();
    }
}
