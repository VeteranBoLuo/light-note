import { RouteRecordRaw } from 'vue-router';
import { RoleEnum } from '@/config/bookmarkCfg.ts';

// 全局知识图谱:root 专属
const graphRouter: RouteRecordRaw = {
  meta: {
    title: '知识图谱',
    requireAuth: true,
    roles: [RoleEnum.Root, RoleEnum.ADMIN, RoleEnum.VISITOR],
  },
  path: '/graph',
  name: 'globalGraph',
  component: () => import('@/view/graph/GlobalGraph.vue'),
};

export default graphRouter;
