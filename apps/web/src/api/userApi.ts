import { apiBaseGet, apiBasePost } from '@/http/request';

const userApi = {
  getUserInfoById(data) {
    return apiBaseGet('/api/user/getUserInfo', data);
  },
  updateUserInfo(user) {
    return apiBasePost('/api/user/saveUserInfo', user);
  },
  saveAdminUserRemark(targetUserId: string, remarkName: string) {
    return apiBasePost('/api/user/admin/remark', { targetUserId, remarkName });
  },
  deleteUserById(id) {
    return apiBaseGet(`/api/user/deleteUserById?id=${id}`);
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
