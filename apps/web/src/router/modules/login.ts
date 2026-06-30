import { RouteRecordRaw } from 'vue-router';
import { RoleEnum } from '@/config/bookmarkCfg.ts';

const loginRouter: RouteRecordRaw = {
  meta: {
    roles: [RoleEnum.Root, RoleEnum.ADMIN, RoleEnum.VISITOR],
  },
  path: '/login',
  name: 'login',
  component: () => import('@/view/login/UserAuthModal.vue'),
};

export default loginRouter;
