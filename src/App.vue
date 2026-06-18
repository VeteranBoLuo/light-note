<template>
  <div id="app" style="height: 100vh; width: 100vw">
    <a-config-provider
      :theme="{
        token: {
          colorPrimary: '#4e4b46',
        },
      }"
    >
      <router-view />
      <Login v-if="bookmark.isShowLogin" />
      <BViewer />
      <FloatQuestion v-if="aiVisible" />
    </a-config-provider>
  </div>
</template>
<script setup lang="ts">
  import { bookmarkStore, useUserStore } from '@/store';
  import { h, nextTick, onMounted, onBeforeUnmount, watch, computed, defineAsyncComponent } from 'vue';
  import BViewer from '@/components/base/Viewer/BViewer.vue';
  import { apiBaseGet } from '@/http/request';
  import { getNoticeSummary } from '@/api/commonApi.ts';
  import { useRouter, type RouteLocationNormalized } from 'vue-router';
  import { fingerprint } from '@/utils/common';
  import { notification } from 'ant-design-vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { throttle } from 'lodash-es';
  import { setLocale } from './i18n';
  import { updateNotice } from '@/config/updateNotice';
  import { RoleEnum } from '@/config/bookmarkCfg.ts';
  import { getAppHomePath, getHomePagePreference } from '@/utils/preferences.ts';
  import { useI18n } from 'vue-i18n';
  import { getAdminLoginPreviewPreferences, isAdminLoginPreview } from '@/utils/authStorage.ts';

  const Login = defineAsyncComponent(() => import('@/view/login/UserAuthModal.vue'));
  const FloatQuestion = defineAsyncComponent(() => import('./components/aiAssistant/FloatQuestion.vue'));

  const router = useRouter();
  const user = useUserStore();
  const bookmark = bookmarkStore();
  const { t } = useI18n();
  const NOTICE_KEY = 'pending-notice';
  const NOTICE_POLLING_INTERVAL = 300 * 1000;
  const NOTICE_MIN_REFRESH_GAP = 10 * 1000;

  // 监听主题变化
  watch(
    () => user.preferences?.theme,
    () => {
      applyTheme();
    },
  );

  const aiVisible = computed(() => {
    return !bookmark.isMobile && !bookmark.isShowLogin;
  });
  function getStoredPreferences() {
    if (isAdminLoginPreview()) {
      return getAdminLoginPreviewPreferences();
    }
    try {
      return JSON.parse(localStorage.getItem('preferences') || '{}');
    } catch (e) {
      return {};
    }
  }

  function setStoredPreferences(preferences) {
    if (!isAdminLoginPreview()) {
      localStorage.setItem('preferences', JSON.stringify(preferences));
    }
  }

  // 路由映射表
  const phoneReplaceMap = {
    '/admin/apiLog': '/apiLog',
    '/admin/userMg': '/userMg',
    '/admin/userOpinion': '/userOpinion',
    '/admin/operationLog': '/operationLog',
    '/admin/imageMg': '/imageMg',
    '/workbenches': '/home',
    '/': '/home',
    '/securityCenter/overview': '/securityOverview',
    '/securityCenter/events': '/securityEvents',
    '/securityCenter/ips': '/securityIps',
    '/securityCenter/account-reputation': '/securityAccountReputation',
    '/securityCenter/whitelist': '/securityWhitelist',
    '/securityCenter/rules': '/securityRules',
    '/trash': '/ptrash',
  };
  const deskReplaceMap = {
    '/apiLog': '/admin/apiLog',
    '/userMg': '/admin/userMg',
    '/userOpinion': '/admin/userOpinion',
    '/operationLog': '/admin/operationLog',
    '/imageMg': '/admin/imageMg',
    '/admin': '/admin/operationLog',
    '/personCenter': '/home',
    '/securityOverview': '/securityCenter/overview',
    '/securityEvents': '/securityCenter/events',
    '/securityIps': '/securityCenter/ips',
    '/securityAccountReputation': '/securityCenter/account-reputation',
    '/securityWhitelist': '/securityCenter/whitelist',
    '/securityRules': '/securityCenter/rules',
    '/securityCenterMobile': '/securityCenter/overview',
    '/ptrash': '/trash',
  };

  let mq = null;
  let mqListener = null;
  let noticeTimer: number | null = null;
  let lastNoticeRefreshAt = 0;
  let noticeRequest: Promise<void> | null = null;
  let userInfoRequest: Promise<any> | null = null;
  let userInfoLoaded = false;
  let isHandlingAuthExpired = false;
  let isHandlingUserBanned = false;
  let authExpireTimer: number | null = null;
  const handleResize = throttle(() => {
    bookmark.screenWidth = window.innerWidth;
    bookmark.screenHeight = window.innerHeight;
  }, 100);
  function initApp() {
    localStorage.removeItem('theme');
    // 页面加载前需要提前预设置主题，否则如果后台查询是黑夜主题，但是页面默认是白色的，页面会从白到黑闪一下，这种情况就需要提前设置为黑色
    const preferences = getStoredPreferences();
    if (Object.keys(preferences).length > 0) {
      user.preferences = preferences as any;
    }

    applyTheme();
    // 设置指纹
    window['fingerprint'] = fingerprint();

    mq = window.matchMedia('(prefers-color-scheme: dark)');
    mqListener = (e) => {
      user.preferences.theme = e.matches ? 'night' : 'day';
    };
    mq.addEventListener('change', mqListener);
    console.log('初始屏幕尺寸：', user.preferences);
  }

  // 添加应用就绪状态
  // const isAppReady = ref(false); // 已移除，不再需要loading界面
  function applyUserInfo(data) {
    user.setUserInfo(data || {});
    user.preferences.theme = user.preferences?.theme || 'day';
    user.preferences.lang = user.preferences?.lang || 'zh-CN';
    user.preferences.noteViewMode = user.preferences?.noteViewMode || 'list';
    user.preferences.homePage = getHomePagePreference(user.preferences);
    // 已登录用户同步偏好到 localStorage（游客无 API 偏好，不需处理）
    if (user.id && user.role !== 'visitor') {
      setStoredPreferences(user.preferences);
    }
    setLocale(user.preferences.lang || 'zh-CN');
  }

  async function getUserInfo(force = false) {
    if (!force && userInfoLoaded) {
      return;
    }
    if (userInfoRequest) {
      return userInfoRequest;
    }

    userInfoRequest = (async () => {
      try {
        const res = await apiBaseGet('/api/user/me');
        userInfoLoaded = true;
        applyUserInfo(res.data);
        if (res.status === 200) {
          bookmark.isShowLogin = false;
          await refreshOpinionNotice();
        } else {
          bookmark.isShowLogin = true;
          stopOpinionNoticePolling();
          notification.close(NOTICE_KEY);
        }
        return res;
      } catch (error) {
        userInfoLoaded = true;
        message.error('获取用户信息失败：', error);
        handleUserLogout();
        return null;
      } finally {
        userInfoRequest = null;
      }
    })();

    return userInfoRequest;
  }

  // 应用主题样式
  function applyTheme() {
    // 禁用所有动画
    document.documentElement.classList.add('disable-animations');

    // 强制重绘确保样式生效
    void document.documentElement.offsetWidth;
    // 执行主题切换
    document.documentElement.setAttribute('data-theme', user.currentTheme);

    // 下一事件循环恢复动画
    setTimeout(() => {
      document.documentElement.classList.remove('disable-animations');
    }, 0);
  }

  // 设置动画
  function setTransition(val) {
    nextTick(() => {
      const filter = document.getElementById('phone-filter-panel');
      if (filter) {
        handleFilterTransition(filter, val);
      }
    });
  }

  function handleFilterTransition(filter, val) {
    if (val) {
      filter.style.transition = 'none';
      filter.style.transform = 'translateX(-100%)';
    } else {
      filter.style.transform = 'translateX(0)';
      filter.style.transition = 'unset';
      bookmark.isFold = true;
    }
  }

  // 手机布局和桌面布局的路由不一样，切换断点后需要切换对应路由地址
  function handleRouteChange(isMobileLayout: boolean, path: string) {
    // 桌面布局切换至手机布局
    if (isMobileLayout) {
      if (phoneReplaceMap[path]) {
        router.push(phoneReplaceMap[path]);
      }
    } else {
      if (deskReplaceMap[path]) {
        router.push(deskReplaceMap[path]);
      }
    }
  }
  async function redirectToGuestHome() {
    const targetPath = getAppHomePath(user.preferences, bookmark.isMobile);
    if (router.currentRoute.value.path !== targetPath) {
      await router.replace(targetPath);
    }
  }

  function handleUserLogout(resetUser = true) {
    if (authExpireTimer !== null) {
      window.clearTimeout(authExpireTimer);
      authExpireTimer = null;
    }
    if (resetUser) {
      user.resetUserInfo();
    }
    setStoredPreferences(user.preferences);
    bookmark.isShowLogin = true;
    stopOpinionNoticePolling();
    notification.close(NOTICE_KEY);
    localStorage.removeItem('rememberedSid');
  }

  async function handleAuthExpired(options: { refreshUser?: boolean; redirect?: boolean; resetUser?: boolean } = {}) {
    const { refreshUser = true, redirect = true, resetUser = true } = options;
    if (isHandlingAuthExpired) {
      return;
    }
    isHandlingAuthExpired = true;
    const isManualLogout = sessionStorage.getItem('manualLogout') === '1';
    sessionStorage.removeItem('manualLogout');
    if (!isManualLogout) {
      message.warning('登录已过期，请重新登录');
    }
    userInfoLoaded = true;
    handleUserLogout(resetUser);
    bookmark.type = 'all';
    if (refreshUser) {
      await getUserInfo(true);
    }
    bookmark.refreshTag();
    if (redirect) {
      await redirectToGuestHome();
    }
    isHandlingAuthExpired = false;
  }

  async function handleUserBanned() {
    if (isHandlingUserBanned) {
      return;
    }
    isHandlingUserBanned = true;
    try {
      userInfoLoaded = true;
      handleUserLogout(true);
      bookmark.type = 'all';
      if (!['login'].includes(String(router.currentRoute.value.name || ''))) {
        await redirectToGuestHome();
      }
    } finally {
      isHandlingUserBanned = false;
    }
  }

  function handleAuthSession(event: Event) {
    const expiresIn = Number((event as CustomEvent<{ expiresIn: number }>).detail?.expiresIn || 0);
    if (!expiresIn) {
      return;
    }
    if (authExpireTimer !== null) {
      window.clearTimeout(authExpireTimer);
    }
    authExpireTimer = window.setTimeout(
      () => {
        window.dispatchEvent(new CustomEvent('light-note:auth-expired'));
      },
      Math.max(0, expiresIn * 1000 + 300),
    );
  }

  function openNoticeSummary(data) {
    if (user.role === 'root') {
      const opinion = data.opinion || {};
      const security = data.security || {};
      const hasOpinionNotice = Number(opinion.pendingTotal || 0) > 0;
      const hasSecurityNotice = Number(security.unhandledHighRiskCount || 0) > 0;
      if (!hasOpinionNotice && !hasSecurityNotice) {
        notification.close(NOTICE_KEY);
        return;
      }
      const children = [];
      if (hasOpinionNotice) {
        children.push(
          h(
            'a',
            {
              onClick: () => {
                notification.close(NOTICE_KEY);
                router.push({ path: bookmark.isMobile ? '/userOpinion' : '/admin/userOpinion', query: { status: 'pending' } });
              },
            },
            `${t('personCenter.opinions.feedbackModule')}：${opinion.pendingTotal}${t('personCenter.opinions.pendingCountSuffix')}`,
          ),
        );
      }
      if (hasSecurityNotice) {
        if (children.length > 0) {
          children.push(h('br'));
        }
        const criticalText = security.unhandledCriticalCount
          ? `，${t('common.noticeCriticalPrefix')}${security.unhandledCriticalCount}${t('personCenter.opinions.noticeCountSuffix')}`
          : '';
        children.push(
          h(
            'a',
            {
              onClick: () => {
                notification.close(NOTICE_KEY);
                router.push({
                  path: bookmark.isMobile ? '/securityEvents' : '/securityCenter/events',
                  query: { handledStatus: 'unhandled' },
                });
              },
            },
            `${t('common.securityCenter')}：${security.unhandledHighRiskCount}${t('common.noticeHighRiskSuffix')}${criticalText}`,
          ),
        );
      }
      notification.open({
        key: NOTICE_KEY,
        message: t('common.pendingNoticeTitle'),
        description: h('div', children),
        duration: 8,
      });
      return;
    }

    const opinion = data.opinion || {};
    if (!opinion.unreadReplyTotal) {
      notification.close(NOTICE_KEY);
      return;
    }

    const latestReplySummary = opinion.latestReply?.replyContent || t('personCenter.opinions.userNoticeDesc');
    notification.open({
      key: NOTICE_KEY,
      message: t('personCenter.opinions.userNoticeTitle'),
      description: h(
        'a',
        `${t('personCenter.opinions.replyCountPrefix')}${opinion.unreadReplyTotal}${t('personCenter.opinions.noticeCountSuffix')} · ${latestReplySummary}`,
      ),
      onClick: () => {
        notification.close(NOTICE_KEY);
        router.push({ path: '/opinions', query: { tab: 'history', markViewed: '1' } });
      },
      duration: 8,
    });
  }

  async function refreshOpinionNotice() {
    if (!user.id || user.role === RoleEnum.VISITOR) {
      stopOpinionNoticePolling();
      return;
    }

    const now = Date.now();
    if (now - lastNoticeRefreshAt < NOTICE_MIN_REFRESH_GAP) {
      return;
    }

    if (noticeRequest) {
      return noticeRequest;
    }

    noticeRequest = (async () => {
      try {
        const res = await getNoticeSummary();
        if (res.status === 200) {
          const summary = res.data || {};
          lastNoticeRefreshAt = Date.now();
          user.pendingOpinionTotal = summary.opinion?.pendingTotal || 0;
          user.unreadOpinionReplyTotal = summary.opinion?.unreadReplyTotal || 0;
          user.pendingSecurityTotal = summary.security?.unhandledHighRiskCount || 0;
          user.criticalSecurityTotal = summary.security?.unhandledCriticalCount || 0;
          openNoticeSummary(summary);
        }
      } catch (error) {
        console.error('获取提醒汇总失败', error);
      } finally {
        noticeRequest = null;
      }
    })();

    return noticeRequest;
  }

  function stopOpinionNoticePolling() {
    if (noticeTimer !== null) {
      window.clearInterval(noticeTimer);
      noticeTimer = null;
    }
  }

  function startOpinionNoticePolling() {
    stopOpinionNoticePolling();
    if (!user.id || user.role === RoleEnum.VISITOR) {
      return;
    }
    noticeTimer = window.setInterval(() => {
      if (!document.hidden) {
        refreshOpinionNotice();
      }
    }, NOTICE_POLLING_INTERVAL);
  }

  const skipRouter = ['help', 'updateLogs', 'githubCallBack', 'not-found', 'not-role', 'landing'];
  const mobileAdminRoute = ['/apiLog', '/operationLog', '/userMg', '/userOpinion', '/imageMg'];

  function getRequiredRoles(to: RouteLocationNormalized): string[] {
    const targetRecord = [...to.matched].reverse().find((record) => Array.isArray(record.meta?.roles));
    const targetRoles = (targetRecord?.meta?.roles as string[]) || [];
    if (targetRoles.length > 0) {
      return targetRoles;
    }
    if (mobileAdminRoute.includes(to.path)) {
      return [RoleEnum.Root];
    }
    return [];
  }

  // 路由发生变化触发
  router.beforeEach(async (to, from, next) => {
    // 手机端访问官网 → 跳 /home（根路由 redirect 已处理 /）
    if (bookmark.isMobile && to.path === '/landing') {
      next('/home');
      return;
    }

    if (to.name === 'workbenches') {
      handleRouteChange(bookmark.isMobile, to.path);
    }

    if (from.name === 'githubCallBack') {
      await getUserInfo(true);
    }

    if (skipRouter.includes(<string>to.name)) {
      bookmark.isShowLogin = false;
      next();
      return;
    }

    // 用户刷新后 store 为空时，先尝试恢复用户信息再做权限判断。
    if (!user.id) {
      await getUserInfo();
    }

    const requiredRoles = getRequiredRoles(to);
    if (requiredRoles.length > 0 && !requiredRoles.includes(user.role)) {
      if (!user.id || user.role === RoleEnum.VISITOR) {
        handleUserLogout();
        next(getAppHomePath(user.preferences, bookmark.isMobile));
        return;
      }
      next('/403');
      return;
    }

    next();
  });

  // 只有第一次进入页面或者刷新页面才触发（简化）
  async function init() {
    window.addEventListener('resize', handleResize);
    window.addEventListener('light-note:auth-expired', handleAuthExpired);
    window.addEventListener('light-note:user-banned', handleUserBanned);
    window.addEventListener('light-note:auth-session', handleAuthSession);
    router.isReady().then(async () => {
      await getUserInfo();
      handleRouteChange(bookmark.isMobile, router.currentRoute.value.path);
      if (skipRouter.includes(<string>router.currentRoute.value.name)) {
        bookmark.isShowLogin = false;
      }
    });
  }

  function checkUpdateNotice() {
    const lastSeen = localStorage.getItem(updateNotice.storageKey);
    if (lastSeen === updateNotice.version) {
      return;
    }
    const noticeKey = `update-notice-${updateNotice.version}`;
    const markAsSeen = () => {
      localStorage.setItem(updateNotice.storageKey, updateNotice.version);
    };
    notification.open({
      key: noticeKey,
      placement: 'topRight',
      message: updateNotice.title,
      description: updateNotice.description,
      duration: 0,
      btn: () =>
        h(
          'a',
          {
            onClick: () => {
              markAsSeen();
              notification.close(noticeKey);
              router.push(updateNotice.logRoute);
            },
            style: { color: 'var(--primary-color)' },
          },
          { default: () => updateNotice.actionText },
        ),
      onClose: () => {
        markAsSeen();
      },
    });
  }
  onMounted(async () => {
    initApp();
    await init();
    startOpinionNoticePolling();
    checkUpdateNotice();
  });

  // 解绑媒体查询监听，防止内存泄漏
  onBeforeUnmount(() => {
    stopOpinionNoticePolling();
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('light-note:auth-expired', handleAuthExpired);
    window.removeEventListener('light-note:user-banned', handleUserBanned);
    window.removeEventListener('light-note:auth-session', handleAuthSession);
    if (mq && mqListener) {
      mq.removeEventListener('change', mqListener);
    }
  });

  // 监听布局断点变化
  watch(
    () => bookmark.isMobile,
    (val) => {
      handleRouteChange(val, router.currentRoute.value.path);
      setTransition(val);
    },
  );

  // 添加类型声明
  declare global {
    interface Window {
      InstallTrigger?: any;
    }
  }
  const isFirefox = typeof window?.InstallTrigger !== 'undefined';
  if (isFirefox) {
    const style = document.createElement('style');
    style.innerHTML = `
        * {
          scrollbar-width: thin;
        }
      `;
    document.head.appendChild(style);
  }
