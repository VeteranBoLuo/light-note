import { RouteRecordRaw } from 'vue-router';
import { RoleEnum } from '@/config/bookmarkCfg.ts';

const phoneRouter: RouteRecordRaw[] = [
  {
    meta: {
      keepAlive: true,
      requireAuth: true,
      roles: [RoleEnum.Root, RoleEnum.ADMIN, RoleEnum.VISITOR],
    },
    path: '/opinions',
    name: 'opinions',
    component: () => import('@/components/personCenter/opinions/POpinions.vue'),
  },
  {
    meta: {
      keepAlive: true,
      requireAuth: true,
      roles: [RoleEnum.Root, RoleEnum.ADMIN, RoleEnum.VISITOR],
    },
    path: '/myInfo',
    name: 'myInfo',
    component: () => import('@/components/personCenter/myInfo/PMyInfo.vue'),
  },
];

export default phoneRouter;
