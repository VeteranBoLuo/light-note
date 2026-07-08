import { RouteRecordRaw } from 'vue-router';
import { RoleEnum } from '@/config/bookmarkCfg.ts';

const commonRouter: RouteRecordRaw[] = [
  {
    meta: {
      title: '帮助文档',
      keepAlive: true,
      requireAuth: true,
      roles: [RoleEnum.Root, RoleEnum.ADMIN, RoleEnum.VISITOR],
    },
    path: '/help',
    name: 'help',
    component: () => import('@/components/personCenter/help/HelpMg.vue'),
  },
  {
    meta: {
      keepAlive: true,
      requireAuth: true,
      roles: [RoleEnum.Root, RoleEnum.ADMIN, RoleEnum.VISITOR],
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
      roles: [RoleEnum.Root, RoleEnum.ADMIN, RoleEnum.VISITOR],
    },
    path: '/settings',
    name: 'settings',
    component: () => import('@/view/settings/Settings.vue'),
  },
];

export default commonRouter;
