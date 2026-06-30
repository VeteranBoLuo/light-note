import { RouteRecordRaw } from 'vue-router';
import { RoleEnum } from '@/config/bookmarkCfg.ts';

const statusRouter: RouteRecordRaw[] = [
  {
    path: '/:catchAll(.*)',
    name: 'not-found',
    meta: {
      roles: [RoleEnum.Root, RoleEnum.ADMIN, RoleEnum.VISITOR],
    },
    component: () => import('@/components/base/PageResponse/404.vue'),
  },
  {
    path: '/403',
    name: 'not-role',
    meta: {
      roles: [RoleEnum.Root, RoleEnum.ADMIN, RoleEnum.VISITOR],
    },
    component: () => import('@/components/base/PageResponse/403.vue'),
  },
];

export default statusRouter;
