import { RouteRecordRaw } from 'vue-router';
import { ALL_ROLES } from '@/config/bookmarkCfg.ts';

const trashRouter: RouteRecordRaw = {
  meta: {
    roles: ALL_ROLES,
  },
  path: '/trash',
  name: 'trash',
  component: () => import('@/view/trash/Trash.vue'),
};

export default trashRouter;
