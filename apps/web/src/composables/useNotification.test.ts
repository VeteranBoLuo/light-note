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

const user = { id: 'user-1', role: 'user' };
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
});
