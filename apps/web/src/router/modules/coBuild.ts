import type { RouteRecordRaw } from 'vue-router';
import { ALL_ROLES } from '@/config/bookmarkCfg';

const coBuildRouter: RouteRecordRaw[] = [
  {
    path: '/co-build',
    name: 'coBuild',
    meta: {
      title: '共建轻笺',
      keepAlive: true,
      requireAuth: true,
      roles: ALL_ROLES,
    },
    component: () => import('@/view/coBuild/CoBuildPage.vue'),
  },
  {
    path: '/co-build/:id',
    name: 'coBuildDetail',
    meta: {
      title: '建议详情',
      keepAlive: false,
      requireAuth: true,
      roles: ALL_ROLES,
    },
    component: () => import('@/view/coBuild/CoBuildDetail.vue'),
  },
];

export default coBuildRouter;
