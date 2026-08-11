import { computed, onBeforeUnmount, onMounted, watch } from 'vue';
import notificationApi from '@/api/notificationApi';
import type { NotificationItem } from '@/composables/useNotification';
import { useUserStore } from '@/store';
import {
  cancelAndroidChatNotification,
  clearAndroidChatNotifications,
  clearAndroidNotifications,
  configureAndroidNotifications,
  hasAndroidNativeNotificationCapability,
  isLightNoteAndroidApp,
  onAndroidNotificationPermission,
  postAndroidChatNotification,
  syncAndroidNotifications,
} from '@/utils/androidBridge';

const REALTIME_PATH = '/realtime/notifications';
const FALLBACK_POLL_MS = 30_000;
const SYNC_DEBOUNCE_MS = 80;

function socketUrl(locationLike: Pick<Location, 'href'> = window.location) {
  const url = new URL(REALTIME_PATH, locationLike.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.search = '';
  url.hash = '';
  return url.toString();
}

function responseItems(response: any): NotificationItem[] {
  return Array.isArray(response?.data?.items) ? response.data.items : [];
}

/** Root App 灰度原生通知运行时。浏览器、PC 与普通账号不会建立连接，也不会触碰系统权限。 */
export function useAndroidNativeNotifications() {
  const user = useUserStore();
  const nativeCapable = computed(
    () => isLightNoteAndroidApp() && hasAndroidNativeNotificationCapability(),
  );
  const eligible = computed(
    () =>
      nativeCapable.value &&
      user.role === 'root' &&
      Boolean(user.id) &&
      !user.adminPreview &&
      !user.adminContext,
  );
  const enabled = computed(() => eligible.value && user.preferences.notificationsAndroid !== false);
  const badgeEnabled = computed(() => user.preferences.notificationsAndroidBadge !== false);
  const chatEnabled = computed(() => enabled.value && user.preferences.communityChatAndroidNotifications === true);
  const ordinarySeen = new Set<string>();
  const chatSeen = new Set<string>();
  const postedChat = new Set<string>();
  let baselineReady = false;
  let socket: WebSocket | null = null;
  let reconnectTimer: number | undefined;
  let syncTimer: number | undefined;
  let consistencyTimer: number | undefined;
  let pollTimer: number | undefined;
  let reconnectAttempt = 0;
  let disposed = false;
  let identityInitialized = false;
  let syncing: Promise<void> | null = null;
  let pendingEventDrivenSync = false;
  let disposePermission: (() => void) | null = null;

  function remember(set: Set<string>, ids: string[]) {
    ids.forEach((id) => set.add(id));
    while (set.size > 200) set.delete(set.values().next().value as string);
  }

  async function synchronize({ eventDriven = false } = {}) {
    if (syncing) {
      pendingEventDrivenSync = pendingEventDrivenSync || eventDriven;
      return syncing;
    }
    syncing = (async () => {
      if (!enabled.value) {
        configureAndroidNotifications(false);
        clearAndroidNotifications();
        return;
      }
      configureAndroidNotifications(true);
      const [countResponse, ordinaryResponse, chatResponse] = await Promise.all([
        notificationApi.getUnreadCount({ excludeCommunityChat: true }),
        notificationApi.getNotificationList({ currentPage: 1, pageSize: 20, type: 'all', excludeCommunityChat: true }),
        notificationApi.getNotificationList({ currentPage: 1, pageSize: 50, type: 'community_chat' }),
      ]);
      const ordinaryItems = responseItems(ordinaryResponse).filter((item) => Number(item.isRead || 0) === 0);
      const chatItems = responseItems(chatResponse).filter((item) => Number(item.isRead || 0) === 0);
      const ordinaryIds = ordinaryItems.map((item) => item.id);
      const chatIds = chatItems.map((item) => item.id);
      const unreadCount = Math.max(0, Number(countResponse?.data?.unreadTotal || 0));
      const latestOrdinary = ordinaryItems[0];
      const hasNewOrdinary = baselineReady && ordinaryItems.some((item) => !ordinarySeen.has(item.id));

      syncAndroidNotifications({
        unreadCount,
        title: latestOrdinary?.title || undefined,
        content: latestOrdinary?.content || undefined,
        path: latestOrdinary?.link || '/notifications',
        badgeEnabled: badgeEnabled.value,
        // WebSocket 可能被鸿蒙兼容层短暂挂起；只要基线建立后发现了新 ID，轮询/回前台补偿
        // 同样应提示一次。跨端已读只会减少 ID，不会误触发新通知。
        alert: hasNewOrdinary,
      });

      if (baselineReady && chatEnabled.value) {
        for (const item of [...chatItems].reverse()) {
          if (chatSeen.has(item.id)) continue;
          postAndroidChatNotification({
            notificationId: item.id,
            title: item.title,
            content: item.content,
            path: item.link || '/community-chat',
          });
          postedChat.add(item.id);
        }
      }
      for (const id of [...postedChat]) {
        if (chatIds.includes(id)) continue;
        cancelAndroidChatNotification(id);
        postedChat.delete(id);
      }
      remember(ordinarySeen, ordinaryIds);
      remember(chatSeen, chatIds);
      baselineReady = true;
    })()
      .catch(() => {
        // 原生通知是附加渠道；保留旧角标，下一次实时事件、轮询或回前台继续补偿。
      })
      .finally(() => {
        syncing = null;
        if (pendingEventDrivenSync) {
          pendingEventDrivenSync = false;
          scheduleSync(true);
        }
      });
    return syncing;
  }

  function scheduleSync(eventDriven = false) {
    if (syncTimer !== undefined) window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => {
      syncTimer = undefined;
      void synchronize({ eventDriven });
    }, SYNC_DEBOUNCE_MS);
  }

  function scheduleConsistencySync() {
    if (consistencyTimer !== undefined) window.clearTimeout(consistencyTimer);
    consistencyTimer = window.setTimeout(() => {
      consistencyTimer = undefined;
      // 某些业务通知跟随较长事务提交；第二次只读校准避免实时失效信号早于提交完成。
      scheduleSync(true);
    }, 900);
  }

  function closeSocket() {
    if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
    const current = socket;
    socket = null;
    if (current && (current.readyState === WebSocket.OPEN || current.readyState === WebSocket.CONNECTING)) {
      current.close(1000, 'client_reset');
    }
  }

  function connect() {
    if (disposed || !enabled.value || navigator.onLine === false || typeof WebSocket === 'undefined') return;
    closeSocket();
    const current = new WebSocket(socketUrl());
    socket = current;
    current.onopen = () => {
      reconnectAttempt = 0;
      scheduleSync(false);
    };
    current.onmessage = (message) => {
      try {
        const event = JSON.parse(String(message.data || ''));
        if (event?.protocolVersion === 1 && event?.type === 'notification.changed') {
          scheduleSync(true);
          scheduleConsistencySync();
        }
      } catch {
        // 严格忽略未知服务端消息。
      }
    };
    current.onclose = () => {
      if (socket !== current || disposed || !enabled.value) return;
      socket = null;
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(reconnectAttempt, 5));
      reconnectAttempt += 1;
      reconnectTimer = window.setTimeout(connect, delay);
    };
    current.onerror = () => {};
  }

  function resetIdentity() {
    // 旧 App 壳不认识 notifications.*；完全不发消息，避免 Web 先上线时出现“有设置但无能力”的假入口。
    if (!nativeCapable.value) return;
    // App 首帧的 Pinia 仍是空游客，/me 尚未确认身份。此时清原生通知会让桌面角标先消失、
    // 数秒后又按 Root 权威值重建；等拿到首个真实身份再决定保留或清理。
    if (!identityInitialized && !user.id) return;
    const preserveRootColdStart = !identityInitialized && eligible.value;
    identityInitialized = true;
    baselineReady = false;
    ordinarySeen.clear();
    chatSeen.clear();
    postedChat.clear();
    closeSocket();
    // 账号切换必须先清上一身份的系统通知，随后再按新身份的服务端未读权威值重建。
    if (!preserveRootColdStart) {
      configureAndroidNotifications(false);
      clearAndroidNotifications();
    }
    if (!eligible.value) {
      return;
    }
    configureAndroidNotifications(enabled.value);
    void synchronize();
    if (enabled.value) connect();
  }

  function handleVisibility() {
    if (document.visibilityState === 'visible' && eligible.value) scheduleSync(false);
  }

  onMounted(() => {
    disposePermission = onAndroidNotificationPermission((granted) => {
      if (granted) scheduleSync(false);
    });
    resetIdentity();
    window.addEventListener('online', connect);
    document.addEventListener('visibilitychange', handleVisibility);
    pollTimer = window.setInterval(() => {
      if (eligible.value) void synchronize();
    }, FALLBACK_POLL_MS);
  });

  watch([() => user.id, () => user.role, () => user.adminPreview, () => user.adminContext], resetIdentity);
  watch([enabled, badgeEnabled, chatEnabled], () => {
    if (!eligible.value) return;
    if (!enabled.value) {
      closeSocket();
      configureAndroidNotifications(false);
      clearAndroidNotifications();
      return;
    }
    if (!chatEnabled.value) {
      postedChat.clear();
      clearAndroidChatNotifications();
    }
    configureAndroidNotifications(true);
    scheduleSync(false);
    if (!socket) connect();
  });

  onBeforeUnmount(() => {
    disposed = true;
    closeSocket();
    if (syncTimer !== undefined) window.clearTimeout(syncTimer);
    if (consistencyTimer !== undefined) window.clearTimeout(consistencyTimer);
    if (pollTimer !== undefined) window.clearInterval(pollTimer);
    disposePermission?.();
    window.removeEventListener('online', connect);
    document.removeEventListener('visibilitychange', handleVisibility);
  });

  return { eligible, synchronize };
}

export const __test__ = { FALLBACK_POLL_MS, REALTIME_PATH, SYNC_DEBOUNCE_MS, socketUrl };
