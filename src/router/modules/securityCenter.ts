import { RouteRecordRaw } from 'vue-router';
import { RoleEnum } from '@/config/bookmarkCfg.ts';

const securityCenterMeta = {
  title: '安全中心',
  keepAlive: true,
  requireAuth: true,
  roles: [RoleEnum.Root],
};

const securityCenterRouter: RouteRecordRaw[] = [
  {
    meta: securityCenterMeta,
    path: '/securityCenter',
    component: () => import('@/view/admin/components/securityCenter/SecurityCenterMg.vue'),
    children: [
      {
        path: '',
        name: 'securityCenter',
        redirect: { name: 'securityCenterOverview' },
      },
      {
        path: 'overview',
        name: 'securityCenterOverview',
        component: () => import('@/view/admin/components/securityCenter/Overview.vue'),
      },
      {
        path: 'events',
        name: 'securityCenterEvents',
        component: () => import('@/view/admin/components/securityCenter/Events.vue'),
      },
      {
        path: 'ips',
        name: 'securityCenterIps',
        component: () => import('@/view/admin/components/securityCenter/Ips.vue'),
      },
      {
        path: 'account-bans',
        name: 'securityCenterAccountBans',
        component: () => import('@/view/admin/components/securityCenter/AccountBans.vue'),
      },
      {
        path: 'account-reputation',
        name: 'securityCenterAccountReputation',
        component: () => import('@/view/admin/components/securityCenter/AccountReputation.vue'),
      },
      {
        path: 'whitelist',
        name: 'securityCenterWhitelist',
        component: () => import('@/view/admin/components/securityCenter/Whitelist.vue'),
      },
      {
        path: 'rules',
        name: 'securityCenterRules',
        component: () => import('@/view/admin/components/securityCenter/Rules.vue'),
      },
    ],
  },
  // 移动端安全中心路由
  {
    meta: securityCenterMeta,
    path: '/securityCenterMobile',
    name: 'securityCenterMobile',
    component: () => import('@/view/admin/components/securityCenter/PSecurityCenter.vue'),
  },
  {
    meta: securityCenterMeta,
    path: '/securityOverview',
    name: 'securityOverview',
    component: () => import('@/view/admin/components/securityCenter/POverview.vue'),
  },
  {
    meta: securityCenterMeta,
    path: '/securityEvents',
    name: 'securityEvents',
    component: () => import('@/view/admin/components/securityCenter/PEvents.vue'),
  },
  {
    meta: securityCenterMeta,
    path: '/securityIps',
    name: 'securityIps',
    component: () => import('@/view/admin/components/securityCenter/PIps.vue'),
  },
  {
    meta: securityCenterMeta,
    path: '/securityAccountBans',
    name: 'securityAccountBans',
    component: () => import('@/view/admin/components/securityCenter/PAccountBans.vue'),
  },
  {
    meta: securityCenterMeta,
    path: '/securityAccountReputation',
    name: 'securityAccountReputation',
    component: () => import('@/view/admin/components/securityCenter/PAccountReputation.vue'),
  },
  {
    meta: securityCenterMeta,
    path: '/securityRules',
    name: 'securityRules',
    component: () => import('@/view/admin/components/securityCenter/PRules.vue'),
  },
  {
    meta: securityCenterMeta,
    path: '/securityWhitelist',
    name: 'securityWhitelist',
    component: () => import('@/view/admin/components/securityCenter/PWhitelist.vue'),
  },
];

export default securityCenterRouter;
