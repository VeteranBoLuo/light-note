import { RouteRecordRaw } from 'vue-router';
import { RoleEnum } from '@/config/bookmarkCfg.ts';

const workbenchesRouter: RouteRecordRaw = {
  meta: {
    roles: [RoleEnum.Root, RoleEnum.ADMIN, RoleEnum.VISITOR],
  },
  path: '/workbenches',
  name: 'workbenches',
  component: () => import('@/view/workbenches/Workbenches.vue'),
};

export default workbenchesRouter;
