import { beforeEach, describe, expect, it, vi } from 'vitest';

const getNotificationList = vi.fn();
const getUnreadCount = vi.fn();
const markAllNotificationsRead = vi.fn();
const setNotificationReadState = vi.fn();
const deleteNotifications = vi.fn();

vi.mock('@/api/notificationApi.ts', () => ({
  default: {
    getNotificationList: (...args: any[]) => getNotificationList(...args),
    getUnreadCount: (...args: any[]) => getUnreadCount(...args),
    markNotificationsRead: vi.fn(),
    setNotificationReadState: (...args: any[]) => setNotificationReadState(...args),
    markAllNotificationsRead: (...args: any[]) => markAllNotificationsRead(...args),
    deleteNotifications: (...args: any[]) => deleteNotifications(...args),
  },
}));

const user = { id: 'user-1', role: 'user', preferences: { notificationsBrowser: false } };
vi.mock('@/store', () => ({ useUserStore: () => user }));

const { resetNotification, useNotification } = await import('@/composables/useNotification.ts');

describe('useNotification.fetchList', () => {
  beforeEach(() => {
    resetNotification();
    getNotificationList.mockReset();
    getUnreadCount.mockReset();
    markAllNotificationsRead.mockReset();
    deleteNotifications.mockReset();
    user.id = 'user-1';
    user.role = 'user';
    user.preferences.notificationsBrowser = false;
    delete window.LightNoteAndroid;
  });

  it('正常返回通知分页数据', async () => {
    getNotificationList.mockResolvedValue({
      status: 200,
      data: {
        items: [{ id: 'n-1' }],
        total: 1,
        unreadTotal: 1,
        currentPage: 2,
        pageSize: 10,
      },
    });

    const page = await useNotification().fetchList({ currentPage: 2, pageSize: 10 });

    expect(page.items).toEqual([{ id: 'n-1' }]);
    expect(page).toMatchObject({ total: 1, unreadTotal: 1, currentPage: 2, pageSize: 10 });
  });

  it('成功响应结构异常时回退为空数组，避免模板读取 undefined.length', async () => {
    getNotificationList.mockResolvedValue({
      status: 200,
      data: { noop: true, adminContext: true },
    });

    const page = await useNotification().fetchList();

    expect(page.items).toEqual([]);
    expect(page).toMatchObject({ total: 0, currentPage: 1, pageSize: 20 });
  });

  it('只有后端确认成功时才返回通知状态变更成功', async () => {
    markAllNotificationsRead.mockResolvedValue({ status: 200 });
    deleteNotifications.mockResolvedValue({ status: 200 });
    getUnreadCount.mockResolvedValue({ status: 200, data: { unreadTotal: 0, byType: {} } });
    const notification = useNotification();

    await expect(notification.markAllRead()).resolves.toBe(true);
    await expect(notification.deleteNotifications(['n-1'])).resolves.toBe(true);
  });

  it('通知删除失败时返回 false，供界面回滚乐观更新', async () => {
    deleteNotifications.mockRejectedValue(new Error('network'));
    getUnreadCount.mockResolvedValue({ status: 200, data: { unreadTotal: 1, byType: { system: 1 } } });

    await expect(useNotification().deleteNotifications(['n-1'])).resolves.toBe(false);
  });

  it('移动端范围会从列表、铃铛计数和全部已读统一排除聊天室通知', async () => {
    getUnreadCount.mockResolvedValue({ status: 200, data: { unreadTotal: 1, byType: { system: 1 } } });
    getNotificationList.mockResolvedValue({
      status: 200,
      data: { items: [], total: 0, unreadTotal: 1, currentPage: 1, pageSize: 20 },
    });
    markAllNotificationsRead.mockResolvedValue({ status: 200 });
    const notification = useNotification({ excludeCommunityChat: true });

    await notification.refreshUnread();
    await notification.fetchList({ currentPage: 1, pageSize: 20 });
    await notification.markAllRead();

    expect(getUnreadCount).toHaveBeenCalledWith({ excludeCommunityChat: true });
    expect(getNotificationList).toHaveBeenCalledWith({
      currentPage: 1,
      pageSize: 20,
      excludeCommunityChat: true,
    });
    expect(markAllNotificationsRead).toHaveBeenCalledWith({ excludeCommunityChat: true, type: 'all' });
  });

  it('页面未读刷新不再创建系统通知，避免与 Service Worker 重复投递', async () => {
    const notificationConstructor = vi.fn();
    vi.stubGlobal('Notification', notificationConstructor);
    user.preferences.notificationsBrowser = true;
    getUnreadCount
      .mockResolvedValueOnce({ status: 200, data: { unreadTotal: 1 } })
      .mockResolvedValueOnce({ status: 200, data: { unreadTotal: 2 } });
    await useNotification().refreshUnread();
    await useNotification().refreshUnread();
    expect(notificationConstructor).not.toHaveBeenCalled();
    expect(getNotificationList).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('Android App 不借用 WebView 浏览器通知模拟后台系统提醒', async () => {
    const created = vi.fn();
    class MockNotification {
      static permission = 'granted';
      constructor(...args: any[]) {
        created(...args);
      }
    }
    vi.stubGlobal('Notification', MockNotification);
    window.LightNoteAndroid = { postMessage: vi.fn() };
    user.preferences.notificationsBrowser = true;
    getUnreadCount.mockResolvedValue({ status: 200, data: { unreadTotal: 1, byType: { system: 1 } } });

    await useNotification().refreshUnread();

    expect(created).not.toHaveBeenCalled();
    expect(getNotificationList).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('合并同范围并发计数请求，变更发生在在途请求期间时补读一次', async () => {
    let resolveFirst;
    getUnreadCount
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      )
      .mockResolvedValue({ status: 200, data: { unreadTotal: 2, byType: {} } });
    const notification = useNotification();
    const first = notification.refreshUnread();
    const duplicate = notification.refreshUnread();
    const changed = notification.refreshUnread({ afterCurrent: true });
    expect(getUnreadCount).toHaveBeenCalledOnce();
    resolveFirst({ status: 200, data: { unreadTotal: 1, byType: {} } });
    await Promise.all([first, duplicate, changed]);
    expect(getUnreadCount).toHaveBeenCalledTimes(2);
    expect(notification.unreadTotal.value).toBe(2);
  });

  it('静默列表刷新失败会抛错，让界面保留已有通知', async () => {
    getNotificationList.mockRejectedValue(new Error('network'));
    await expect(useNotification().fetchList({}, { throwOnError: true })).rejects.toThrow('network');
  });

  it('连续通知不会让标记已读一直等待后续无关的计数请求', async () => {
    const resolve: Array<(value: unknown) => void> = [];
    getUnreadCount.mockImplementation(
      () =>
        new Promise((done) => {
          resolve.push(done);
        }),
    );
    markAllNotificationsRead.mockResolvedValue({ status: 200 });
    const notification = useNotification();
    const first = notification.refreshUnread();
    let marked = false;
    const mark = notification.markAllRead().then(() => {
      marked = true;
    });
    await Promise.resolve();
    const result = { status: 200, data: { unreadTotal: 0, byType: {} } };
    resolve[0](result);
    await vi.waitFor(() => expect(resolve).toHaveLength(2));
    const later = notification.refreshUnread({ afterCurrent: true });
    resolve[1](result);
    await vi.waitFor(() => expect(resolve).toHaveLength(3));
    try {
      expect(marked).toBe(true);
    } finally {
      resolve[2](result);
      await Promise.all([first, mark, later]);
    }
  });
});

describe('useNotification.setReadState', () => {
  beforeEach(() => {
    resetNotification();
    user.id = 'user-1';
    user.role = 'user';
    setNotificationReadState.mockReset();
    getUnreadCount.mockReset();
  });

  it.each([true, false])('synchronizes authoritative badge counts after setting state %s', async (isRead) => {
    setNotificationReadState.mockResolvedValue({ status: 200, data: { isRead } });
    getUnreadCount.mockResolvedValue({
      status: 200,
      data: { unreadTotal: isRead ? 0 : 1, byType: { system: isRead ? 0 : 1 } },
    });
    const state = useNotification();
    expect(await state.setReadState('n-1', isRead)).toBe(true);
    expect(setNotificationReadState).toHaveBeenCalledWith('n-1', isRead);
    expect(state.unreadTotal.value).toBe(isRead ? 0 : 1);
    expect(state.unreadByType.value.system).toBe(isRead ? 0 : 1);
  });

  it('keeps the old state on failure and still reconciles counts', async () => {
    setNotificationReadState.mockRejectedValue(new Error('network'));
    getUnreadCount.mockResolvedValue({ status: 200, data: { unreadTotal: 3, byType: {} } });
    const state = useNotification();
    expect(await state.setReadState('n-1', false)).toBe(false);
    expect(state.unreadTotal.value).toBe(3);
  });

  it('ignores a response after switching accounts', async () => {
    let finish!: (value: any) => void;
    setNotificationReadState.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    const pending = useNotification().setReadState('n-1', false);
    user.id = 'user-2';
    finish({ status: 200, data: { isRead: false } });
    expect(await pending).toBe(false);
    expect(getUnreadCount).not.toHaveBeenCalled();
  });

  it('rejects empty IDs and guest writes', async () => {
    expect(await useNotification().setReadState('', false)).toBe(false);
    user.role = 'visitor';
    expect(await useNotification().setReadState('n-1', false)).toBe(false);
    expect(setNotificationReadState).not.toHaveBeenCalled();
  });
});
