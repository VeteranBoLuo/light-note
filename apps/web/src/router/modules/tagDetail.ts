import { RouteRecordRaw } from 'vue-router';
import { ALL_ROLES } from '@/config/bookmarkCfg.ts';

const tagDetailRouter: RouteRecordRaw = {
  meta: {
    title: '标签',
    keepAlive: true,
    requireAuth: true,
    roles: ALL_ROLES,
    mobileShell: 'resources',
    mobileTopSwitcher: true,
    mobileBottomNav: true,
  },
  path: '/tag/:id',
  name: 'tagDetail',
  component: () => import('@/view/tagDetail/TagDetail.vue'),
};

export default tagDetailRouter;
