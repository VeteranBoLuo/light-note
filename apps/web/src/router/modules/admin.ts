import { RouteRecordRaw } from 'vue-router';
import { RoleEnum } from '@/config/bookmarkCfg.ts';

const adminRouter: RouteRecordRaw[] = [
  {
    meta: {
      title: '后台管理',
      keepAlive: true,
      requireAuth: true,
      roles: [RoleEnum.Root],
    },
    path: '/admin',
    name: 'admin',
    redirect: '/admin/operationLog',
    component: () => import('@/view/admin/AdminMg.vue'),
    children: [
      {
        path: 'apiLog',
        component: () => import('@/view/admin/components/apiLog/ApiLog.vue'),
      },
      {
        path: 'operationLog',
        component: () => import('@/view/admin/components/operationLog/OperationLog.vue'),
      },
      {
        path: 'userMg',
        component: () => import('@/view/admin/components/userMg/UserMg.vue'),
      },
      {
        path: 'userOpinion',
        component: () => import('@/view/admin/components/userOpinion/UserOpinion.vue'),
      },
      {
        path: 'imageMg',
        component: () => import('@/view/admin/components/imageMg/ImageMg.vue'),
      },
      {
        path: 'simpleSql',
        component: () => import('@/view/admin/components/SimpleSql.vue'),
      },
      {
        path: 'agentLog',
        component: () => import('@/view/admin/components/agentLog/AgentLog.vue'),
      },
      {
        path: 'conversion',
        component: () => import('@/view/admin/components/conversion/ConversionFunnel.vue'),
      },
      {
        path: 'logCleanup',
        component: () => import('@/view/admin/components/logCleanup/LogCleanup.vue'),
      },
    ],
  },
  {
    path: 'apiLog',
    component: () => import('@/view/admin/components/apiLog/PApiLog.vue'),
  },
  {
    path: 'operationLog',
    component: () => import('@/view/admin/components/operationLog/POperationLog.vue'),
  },
  {
    path: 'userMg',
    component: () => import('@/view/admin/components/userMg/PUserMg.vue'),
  },
  {
    path: 'userOpinion',
    component: () => import('@/view/admin/components/userOpinion/PUserOpinion.vue'),
  },
  {
    path: 'imageMg',
    component: () => import('@/view/admin/components/imageMg/PImageMg.vue'),
  },
  {
    path: 'agentLog',
    component: () => import('@/view/admin/components/agentLog/PAgentLog.vue'),
  },
  {
    path: 'conversion',
    component: () => import('@/view/admin/components/conversion/ConversionFunnel.vue'),
  },
  {
    path: 'logCleanup',
    component: () => import('@/view/admin/components/logCleanup/LogCleanup.vue'),
  },
];

export default adminRouter;
