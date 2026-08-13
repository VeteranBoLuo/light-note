import { computed, onBeforeUnmount, onMounted, ref, watch, type ComputedRef, type Ref } from 'vue';

export const COMMUNITY_CHAT_REALTIME_PROTOCOL_VERSION = 1;
export const COMMUNITY_CHAT_REALTIME_PATH = '/realtime/chat';

export type CommunityChatRealtimeStatus = 'disabled' | 'connecting' | 'connected' | 'reconnecting' | 'fallback';

export interface CommunityChatRealtimeEvent {
  protocolVersion: 1;
  type: 'message.created' | 'message.updated' | 'message.removed' | 'runtime.changed' | 'access.changed';
  eventId: string;
  serverTime: string;
  payload: Record<string, unknown>;
}

export interface CommunityChatOnlineMember {
  alias: string;
  role: 'root' | 'user' | 'visitor' | 'test';
  avatar: string;
  frameId: string;
}

export interface CommunityChatOnlineMembersSnapshot {
  onlineCount: number;
  memberCount: number;
  guestCount: number;
  members: CommunityChatOnlineMember[];
}

interface RealtimeServerEvent {
  protocolVersion: number;
  type: string;
  eventId: string;
  serverTime: string;
  requestId?: string;
  payload: Record<string, unknown>;
}

type ReadonlyStringRef = Readonly<Ref<string>> | ComputedRef<string>;
type ReadonlyBooleanRef = Readonly<Ref<boolean>> | ComputedRef<boolean>;

export interface UseCommunityChatSocketOptions {
  enabled: ReadonlyBooleanRef;
  roomSlug: ReadonlyStringRef;
  identityKey?: ReadonlyStringRef;
  onEvent?: (event: CommunityChatRealtimeEvent) => void | Promise<void>;
  onSynchronized?: () => void | Promise<void>;
  socketFactory?: (url: string) => WebSocket;
  random?: () => number;
}

