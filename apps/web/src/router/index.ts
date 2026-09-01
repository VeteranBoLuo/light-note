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
import notificationsRouter from '@/router/modules/notifications.ts';
import searchRouter from '@/router/modules/search.ts';
import searchBatchRouter from '@/router/modules/searchBatch.ts';
import tagDetailRouter from '@/router/modules/tagDetail.ts';
import trashRouter from '@/router/modules/trash.ts';
import knowledgeBaseRouter from '@/router/modules/knowledgeBase.ts';
import graphRouter from '@/router/modules/graph.ts';
import inboxRouter from '@/router/modules/inbox.ts';
import organizeRouter from '@/router/modules/organize.ts';
import todoCreateRouter from '@/router/modules/todoCreate.ts';
import coBuildRouter from '@/router/modules/coBuild.ts';
import communityChatRouter from '@/router/modules/communityChat.ts';
import { getRuntimeApplicationEntryPath } from '@/utils/appEntry.ts';
import { resolveLightNoteRuntime, shouldRedirectLandingToApplication } from '@/utils/appRuntime.ts';
import { isMobileViewport } from '@/config/responsive.ts';
import { hasLoggedInBefore } from '@/utils/authStorage.ts';
import { hasVisitedMobileLanding } from '@/utils/mobileLandingVisit.ts';
import { syncRouteSeoMeta } from '@/utils/seoMeta.ts';

function getStoredPreferences() {
  try {
    return JSON.parse(localStorage.getItem('preferences') || '{}');
  } catch {
    return {};
  }
}

export const routes: RouteRecordRaw[] = [
  {
    meta: {
      roles: ALL_ROLES,
    },
    path: '/',
    name: 'appShell',
    component: () => import('@/view/index.vue'),
    // 放入此处的有顶部导航栏
    children: [
      {
        path: '',
        name: 'landing',
        meta: {
          seoIndexable: true,
          canonicalPath: '/',
        },
        component: () => import('@/view/landing/Landing.vue'),
      },
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
      organizeRouter,
      todoCreateRouter,
      communityChatRouter,
      ...coBuildRouter,
      ...securityCenterRouter,
      notificationsRouter,
      notificationCenterRouter,
    ],
  },
  {
    meta: {
      roles: ALL_ROLES,
      mobileShell: 'profile',
      mobileBottomNav: true,
    },
    path: '/personCenter',
    name: 'personCenter',
    component: () => import('@/view/personCenter/PersonCenterMobile.vue'),
  },
  loginRouter,
  {
    path: '/app',
    name: 'appEntry',
    redirect: () => getRuntimeApplicationEntryPath(getStoredPreferences(), window.innerWidth),
  },
  {
    path: '/landing',
    name: 'legacyLanding',
    redirect: '/',
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
  {
    meta: {
      title: '授权轻笺浏览器插件',
      seoIndexable: false,
      hideAiAssistant: true,
    },
    path: '/extension/authorize',
    name: 'extensionAuthorize',
    component: () => import('@/view/extension/ExtensionAuthorize.vue'),
  },
  {
    // Android APK 官网直发落地页:公开可访问、无需登录,独立于应用壳(顶部导航要求登录态,
    // 而这个页面的读者通常还没有账号)。备案号与校验信息必须能被搜索引擎和普通访客直接看到。
    meta: {
      title: '下载轻笺 Android 版',
      seoIndexable: true,
      canonicalPath: '/download/android',
    },
    path: '/download/android',
    name: 'downloadAndroid',
    component: () => import('@/view/download/DownloadAndroid.vue'),
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
    meta: {
      title: '分享笔记',
      publicStandalone: true,
      hideAiAssistant: true,
      seoIndexable: false,
      mobileTopBar: false,
    },
    path: '/share/note',
    name: 'noteShare',
    component: () => import('@/view/share/NoteShareReader.vue'),
  },
  {
    path: '/share/:token',
    name: 'fileShare',
    component: () => import('@/view/share/ShareDownload.vue'),
  },
  {
    path: '/share/:id/:token/:fileName?/:fileType?/:desc?',
    name: 'legacyShareDownload',
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
  if (to.name === 'landing') {
    const runtime = resolveLightNoteRuntime();
    const isMobileLayout = isMobileViewport(window.innerWidth);
    const isReturningVisitor = runtime === 'browser' && (hasVisitedMobileLanding() || hasLoggedInBefore());

    // 这是 <head> 首屏守卫的路由级兜底，也覆盖同一 SPA 会话中再次导航到根路径：
    // APK/移动 PWA 与移动回访浏览器进入应用，桌面浏览器和桌面 PWA 保留官网。
    if (
      shouldRedirectLandingToApplication({
        runtime,
        isMobileLayout,
        isReturningVisitor,
      })
    ) {
      return { name: 'appEntry', replace: true };
    }
  }

  pendingNavigationTarget = to.fullPath;

  // 详情页脚本仍在下载时就并行请求正文。这里覆盖通知、搜索、图谱等所有直达入口；
  // 笔记库卡片自身也会预取，但同一身份/笔记 ID 会命中同一个在途 Promise，不会重复请求。
  if (to.name === 'noteDetail') {
    const rawId = to.params.id;
    const noteId = Array.isArray(rawId) ? rawId.join('/') : String(rawId || '');
    if (noteId && noteId !== 'add') {
      void Promise.all([import('@/api/noteDetailPrefetch'), import('@/store/useUser')])
        .then(([prefetchModule, userModule]) => {
          void prefetchModule.prefetchNoteDetail(userModule.default(), noteId)?.catch(() => {
            // 正文预取失败不阻断导航；详情视图会按正常链路重试并给出反馈。
          });
        })
        .catch(() => {
          // 预取是加速层；失败后详情页仍会走自身可重试请求。
        });
    }
  }
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
const CHUNK_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;

router.onError((error, to) => {
  if (!CHUNK_ERROR_PATTERN.test(error?.message || '')) return;
  reloadOnceTo(to.fullPath);
});

router.afterEach((to) => {
  sessionStorage.removeItem(CHUNK_RELOAD_FLAG);
  syncRouteSeoMeta(to);
});

export default router;
