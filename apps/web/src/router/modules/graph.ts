import { RouteRecordRaw } from 'vue-router';
import { ALL_ROLES } from '@/config/bookmarkCfg.ts';

// 全局知识地图：已登录用户可浏览自己的标签主题关系
const graphRouter: RouteRecordRaw = {
  meta: {
    title: '知识地图',
    requireAuth: true,
    roles: ALL_ROLES,
  },
  path: '/graph',
  name: 'globalGraph',
  component: () => import('@/view/graph/GlobalGraph.vue'),
};

export default graphRouter;