</script>
<style>
  /* 只影响根元素下的主要内容，避免全局影响 */
  .disable-animations #app,
  .disable-animations #app * {
    animation: none !important;
    transition: none !important;
    animation-play-state: paused !important;
  }

  /* 系统级动画禁用*/
  @media (prefers-reduced-motion: reduce) {
    * {
      animation: none !important;
      transition: none !important;
    }
  }
  .ant-notification-notice-description {
    font-size: 13px !important;
    color: #6b7280 !important;
  }
  @media (max-width: 768px) {
    *::-webkit-scrollbar {
      display: none;
    }
  }
  .app-loading {
    height: 100vh;
    width: 100vw;
    background: linear-gradient(135deg, #f5f7fa 0%, #8999b3 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
  }

  .app-loading::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background:
      radial-gradient(circle at 30% 40%, rgba(78, 75, 70, 0.1) 0%, transparent 50%),
      radial-gradient(circle at 70% 60%, rgba(78, 75, 70, 0.05) 0%, transparent 50%);
    animation: backgroundShift 8s ease-in-out infinite;
  }

  @keyframes backgroundShift {
    0%,
    100% {
      transform: translateX(0) translateY(0);
    }
    25% {
      transform: translateX(-10px) translateY(10px);
    }
    50% {
      transform: translateX(10px) translateY(-10px);
    }
    75% {
      transform: translateX(-5px) translateY(-5px);
    }
  }

  .loading-container {
    text-align: center;
    z-index: 1;
    position: relative;
  }

  .loading-spinner {
    position: relative;
    width: 80px;
    height: 80px;
    margin: 0 auto 20px;
  }

  .spinner-ring {
    position: absolute;
    border: 3px solid rgba(78, 75, 70, 0.1);
    border-top: 3px solid #4e4b46;
    border-radius: 50%;
    width: 100%;
    height: 100%;
    animation: spin 1.5s linear infinite;
  }

  .spinner-ring:nth-child(2) {
    animation-delay: 0.2s;
    border-top-color: #6b7280;
  }

  .spinner-ring:nth-child(3) {
    animation-delay: 0.4s;
    border-top-color: #9ca3af;
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  .loading-text h2 {
    font-size: 2rem;
    font-weight: 700;
    color: #4e4b46;
    margin: 0 0 10px 0;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    animation: fadeInUp 1s ease-out;
  }

  .loading-text p {
    font-size: 1rem;
    color: #6b7280;
    margin: 0;
    animation: fadeInUp 1.2s ease-out;
  }

  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .loading-spinner {
      width: 60px;
      height: 60px;
    }
    .loading-text h2 {
      font-size: 1.5rem;
    }
    .loading-text p {
      font-size: 0.9rem;
    }
  }
</style>
