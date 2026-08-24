import { RouteRecordRaw } from 'vue-router';
import { RoleEnum } from '@/config/bookmarkCfg.ts';

// 移动端扁平后台路由(App.vue phoneReplaceMap 的映射目标)统一 Root 守卫:
// 此前这批路由无 meta.roles,前端仅靠 App.vue 的 mobileAdminRoute 兜底列表(覆盖不全);后端 ensureRootRole 仍是硬边界。
const MOBILE_ADMIN_META = { title: '后台管理', requireAuth: true, roles: [RoleEnum.Root] };

const adminRouter: RouteRecordRaw[] = [
  {
    path: '/serverManagement',
    name: 'serverManagement',
    meta: {
      title: '服务器管理',
      requireAuth: true,
      roles: [RoleEnum.Root],
    },
    redirect: '/serverManagement/overview',
    component: () => import('@/view/serverManagement/ServerManagementShell.vue'),
    children: [
      {
        path: 'overview',
        meta: { infraModule: 'overview' },
        component: () => import('@/view/serverManagement/ServerManagement.vue'),
      },
      {
        path: 'diagnostics',
        meta: { infraModule: 'diagnostics' },
        component: () => import('@/view/serverManagement/ServerDiagnostics.vue'),
      },
      {
        path: 'services',
        meta: { infraModule: 'services' },
        component: () => import('@/view/serverManagement/ServerServices.vue'),
      },
      {
        path: 'security',
        meta: { infraModule: 'security' },
        component: () => import('@/view/serverManagement/ServerSecurity.vue'),
      },
      {
        path: 'storage',
        meta: { infraModule: 'storage' },
        component: () => import('@/view/serverManagement/ServerStorage.vue'),
      },
      {
        path: 'events',
        meta: { infraModule: 'events' },
        component: () => import('@/view/serverManagement/ServerEvents.vue'),
      },
    ],
  },
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
        path: 'actionCenter',
        component: () => import('@/view/admin/components/actionCenter/ActionCenter.vue'),
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
        path: 'adminAudit',
        component: () => import('@/view/admin/components/adminAudit/AdminAudit.vue'),
      },
      {
        path: 'todoPlanDiagnostics',
        component: () => import('@/view/admin/components/todoPlanDiagnostics/TodoPlanDiagnostics.vue'),
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
        path: 'communityChatModeration',
        component: () => import('@/view/admin/components/communityChat/CommunityChatModerationAdmin.vue'),
      },
      {
        path: 'resourceGovernance',
        component: () => import('@/view/admin/components/resourceGovernance/ResourceGovernance.vue'),
      },
      {
        path: 'imageMg',
        redirect: '/admin/resourceGovernance',
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
        path: 'productInsights',
        component: () => import('@/view/admin/components/productInsights/ProductInsights.vue'),
      },
      {
        path: 'conversion',
        component: () => import('@/view/admin/components/conversion/ConversionFunnel.vue'),
      },
      {
        path: 'supportManagement',
        component: () => import('@/view/admin/components/supportManagement/SupportManagement.vue'),
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
      {
        path: 'adminGovernance',
        component: () => import('@/view/admin/components/adminGovernance/AdminGovernance.vue'),
      },
    ],
  },
  {
    path: 'overview',
    meta: MOBILE_ADMIN_META,
    component: () => import('@/view/admin/components/overview/AdminOverview.vue'),
  },
  {
    path: 'actionCenter',
    meta: MOBILE_ADMIN_META,
    component: () => import('@/view/admin/components/actionCenter/ActionCenter.vue'),
  },
  {
    path: 'apiLog',
    meta: MOBILE_ADMIN_META,
    component: () => import('@/view/admin/components/apiLog/ApiLogMobile.vue'),
  },
  {
    path: 'operationLog',
    meta: MOBILE_ADMIN_META,
    component: () => import('@/view/admin/components/operationLog/OperationLogMobile.vue'),
  },
  {
    path: 'adminAudit',
    meta: MOBILE_ADMIN_META,
    component: () => import('@/view/admin/components/adminAudit/AdminAudit.vue'),
  },
  {
    path: 'todoPlanDiagnostics',
    meta: MOBILE_ADMIN_META,
    component: () => import('@/view/admin/components/todoPlanDiagnostics/TodoPlanDiagnostics.vue'),
  },
  {
    path: 'userMg',
    meta: MOBILE_ADMIN_META,
    component: () => import('@/view/admin/components/userMg/UserMgMobile.vue'),
  },
  {
    path: 'userOpinion',
    meta: MOBILE_ADMIN_META,
    component: () => import('@/view/admin/components/userOpinion/UserOpinionMobile.vue'),
  },
  {
    path: 'communityChatModeration',
    meta: MOBILE_ADMIN_META,
    component: () => import('@/view/admin/components/communityChat/CommunityChatModerationAdmin.vue'),
  },
  {
    path: 'resourceGovernance',
    meta: MOBILE_ADMIN_META,
    component: () => import('@/view/admin/components/resourceGovernance/ResourceGovernance.vue'),
  },
  {
    path: 'imageMg',
    meta: MOBILE_ADMIN_META,
    redirect: '/resourceGovernance',
  },
  {
    path: 'agentLog',
    meta: MOBILE_ADMIN_META,
    component: () => import('@/view/admin/components/agentLog/AgentLogMobile.vue'),
  },
  {
    path: 'aiFeedback',
    meta: MOBILE_ADMIN_META,
    component: () => import('@/view/admin/components/aiFeedback/AiFeedback.vue'),
  },
  {
    path: 'productInsights',
    meta: MOBILE_ADMIN_META,
    component: () => import('@/view/admin/components/productInsights/ProductInsights.vue'),
  },
  {
    path: 'conversion',
    meta: MOBILE_ADMIN_META,
    component: () => import('@/view/admin/components/conversion/ConversionFunnel.vue'),
  },
  {
    path: 'supportManagement',
    meta: MOBILE_ADMIN_META,
    component: () => import('@/view/admin/components/supportManagement/SupportManagement.vue'),
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
  {
    path: 'adminGovernance',
    meta: MOBILE_ADMIN_META,
    component: () => import('@/view/admin/components/adminGovernance/AdminGovernance.vue'),
  },
];

export default adminRouter;
