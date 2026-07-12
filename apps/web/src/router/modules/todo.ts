import { RouteRecordRaw } from 'vue-router';
import { ALL_ROLES } from '@/config/bookmarkCfg.ts';

const todoRouter: RouteRecordRaw = {
  meta: {
    title: '待办',
    roles: ALL_ROLES,
  },
  path: '/todo',
  name: 'todo',
  component: () => import('@/view/todo/Todo.vue'),
};

export default todoRouter;
