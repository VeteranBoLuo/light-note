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
        meta: { securitySection: 'overview' },
      },
      {
        path: 'review',
        name: 'securityCenterReview',
        component: () => import('@/view/admin/components/securityCenter/Events.vue'),
        meta: { securitySection: 'review' },
      },
      {
        path: 'detection-quality',
        name: 'securityCenterQuality',
        component: () => import('@/view/admin/components/securityCenter/Rules.vue'),
        meta: { securitySection: 'quality' },
      },
      {
        path: 'access-control',
        name: 'securityCenterAccess',
        component: () => import('@/view/admin/components/securityCenter/SecurityAccessControl.vue'),
        meta: { securitySection: 'access' },
      },
      {
        path: 'events',
        name: 'securityCenterEvents',
        redirect: { name: 'securityCenterReview' },
      },
      {
        path: 'ips',
        name: 'securityCenterIps',
        redirect: { name: 'securityCenterAccess' },
      },
      {
        path: 'account-reputation',
        name: 'securityCenterAccountReputation',
        redirect: { name: 'securityCenterAccess' },
      },
      {
        path: 'whitelist',
        name: 'securityCenterWhitelist',
        redirect: { name: 'securityCenterAccess' },
      },
      {
        path: 'rules',
        name: 'securityCenterRules',
        redirect: { name: 'securityCenterQuality' },
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
    redirect: { name: 'securityCenterMobile', query: { tab: 'overview' } },
  },
  {
    meta: securityCenterMeta,
    path: '/securityEvents',
    name: 'securityEvents',
    redirect: { name: 'securityCenterMobile', query: { tab: 'review' } },
  },
  {
    meta: securityCenterMeta,
    path: '/securityIps',
    name: 'securityIps',
    redirect: { name: 'securityCenterMobile', query: { tab: 'access' } },
  },
  {
    meta: securityCenterMeta,
    path: '/securityAccountReputation',
    name: 'securityAccountReputation',
    redirect: { name: 'securityCenterMobile', query: { tab: 'access' } },
  },
  {
    meta: securityCenterMeta,
    path: '/securityRules',
    name: 'securityRules',
    redirect: { name: 'securityCenterMobile', query: { tab: 'quality' } },
  },
  {
    meta: securityCenterMeta,
    path: '/securityWhitelist',
    name: 'securityWhitelist',
    redirect: { name: 'securityCenterMobile', query: { tab: 'access' } },
  },
];

export default securityCenterRouter;
