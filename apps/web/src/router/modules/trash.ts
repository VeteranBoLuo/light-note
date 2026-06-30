import { RouteRecordRaw } from 'vue-router';
import { RoleEnum } from '@/config/bookmarkCfg.ts';

const trashRouter: RouteRecordRaw = {
  meta: {
    roles: [RoleEnum.Root, RoleEnum.ADMIN, RoleEnum.VISITOR],
  },
  path: '/trash',
  name: 'trash',
  component: () => import('@/view/trash/Trash.vue'),
};

export default trashRouter;
