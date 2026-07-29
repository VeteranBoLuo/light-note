import { RouteRecordRaw } from 'vue-router';
import { ALL_ROLES } from '@/config/bookmarkCfg.ts';

const phoneRouter: RouteRecordRaw[] = [
  {
    meta: {
      keepAlive: true,
      requireAuth: true,
      roles: ALL_ROLES,
    },
    path: '/ptrash',
    name: 'ptrash',
    component: () => import('@/view/trash/TrashMobile.vue'),
  },
  {
    meta: {
      keepAlive: true,
      requireAuth: true,
      roles: ALL_ROLES,
    },
    path: '/opinions',
    name: 'opinions',
    component: () => import('@/components/personCenter/opinions/OpinionsMobile.vue'),
  },
  {
    meta: {
      keepAlive: true,
      requireAuth: true,
      roles: ALL_ROLES,
    },
    path: '/myInfo',
    name: 'myInfo',
    component: () => import('@/components/personCenter/myInfo/MyInfoMobile.vue'),
  },
];

export default phoneRouter;
