import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';

import loginRouter from '@/router/modules/login';
import mainPageRouter from '@/router/modules/mainPage';
import statusRouter from '@/router/modules/status';
import commonRouter from '@/router/modules/common';
import adminRouter from '@/router/modules/admin';
import manageRouter from '@/router/modules/manage.ts';
import phoneRouter from '@/router/modules/phone';
import noteLibraryRouter from '@/router/modules/noteLibrary.ts';
import { ALL_ROLES } from '@/config/bookmarkCfg.ts';
import cloudSpaceRouter from '@/router/modules/cloudSpace.ts';
import workbenchesRouter from '@/router/modules/workbenches.ts';
import securityCenterRouter from '@/router/modules/securityCenter.ts';
import notificationCenterRouter from '@/router/modules/notificationCenter.ts';
import searchRouter from '@/router/modules/search.ts';
import searchBatchRouter from '@/router/modules/searchBatch.ts';
import tagDetailRouter from '@/router/modules/tagDetail.ts';
import trashRouter from '@/router/modules/trash.ts';
import knowledgeBaseRouter from '@/router/modules/knowledgeBase.ts';
import graphRouter from '@/router/modules/graph.ts';
import inboxRouter from '@/router/modules/inbox.ts';
import { getDesktopHomePath } from '@/utils/preferences.ts';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      roles: ALL_ROLES,
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
      inboxRouter,
      ...securityCenterRouter,
      notificationCenterRouter,
    ],
  },
  {
    meta: {
      roles: ALL_ROLES,
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
  {
    // 一键收藏落地页(bookmarklet 弹窗打开):独立无导航壳,自己处理登录态
    path: '/quick-save',
    name: 'quickSave',
    component: () => import('@/view/quickSave/QuickSave.vue'),
  },
  ...statusRouter,
  ...phoneRouter,
  {
    meta: {
      roles: ALL_ROLES,
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

// 记录"用户正要去哪":异步组件解析(可能因 chunk 404 而失败)之前先落一份目标路径,
// 供 main.ts 的 vite:preloadError 兜底使用,让自愈刷新精确落到用户点击的目标页,
// 而不是退回到点击前的旧页面(那样用户还得再点一次)。
let pendingNavigationTarget = '';
router.beforeEach((to) => {
  pendingNavigationTarget = to.fullPath;
});
export function getPendingNavigationTarget() {
  return pendingNavigationTarget || window.location.pathname + window.location.search;
}

// 两处 chunk-404 兜底(这里的 onError 与 main.ts 的 vite:preloadError)共用同一把
// sessionStorage 锁:无论哪个先触发、或两个都触发,只会真正跳转一次,防止死循环刷新
// (比如目标 chunk 在新版本里也确实不存在了,这种情况应该暴露问题而不是无限刷新)。
const CHUNK_RELOAD_FLAG = 'ln-chunk-reload-attempted';
export function reloadOnceTo(target: string) {
  if (sessionStorage.getItem(CHUNK_RELOAD_FLAG)) return false;
  sessionStorage.setItem(CHUNK_RELOAD_FLAG, '1');
  window.location.href = target;
  return true;
}

// 兜底:部分懒加载 chunk 请求失败不会经过 vite:preloadError(见 main.ts),
// 而是直接以路由导航错误的形式出现,这里按错误信息匹配后自动刷新自愈。
const CHUNK_ERROR_PATTERN = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;

router.onError((error, to) => {
  if (!CHUNK_ERROR_PATTERN.test(error?.message || '')) return;
  reloadOnceTo(to.fullPath);
});

router.afterEach(() => {
  sessionStorage.removeItem(CHUNK_RELOAD_FLAG);
});

export default router;
