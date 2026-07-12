import { RouteRecordRaw } from 'vue-router';
import { ALL_ROLES } from '@/config/bookmarkCfg.ts';

const searchRouter: RouteRecordRaw = {
  meta: {
    title: '资源中心',
    keepAlive: true,
    requireAuth: true,
    roles: ALL_ROLES,
  },
  path: '/search',
  name: 'searchCenter',
  component: () => import('@/view/search/SearchCenter.vue'),
};

export default searchRouter;
