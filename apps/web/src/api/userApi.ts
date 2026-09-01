import { apiBaseGet, apiBasePost } from '@/http/request';

const userApi = {
  getUserInfoById(data) {
    return apiBaseGet('/api/user/getUserInfo', data);
  },
  updateUserInfo(user) {
    return apiBasePost('/api/user/saveUserInfo', user);
  },
  markFeatureAnnouncementSeen(payload: { announcementId: string; version: string }) {
    return apiBasePost('/api/user/feature-announcements/seen', payload, { silent: true });
  },
  saveAdminUserRemark(targetUserId: string, remarkName: string) {
    return apiBasePost('/api/user/admin/remark', { targetUserId, remarkName });
  },
  getAdminUserDetail(userId: string) {
    return apiBasePost('/api/user/admin/detail', { userId });
  },
  updateAdminUser(payload: {
    userId: string;
    alias: string;
    email: string;
    role: string;
    reason: string;
    confirmed: true;
    confirmText: string;
  }) {
    return apiBasePost('/api/user/admin/update', payload);
  },
  disableAdminUser(userId: string, action: { reason: string; confirmed: true; confirmText: string }) {
    return apiBasePost('/api/user/admin/disable', { userId, ...action });
  },
  restoreAdminUser(userId: string, action: { reason: string; confirmed: true; confirmText: string }) {
    return apiBasePost('/api/user/admin/restore', { userId, ...action });
  },
  logout() {
    return apiBasePost('/api/user/logout');
  },
  startAdminContext(targetUserId: string, mode: 'readonly' | 'maintain') {
    return apiBasePost('/api/user/adminContext/start', { targetUserId, mode });
  },
  getAdminContextStatus() {
    return apiBaseGet('/api/user/adminContext/status');
  },
  endAdminContext(token?: string) {
    return apiBasePost('/api/user/adminContext/end', token ? { contextToken: token } : undefined);
  },
};

export default userApi;
