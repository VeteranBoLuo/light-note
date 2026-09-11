import { RouteRecordRaw } from 'vue-router';
import { ALL_ROLES } from '@/config/bookmarkCfg.ts';

// 兼容历史图谱链接，统一进入资源查找。
const graphRouter: RouteRecordRaw = {
  meta: {
    title: '资源中心',
    requireAuth: true,
    roles: ALL_ROLES,
  },
  path: '/graph',
  name: 'globalGraph',
  redirect: '/search',
};

export default graphRouter;
