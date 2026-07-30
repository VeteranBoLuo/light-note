import { RouteRecordRaw } from 'vue-router';
import { ALL_ROLES } from '@/config/bookmarkCfg.ts';

const workbenchesRouter: RouteRecordRaw = {
  meta: {
    roles: ALL_ROLES,
    mobileBottomNav: true,
  },
  path: '/workbenches',
  name: 'workbenches',
  component: () => import('@/view/workbenches/Workbenches.vue'),
};

export default workbenchesRouter;
