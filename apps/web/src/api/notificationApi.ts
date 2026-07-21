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

// 删除(软删)指定通知
export const deleteNotifications = (ids: string[]) => apiBasePost('/api/notification/delete', { ids });

// 管理员发通知(仅 root):接收人四选一 —— toAll / role / userIds(多选) / userId(单发)
export const sendNotification = (payload: {
  userId?: string;
  userIds?: string[];
  toAll?: boolean;
  role?: string;
  type?: string;
  title: string;
  content?: string;
  link?: string;
}) => apiBasePost('/api/notification/send', payload);

// 后台通知中心(仅 root):概览统计
export const getAdminStats = () => apiBasePost('/api/notification/admin/stats');

// 后台通知中心(仅 root):发送记录(按批聚合 + 已读率 + 撤回态)
export const getAdminList = (params: { currentPage?: number; pageSize?: number } = {}) =>
  apiBasePost('/api/notification/admin/list', params);

// 后台通知中心(仅 root):撤回一个批次
export const recallNotification = (batchId: string) => apiBasePost('/api/notification/admin/recall', { batchId });

// 后台通知中心(仅 root):删除一个批次(同时撤回并从发送记录移除)
export const deleteAdminNotification = (batchId: string) =>
  apiBasePost('/api/notification/admin/delete', { batchId });

// 后台通知中心(仅 root):某批次接收者与已读明细(发给谁、谁已读谁未读)
export const getBatchRecipients = (batchId: string) =>
  apiBasePost('/api/notification/admin/recipients', { batchId });

export default {
  getNotificationList,
  getUnreadCount,
  markNotificationsRead,
  markAllNotificationsRead,
  deleteNotifications,
  sendNotification,
  getAdminStats,
  getAdminList,
  recallNotification,
  deleteAdminNotification,
  getBatchRecipients,
};
