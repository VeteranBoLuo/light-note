import { RouteRecordRaw } from 'vue-router';
import { ALL_ROLES } from '@/config/bookmarkCfg.ts';
import { loadUserAuthModal } from '@/utils/userAuthModalLoader.ts';

const loginRouter: RouteRecordRaw = {
  meta: {
    roles: ALL_ROLES,
  },
  path: '/login',
  name: 'login',
  component: loadUserAuthModal,
};

export default loginRouter;
