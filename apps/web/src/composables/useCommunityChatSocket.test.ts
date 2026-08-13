import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import {
  buildCommunityChatSocketUrl,
  parseCommunityChatServerEvent,
  useCommunityChatSocket,
  type CommunityChatRealtimeEvent,
} from './useCommunityChatSocket';

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  url: string;
  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  message(value: unknown) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(value) }));
  }

  close(code = 1000, reason = '') {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close', { code, reason }));
  }

  serverClose(code = 1006) {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close', { code }));
  }
}

const apps: Array<ReturnType<typeof createApp>> = [];

function serverEvent(type: string, payload: Record<string, unknown>, eventId = `${type}-0001`) {
  return {
    protocolVersion: 1,
    type,
    eventId,
    serverTime: '2026-08-09T10:00:00.000Z',
    payload,
  };
}

async function mountSocket(options: { enabled?: boolean } = {}) {
  const enabled = ref(options.enabled ?? true);
  const roomSlug = ref('general');
  const identityKey = ref('guest:visitor');
  const onEvent = vi.fn<(event: CommunityChatRealtimeEvent) => void>();
  const onSynchronized = vi.fn();
  let socketState!: ReturnType<typeof useCommunityChatSocket>;
  const app = createApp({
    setup() {
      socketState = useCommunityChatSocket({
        enabled,
        roomSlug,
        identityKey,
        onEvent,
        onSynchronized,
        random: () => 0,
      });
      return () => h('div');
    },
  });
  const host = document.createElement('div');
  document.body.append(host);
  app.mount(host);
  apps.push(app);
  await nextTick();
  return { enabled, identityKey, onEvent, onSynchronized, roomSlug, socketState };
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});

afterEach(() => {
  while (apps.length) apps.pop()?.unmount();
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useCommunityChatSocket', () => {
  it('使用同源 ws/wss 地址，不在 URL 中携带 sid', () => {
    expect(buildCommunityChatSocketUrl({ href: 'https://boluo66.top/community-chat?message=1' } as Location)).toBe(
      'wss://boluo66.top/realtime/chat',
    );
    expect(buildCommunityChatSocketUrl({ href: 'http://127.0.0.1:5173/community-chat' } as Location)).toBe(
      'ws://127.0.0.1:5173/realtime/chat',
    );
  });

  it('连接后只提交房间订阅，并在确认订阅后进入实时状态', async () => {
    const mounted = await mountSocket();
    const socket = FakeWebSocket.instances[0];
    expect(socket.url).toContain('/realtime/chat');
    expect(mounted.socketState.status.value).toBe('connecting');

    socket.open();
    const subscription = JSON.parse(socket.sent[0]);
    expect(subscription).toMatchObject({
      protocolVersion: 1,
      type: 'room.subscribe',
      payload: { roomSlug: 'general', presenceClientId: expect.any(String) },
    });
    expect(subscription).not.toHaveProperty('userId');
    expect(subscription).not.toHaveProperty('role');
    expect(JSON.stringify(subscription)).not.toContain('guest:visitor');

    socket.message(serverEvent('room.subscribed', { roomSlug: 'general', onlineCount: 6 }));
    expect(mounted.socketState.status.value).toBe('connected');
    expect(mounted.socketState.onlineCount.value).toBe(6);
    expect(mounted.onSynchronized).toHaveBeenCalledTimes(1);
  });

  it('在线人数事件只更新共享人数，不触发消息刷新回调', async () => {
    const mounted = await mountSocket();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    socket.message(serverEvent('room.subscribed', { roomSlug: 'general', onlineCount: 2 }));
    socket.message(serverEvent('presence.changed', { onlineCount: 6 }, 'presence-0002'));

    expect(mounted.socketState.onlineCount.value).toBe(6);
    expect(mounted.onEvent).not.toHaveBeenCalled();
  });

  it('Root 可按需请求在线名单，且请求不携带身份字段', async () => {
    const mounted = await mountSocket();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    socket.message(serverEvent('room.subscribed', { roomSlug: 'general', onlineCount: 3 }));

    const pending = mounted.socketState.requestOnlineMembers();
    const request = JSON.parse(socket.sent.at(-1) || '{}');
    expect(request).toMatchObject({
      protocolVersion: 1,
      type: 'presence.members.request',
      payload: {},
    });
    expect(request).not.toHaveProperty('userId');
    expect(request).not.toHaveProperty('role');
    socket.message({
      ...serverEvent(
        'presence.members',
        {
          onlineCount: 3,
          memberCount: 2,
          guestCount: 1,
          members: [
            { alias: '菠萝', role: 'root', avatar: 'https://example.com/root.png', frameId: 'frame-celestial' },
            {
              alias: '测试员',
              role: 'test',
              avatar: '/api/community-chat/presence/members/v1.opaque-token/avatar',
              frameId: '',
            },
          ],
        },
        'presence-members-0001',
      ),
      requestId: request.requestId,
    });

    await expect(pending).resolves.toMatchObject({ onlineCount: 3, memberCount: 2, guestCount: 1 });
  });

  it('按 eventId 去重业务事件，忽略其他房间和无效 JSON', async () => {
    const mounted = await mountSocket();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    socket.message(serverEvent('room.subscribed', { roomSlug: 'general' }));
    const created = serverEvent('message.created', { roomSlug: 'general', messagePublicId: 'message-1' });

    socket.message(created);
    socket.message(created);
    socket.message(
      serverEvent(
        'message.updated',
        { roomSlug: 'general', messagePublicId: 'message-1', reason: 'like' },
        'updated-1',
      ),
    );
    socket.message(serverEvent('message.created', { roomSlug: 'other', messagePublicId: 'message-2' }, 'event-other'));
    socket.onmessage?.(new MessageEvent('message', { data: '{invalid' }));

    expect(mounted.onEvent).toHaveBeenCalledTimes(2);
    expect(mounted.onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'message.created' }));
    expect(mounted.onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'message.updated' }));
  });

  it('断线后指数退避重连，重新订阅时触发 REST 补齐回调', async () => {
    vi.useFakeTimers();
    const mounted = await mountSocket();
    const first = FakeWebSocket.instances[0];
    first.open();
    first.message(serverEvent('room.subscribed', { roomSlug: 'general' }));
    first.serverClose();

    expect(mounted.socketState.status.value).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    const second = FakeWebSocket.instances[1];
    second.open();
    second.message(serverEvent('room.subscribed', { roomSlug: 'general' }, 'subscribed-0002'));

    expect(mounted.socketState.status.value).toBe('connected');
    expect(mounted.onSynchronized).toHaveBeenCalledTimes(2);
  });

  it('协议不兼容时停止重连并稳定降级为前台刷新', async () => {
    vi.useFakeTimers();
    const mounted = await mountSocket();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    socket.message({ ...serverEvent('hello', {}), protocolVersion: 99 });

    expect(mounted.socketState.status.value).toBe('fallback');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('连接已打开但订阅长期未确认时主动断开并重试', async () => {
    vi.useFakeTimers();
    const mounted = await mountSocket();
    FakeWebSocket.instances[0].open();

    await vi.advanceTimersByTimeAsync(12_000);
    expect(mounted.socketState.status.value).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('关闭功能时不建连接，并拒绝结构不完整的服务端事件', async () => {
    const mounted = await mountSocket({ enabled: false });
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(mounted.socketState.status.value).toBe('disabled');
    expect(parseCommunityChatServerEvent('{"type":"message.created"}')).toBeNull();
  });
});
