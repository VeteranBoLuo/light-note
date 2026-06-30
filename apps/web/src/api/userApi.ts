import { apiBaseGet, apiBasePost } from '@/http/request';

const userApi = {
  getUserInfoById(data) {
    return apiBaseGet('/api/user/getUserInfo', data);
  },
  updateUserInfo(user) {
    return apiBasePost('/api/user/saveUserInfo', user);
  },
  deleteUserById(id) {
    return apiBaseGet(`/api/user/deleteUserById?id=${id}`);
  },
  logout() {
    return apiBasePost('/api/user/logout');
  },
};

export default userApi;
