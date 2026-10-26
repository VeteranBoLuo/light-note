import { computed, onBeforeUnmount, onMounted, watch, type ComputedRef, type Ref } from 'vue';
import { useCommunityChatSocket, type CommunityChatRealtimeEvent } from './useCommunityChatSocket';
import { useCommunityChatUnread } from './useCommunityChatUnread';

type ReadonlyStringRef = Readonly<Ref<string>> | ComputedRef<string>;
type ReadonlyBooleanRef = Readonly<Ref<boolean>> | ComputedRef<boolean>;

export interface UseCommunityChatUnreadRuntimeOptions {
  userId: ReadonlyStringRef;
  userRole: ReadonlyStringRef;
  realtimeActive: ReadonlyBooleanRef;
  previewContextId?: ReadonlyStringRef;
}

const FALLBACK_REFRESH_INTERVAL_MS = 60_000;
const REALTIME_REFRESH_DEBOUNCE_MS = 25;
const PASSIVE_REFRESH_MIN_INTERVAL_MS = 1_000;

/**
 * 应用级聊天室角标与全项目在线状态运行时。
 *
 * 聊天页面自己的连接负责消息列表；其余页面由这里维持唯一的公共房间订阅，
 * 收到事件后再读取服务端权威目录。不能在客户端直接 +1，因为是否产生角标
 * 取决于每个账号的「关闭 / 仅管理员 / 仅提及 / 管理员和提及 / 全部消息」设置。
 * 游客也会维持同一条轻量连接用于项目在线人数，但不会产生未读或额外刷新消息目录。
 */
export function useCommunityChatUnreadRuntime(options: UseCommunityChatUnreadRuntimeOptions) {
  const unread = useCommunityChatUnread();
  const previewContext = computed(() => options.previewContextId?.value || '');
  const active = computed(() => options.realtimeActive.value && !previewContext.value);
  const authenticated = computed(() => Boolean(options.userId.value) && options.userRole.value !== 'visitor');
  const roomSlug = computed(() => unread.rooms.value[0]?.slug || 'general');
  const socketEnabled = computed(() => active.value && unread.realtimeAvailable.value && Boolean(roomSlug.value));
  const identityKey = computed(() => `${options.userId.value || 'guest'}:${options.userRole.value || 'visitor'}`);
  let mounted = false;
  let passiveRefreshTimer: number | undefined;
  let fallbackRefreshTimer: number | undefined;
  let lastPassiveRefreshAt = -Infinity;
  let refreshAfterCurrent = false;

  function clearPassiveRefreshTimer() {
    if (passiveRefreshTimer !== undefined) window.clearTimeout(passiveRefreshTimer);
    passiveRefreshTimer = undefined;
    refreshAfterCurrent = false;
  }

  function refreshNow({ afterCurrent = false } = {}) {
    // 聊天室页面由 Workspace 的实时连接和目录刷新维护状态，
    // 根层角标运行时不应再发起一组重复 REST 请求。
    if (!active.value || document.visibilityState !== 'visible') return;
    void unread.refresh({ afterCurrent });
  }

  function schedulePassiveRefresh({ afterCurrent = false, debounceMs = 0 } = {}) {
    if (!active.value || document.visibilityState !== 'visible') return;
    refreshAfterCurrent ||= afterCurrent;
    if (passiveRefreshTimer !== undefined) return;
    // 25ms 合并只覆盖同一小批事件。持续失效信号或重复前台唤醒仍会逐次读取目录，
    // 因此共用最小间隔并保留尾部刷新；请求失败也不能变成高频重试。
    const delay = Math.max(debounceMs, PASSIVE_REFRESH_MIN_INTERVAL_MS - (Date.now() - lastPassiveRefreshAt));
    if (delay > 0) {
      passiveRefreshTimer = window.setTimeout(() => {
        passiveRefreshTimer = undefined;
        schedulePassiveRefresh();
      }, delay);
      return;
    }
    const queuedAfterCurrent = refreshAfterCurrent;
    refreshAfterCurrent = false;
    lastPassiveRefreshAt = Date.now();
    refreshNow({ afterCurrent: queuedAfterCurrent });
  }

  function handleRealtimeEvent(event: CommunityChatRealtimeEvent) {
    if (!authenticated.value) return;
    // 点赞等互动不会改变未读数，避免公共房间每次点赞都让所有在线用户请求目录。
    if (event.type === 'message.updated' && event.payload.reason !== 'recall') return;
    schedulePassiveRefresh({ afterCurrent: true, debounceMs: REALTIME_REFRESH_DEBOUNCE_MS });
  }

  const socket = useCommunityChatSocket({
    enabled: socketEnabled,
    roomSlug,
    identityKey,
    onEvent: handleRealtimeEvent,
    // 断线期间可能漏过事件；重新订阅成功后必须用 REST 补齐权威角标。
    onSynchronized: () => {
      if (authenticated.value) schedulePassiveRefresh({ afterCurrent: true });
    },
  });

  watch(
    [options.userId, options.userRole, previewContext],
    () => {
      clearPassiveRefreshTimer();
      lastPassiveRefreshAt = -Infinity;
      unread.reset();
      if (mounted) refreshNow();
    },
    { flush: 'post' },
  );

  watch(
    active,
    (active) => {
      clearPassiveRefreshTimer();
      if (mounted && active) refreshNow();
    },
    { flush: 'post' },
  );

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') schedulePassiveRefresh();
    else clearPassiveRefreshTimer();
  }

  onMounted(() => {
    mounted = true;
    if (active.value) refreshNow();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    fallbackRefreshTimer = window.setInterval(() => {
      // 游客没有未读状态，首次读取开放策略后由 WebSocket 自身负责在线状态；
      // 只有登录账号需要用低频 REST 覆盖断线期间可能遗漏的角标变化。
      if (authenticated.value) schedulePassiveRefresh();
    }, FALLBACK_REFRESH_INTERVAL_MS);
  });

  onBeforeUnmount(() => {
    mounted = false;
    clearPassiveRefreshTimer();
    if (fallbackRefreshTimer !== undefined) window.clearInterval(fallbackRefreshTimer);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  });

  return {
    status: socket.status,
  };
}

export const __test__ = {
  FALLBACK_REFRESH_INTERVAL_MS,
  REALTIME_REFRESH_DEBOUNCE_MS,
};
