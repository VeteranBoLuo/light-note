import { RouteRecordRaw } from 'vue-router';
import { RoleEnum } from '@/config/bookmarkCfg.ts';

const tagDetailRouter: RouteRecordRaw = {
  meta: {
    title: '标签详情',
    keepAlive: true,
    requireAuth: true,
    roles: [RoleEnum.Root, RoleEnum.ADMIN, RoleEnum.VISITOR],
  },
  path: '/tag/:id',
  name: 'tagDetail',
  component: () => import('@/view/tagDetail/TagDetail.vue'),
};

export default tagDetailRouter;
