import { computed, onBeforeUnmount, onMounted, watch, type ComputedRef, type Ref } from 'vue';
import { useCommunityChatSocket, type CommunityChatRealtimeEvent } from './useCommunityChatSocket';
import { useCommunityChatUnread } from './useCommunityChatUnread';

type ReadonlyStringRef = Readonly<Ref<string>> | ComputedRef<string>;
type ReadonlyBooleanRef = Readonly<Ref<boolean>> | ComputedRef<boolean>;

export interface UseCommunityChatUnreadRuntimeOptions {
  userId: ReadonlyStringRef;
  userRole: ReadonlyStringRef;
  realtimeActive: ReadonlyBooleanRef;
}

const FALLBACK_REFRESH_INTERVAL_MS = 60_000;
const REALTIME_REFRESH_DEBOUNCE_MS = 25;

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
  const authenticated = computed(() => Boolean(options.userId.value) && options.userRole.value !== 'visitor');
  const roomSlug = computed(() => unread.rooms.value[0]?.slug || 'general');
  const socketEnabled = computed(
    () => options.realtimeActive.value && unread.realtimeAvailable.value && Boolean(roomSlug.value),
  );
  const identityKey = computed(() => `${options.userId.value || 'guest'}:${options.userRole.value || 'visitor'}`);
  let mounted = false;
  let realtimeRefreshTimer: number | undefined;
  let fallbackRefreshTimer: number | undefined;

  function clearRealtimeRefreshTimer() {
    if (realtimeRefreshTimer !== undefined) window.clearTimeout(realtimeRefreshTimer);
    realtimeRefreshTimer = undefined;
  }

  function refreshNow({ afterCurrent = false } = {}) {
    // 聊天室页面由 Workspace 的实时连接和目录刷新维护状态，
    // 根层角标运行时不应再发起一组重复 REST 请求。
    if (!options.realtimeActive.value) return;
    void unread.refresh({ afterCurrent });
  }

  function scheduleAuthoritativeRefresh() {
    if (!options.realtimeActive.value || !authenticated.value || realtimeRefreshTimer !== undefined) return;
    realtimeRefreshTimer = window.setTimeout(() => {
      realtimeRefreshTimer = undefined;
      refreshNow({ afterCurrent: true });
    }, REALTIME_REFRESH_DEBOUNCE_MS);
  }

  function handleRealtimeEvent(event: CommunityChatRealtimeEvent) {
    if (!authenticated.value) return;
    // 点赞等互动不会改变未读数，避免公共房间每次点赞都让所有在线用户请求目录。
    if (event.type === 'message.updated' && event.payload.reason !== 'recall') return;
    scheduleAuthoritativeRefresh();
  }

  const socket = useCommunityChatSocket({
    enabled: socketEnabled,
    roomSlug,
    identityKey,
    onEvent: handleRealtimeEvent,
    // 断线期间可能漏过事件；重新订阅成功后必须用 REST 补齐权威角标。
    onSynchronized: () => {
      if (authenticated.value) refreshNow({ afterCurrent: true });
    },
  });

  watch(
    [options.userId, options.userRole],
    () => {
      clearRealtimeRefreshTimer();
      unread.reset();
      if (mounted) refreshNow();
    },
    { flush: 'post' },
  );

  watch(
    options.realtimeActive,
    (active) => {
      clearRealtimeRefreshTimer();
      if (mounted && active) refreshNow();
    },
    { flush: 'post' },
  );

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') refreshNow();
  }

  onMounted(() => {
    mounted = true;
    if (options.realtimeActive.value) refreshNow();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    fallbackRefreshTimer = window.setInterval(() => {
      // 游客没有未读状态，首次读取开放策略后由 WebSocket 自身负责在线状态；
      // 只有登录账号需要用低频 REST 覆盖断线期间可能遗漏的角标变化。
      if (options.realtimeActive.value && authenticated.value && document.visibilityState === 'visible') refreshNow();
    }, FALLBACK_REFRESH_INTERVAL_MS);
  });

  onBeforeUnmount(() => {
    mounted = false;
    clearRealtimeRefreshTimer();
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
