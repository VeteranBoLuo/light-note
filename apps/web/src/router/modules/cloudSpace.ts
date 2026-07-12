import { RouteRecordRaw } from 'vue-router';
import { ALL_ROLES } from '@/config/bookmarkCfg.ts';

const cloudSpaceRouter: RouteRecordRaw[] = [
  {
    meta: {
      title: '云空间',
      keepAlive: true,
      requireAuth: true,
      roles: ALL_ROLES,
    },
    path: '/cloudSpace',
    name: 'cloudSpace',
    component: () => import('@/view/cloudSpace/cloudSpace.vue'),
  },
];

export default cloudSpaceRouter;
