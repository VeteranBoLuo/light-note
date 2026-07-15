import { beforeEach, describe, expect, it, vi } from 'vitest';

const getNotificationList = vi.fn();
const getUnreadCount = vi.fn();

vi.mock('@/api/notificationApi.ts', () => ({
  default: {
    getNotificationList: (...args: any[]) => getNotificationList(...args),
    getUnreadCount: (...args: any[]) => getUnreadCount(...args),
    markNotificationsRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
    deleteNotifications: vi.fn(),
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
});
