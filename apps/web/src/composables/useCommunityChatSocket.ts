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
  if (typeof raw !== 'string' || raw.length > 16 * 1024) return null;
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

export function useCommunityChatSocket(options: UseCommunityChatSocketOptions) {
  const status = ref<CommunityChatRealtimeStatus>('disabled');
  const isConnected = computed(() => status.value === 'connected');
  const random = options.random || Math.random;
  const seenEventIds = new Map<string, true>();
  let mounted = false;
  let socket: WebSocket | null = null;
  let generation = 0;
  let reconnectAttempts = 0;
  let reconnectTimer: number | undefined;
  let handshakeTimer: number | undefined;
  let reconnectBlocked = false;

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
            payload: { roomSlug: options.roomSlug.value },
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
        clearHandshakeTimer();
        reconnectAttempts = 0;
        status.value = 'connected';
        void options.onSynchronized?.();
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
    reconnect: restart,
    status,
  };
}

export const __test__ = {
  BROADCAST_EVENT_TYPES,
  MAX_SEEN_EVENT_IDS,
  isPlainObject,
  subscribeRequestId,
};
