import { apiBasePost } from '@/http/request.ts';

// 通知列表(分页 + 未读数;可按 type 筛选:all/level_up/opinion_reply/system)
export const getNotificationList = (params: { currentPage?: number; pageSize?: number; type?: string } = {}) =>
  apiBasePost('/api/notification/list', params);

// 仅未读数(铃铛角标轮询用,轻量)
export const getUnreadCount = () => apiBasePost('/api/notification/unreadCount');

// 标记指定通知已读
export const markNotificationsRead = (ids: string[]) => apiBasePost('/api/notification/markRead', { ids });

// 全部已读
export const markAllNotificationsRead = () => apiBasePost('/api/notification/markAllRead');

// 管理员发通知(仅 root):单发传 userId,群发传 toAll:true
export const sendNotification = (payload: {
  userId?: string;
  toAll?: boolean;
  type?: string;
  title: string;
  content?: string;
  link?: string;
}) => apiBasePost('/api/notification/send', payload);

export default {
  getNotificationList,
  getUnreadCount,
  markNotificationsRead,
  markAllNotificationsRead,
  sendNotification,
};
