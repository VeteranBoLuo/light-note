import { RouteRecordRaw } from 'vue-router';
import { ALL_ROLES } from '@/config/bookmarkCfg.ts';

const searchBatchRouter: RouteRecordRaw = {
  meta: {
    title: '批量标签操作',
    keepAlive: false,
    requireAuth: true,
    roles: ALL_ROLES,
  },
  path: '/search/batch-tags',
  name: 'searchBatchTags',
  component: () => import('@/view/search/SearchBatchTags.vue'),
};

export default searchBatchRouter;
