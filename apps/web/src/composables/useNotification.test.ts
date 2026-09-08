import { beforeEach, describe, expect, it, vi } from 'vitest';

const getNotificationList = vi.fn();
const getUnreadCount = vi.fn();
const markAllNotificationsRead = vi.fn();
const deleteNotifications = vi.fn();

vi.mock('@/api/notificationApi.ts', () => ({
  default: {
    getNotificationList: (...args: any[]) => getNotificationList(...args),
    getUnreadCount: (...args: any[]) => getUnreadCount(...args),
    markNotificationsRead: vi.fn(),
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
    expect(markAllNotificationsRead).toHaveBeenCalledWith({ excludeCommunityChat: true });
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
});
