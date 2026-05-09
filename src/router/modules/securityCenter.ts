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
    name: 'securityCenter',
    component: () => import('@/view/admin/components/securityCenter/SecurityCenter.vue'),
    children: [
      {
        path: '',
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
        path: 'rules',
        name: 'securityCenterRules',
        component: () => import('@/view/admin/components/securityCenter/Rules.vue'),
      },
    ],
  },
];

export default securityCenterRouter;
