import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';

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
import securityCenterRouter from '@/router/modules/securityCenter.ts';
import searchRouter from '@/router/modules/search.ts';
import tagDetailRouter from '@/router/modules/tagDetail.ts';
import trashRouter from '@/router/modules/trash.ts';
import { getDesktopHomePath } from '@/utils/preferences.ts';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      roles: [RoleEnum.Root, RoleEnum.ADMIN, RoleEnum.VISITOR],
    },
    path: '/',
    name: '/',
    redirect: () => getDesktopHomePath(JSON.parse(localStorage.getItem('preferences') || '{}')),
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
      searchRouter,
      tagDetailRouter,
      trashRouter,
      ...securityCenterRouter,
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
  {
    path: '/share/:id/:fileName?/:fileType?/:desc?',
    name: 'shareDownload',
    component: () => import('@/view/share/ShareDownload.vue'),
  },
];

// 创建路由实例
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

export default router;
