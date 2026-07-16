import { ref } from 'vue';
import notificationApi from '@/api/notificationApi.ts';
import { useUserStore } from '@/store';

export interface NotificationItem {
  id: string;
  type: string; // level_up | opinion_reply | system | other
  title: string;
  content: string | null;
  link: string | null;
  meta: any;
  isRead: number;
  createTime: string;
}

export interface NotificationPage {
  items: NotificationItem[];
  total: number;
  unreadTotal: number;
  currentPage: number;
  pageSize: number;
}

// 模块级单例:铃铛角标与通知面板共享未读数,切号作废
const unreadTotal = ref(0);
const unreadByType = ref<Record<string, number>>({}); // 分类型未读数(各 tab 角标)
let ownerId: string | null = null;

/** 登出/切号时作废未读缓存 */
export function resetNotification() {
  unreadTotal.value = 0;
  unreadByType.value = {};
  ownerId = null;
}

export function useNotification() {
  function isGuest() {
    const user = useUserStore();
    return !user.id || user.role === 'visitor';
  }

  // 轻量:刷新未读总数 + 分类型未读数(铃铛角标 + 各 tab 角标)。切号即清零。
  async function refreshUnread() {
    if (isGuest()) {
      unreadTotal.value = 0;
      unreadByType.value = {};
      return;
    }
    const uid = useUserStore().id;
    if (ownerId !== uid) {
      unreadTotal.value = 0;
      unreadByType.value = {};
      ownerId = uid;
    }
    try {
      const res = await notificationApi.getUnreadCount();
      if (res?.status === 200 && res.data) {
        unreadTotal.value = Number(res.data.unreadTotal) || 0;
        unreadByType.value = res.data.byType || {};
      }
    } catch {
      /* 忽略,下次轮询再试 */
    }
  }

  // 拉取分页列表(顺带同步未读数)
  async function fetchList(params: { currentPage?: number; pageSize?: number; type?: string } = {}): Promise<NotificationPage> {
    const empty: NotificationPage = { items: [], total: 0, unreadTotal: unreadTotal.value, currentPage: 1, pageSize: 20 };
    if (isGuest()) return empty;
    try {
      const res = await notificationApi.getNotificationList(params);
      if (res?.status === 200 && res.data) {
        unreadTotal.value = Number(res.data.unreadTotal ?? unreadTotal.value) || 0;
        return {
          items: Array.isArray(res.data.items) ? res.data.items : [],
          total: Number(res.data.total) || 0,
          unreadTotal: unreadTotal.value,
          currentPage: Number(res.data.currentPage) || empty.currentPage,
          pageSize: Number(res.data.pageSize) || empty.pageSize,
        };
      }
    } catch {
      /* 忽略 */
    }
    return empty;
  }

  // 标记指定已读(本地未读数即时递减,乐观更新;随后同步分类型角标)
  async function markRead(ids: string[]) {
    if (!ids.length) return;
    unreadTotal.value = Math.max(0, unreadTotal.value - ids.length);
    await notificationApi.markNotificationsRead(ids).catch(() => {});
    refreshUnread();
  }

  // 全部已读
  async function markAllRead() {
    unreadTotal.value = 0;
    unreadByType.value = {};
    try {
      const res = await notificationApi.markAllNotificationsRead();
      if (res?.status !== 200) refreshUnread();
      return res?.status === 200;
    } catch {
      refreshUnread();
      return false;
    }
  }

  // 删除(软删)指定通知,随后同步未读角标(被删的可能是未读)
  async function deleteNotifications(ids: string[]) {
    if (!ids.length) return false;
    try {
      const res = await notificationApi.deleteNotifications(ids);
      return res?.status === 200;
    } catch {
      return false;
    } finally {
      refreshUnread();
    }
  }

  return { unreadTotal, unreadByType, refreshUnread, fetchList, markRead, markAllRead, deleteNotifications };
}
