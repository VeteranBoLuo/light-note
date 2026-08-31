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
    meta: { ...homeMeta, title: '知识工具箱' },
    component: () => import('@/view/toolbox/ToolboxHome.vue'),
  },
  {
    path: '/toolbox/task/:jobId',
    name: 'toolboxTask',
    meta: { ...commonMeta, title: '处理任务' },
    component: () => import('@/view/toolbox/ToolboxTask.vue'),
  },
  {
    path: '/toolbox/project',
    redirect: { name: 'toolboxPresentationProjects' },
    meta: { ...commonMeta, title: '生产工作室' },
  },
  {
    path: '/toolbox/project/documents',
    name: 'toolboxDocumentProjects',
    meta: { ...commonMeta, title: '旧版文档项目' },
    component: () => import('@/view/toolbox/ToolboxDocumentProjects.vue'),
  },
  {
    path: '/toolbox/project/documents/:projectId',
    name: 'toolboxDocumentProject',
    meta: { ...commonMeta, title: '旧版文档项目' },
    component: () => import('@/view/toolbox/ToolboxDocumentProjectEditor.vue'),
  },
  {
    path: '/toolbox/project/presentations',
    name: 'toolboxPresentationProjects',
    meta: { ...commonMeta, title: '演示文稿工作室' },
    component: () => import('@/view/toolbox/ToolboxPresentationProjects.vue'),
  },
  {
    path: '/toolbox/project/presentations/:projectId',
    name: 'toolboxPresentationProject',
    meta: { ...commonMeta, title: '演示文稿工作室' },
    component: () => import('@/view/toolbox/ToolboxPresentationProjectEditor.vue'),
  },
  {
    path: '/toolbox/project/workbooks',
    name: 'toolboxWorkbookProjects',
    meta: { ...commonMeta, title: '电子表格工作室' },
    component: () => import('@/view/toolbox/ToolboxWorkbookProjects.vue'),
  },
  {
    path: '/toolbox/project/workbooks/:projectId',
    name: 'toolboxWorkbookProject',
    meta: { ...commonMeta, title: '电子表格工作室' },
    component: () => import('@/view/toolbox/ToolboxWorkbookProjectEditor.vue'),
  },
  {
    path: '/toolbox/:toolId',
    name: 'toolboxWorkbench',
    meta: { ...commonMeta, title: '知识工具箱' },
    component: () => import('@/view/toolbox/ToolboxWorkbench.vue'),
  },
];

export default toolboxRouter;
