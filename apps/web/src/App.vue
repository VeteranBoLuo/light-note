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
  import { useGrowth } from '@/composables/useGrowth';
  import { h, nextTick, onMounted, onBeforeUnmount, watch, computed, defineAsyncComponent } from 'vue';
  import BViewer from '@/components/base/Viewer/BViewer.vue';
  import { apiBaseGet, apiBasePost } from '@/http/request';
  import { getNoticeSummary } from '@/api/commonApi.ts';
  import { useRouter, type RouteLocationNormalized } from 'vue-router';
  import { fingerprint } from '@/utils/common';
  import { notification } from 'ant-design-vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { throttle } from 'lodash-es';
  import { setLocale } from './i18n';
  import { applyDisplaySettings } from '@/utils/savePreference';
  import { RoleEnum } from '@/config/bookmarkCfg.ts';
  import { getAppHomePath, getHomePagePreference } from '@/utils/preferences.ts';
  import { useI18n } from 'vue-i18n';
  import { getAdminLoginPreviewPreferences, isAdminLoginPreview, hasLoggedInBefore } from '@/utils/authStorage.ts';
  import { showPreviewGuide } from '@/composables/useGuestGuard';

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

  // 缩放只作用于登录后的应用内页面;landing/帮助/更新日志等入口页(skipRouter)一律不缩放,
  // 避免营销页/预渲染页的固定排版被 zoom 拉变形。
  function applyScaleForRoute(routeName?: string) {
    const name = String(routeName ?? router.currentRoute.value.name ?? '');
    if (skipRouter.includes(name)) {
      document.documentElement.style.zoom = '';
    } else {
      applyDisplaySettings();
    }
  }

  // 监听界面缩放变化 → 按当前路由重设 <html> zoom
  watch(
    () => user.preferences?.uiScale,
    () => {
      applyScaleForRoute();
    },
  );

  // 账号切换(登录/登出/换号)→ 刷新成长缓存,防个人中心徽章/成长页显示上一个账号的等级数据
  watch(
    () => user.id,
    () => {
      useGrowth().load(true);
    },
  );

  // 用户切换页面时节流刷新成长:升级为后端异步事件,让右上角头像红点在正常使用中较快出现,不必主动点头像
  const throttledGrowthRefresh = throttle(() => useGrowth().load(true), 30000);
  watch(
    () => router.currentRoute.value.fullPath,
    () => throttledGrowthRefresh(),
  );

  const aiVisible = computed(() => {
    // landing 落地页不挂 AI 悬浮球:FloatQuestion 挂载时会预热 ChatContainer chunk(gzip 300KB+),
    // 预渲染会把它烘焙进 landing 首屏 modulepreload,拖累 TBT/未使用JS;落地页访客也用不到 AI 助手。
    // AI 开关(设置里)关闭则不挂悬浮球;默认(未设置)视为开启
    return (
      !bookmark.isMobile &&
      !bookmark.isShowLogin &&
      router.currentRoute.value.name !== 'landing' &&
      (user.preferences as any).aiEnabled !== false
    );
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

  // 首屏同步恢复偏好——必须在 setup 阶段执行,早于子路由组件的 setup(它们会在 setup 里读 user.preferences,
  // 如资源中心视图/排序、标签详情视图)。若放到 onMounted 的 initApp(晚于子组件 setup),子组件会先读到默认值、
  // 退回各自陈旧的独立 localStorage 缓存,表现为「设置页改了视图/排序,刷新对应页面不生效」。
  (() => {
    const stored = getStoredPreferences();
    if (stored && Object.keys(stored).length > 0) {
      user.preferences = { ...user.preferences, ...stored };
    }
  })();

  // 路由映射表
  const phoneReplaceMap = {
    '/admin/apiLog': '/apiLog',
    '/admin/userMg': '/userMg',
    '/admin/userOpinion': '/userOpinion',
    '/admin/operationLog': '/operationLog',
    '/admin/imageMg': '/imageMg',
    '/admin/logExclude': '/logExclude',
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
    '/logExclude': '/admin/logExclude',
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
    // 偏好已在 setup 阶段同步恢复(见上方,早于子路由 setup),此处不再重复恢复,直接应用主题/缩放。
    applyTheme();
    applyScaleForRoute(); // 启动即应用缩放(仅应用内页;landing 等入口页不缩放)
    // 设置指纹
    window['fingerprint'] = fingerprint();

    // 游客访问量埋点:fingerprint 就绪后再上报,每浏览器会话一次(后端只对游客落库,已登录不计)
    try {
      if (!sessionStorage.getItem('ln_pv_sent')) {
        sessionStorage.setItem('ln_pv_sent', '1');
        apiBasePost('/api/common/recordConversion', { event: 'page_view', source: location.pathname }).catch(() => {});
      }
    } catch (e) {
      /* 隐私模式 sessionStorage 不可用时忽略 */
    }

    mq = window.matchMedia('(prefers-color-scheme: dark)');
    mqListener = () => {
      // 仅当用户选择「跟随系统」时,OS 配色变化才重新应用主题——只切 DOM,不回写 preferences.theme,
      // 保留 'system' 语义(旧实现会把 theme 覆盖成具体 night/day,破坏语义且是隐藏写入口)
      if (user.preferences.theme === 'system') {
        applyTheme();
      }
    };
    mq.addEventListener('change', mqListener);
    console.log('初始屏幕尺寸：', user.preferences);
  }

  // 添加应用就绪状态
  // const isAppReady = ref(false); // 已移除，不再需要loading界面
  function applyUserInfo(data) {
    user.setUserInfo(data || {});
    // 游客:/me 返回的是共用「游客」账号的偏好,应让本地(localStorage)选择优先,
    // 否则刷新后游客自己切的主题/语言会被服务器默认值覆盖(配合 savePreference.ts 的本地持久化)
    if (!user.id || user.role === 'visitor') {
      const storedPreferences = getStoredPreferences();
      if (storedPreferences && Object.keys(storedPreferences).length > 0) {
        user.preferences = { ...user.preferences, ...storedPreferences };
      }
    }
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
      // 记录发起本次 /me 时的登录身份,用于识别并丢弃「陈旧的在途响应」
      const reqUserId = user.id || '';
      try {
        const res = await apiBaseGet('/api/user/me');
        // 陈旧响应保护:请求在途期间登录身份已变(典型:退出时发出的游客 /me,晚于「重新登录」才返回),
        // 该响应已过时。若继续 applyUserInfo 会用游客数据覆盖刚登录的账号,导致登录态被冲掉且无从恢复,
        // 故整体丢弃——不写 user、不改登录框、不刷通知。当前身份的数据以登录时写入的为准。
        if ((user.id || '') !== reqUserId) {
          return res;
        }
        userInfoLoaded = true;
        applyUserInfo(res.data);
        if (res.status === 200) {
          bookmark.isShowLogin = false;
          await refreshOpinionNotice();
        } else {
          // 仅对「曾登录过、会话过期」的老用户弹登录框；始终是游客的新访客不弹
          bookmark.isShowLogin = hasLoggedInBefore();
          stopOpinionNoticePolling();
          notification.close(NOTICE_KEY);
        }
        return res;
      } catch (error) {
        userInfoLoaded = true;
        message.error(t('app.loadUserFailed'), error);
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
    // 退出/会话失效后是否弹登录框：仅对曾登录过的老用户弹，纯游客不弹
    bookmark.isShowLogin = hasLoggedInBefore();
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
      message.warning(t('app.sessionExpired'));
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
    // 手动登出当次不再弹登录框（hasLoggedInBefore 标记仍保留，下次会话自然过期时才弹）
    if (isManualLogout) {
      bookmark.isShowLogin = false;
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
      bookmark.isShowLogin = false; // 被封禁走专属申诉页,不弹登录框
      bookmark.type = 'all';
      if (String(router.currentRoute.value.name || '') !== 'banned') {
        await router.push('/banned');
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

  function handlePreviewBlocked(event: Event) {
    const msg = (event as CustomEvent<{ msg?: string }>).detail?.msg;
    showPreviewGuide(msg);
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
          // 反馈回复/安全提醒已统一进通知中心(收件箱),这里只保留计数(驱动菜单红点),不再弹右上角 toast
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

  const skipRouter = ['help', 'updateLogs', 'githubCallBack', 'not-found', 'not-role', 'landing', 'banned', 'quickSave'];
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
    // 白名单含 VISITOR = 该页面对所有人开放(游客都能看,已登录角色自然都能看)。
    // 这样新增的 user / test 角色无需改任何路由文件即可访问所有普通页;仅 [Root] 页面(不含 VISITOR)才继续只放行 root。
    const isPublicRoute = requiredRoles.includes(RoleEnum.VISITOR);
    if (requiredRoles.length > 0 && !isPublicRoute && !requiredRoles.includes(user.role)) {
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

  // 每次路由切换后按目标页决定是否缩放:入口页(skipRouter)清零、应用内页按 uiScale
  router.afterEach((to) => {
    applyScaleForRoute(<string>to.name);
  });

  // 只有第一次进入页面或者刷新页面才触发（简化）
  async function init() {
    window.addEventListener('resize', handleResize);
    window.addEventListener('light-note:auth-expired', handleAuthExpired);
    window.addEventListener('light-note:user-banned', handleUserBanned);
    window.addEventListener('light-note:auth-session', handleAuthSession);
    window.addEventListener('light-note:preview-blocked', handlePreviewBlocked);
    router.isReady().then(async () => {
      await getUserInfo();
      handleRouteChange(bookmark.isMobile, router.currentRoute.value.path);
      if (skipRouter.includes(<string>router.currentRoute.value.name)) {
        bookmark.isShowLogin = false;
      }
    });
  }

  onMounted(async () => {
    initApp();
    await init();
    // /landing 是纯官网展示页(游客默认首页),不应该出现任何账号相关的通知/弹窗
    if (router.currentRoute.value.name === 'landing') return;
    startOpinionNoticePolling();
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
