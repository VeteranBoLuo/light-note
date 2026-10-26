import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';

const mocks = vi.hoisted(() => ({
  getRooms: vi.fn(),
  socketOptions: null as Record<string, any> | null,
}));

vi.mock('@/api/communityChatApi', () => ({
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

async function mountRuntime(context = '') {
  const previewContextId = ref(context);
  const userId = ref('user-b');
  const userRole = ref('user');
  const realtimeActive = ref(true);
  const app = createApp({
    setup() {
      useCommunityChatUnreadRuntime({ userId, userRole, realtimeActive, previewContextId });
      return () => h('div');
    },
  });
  const host = document.createElement('div');
  document.body.append(host);
  app.mount(host);
  apps.push(app);
  await flushRequests();
  return { realtimeActive, userId, userRole, previewContextId };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  useCommunityChatUnread().reset();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
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
  it('does not connect, poll or retain chat state during administrator preview', async () => {
    const { previewContextId } = await mountRuntime('context-a');
    expect(mocks.getRooms).not.toHaveBeenCalled();
    expect(mocks.socketOptions?.enabled.value).toBe(false);
    await vi.advanceTimersByTimeAsync(120000);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(mocks.getRooms).not.toHaveBeenCalled();
    previewContextId.value = '';
    await flushRequests();
    expect(mocks.getRooms).toHaveBeenCalled();
    expect(mocks.socketOptions?.enabled.value).toBe(true);
    previewContextId.value = 'context-b';
    await flushRequests();
    expect(mocks.socketOptions?.enabled.value).toBe(false);
    expect(useCommunityChatUnread().rooms.value).toEqual([]);
  });

  it('在聊天室外订阅公共房间，并在新消息事件后立即刷新服务端权威角标', async () => {
    await mountRuntime();
    expect(mocks.socketOptions?.enabled.value).toBe(true);
    expect(mocks.socketOptions?.roomSlug.value).toBe('general');
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
    mocks.getRooms.mockClear();
    await vi.advanceTimersByTimeAsync(__test__.FALLBACK_REFRESH_INTERVAL_MS);
    await flushRequests();
    expect(mocks.getRooms).not.toHaveBeenCalled();

    runtime.realtimeActive.value = true;
    await nextTick();
    await flushRequests();
    expect(mocks.getRooms).toHaveBeenCalledTimes(1);
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
    expect(mocks.socketOptions?.enabled.value).toBe(true);
    expect(mocks.socketOptions?.roomSlug.value).toBe('general');
  });

  it('游客不产生未读，但会复用公共房间连接参与项目在线人数', async () => {
    const runtime = await mountRuntime();
    runtime.userId.value = '';
    runtime.userRole.value = 'visitor';
    await flushRequests();

    mocks.getRooms.mockClear();
    await vi.advanceTimersByTimeAsync(__test__.FALLBACK_REFRESH_INTERVAL_MS);
    await flushRequests();

    expect(mocks.socketOptions?.enabled.value).toBe(true);
    expect(mocks.socketOptions?.roomSlug.value).toBe('general');
    expect(useCommunityChatUnread().totalUnread.value).toBe(0);
    expect(mocks.getRooms).not.toHaveBeenCalled();
  });

  it('服务端关闭 realtime 时保留低频 REST 兜底但不反复建立 WebSocket', async () => {
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

  it('游客连续收到前台恢复信号时，不按每个信号重复读取目录', async () => {
    const runtime = await mountRuntime();
    runtime.userRole.value = 'visitor';
    await flushRequests();
    mocks.getRooms.mockClear();

    for (let index = 0; index < 300; index++) {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(200);
    }

    expect(mocks.getRooms.mock.calls.length).toBeLessThanOrEqual(60);
    expect(useCommunityChatUnread().totalUnread.value).toBe(0);
  });

  it('持续新消息以有界频率刷新，末尾事件仍能收敛到权威角标', async () => {
    await mountRuntime();
    mocks.getRooms.mockClear();
    let unreadCount = 0;
    mocks.getRooms.mockImplementation(async () => ({
      data: {
        access: { realtimeEnabled: true },
        messagingEnabled: true,
        items: [{ slug: 'general', unreadCount, mentionCount: 0 }],
      },
    }));
    for (let index = 0; index < 200; index++) {
      unreadCount++;
      mocks.socketOptions?.onEvent({ type: 'message.created', payload: { roomSlug: 'general' } });
      await vi.advanceTimersByTimeAsync(30);
    }
    await vi.advanceTimersByTimeAsync(1000);

    expect(mocks.getRooms.mock.calls.length).toBeLessThanOrEqual(7);
    expect(useCommunityChatUnread().totalUnread.value).toBe(200);
  });

  it('转入后台后取消已排队刷新，后台事件和重连回调都不请求目录', async () => {
    await mountRuntime();
    mocks.getRooms.mockClear();
    mocks.socketOptions?.onEvent({ type: 'message.created', payload: { roomSlug: 'general' } });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(2000);
    mocks.socketOptions?.onSynchronized();
    await vi.advanceTimersByTimeAsync(2000);

    expect(mocks.getRooms).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    await flushRequests();
    expect(mocks.getRooms).toHaveBeenCalledTimes(1);
  });

  it('连续失败也遵守刷新间隔，切号时取消旧身份的尾部任务', async () => {
    const runtime = await mountRuntime();
    mocks.getRooms.mockClear();
    mocks.getRooms.mockRejectedValue(new Error('rate limited'));
    for (let index = 0; index < 100; index++) {
      mocks.socketOptions?.onSynchronized();
      await vi.advanceTimersByTimeAsync(30);
    }
    expect(mocks.getRooms.mock.calls.length).toBeLessThanOrEqual(4);

    mocks.getRooms.mockResolvedValue({
      data: { messagingEnabled: true, items: [{ slug: 'general', unreadCount: 2, mentionCount: 0 }] },
    });
    runtime.userId.value = 'user-c';
    await flushRequests();
    const callsAfterSwitch = mocks.getRooms.mock.calls.length;
    await vi.advanceTimersByTimeAsync(2000);
    expect(mocks.getRooms).toHaveBeenCalledTimes(callsAfterSwitch);
    expect(useCommunityChatUnread().totalUnread.value).toBe(2);
  });
});
