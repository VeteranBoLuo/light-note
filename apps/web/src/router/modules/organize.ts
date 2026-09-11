import type { RouteRecordRaw } from 'vue-router';
import { ALL_ROLES } from '@/config/bookmarkCfg';

const organizeRouter: RouteRecordRaw = {
  path: '/organize',
  name: 'organizeCenter',
  meta: {
    title: '资源整理',
    keepAlive: true,
    requireAuth: true,
    roles: ALL_ROLES,
    mobileShell: 'resources',
    mobileBottomNav: true,
  },
  component: () => import('@/view/organize/OrganizeCenter.vue'),
};

export default organizeRouter;
