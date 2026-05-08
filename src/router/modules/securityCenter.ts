import { RouteRecordRaw } from 'vue-router';
import { RoleEnum } from '@/config/bookmarkCfg.ts';

const securityCenterRouter: RouteRecordRaw = {
  meta: {
    title: '安全中心',
    keepAlive: true,
    requireAuth: true,
    roles: [RoleEnum.Root],
  },
  path: '/securityCenter',
  name: 'securityCenter',
  component: () => import('@/view/admin/components/securityCenter/SecurityCenter.vue'),
};

export default securityCenterRouter;
