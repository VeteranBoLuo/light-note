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

  it('浏览器通知先建立基线，只对页面打开后出现的新未读项提示', async () => {
    const created: Array<{ title: string; options: NotificationOptions }> = [];
    const close = vi.fn();
    class MockNotification {
      static permission = 'granted';
      onclick: (() => void) | null = null;
      constructor(
        public title: string,
        public options: NotificationOptions,
      ) {
        created.push({ title, options });
      }
      close = close;
    }
    vi.stubGlobal('Notification', MockNotification);
    user.preferences.notificationsBrowser = true;
    getUnreadCount
      .mockResolvedValueOnce({ status: 200, data: { unreadTotal: 1, byType: { todo_reminder: 1 } } })
      .mockResolvedValueOnce({ status: 200, data: { unreadTotal: 2, byType: { todo_reminder: 2 } } });
    getNotificationList
      .mockResolvedValueOnce({
        status: 200,
        data: { items: [{ id: 'old', title: '旧提醒', isRead: 0 }], total: 1 },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: {
          items: [
            { id: 'new', title: '新提醒', content: '待办内容', isRead: 0, link: '/inbox' },
            { id: 'old', title: '旧提醒', isRead: 0 },
          ],
          total: 2,
        },
      });

    const notification = useNotification();
    await notification.refreshUnread();
    await vi.waitFor(() => expect(getNotificationList).toHaveBeenCalledTimes(1));
    expect(created).toHaveLength(0);

    await notification.refreshUnread();
    await vi.waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]).toEqual({
      title: '新提醒',
      options: expect.objectContaining({ body: '待办内容', tag: 'light-note:new' }),
    });
    vi.unstubAllGlobals();
  });
});
