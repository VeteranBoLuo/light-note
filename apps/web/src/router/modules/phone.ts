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
    component: () => import('@/view/trash/PTrash.vue'),
  },
  {
    meta: {
      keepAlive: true,
      requireAuth: true,
      roles: ALL_ROLES,
    },
    path: '/opinions',
    name: 'opinions',
    component: () => import('@/components/personCenter/opinions/POpinions.vue'),
  },
  {
    meta: {
      keepAlive: true,
      requireAuth: true,
      roles: ALL_ROLES,
    },
    path: '/myInfo',
    name: 'myInfo',
    component: () => import('@/components/personCenter/myInfo/PMyInfo.vue'),
  },
];

export default phoneRouter;
