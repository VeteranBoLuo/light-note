import { RouteRecordRaw } from 'vue-router';
import { ALL_ROLES } from '@/config/bookmarkCfg.ts';

const loginRouter: RouteRecordRaw = {
  meta: {
    roles: ALL_ROLES,
  },
  path: '/login',
  name: 'login',
  component: () => import('@/view/login/UserAuthModal.vue'),
};

export default loginRouter;