const BROADCAST_EVENT_TYPES = new Set([
  'message.created',
  'message.updated',
  'message.removed',
  'runtime.changed',
  'access.changed',
]);
const MAX_SEEN_EVENT_IDS = 512;
const MAX_SERVER_EVENT_PAYLOAD_BYTES = 512 * 1024;
const PRESENCE_MEMBERS_REQUEST_TIMEOUT_MS = 8000;
// 与 HTTP 请求的 X-Device-Id 共用同一 localStorage 键，但不引入包含路由等依赖的 common.ts，
// 避免这个应用级轻量连接反向扩大首屏模块依赖。
const PRESENCE_CLIENT_ID_STORAGE_KEY = 'ln_log_device_id';
const PRESENCE_CLIENT_ID_PATTERN = /^[A-Za-z0-9:_-]{12,80}$/;
let fallbackPresenceClientId = '';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function buildCommunityChatSocketUrl(locationLike: Pick<Location, 'href'> = window.location) {
  const url = new URL(COMMUNITY_CHAT_REALTIME_PATH, locationLike.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.search = '';
  url.hash = '';
  return url.toString();
}

export function parseCommunityChatServerEvent(raw: unknown): RealtimeServerEvent | null {
  if (typeof raw !== 'string' || raw.length > MAX_SERVER_EVENT_PAYLOAD_BYTES) return null;
  try {
    const value = JSON.parse(raw);
    if (
      !isPlainObject(value) ||
      typeof value.type !== 'string' ||
      typeof value.eventId !== 'string' ||
      typeof value.serverTime !== 'string' ||
      !isPlainObject(value.payload)
    ) {
      return null;
    }
    return value as unknown as RealtimeServerEvent;
  } catch {
    return null;
  }
}

function subscribeRequestId(random: () => number) {
  return `subscribe:${Date.now().toString(36)}:${Math.floor(random() * 0x7fffffff).toString(36)}`.slice(0, 64);
}

function presenceMembersRequestId(random: () => number) {
  return `presence:${Date.now().toString(36)}:${Math.floor(random() * 0x7fffffff).toString(36)}`.slice(0, 64);
}

function parseOnlineMembersSnapshot(payload: Record<string, unknown>): CommunityChatOnlineMembersSnapshot | null {
  const onlineCount = Number(payload.onlineCount);
  const memberCount = Number(payload.memberCount);
  const guestCount = Number(payload.guestCount);
  if (
    !Number.isInteger(onlineCount) ||
    onlineCount < 0 ||
    !Number.isInteger(memberCount) ||
    memberCount < 0 ||
    !Number.isInteger(guestCount) ||
    guestCount < 0 ||
    !Array.isArray(payload.members) ||
    payload.members.length > 500
  ) {
    return null;
  }
  const members: CommunityChatOnlineMember[] = [];
  for (const item of payload.members) {
    if (!isPlainObject(item)) return null;
    const role = String(item.role || '');
    if (!['root', 'user', 'visitor', 'test'].includes(role)) return null;
    const avatar = String(item.avatar || '');
    if (
      avatar &&
      !/^https?:\/\//i.test(avatar) &&
      !/^\/api\/community-chat\/presence\/members\/v1\.[A-Za-z0-9_-]+\/avatar$/u.test(avatar)
    ) {
      return null;
    }
    members.push({
      alias: String(item.alias || '').slice(0, 80),
      role: role as CommunityChatOnlineMember['role'],
      avatar: avatar.slice(0, 2048),
      frameId: String(item.frameId || '').slice(0, 64),
    });
  }
  return { onlineCount, memberCount, guestCount, members };
}

function resolvePresenceClientId() {
  try {
    const stored = localStorage.getItem(PRESENCE_CLIENT_ID_STORAGE_KEY);
    if (stored && PRESENCE_CLIENT_ID_PATTERN.test(stored)) return stored;
    const generated =
      globalThis.crypto?.randomUUID?.() ||
      `runtime:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 14)}`;
    localStorage.setItem(PRESENCE_CLIENT_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    // Safari 隐私模式等环境可能禁用存储；运行期标识仍能保证单页内稳定。
  }
  if (!fallbackPresenceClientId) {
    fallbackPresenceClientId =
      globalThis.crypto?.randomUUID?.() ||
      `runtime:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 14)}`;
  }
  return fallbackPresenceClientId;
}

export function useCommunityChatSocket(options: UseCommunityChatSocketOptions) {
  const status = ref<CommunityChatRealtimeStatus>('disabled');
  const onlineCount = ref<number | null>(null);
  const isConnected = computed(() => status.value === 'connected');
  const random = options.random || Math.random;
  const presenceClientId = resolvePresenceClientId();
  const seenEventIds = new Map<string, true>();
  let mounted = false;
  let socket: WebSocket | null = null;
  let generation = 0;
  let reconnectAttempts = 0;
  let reconnectTimer: number | undefined;
  let handshakeTimer: number | undefined;
  let reconnectBlocked = false;
  const pendingPresenceMemberRequests = new Map<
    string,
    {
      resolve: (snapshot: CommunityChatOnlineMembersSnapshot) => void;
      reject: (error: Error) => void;
      timer: number;
    }
  >();

  function rejectPendingPresenceMemberRequests(code = 'REALTIME_CONNECTION_UNAVAILABLE') {
    const error = new Error(code);
    error.name = 'CommunityChatRealtimeRequestError';
    for (const request of pendingPresenceMemberRequests.values()) {
      window.clearTimeout(request.timer);
      request.reject(error);
    }
    pendingPresenceMemberRequests.clear();
  }

  function rememberEvent(eventId: string) {
    if (!eventId || seenEventIds.has(eventId)) return false;
    seenEventIds.set(eventId, true);
    if (seenEventIds.size > MAX_SEEN_EVENT_IDS) {
      const first = seenEventIds.keys().next();
      if (!first.done) seenEventIds.delete(first.value);
    }
    return true;
  }

  function clearReconnectTimer() {
    if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }

  function clearHandshakeTimer() {
    if (handshakeTimer !== undefined) window.clearTimeout(handshakeTimer);
    handshakeTimer = undefined;
  }

  function closeCurrentSocket() {
    clearHandshakeTimer();
    rejectPendingPresenceMemberRequests();
    onlineCount.value = null;
    const current = socket;
    socket = null;
    generation += 1;
    if (!current) return;
    current.onopen = null;
    current.onmessage = null;
    current.onerror = null;
    current.onclose = null;
    if (current.readyState === WebSocket.OPEN || current.readyState === WebSocket.CONNECTING) {
      try {
        current.close(1000, 'client_refresh');
      } catch {
        // 浏览器会自行回收已失效连接，REST 轮询继续兜底。
      }
    }
  }

  function canConnectNow() {
    return (
      mounted &&
      options.enabled.value &&
      Boolean(options.roomSlug.value) &&
      document.visibilityState === 'visible' &&
      navigator.onLine !== false &&
      !reconnectBlocked
    );
  }

  function scheduleReconnect() {
    clearReconnectTimer();
    if (!options.enabled.value || !options.roomSlug.value) {
      status.value = 'disabled';
      return;
    }
    if (reconnectBlocked || typeof WebSocket === 'undefined') {
      status.value = 'fallback';
      return;
    }
    status.value = 'reconnecting';
    if (document.visibilityState !== 'visible' || navigator.onLine === false) return;
    const baseDelay = Math.min(30_000, 1000 * 2 ** Math.min(reconnectAttempts, 5));
    const delay = baseDelay + Math.floor(random() * 250);
    reconnectAttempts += 1;
    reconnectTimer = window.setTimeout(connect, delay);
  }

  function connect() {
    clearReconnectTimer();
    if (!canConnectNow()) {
      if (!options.enabled.value || !options.roomSlug.value) status.value = 'disabled';
      else status.value = reconnectBlocked || typeof WebSocket === 'undefined' ? 'fallback' : 'reconnecting';
      return;
    }
    if (typeof WebSocket === 'undefined') {
      status.value = 'fallback';
      return;
    }

    closeCurrentSocket();
    const currentGeneration = generation;
    status.value = reconnectAttempts > 0 ? 'reconnecting' : 'connecting';
    let nextSocket: WebSocket;
    try {
      nextSocket = (options.socketFactory || ((url: string) => new WebSocket(url)))(buildCommunityChatSocketUrl());
    } catch {
      scheduleReconnect();
      return;
    }
    socket = nextSocket;
    handshakeTimer = window.setTimeout(() => {
      if (currentGeneration !== generation || socket !== nextSocket || status.value === 'connected') return;
      nextSocket.close(4408, 'subscribe_timeout');
    }, 12_000);

    nextSocket.onopen = () => {
      if (currentGeneration !== generation || socket !== nextSocket) return;
      try {
        nextSocket.send(
          JSON.stringify({
            protocolVersion: COMMUNITY_CHAT_REALTIME_PROTOCOL_VERSION,
            type: 'room.subscribe',
            requestId: subscribeRequestId(random),
            payload: {
              roomSlug: options.roomSlug.value,
              ...(presenceClientId ? { presenceClientId } : {}),
            },
          }),
        );
      } catch {
        nextSocket.close();
      }
    };

    nextSocket.onmessage = (message) => {
      if (currentGeneration !== generation || socket !== nextSocket) return;
      const event = parseCommunityChatServerEvent(message.data);
      if (!event) return;
      if (event.protocolVersion !== COMMUNITY_CHAT_REALTIME_PROTOCOL_VERSION) {
        reconnectBlocked = true;
        status.value = 'fallback';
        nextSocket.close(1002, 'protocol_unsupported');
        return;
      }
      if (!rememberEvent(event.eventId)) return;
      if (event.type === 'room.subscribed') {
        if (event.payload.roomSlug !== options.roomSlug.value) return;
        const count = Number(event.payload.onlineCount);
        if (Number.isInteger(count) && count >= 0) onlineCount.value = count;
        clearHandshakeTimer();
        reconnectAttempts = 0;
        status.value = 'connected';
        void options.onSynchronized?.();
        return;
      }
      if (event.type === 'presence.changed') {
        const count = Number(event.payload.onlineCount);
        if (Number.isInteger(count) && count >= 0) onlineCount.value = count;
        return;
      }
      if (event.type === 'presence.members' && event.requestId) {
        const pending = pendingPresenceMemberRequests.get(event.requestId);
        if (!pending) return;
        const snapshot = parseOnlineMembersSnapshot(event.payload);
        if (!snapshot) {
          window.clearTimeout(pending.timer);
          pendingPresenceMemberRequests.delete(event.requestId);
          const error = new Error('REALTIME_RESPONSE_INVALID');
          error.name = 'CommunityChatRealtimeRequestError';
          pending.reject(error);
          return;
        }
        window.clearTimeout(pending.timer);
        pendingPresenceMemberRequests.delete(event.requestId);
        pending.resolve(snapshot);
        return;
      }
      if (event.type === 'error' && event.requestId) {
        const pending = pendingPresenceMemberRequests.get(event.requestId);
        if (!pending) return;
        window.clearTimeout(pending.timer);
        pendingPresenceMemberRequests.delete(event.requestId);
        const error = new Error(String(event.payload.code || 'REALTIME_REQUEST_FAILED'));
        error.name = 'CommunityChatRealtimeRequestError';
        pending.reject(error);
        return;
      }
      if (!BROADCAST_EVENT_TYPES.has(event.type)) return;
      if (
        (event.type === 'message.created' || event.type === 'message.updated' || event.type === 'message.removed') &&
        event.payload.roomSlug !== options.roomSlug.value
      ) {
        return;
      }
      void options.onEvent?.(event as CommunityChatRealtimeEvent);
      if (event.type === 'access.changed' && event.payload.disconnect === true) {
        reconnectBlocked = true;
        status.value = 'fallback';
        nextSocket.close(4403, 'access_changed');
      }
    };

    nextSocket.onerror = () => {
      // close 事件统一负责退避重连，避免 error + close 安排两次定时器。
    };
    nextSocket.onclose = () => {
      if (currentGeneration !== generation || socket !== nextSocket) return;
      clearHandshakeTimer();
      rejectPendingPresenceMemberRequests();
      socket = null;
      scheduleReconnect();
    };
  }

  function restart() {
    reconnectAttempts = 0;
    reconnectBlocked = false;
    seenEventIds.clear();
    clearReconnectTimer();
    closeCurrentSocket();
    if (!options.enabled.value || !options.roomSlug.value) {
      status.value = 'disabled';
      return;
    }
    connect();
  }

  function requestOnlineMembers() {
    return new Promise<CommunityChatOnlineMembersSnapshot>((resolve, reject) => {
      const current = socket;
      if (!current || current.readyState !== WebSocket.OPEN || status.value !== 'connected') {
        const error = new Error('REALTIME_CONNECTION_UNAVAILABLE');
        error.name = 'CommunityChatRealtimeRequestError';
        reject(error);
        return;
      }
      const requestId = presenceMembersRequestId(random);
      const timer = window.setTimeout(() => {
        const pending = pendingPresenceMemberRequests.get(requestId);
        if (!pending) return;
        pendingPresenceMemberRequests.delete(requestId);
        const error = new Error('REALTIME_REQUEST_TIMEOUT');
        error.name = 'CommunityChatRealtimeRequestError';
        pending.reject(error);
      }, PRESENCE_MEMBERS_REQUEST_TIMEOUT_MS);
      pendingPresenceMemberRequests.set(requestId, { resolve, reject, timer });
      try {
        current.send(
          JSON.stringify({
            protocolVersion: COMMUNITY_CHAT_REALTIME_PROTOCOL_VERSION,
            type: 'presence.members.request',
            requestId,
            payload: {},
          }),
        );
      } catch {
        window.clearTimeout(timer);
        pendingPresenceMemberRequests.delete(requestId);
        const error = new Error('REALTIME_REQUEST_SEND_FAILED');
        error.name = 'CommunityChatRealtimeRequestError';
        reject(error);
      }
    });
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
      reconnectAttempts = 0;
      connect();
      return;
    }
    clearReconnectTimer();
    closeCurrentSocket();
    if (options.enabled.value) status.value = 'reconnecting';
  }

  function handleOnline() {
    reconnectAttempts = 0;
    connect();
  }

  function handleOffline() {
    clearReconnectTimer();
    closeCurrentSocket();
    if (options.enabled.value) status.value = 'reconnecting';
  }

  watch(
    [options.enabled, options.roomSlug, options.identityKey || ref('')],
    () => {
      if (mounted) restart();
    },
    { flush: 'post' },
  );

  onMounted(() => {
    mounted = true;
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    restart();
  });

  onBeforeUnmount(() => {
    mounted = false;
    clearReconnectTimer();
    closeCurrentSocket();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  });

  return {
    isConnected,
    onlineCount,
    reconnect: restart,
    requestOnlineMembers,
    status,
  };
}

export const __test__ = {
  BROADCAST_EVENT_TYPES,
  MAX_SEEN_EVENT_IDS,
  isPlainObject,
  resolvePresenceClientId,
  parseOnlineMembersSnapshot,
  presenceMembersRequestId,
  subscribeRequestId,
};
