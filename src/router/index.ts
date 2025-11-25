import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router';

import loginRouter from '@/router/modules/login';
import mainPageRouter from '@/router/modules/mainPage';
import statusRouter from '@/router/modules/status';
import commonRouter from '@/router/modules/common';
import adminRouter from '@/router/modules/admin';
import manageRouter from '@/router/modules/manage.ts';
import phoneRouter from '@/router/modules/phone';
import noteLibraryRouter from '@/router/modules/noteLibrary.ts';
import { RoleEnum } from '@/config/bookmarkCfg.ts';
import cloudSpaceRouter from '@/router/modules/cloudSpace.ts';
import workbenchesRouter from '@/router/modules/workbenches.ts';
import { useUserStore, bookmarkStore } from '@/store';

// 跳过登录显示的路由名称列表
const skipRouter = ['help', 'noteDetail', 'updateLogs', 'githubCallBack', 'not-found', 'not-role'];

// 手机端路由映射：从桌面端路径映射到手机端路径
const phoneReplaceMap = {
  '/admin/apiLog': '/apiLog',
  '/admin/userMg': '/userMg',
  '/admin/userOpinion': '/userOpinion',
  '/admin/operationLog': '/operationLog',
  '/admin/imageMg': '/imageMg',
  '/workbenches': '/home',
  '/': '/home',
};

// 桌面端路由映射：从手机端路径映射到桌面端路径
const deskReplaceMap = {
  '/apiLog': '/admin/apiLog',
  '/userMg': '/admin/userMg',
  '/userOpinion': '/admin/userOpinion',
  '/operationLog': '/admin/operationLog',
  '/imageMg': '/admin/imageMg',
  '/opinions': '/home',
  '/admin': '/admin/operationLog',
};

// 处理用户登出：清除本地存储并显示登录界面
function handleUserLogout() {
  localStorage.setItem('userId', '');
  const bookmark = bookmarkStore();
  bookmark.isShowLogin = true;
}

// 处理路由变化：根据设备类型切换路由
function handleRouteChange(isMobile: boolean, path: string, router: any) {
  if (isMobile) {
    if (phoneReplaceMap[path]) {
      router.push(phoneReplaceMap[path]);
    }
  } else {
    if (deskReplaceMap[path]) {
      router.push(deskReplaceMap[path]);
    }
  }
}

// 路由配置
const routes: RouteRecordRaw[] = [
  {
    meta: {
      roles: [RoleEnum.Root, RoleEnum.ADMIN, RoleEnum.VISITOR],
    },
    path: '/',
    name: '/',
    redirect: '/workbenches',
    component: () => import('@/view/index.vue'),
    // 放入此处的有顶部导航栏
    children: [
      workbenchesRouter,
      mainPageRouter,
      ...commonRouter,
      ...adminRouter,
      manageRouter,
      ...noteLibraryRouter,
      ...cloudSpaceRouter,
    ],
  },
  {
    meta: {
      roles: [RoleEnum.Root, RoleEnum.ADMIN, RoleEnum.VISITOR],
    },
    path: '/personCenter',
    name: 'personCenter',
    component: () => import('@/view/personCenter/PPersonCenter.vue'),
  },
  loginRouter,
  ...statusRouter,
  ...phoneRouter,
  {
    meta: {
      roles: [RoleEnum.Root, RoleEnum.ADMIN, RoleEnum.VISITOR],
    },
    path: '/auth/callback',
    name: 'githubCallBack',
    component: () => import('@/view/auth/callback/GithubCallBack.vue'),
  },
];

// 创建路由实例
const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

// 路由守卫：检查权限和其他逻辑
router.beforeEach(async (to, from, next) => {
  const user = useUserStore();
  const bookmark = bookmarkStore();

  // 检查权限
  const requiredRoles = to.meta?.roles as RoleEnum[] | undefined;
  if (requiredRoles && !requiredRoles.includes(user.role as RoleEnum)) {
    next('/login');
    return;
  }

  // 处理路由变化
  if (to.name === 'workbenches') {
    handleRouteChange(bookmark.isMobile, to.path, router);
  }

  // 从 GitHub 回调回来时触发获取用户信息事件
  if (from.name === 'githubCallBack') {
    window.dispatchEvent(new CustomEvent('fetchUserInfo'));
  }

  // 跳过登录显示的路由
  if (skipRouter.includes(to.name as string)) {
    bookmark.isShowLogin = false;
  }

  next();
});

export default router;
