import { RouteRecordRaw } from 'vue-router';
import { ALL_ROLES, RoleEnum } from '@/config/bookmarkCfg.ts';

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
      seoIndexable: true,
      canonicalPath: '/updateLogs',
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
    beforeEnter: (to) =>
      (Array.isArray(to.query.section) ? to.query.section[0] : to.query.section) === 'ai'
        ? { name: 'aiUsage', replace: true }
        : true,
  },
  {
    meta: {
      title: 'AI 用量与计费',
      keepAlive: true,
      requireAuth: true,
      roles: [RoleEnum.Root, RoleEnum.USER, RoleEnum.TEST],
    },
    path: '/ai-usage',
    name: 'aiUsage',
    component: () => import('@/view/aiUsage/AiUsagePage.vue'),
  },
  {
    meta: {
      title: '积分明细',
      keepAlive: true,
      requireAuth: true,
      roles: [RoleEnum.Root, RoleEnum.USER, RoleEnum.TEST],
    },
    path: '/points-usage',
    name: 'pointsUsage',
    component: () => import('@/view/pointsUsage/PointsUsagePage.vue'),
  },
  {
    meta: {
      title: '成长中心',
      keepAlive: true,
      requireAuth: true,
      roles: ALL_ROLES,
    },
    path: '/growth',
    name: 'growth',
    component: () => import('@/view/growth/GrowthPage.vue'),
  },
  {
    meta: {
      title: '资源商店',
      keepAlive: true,
      requireAuth: true,
      roles: ALL_ROLES,
    },
    path: '/store',
    name: 'entitlementStore',
    component: () => import('@/view/entitlementStore/EntitlementStore.vue'),
  },
  {
    meta: {
      title: '支持轻笺',
      keepAlive: true,
      requireAuth: true,
      roles: ALL_ROLES,
    },
    path: '/support',
    name: 'support',
    component: () => import('@/view/support/SupportUs.vue'),
  },
];

export default commonRouter;
