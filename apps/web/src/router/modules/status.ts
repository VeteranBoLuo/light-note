import { RouteRecordRaw } from 'vue-router';
import { ALL_ROLES } from '@/config/bookmarkCfg.ts';

const statusRouter: RouteRecordRaw[] = [
  {
    path: '/:catchAll(.*)',
    name: 'not-found',
    meta: {
      roles: ALL_ROLES,
    },
    component: () => import('@/components/base/PageResponse/404.vue'),
  },
  {
    path: '/403',
    name: 'not-role',
    meta: {
      roles: ALL_ROLES,
    },
    component: () => import('@/components/base/PageResponse/403.vue'),
  },
];

export default statusRouter;
