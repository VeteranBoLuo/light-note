import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';

const mocks = vi.hoisted(() => ({
  getAccess: vi.fn(),
  getRooms: vi.fn(),
  socketOptions: null as Record<string, any> | null,
}));

vi.mock('@/api/communityChatApi', () => ({
  getCommunityChatAccess: mocks.getAccess,
  getCommunityChatRooms: mocks.getRooms,
}));

vi.mock('./useCommunityChatSocket', async () => {
  const { ref: vueRef } = await import('vue');
  return {
    useCommunityChatSocket: (options: Record<string, any>) => {
      mocks.socketOptions = options;
      return { status: vueRef('connected') };
    },
  };
});

const { useCommunityChatUnread } = await import('./useCommunityChatUnread');
const { __test__, useCommunityChatUnreadRuntime } = await import('./useCommunityChatUnreadRuntime');

const apps: Array<ReturnType<typeof createApp>> = [];

async function flushRequests() {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
}

async function mountRuntime() {
  const userId = ref('user-b');
  const userRole = ref('user');
  const realtimeActive = ref(true);
  const app = createApp({
    setup() {
      useCommunityChatUnreadRuntime({ userId, userRole, realtimeActive });
      return () => h('div');
    },
  });
  const host = document.createElement('div');
  document.body.append(host);
  app.mount(host);
  apps.push(app);
  await flushRequests();
  return { realtimeActive, userId, userRole };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  useCommunityChatUnread().reset();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  mocks.getAccess.mockResolvedValue({ data: { canEnter: true, messagingEnabled: true, realtimeEnabled: true } });
  mocks.getRooms.mockResolvedValue({
    data: {
      access: { realtimeEnabled: true },
      messagingEnabled: true,
      items: [{ slug: 'general', unreadCount: 0, mentionCount: 0 }],
    },
  });
});

afterEach(() => {
  while (apps.length) apps.pop()?.unmount();
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('useCommunityChatUnreadRuntime', () => {
  it('在聊天室外订阅公共房间，并在新消息事件后立即刷新服务端权威角标', async () => {
    await mountRuntime();
    expect(mocks.socketOptions?.enabled.value).toBe(true);
    expect(mocks.socketOptions?.roomSlug.value).toBe('general');
    mocks.getAccess.mockClear();
    mocks.getRooms.mockClear();
    mocks.getRooms.mockResolvedValue({
      data: {
        access: { realtimeEnabled: true },
        messagingEnabled: true,
        items: [{ slug: 'general', unreadCount: 1, mentionCount: 0 }],
      },
    });

    mocks.socketOptions?.onEvent({
      protocolVersion: 1,
      type: 'message.created',
      eventId: 'message-created-1',
      serverTime: '2026-08-10T10:00:00.000Z',
      payload: { roomSlug: 'general', messagePublicId: 'message-1' },
    });
    await vi.advanceTimersByTimeAsync(__test__.REALTIME_REFRESH_DEBOUNCE_MS - 1);
    expect(mocks.getRooms).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await flushRequests();

    expect(mocks.getRooms).toHaveBeenCalledTimes(1);
    expect(useCommunityChatUnread().totalUnread.value).toBe(1);
  });

  it('合并短时间事件、忽略点赞刷新，并在进入聊天室时停用全局连接', async () => {
    const runtime = await mountRuntime();
    mocks.getRooms.mockClear();
    const created = {
      protocolVersion: 1,
      type: 'message.created',
      eventId: 'message-created-2',
      serverTime: '2026-08-10T10:00:00.000Z',
      payload: { roomSlug: 'general', messagePublicId: 'message-2' },
    };
    mocks.socketOptions?.onEvent(created);
    mocks.socketOptions?.onEvent({ ...created, eventId: 'message-created-3' });
    mocks.socketOptions?.onEvent({
      ...created,
      type: 'message.updated',
      eventId: 'message-liked-1',
      payload: { ...created.payload, reason: 'like' },
    });
    await vi.advanceTimersByTimeAsync(__test__.REALTIME_REFRESH_DEBOUNCE_MS);
    await flushRequests();

    expect(mocks.getRooms).toHaveBeenCalledTimes(1);
    runtime.realtimeActive.value = false;
    await nextTick();
    expect(mocks.socketOptions?.enabled.value).toBe(false);
  });

  it('退出登录时立即清空旧账号角标并停止订阅', async () => {
    const runtime = await mountRuntime();
    useCommunityChatUnread().syncDirectory({
      messagingEnabled: true,
      items: [{ slug: 'general', unreadCount: 3, mentionCount: 0 }],
    } as any);

    runtime.userId.value = '';
    runtime.userRole.value = 'visitor';
    await nextTick();

    expect(useCommunityChatUnread().totalUnread.value).toBe(0);
    expect(mocks.socketOptions?.enabled.value).toBe(false);
  });

  it('服务端关闭 realtime 时保留低频 REST 兜底但不反复建立 WebSocket', async () => {
    mocks.getAccess.mockResolvedValue({ data: { canEnter: true, messagingEnabled: true, realtimeEnabled: false } });
    mocks.getRooms.mockResolvedValue({
      data: {
        access: { realtimeEnabled: false },
        messagingEnabled: true,
        items: [{ slug: 'general', unreadCount: 0, mentionCount: 0 }],
      },
    });

    await mountRuntime();

    expect(mocks.socketOptions?.enabled.value).toBe(false);
    expect(mocks.getRooms).toHaveBeenCalledTimes(1);
  });
});
