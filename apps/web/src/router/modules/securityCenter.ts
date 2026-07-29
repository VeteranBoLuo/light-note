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
    component: () => import('@/view/admin/components/securityCenter/SecurityCenterMobile.vue'),
  },
  {
    meta: securityCenterMeta,
    path: '/securityOverview',
    name: 'securityOverview',
    component: () => import('@/view/admin/components/securityCenter/OverviewMobile.vue'),
  },
  {
    meta: securityCenterMeta,
    path: '/securityEvents',
    name: 'securityEvents',
    component: () => import('@/view/admin/components/securityCenter/EventsMobile.vue'),
  },
  {
    meta: securityCenterMeta,
    path: '/securityIps',
    name: 'securityIps',
    component: () => import('@/view/admin/components/securityCenter/IpsMobile.vue'),
  },
  {
    meta: securityCenterMeta,
    path: '/securityAccountReputation',
    name: 'securityAccountReputation',
    component: () => import('@/view/admin/components/securityCenter/AccountReputationMobile.vue'),
  },
  {
    meta: securityCenterMeta,
    path: '/securityRules',
    name: 'securityRules',
    component: () => import('@/view/admin/components/securityCenter/RulesMobile.vue'),
  },
  {
    meta: securityCenterMeta,
    path: '/securityWhitelist',
    name: 'securityWhitelist',
    component: () => import('@/view/admin/components/securityCenter/WhitelistMobile.vue'),
  },
];

export default securityCenterRouter;
