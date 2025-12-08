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
// import workbenchesRouter from '@/router/modules/workbenches.ts';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      roles: [RoleEnum.Root, RoleEnum.ADMIN, RoleEnum.VISITOR],
    },
    path: '/',
    name: '/',
    redirect: '/home',
    component: () => import('@/view/index.vue'),
    // 放入此处的有顶部导航栏
    children: [
      // workbenchesRouter,
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

export default router;
