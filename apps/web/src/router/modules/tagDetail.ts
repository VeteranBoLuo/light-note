import { RouteRecordRaw } from 'vue-router';
import { ALL_ROLES } from '@/config/bookmarkCfg.ts';

const tagDetailRouter: RouteRecordRaw = {
  meta: {
    title: '标签详情',
    keepAlive: true,
    requireAuth: true,
    roles: ALL_ROLES,
  },
  path: '/tag/:id',
  name: 'tagDetail',
  component: () => import('@/view/tagDetail/TagDetail.vue'),
};

export default tagDetailRouter;
