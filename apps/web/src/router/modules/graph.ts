import { RouteRecordRaw } from 'vue-router';
import { ALL_ROLES } from '@/config/bookmarkCfg.ts';

// 全局知识图谱:root 专属
const graphRouter: RouteRecordRaw = {
  meta: {
    title: '知识图谱',
    requireAuth: true,
    roles: ALL_ROLES,
  },
  path: '/graph',
  name: 'globalGraph',
  component: () => import('@/view/graph/GlobalGraph.vue'),
};

export default graphRouter;
