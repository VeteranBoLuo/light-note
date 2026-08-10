import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getAccess: vi.fn(), getRooms: vi.fn() }));
vi.mock('@/api/communityChatApi', () => ({
  getCommunityChatAccess: mocks.getAccess,
  getCommunityChatRooms: mocks.getRooms,
}));

const { useCommunityChatUnread } = await import('./useCommunityChatUnread');

describe('useCommunityChatUnread', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCommunityChatUnread().reset();
    mocks.getAccess.mockResolvedValue({ data: { canEnter: true, messagingEnabled: true } });
  });

  it('只在服务端确认消息试点开启时累计房间角标', async () => {
    mocks.getRooms.mockResolvedValue({
      data: {
        messagingEnabled: true,
        items: [
          { slug: 'newcomers', unreadCount: 2, mentionCount: 1 },
          { slug: 'tips', unreadCount: 3, mentionCount: 0 },
        ],
      },
    });
    const unread = useCommunityChatUnread();

    await unread.refresh();

    expect(unread.totalUnread.value).toBe(5);
    expect(unread.totalMentions.value).toBe(1);
    unread.markRoomRead('newcomers');
    expect(unread.totalUnread.value).toBe(3);
  });

  it('消息试点关闭时清空旧角标，静默刷新失败时保留已有数据', async () => {
    const unread = useCommunityChatUnread();
    unread.syncDirectory({ messagingEnabled: true, items: [{ slug: 'tips', unreadCount: 4, mentionCount: 0 }] } as any);
    mocks.getRooms.mockRejectedValue(new Error('offline'));

    await unread.refresh();
    expect(unread.totalUnread.value).toBe(4);

    unread.syncDirectory({ messagingEnabled: false, items: [] } as any);
    expect(unread.totalUnread.value).toBe(0);
  });

  it('访问或消息开关关闭时不请求受保护频道接口，并清空旧账号角标', async () => {
    const unread = useCommunityChatUnread();
    unread.syncDirectory({ messagingEnabled: true, items: [{ slug: 'tips', unreadCount: 4, mentionCount: 0 }] } as any);
    mocks.getAccess.mockResolvedValue({ data: { canEnter: false, messagingEnabled: false } });

    await unread.refresh();

    expect(mocks.getRooms).not.toHaveBeenCalled();
    expect(unread.totalUnread.value).toBe(0);
  });

  it('账号切换后丢弃旧账号仍在途的频道响应', async () => {
    let resolveRooms: (value: unknown) => void = () => {};
    mocks.getRooms.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRooms = resolve;
        }),
    );
    const unread = useCommunityChatUnread();
    const pendingRefresh = unread.refresh();
    await Promise.resolve();
    unread.reset();
    resolveRooms({ data: { messagingEnabled: true, items: [{ slug: 'tips', unreadCount: 9, mentionCount: 0 }] } });

    await pendingRefresh;

    expect(unread.totalUnread.value).toBe(0);
    expect(unread.loading.value).toBe(false);
  });

  it('实时事件撞上在途请求时，当前请求结束后再补一次权威刷新', async () => {
    let resolveFirstRooms: (value: unknown) => void = () => {};
    mocks.getRooms
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstRooms = resolve;
          }),
      )
      .mockResolvedValueOnce({
        data: { messagingEnabled: true, items: [{ slug: 'general', unreadCount: 1, mentionCount: 0 }] },
      });
    const unread = useCommunityChatUnread();
    const pendingRefresh = unread.refresh();
    await Promise.resolve();

    const queuedRefresh = unread.refresh({ afterCurrent: true });
    resolveFirstRooms({
      data: { messagingEnabled: true, items: [{ slug: 'general', unreadCount: 0, mentionCount: 0 }] },
    });
    await Promise.all([pendingRefresh, queuedRefresh]);

    expect(mocks.getRooms).toHaveBeenCalledTimes(2);
    expect(unread.totalUnread.value).toBe(1);
  });
});
