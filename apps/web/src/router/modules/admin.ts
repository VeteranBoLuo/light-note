import { RouteRecordRaw } from 'vue-router';
import { RoleEnum } from '@/config/bookmarkCfg.ts';

// 移动端扁平后台路由(App.vue phoneReplaceMap 的映射目标)统一 Root 守卫:
// 此前这批路由无 meta.roles,前端仅靠 App.vue 的 mobileAdminRoute 兜底列表(覆盖不全);后端 ensureRootRole 仍是硬边界。
const MOBILE_ADMIN_META = { title: '后台管理', requireAuth: true, roles: [RoleEnum.Root] };

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
    redirect: '/admin/overview',
    component: () => import('@/view/admin/AdminMg.vue'),
    children: [
      {
        path: 'overview',
        component: () => import('@/view/admin/components/overview/AdminOverview.vue'),
      },
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
        path: 'aiFeedback',
        component: () => import('@/view/admin/components/aiFeedback/AiFeedback.vue'),
      },
      {
        path: 'conversion',
        component: () => import('@/view/admin/components/conversion/ConversionFunnel.vue'),
      },
      {
        path: 'logCleanup',
        component: () => import('@/view/admin/components/logCleanup/LogCleanup.vue'),
      },
      {
        path: 'logExclude',
        component: () => import('@/view/admin/components/logExclude/LogExclude.vue'),
      },
      {
        path: 'pointsOps',
        component: () => import('@/view/admin/components/pointsOps/PointsOps.vue'),
      },
    ],
  },
  {
    path: 'overview',
    meta: MOBILE_ADMIN_META,
    component: () => import('@/view/admin/components/overview/AdminOverview.vue'),
  },
  {
    path: 'apiLog',
    meta: MOBILE_ADMIN_META,
    component: () => import('@/view/admin/components/apiLog/PApiLog.vue'),
  },
  {
    path: 'operationLog',
    meta: MOBILE_ADMIN_META,
    component: () => import('@/view/admin/components/operationLog/POperationLog.vue'),
  },
  {
    path: 'userMg',
    meta: MOBILE_ADMIN_META,
    component: () => import('@/view/admin/components/userMg/PUserMg.vue'),
  },
  {
    path: 'userOpinion',
    meta: MOBILE_ADMIN_META,
    component: () => import('@/view/admin/components/userOpinion/PUserOpinion.vue'),
  },
  {
    path: 'imageMg',
    meta: MOBILE_ADMIN_META,
    component: () => import('@/view/admin/components/imageMg/PImageMg.vue'),
  },
  {
    path: 'agentLog',
    meta: MOBILE_ADMIN_META,
    component: () => import('@/view/admin/components/agentLog/PAgentLog.vue'),
  },
  {
    path: 'aiFeedback',
    meta: MOBILE_ADMIN_META,
    component: () => import('@/view/admin/components/aiFeedback/AiFeedback.vue'),
  },
  {
    path: 'conversion',
    meta: MOBILE_ADMIN_META,
    component: () => import('@/view/admin/components/conversion/ConversionFunnel.vue'),
  },
  {
    path: 'logCleanup',
    meta: MOBILE_ADMIN_META,
    component: () => import('@/view/admin/components/logCleanup/LogCleanup.vue'),
  },
  {
    path: 'logExclude',
    meta: MOBILE_ADMIN_META,
    component: () => import('@/view/admin/components/logExclude/LogExclude.vue'),
  },
];

export default adminRouter;
