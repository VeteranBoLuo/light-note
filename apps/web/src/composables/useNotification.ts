import { ref, unref, type MaybeRef } from 'vue';
import notificationApi from '@/api/notificationApi.ts';
import { useUserStore } from '@/store';

export interface NotificationItem {
  id: string;
  type: string; // level_up | opinion_reply | system | todo_reminder | community_chat | other
  title: string;
  content: string | null;
  link: string | null;
  meta: any;
  isRead: number;
  createTime: string;
  todoState?: 'pending' | 'completed' | 'unavailable';
}

export interface NotificationPage {
  items: NotificationItem[];
  total: number;
  unreadTotal: number;
  currentPage: number;
  pageSize: number;
  targetFound?: boolean | null;
}

// 模块级单例:铃铛角标与通知面板共享未读数,切号作废
const unreadTotal = ref(0);
const unreadByType = ref<Record<string, number>>({}); // 分类型未读数(各 tab 角标)
let ownerId: string | null = null;
let generation = 0;
const unreadRequests = new Map<string, Promise<void>>();
const queuedUnreadRefreshes = new Set<string>();

/** 登出/切号时作废未读缓存 */
export function resetNotification() {
  generation++;
  unreadRequests.clear();
  queuedUnreadRefreshes.clear();
  unreadTotal.value = 0;
  unreadByType.value = {};
  ownerId = null;
}

export function useNotification(options: { excludeCommunityChat?: MaybeRef<boolean> } = {}) {
  const notificationScope = () => ({
    excludeCommunityChat: Boolean(unref(options.excludeCommunityChat ?? false)),
  });

  function isGuest() {
    const user = useUserStore();
    return !user.id || user.role === 'visitor';
  }

  // 轻量:刷新未读总数 + 分类型未读数(铃铛角标 + 各 tab 角标)。切号即清零。
  async function refreshUnread(options: { afterCurrent?: boolean } = {}) {
    if (isGuest()) {
      unreadTotal.value = 0;
      unreadByType.value = {};
      return;
    }
    const uid = useUserStore().id;
    const requestGeneration = generation;
    const scope = notificationScope();
    const key = `${uid}:${scope.excludeCommunityChat}:${requestGeneration}`;
    if (unreadRequests.has(key)) {
      if (options.afterCurrent) queuedUnreadRefreshes.add(key);
      return unreadRequests.get(key);
    }
    if (ownerId !== uid) {
      unreadTotal.value = 0;
      unreadByType.value = {};
      ownerId = uid;
    }
    const pending = (async () => {
      do {
        try {
          queuedUnreadRefreshes.delete(key);
          const res = await notificationApi.getUnreadCount(scope);
          if (generation !== requestGeneration || useUserStore().id !== uid || isGuest()) return;
          if (res?.status === 200 && res.data) {
            unreadTotal.value = Number(res.data.unreadTotal) || 0;
            unreadByType.value = res.data.byType || {};
          }
        } catch {
          /* 忽略,下次轮询再试 */
        }
      } while (generation === requestGeneration && useUserStore().id === uid && queuedUnreadRefreshes.has(key));
    })();
    unreadRequests.set(key, pending);
    try {
      await pending;
    } finally {
      if (unreadRequests.get(key) === pending) unreadRequests.delete(key);
      queuedUnreadRefreshes.delete(key);
    }
  }

  // 拉取分页列表(顺带同步未读数)
  async function fetchList(
    params: { currentPage?: number; pageSize?: number; type?: string; notificationId?: string } = {},
    options: { throwOnError?: boolean; syncUnread?: boolean } = {},
  ): Promise<NotificationPage> {
    const empty: NotificationPage = {
      items: [],
      total: 0,
      unreadTotal: unreadTotal.value,
      currentPage: 1,
      pageSize: 20,
    };
    if (isGuest()) return empty;
    const uid = useUserStore().id;
    try {
      const res = await notificationApi.getNotificationList({ ...params, ...notificationScope() });
      if (useUserStore().id !== uid || isGuest()) return empty;
      if (res?.status === 200 && res.data) {
        if (options.syncUnread !== false) unreadTotal.value = Number(res.data.unreadTotal ?? unreadTotal.value) || 0;
        return {
          items: Array.isArray(res.data.items) ? res.data.items : [],
          total: Number(res.data.total) || 0,
          unreadTotal: unreadTotal.value,
          currentPage: Number(res.data.currentPage) || empty.currentPage,
          pageSize: Number(res.data.pageSize) || empty.pageSize,
          targetFound: res.data.targetFound,
        };
      }
    } catch (error) {
      if (params.notificationId || options.throwOnError) throw error;
    }
    if (params.notificationId || options.throwOnError) throw new Error('NOTIFICATION_LOCATE_FAILED');
    return empty;
  }

  // 标记指定已读(本地未读数即时递减,乐观更新;随后同步分类型角标)
  async function markRead(ids: string[]) {
    if (!ids.length || isGuest()) return false;
    const uid = useUserStore().id;
    try {
      const response = await notificationApi.markNotificationsRead(ids);
      if (useUserStore().id !== uid) return false;
      await refreshUnread({ afterCurrent: true });
      return response?.status === 200;
    } catch {
      await refreshUnread({ afterCurrent: true });
      return false;
    }
  }

  async function setReadState(id: string, isRead: boolean) {
    if (!id || isGuest()) return false;
    const uid = useUserStore().id;
    try {
      const response = await notificationApi.setNotificationReadState(id, isRead);
      if (useUserStore().id !== uid || isGuest()) return false;
      await refreshUnread({ afterCurrent: true });
      return useUserStore().id === uid && !isGuest() && response?.status === 200 && response.data?.isRead === isRead;
    } catch {
      if (useUserStore().id === uid) await refreshUnread({ afterCurrent: true });
      return false;
    }
  }

  // 全部已读
  async function markAllRead(type = 'all') {
    if (isGuest()) return false;
    const uid = useUserStore().id;
    try {
      const res = await notificationApi.markAllNotificationsRead({ ...notificationScope(), type });
      if (useUserStore().id !== uid) return false;
      await refreshUnread({ afterCurrent: true });
      return res?.status === 200;
    } catch {
      refreshUnread({ afterCurrent: true });
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
      refreshUnread({ afterCurrent: true });
    }
  }

  return {
    unreadTotal,
    unreadByType,
    refreshUnread,
    fetchList,
    markRead,
    setReadState,
    markAllRead,
    deleteNotifications,
  };
}
