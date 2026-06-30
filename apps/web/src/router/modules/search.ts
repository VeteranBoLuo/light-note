import { RouteRecordRaw } from 'vue-router';
import { RoleEnum } from '@/config/bookmarkCfg.ts';

const searchRouter: RouteRecordRaw = {
  meta: {
    title: '资源中心',
    keepAlive: true,
    requireAuth: true,
    roles: [RoleEnum.Root, RoleEnum.ADMIN, RoleEnum.VISITOR],
  },
  path: '/search',
  name: 'searchCenter',
  component: () => import('@/view/search/SearchCenter.vue'),
};

export default searchRouter;
