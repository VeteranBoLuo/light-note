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
import searchBatchRouter from '@/router/modules/searchBatch.ts';
import tagDetailRouter from '@/router/modules/tagDetail.ts';
import trashRouter from '@/router/modules/trash.ts';
import knowledgeBaseRouter from '@/router/modules/knowledgeBase.ts';
import graphRouter from '@/router/modules/graph.ts';
import { getDesktopHomePath } from '@/utils/preferences.ts';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      roles: [RoleEnum.Root, RoleEnum.ADMIN, RoleEnum.VISITOR],
    },
    path: '/',
    name: '/',
    redirect: () => {
      if (window.innerWidth < 1024) return '/home';
      return getDesktopHomePath(JSON.parse(localStorage.getItem('preferences') || '{}'));
    },
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
      searchBatchRouter,
      tagDetailRouter,
      trashRouter,
      knowledgeBaseRouter,
      graphRouter,
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
  {
    path: '/landing',
    name: 'landing',
    component: () => import('@/view/landing/Landing.vue'),
  },
  {
    path: '/banned',
    name: 'banned',
    component: () => import('@/view/banned/BannedAppeal.vue'),
  },
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
    path: '/share/:id/:token/:fileName?/:fileType?/:desc?',
    name: 'shareDownload',
    component: () => import('@/view/share/ShareDownload.vue'),
  },
];

// 创建路由实例
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

// 兜底:部分懒加载 chunk 请求失败不会经过 vite:preloadError(见 main.ts),
// 而是直接以路由导航错误的形式出现,这里按错误信息匹配后自动刷新自愈。
// 用 sessionStorage 打标防止死循环刷新(比如目标 chunk 在新版本里也确实不存在了)。
const CHUNK_ERROR_PATTERN = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;
const CHUNK_RELOAD_FLAG = 'ln-chunk-reload-attempted';

router.onError((error, to) => {
  if (!CHUNK_ERROR_PATTERN.test(error?.message || '')) return;
  if (sessionStorage.getItem(CHUNK_RELOAD_FLAG)) return; // 已重试过一次,避免死循环
  sessionStorage.setItem(CHUNK_RELOAD_FLAG, '1');
  window.location.href = to.fullPath;
});

router.afterEach(() => {
  sessionStorage.removeItem(CHUNK_RELOAD_FLAG);
});

export default router;
