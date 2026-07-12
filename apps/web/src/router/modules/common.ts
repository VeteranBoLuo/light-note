import { RouteRecordRaw } from 'vue-router';
import { ALL_ROLES } from '@/config/bookmarkCfg.ts';

const commonRouter: RouteRecordRaw[] = [
  {
    meta: {
      title: '帮助文档',
      keepAlive: true,
      requireAuth: true,
      roles: ALL_ROLES,
    },
    path: '/help',
    name: 'help',
    component: () => import('@/components/personCenter/help/HelpMg.vue'),
  },
  {
    meta: {
      keepAlive: true,
      requireAuth: true,
      roles: ALL_ROLES,
    },
    path: '/updateLogs',
    name: 'updateLogs',
    component: () => import('@/components/personCenter/UpdateLogs.vue'),
  },
  {
    meta: {
      title: '设置',
      keepAlive: true,
      requireAuth: true,
      roles: ALL_ROLES,
    },
    path: '/settings',
    name: 'settings',
    component: () => import('@/view/settings/Settings.vue'),
  },
  {
    meta: {
      title: '我的成长',
      keepAlive: true,
      requireAuth: true,
      roles: ALL_ROLES,
    },
    path: '/growth',
    name: 'growth',
    component: () => import('@/view/growth/GrowthPage.vue'),
  },
];

export default commonRouter;
