import { createRouter, createWebHashHistory, RouteMeta, RouteRecordRaw } from 'vue-router';
import { Component } from 'vue';

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
export interface AppRouteRecordRaw {
  name?: string;
  meta?: RouteMeta;
  path?: string;
  component?: Component | string;
  components?: Component;
  redirect?: string;
  children?: AppRouteRecordRaw[];
}

const routes: Array<RouteRecordRaw | any> = [
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

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});
export default router;
