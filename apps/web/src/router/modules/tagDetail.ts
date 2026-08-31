import { RouteRecordRaw } from 'vue-router';
import { RoleEnum } from '@/config/bookmarkCfg.ts';

const tagDetailRouter: RouteRecordRaw = {
  meta: {
    title: '标签',
    keepAlive: true,
    requireAuth: true,
    roles: [RoleEnum.Root, RoleEnum.USER, RoleEnum.TEST],
    mobileShell: 'resources',
    mobileTopSwitcher: true,
    mobileBottomNav: true,
  },
  path: '/tag/:id',
  name: 'tagDetail',
  component: () => import('@/view/tagDetail/TagDetail.vue'),
};

export default tagDetailRouter;
