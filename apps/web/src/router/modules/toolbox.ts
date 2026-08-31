import type { RouteRecordRaw } from 'vue-router';
import { ALL_ROLES } from '@/config/bookmarkCfg';

const commonMeta = {
  roles: ALL_ROLES,
  requireAuth: true,
  mobileShell: 'toolbox',
  mobileBottomNav: false,
} as const;

const homeMeta = {
  ...commonMeta,
  mobileBottomNav: true,
} as const;

const toolboxRouter: RouteRecordRaw[] = [
  {
    path: '/toolbox',
    name: 'toolboxHome',
    meta: { ...homeMeta, title: '知识工坊' },
    component: () => import('@/view/toolbox/ToolboxHome.vue'),
  },
  {
    path: '/toolbox/task/:jobId',
    name: 'toolboxTask',
    meta: { ...commonMeta, title: '处理任务' },
    component: () => import('@/view/toolbox/ToolboxTask.vue'),
  },
  {
    path: '/toolbox/:toolId',
    name: 'toolboxWorkbench',
    meta: { ...commonMeta, title: '知识工坊' },
    component: () => import('@/view/toolbox/ToolboxWorkbench.vue'),
  },
];

export default toolboxRouter;
