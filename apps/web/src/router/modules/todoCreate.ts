import type { RouteRecordRaw } from 'vue-router';
import { ALL_ROLES } from '@/config/bookmarkCfg';

/**
 * 移动端新建待办使用独立页面，避免全屏底部抽屉的长距离入场动画。
 * 路由允许游客进入并预览；真正创建仍由提交动作统一触发游客写入门禁。
 */
const todoCreateRouter: RouteRecordRaw = {
  path: '/todo/new',
  name: 'todoCreate',
  meta: {
    title: '新建待办',
    requireAuth: true,
    roles: ALL_ROLES,
  },
  component: () => import('@/view/todo/TodoCreate.vue'),
};

export default todoCreateRouter;
