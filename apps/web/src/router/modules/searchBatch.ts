import { RouteRecordRaw } from 'vue-router';
import { RoleEnum } from '@/config/bookmarkCfg.ts';

const searchBatchRouter: RouteRecordRaw = {
  meta: {
    title: '批量标签操作',
    keepAlive: false,
    requireAuth: true,
    roles: [RoleEnum.Root, RoleEnum.ADMIN, RoleEnum.VISITOR],
  },
  path: '/search/batch-tags',
  name: 'searchBatchTags',
  component: () => import('@/view/search/SearchBatchTags.vue'),
};

export default searchBatchRouter;
