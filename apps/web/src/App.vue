<template>
  <div class="app-root" :class="{ 'has-mobile-bottom-nav': mobileBottomNavActive }">
    <div v-if="!isOnline" class="app-offline-banner" role="status" aria-live="polite">
      <span class="app-offline-banner__dot" aria-hidden="true"></span>
      {{ t('http.offline') }}
    </div>
    <a-config-provider
      :theme="{
        token: {
          colorPrimary: '#4e4b46',
        },
      }"
    >
      <MobileAppShell
        :enabled="mobileShellEnabled"
        :show-top-switcher="mobileTopSwitcherActive"
        :show-bottom-nav="mobileBottomNavActive"
      >
        <router-view />
      </MobileAppShell>
      <Login v-if="bookmark.isShowLogin" />
      <BViewer v-if="bookmark.viewerKey" />
      <FloatQuestion v-if="aiVisible" :hide-trigger="aiEdgeTriggerHidden" />
      <GuestNudge v-if="nudgeVisible" />
      <AndroidDownloadProgress v-if="isAndroidApp" />
      <DisplayScaleSuggestion />
      <AdminContextBanner v-if="user.adminContext" />
      <QuickCaptureModal v-if="inbox.quickCaptureVisible" v-model:visible="inbox.quickCaptureVisible" />
      <PwaInstallGuideModal v-if="!isAndroidApp && pwaGuideVisible" />
    </a-config-provider>
  </div>
</template>
<script setup lang="ts">
  import { bookmarkStore, inboxStore, useAiAssistantStore, useUserStore } from '@/store';
  import { buildAiAssistantRuntimeIdentityKey, resolveAiAssistantIdentity } from '@/store/aiAssistant';
  import { useGrowth } from '@/composables/useGrowth';
  import { onMounted, onBeforeUnmount, watch, computed, defineAsyncComponent, provide, ref } from 'vue';
  import { apiBaseGet, apiBasePost } from '@/http/request';
  import { getNoticeSummary, resetBookmarkIconRefreshRequests } from '@/api/commonApi.ts';
  import { useRouter, type RouteLocationNormalized } from 'vue-router';
  import { getLogFingerprint } from '@/utils/common';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { throttle } from 'lodash-es';
  import { setLocale } from './i18n';
  import { applyDisplaySettings } from '@/utils/savePreference';
  import { RoleEnum } from '@/config/bookmarkCfg.ts';
  import { DEFAULT_NOTE_VIEW_MODE, getHomePagePreference } from '@/utils/preferences.ts';
  import { getRuntimeApplicationHomePath, getRuntimeGuestEntryPath } from '@/utils/appEntry.ts';
  import { resolveLightNoteRuntime, shouldRedirectLandingToApplication } from '@/utils/appRuntime.ts';
  import { useI18n } from 'vue-i18n';
  import { getAdminLoginPreviewPreferences, isAdminLoginPreview, markLoggedIn } from '@/utils/authStorage.ts';
  import { resolvePassiveAuthUi } from '@/utils/authUiPolicy.ts';
  import { showPreviewGuide } from '@/composables/useGuestGuard';
  import DisplayScaleSuggestion from '@/components/base/DisplayScaleSuggestion.vue';
  import { resetBookmarkIconRuntime } from '@/composables/bookmarkIconRuntime.ts';
  import MobileAppShell from '@/components/mobile/MobileAppShell.vue';
  import {
    getLandingAuthRetryDelay,
    LANDING_AUTH_CONTEXT,
    resolveLandingAuthStatus,
    type LandingAuthStatus,
  } from '@/view/landing/landingAuth.ts';
  import { applyDocumentTheme } from '@/utils/theme.ts';
  import { shouldHideAiEdgeTrigger } from '@/utils/aiEntry.ts';
  import AsyncFeatureLoadingOverlay from '@/components/base/AsyncFeatureLoadingOverlay.vue';
  import { isLightNoteAndroidApp } from '@/utils/androidBridge';
  import { onSystemThemeChange } from '@/utils/systemTheme';
  import { MOBILE_LAYOUT_CONTEXT } from '@/composables/useMobileLayout';
  import { useCommunityChatUnreadRuntime } from '@/composables/useCommunityChatUnreadRuntime';
  import { nudgeVisible } from '@/composables/guestNudge';
  import { usePwaInstall } from '@/composables/usePwaInstall';
  import { useAndroidNativeNotifications } from '@/composables/useAndroidNativeNotifications';

  const Login = defineAsyncComponent(() => import('@/view/login/UserAuthModal.vue'));
  // 图片查看器包含 viewer.js，只有用户真正打开图片时才下载，避免每次启动都解析第三方预览运行时。
  const BViewer = defineAsyncComponent({
    loader: () => import('@/components/base/Viewer/BViewer.vue'),
    loadingComponent: AsyncFeatureLoadingOverlay,
    delay: 120,
  });
  const FloatQuestion = defineAsyncComponent(() => import('./components/aiAssistant/FloatQuestion.vue'));
  const QuickCaptureModal = defineAsyncComponent(() => import('@/components/inbox/QuickCaptureModal.vue'));
  const GuestNudge = defineAsyncComponent(() => import('@/components/home/GuestNudge.vue'));
  const AndroidDownloadProgress = defineAsyncComponent(() => import('@/components/base/AndroidDownloadProgress.vue'));
  const AdminContextBanner = defineAsyncComponent(() => import('@/components/admin/AdminContextBanner.vue'));
  const PwaInstallGuideModal = defineAsyncComponent({
    loader: () => import('@/components/pwa/PwaInstallGuideModal.vue'),
    loadingComponent: AsyncFeatureLoadingOverlay,
    delay: 280,
  });

  const router = useRouter();
  const user = useUserStore();
  const aiAssistant = useAiAssistantStore();
  const bookmark = bookmarkStore();
  const inbox = inboxStore();
  const { guideVisible: pwaGuideVisible } = usePwaInstall();
  const { t } = useI18n();
  provide(
    MOBILE_LAYOUT_CONTEXT,
    computed(() => bookmark.isMobile),
  );
  const isAndroidApp = isLightNoteAndroidApp();
  const aiRuntimeIdentity = computed(() => resolveAiAssistantIdentity(user));
  const isOnline = ref(typeof navigator === 'undefined' ? true : navigator.onLine !== false);
  const aiRuntimeIdentityKey = computed(() => buildAiAssistantRuntimeIdentityKey(aiRuntimeIdentity.value));
  // AI 请求属于应用级运行时，而不是某个路由组件。根层持续守护 owner 四维身份：
  // 普通导航不会触碰请求；登录、退出或管理员上下文变化则先中止旧域，再原子切换状态。
  // 未使用过 AI 时保持懒加载，不在官网或普通业务首屏读取可能很大的本地会话。
  watch(aiRuntimeIdentityKey, () => {
    if (!aiAssistant.initialized) return;
    aiAssistant.switchConversation(aiRuntimeIdentity.value, t('ai.greeting'));
  });
  const NOTICE_POLLING_INTERVAL = 300 * 1000;
  const NOTICE_MIN_REFRESH_GAP = 10 * 1000;
  const scaleExcludedRouter = new Set([
    'updateLogs',
    'githubCallBack',
    'not-found',
    'not-role',
    'landing',
    'banned',
    'quickSave',
  ]);

  // 监听主题变化
  watch(
    () => user.preferences?.theme,
    () => {
      applyTheme();
    },
  );

  // 缩放只排除营销页、独立入口页等固定排版页面。
  // 路由鉴权放行由 skipRouter 单独负责，避免公开访问规则误伤帮助中心等应用内页面的界面缩放。
  function applyScaleForRoute(routeName?: string) {
    const name = String(routeName ?? router.currentRoute.value.name ?? '');
    if (scaleExcludedRouter.has(name)) {
      document.documentElement.style.zoom = '';
    } else {
      // 手机端已有独立响应式布局，不再叠加桌面端界面缩放；这里只改变运行时效果，
      // 不回写 uiScale，确保用户回到电脑后仍保留原来的小/标准/大偏好。
      applyDisplaySettings({ forceStandard: bookmark.isMobile });
    }
  }

  // 监听界面缩放和手机布局变化 → 按当前路由重设 <html> zoom
  watch(
    () => [user.preferences?.uiScale, bookmark.isMobile],
    () => {
      applyScaleForRoute();
    },
  );

  // 账号切换(登录/登出/换号)→ 刷新成长缓存,防个人中心徽章/成长页显示上一个账号的等级数据
  watch(
    () => user.id,
    () => {
      resetBookmarkIconRefreshRequests();
      resetBookmarkIconRuntime();
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
      !bookmark.isShowLogin &&
      router.currentRoute.value.name !== 'landing' &&
      router.currentRoute.value.name !== 'mobileAiWorkspace' &&
      (user.preferences as any).aiEnabled !== false
    );
  });
  const aiEdgeTriggerHidden = computed(() =>
    shouldHideAiEdgeTrigger(bookmark.isMobile, router.currentRoute.value.name),
  );
  const mobileTopSwitcherActive = computed(
    () => bookmark.isMobile && router.currentRoute.value.meta.mobileTopSwitcher === true,
  );
  const mobileBottomNavActive = computed(
    () => bookmark.isMobile && router.currentRoute.value.meta.mobileBottomNav === true,
  );
  // `mobileShell` 表示该路由需要统一移动端顶栏；资源切换器与底部导航是两个独立开关。
  // 二级页（例如模板管理）只需要「返回 + 标题 + 页面动作」，不能因为两项导航都关闭就把顶栏一并卸载。
  const mobileShellEnabled = computed(() => bookmark.isMobile && Boolean(router.currentRoute.value.meta.mobileShell));
  // 聊天室页面已有负责消息列表的实时连接；其余页面由根层连接守护导航角标。
  // 放在 App 而不是底部导航中，键盘弹出导致底栏卸载时也不会断开订阅。
  useCommunityChatUnreadRuntime({
    userId: computed(() => user.id),
    userRole: computed(() => user.role),
    realtimeActive: computed(() => router.currentRoute.value.name !== 'communityChat'),
  });
  useAndroidNativeNotifications();
  watch(
    mobileBottomNavActive,
    (active) => {
      if (typeof document === 'undefined') return;
      document.documentElement.classList.toggle('has-mobile-bottom-nav', active);
    },
    { immediate: true },
  );
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

  function withoutHomePagePreference(preferences) {
    const { homePage: _homePage, ...rest } = preferences || {};
    return rest;
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
    '/admin/overview': '/overview',
    '/admin/actionCenter': '/actionCenter',
    '/admin/adminAudit': '/adminAudit',
    '/admin/apiLog': '/apiLog',
    '/admin/agentLog': '/agentLog',
    '/admin/aiFeedback': '/aiFeedback',
    '/admin/aiEvaluation': '/aiEvaluation',
    '/admin/productInsights': '/productInsights',
    '/admin/conversion': '/conversion',
    '/admin/userMg': '/userMg',
    '/admin/userOpinion': '/userOpinion',
    '/admin/communityChatModeration': '/communityChatModeration',
    '/admin/operationLog': '/operationLog',
    '/admin/todoPlanDiagnostics': '/todoPlanDiagnostics',
    '/admin/imageMg': '/resourceGovernance',
    '/admin/resourceGovernance': '/resourceGovernance',
    '/admin/logCleanup': '/logCleanup',
    '/admin/logExclude': '/logExclude',
    '/admin/adminGovernance': '/adminGovernance',
    '/securityCenter/overview': '/securityCenterMobile',
    '/securityCenter/review': '/securityCenterMobile',
    '/securityCenter/detection-quality': '/securityCenterMobile',
    '/securityCenter/access-control': '/securityCenterMobile',
    '/securityCenter/events': '/securityCenterMobile',
    '/securityCenter/ips': '/securityCenterMobile',
    '/securityCenter/account-reputation': '/securityCenterMobile',
    '/securityCenter/whitelist': '/securityCenterMobile',
    '/securityCenter/rules': '/securityCenterMobile',
    '/trash': '/ptrash',
  };
  const deskReplaceMap = {
    '/overview': '/admin/overview',
    '/actionCenter': '/admin/actionCenter',
    '/adminAudit': '/admin/adminAudit',
    '/apiLog': '/admin/apiLog',
    '/agentLog': '/admin/agentLog',
    '/aiFeedback': '/admin/aiFeedback',
    '/aiEvaluation': '/admin/aiEvaluation',
    '/productInsights': '/admin/productInsights',
    '/conversion': '/admin/conversion',
    '/userMg': '/admin/userMg',
    '/userOpinion': '/admin/userOpinion',
    '/communityChatModeration': '/admin/communityChatModeration',
    '/operationLog': '/admin/operationLog',
    '/todoPlanDiagnostics': '/admin/todoPlanDiagnostics',
    '/imageMg': '/admin/resourceGovernance',
    '/resourceGovernance': '/admin/resourceGovernance',
    '/logCleanup': '/admin/logCleanup',
    '/logExclude': '/admin/logExclude',
    '/adminGovernance': '/admin/adminGovernance',
    '/admin': '/admin/operationLog',
    '/personCenter': '/home',
    '/securityOverview': '/securityCenter/overview',
    '/securityEvents': '/securityCenter/review',
    '/securityIps': '/securityCenter/ips',
    '/securityAccountReputation': '/securityCenter/account-reputation',
    '/securityWhitelist': '/securityCenter/whitelist',
    '/securityRules': '/securityCenter/detection-quality',
    '/securityCenterMobile': '/securityCenter/overview',
    '/ptrash': '/trash',
  };

  let disposeSystemTheme: (() => void) | null = null;
  let noticeTimer: number | null = null;
  let lastNoticeRefreshAt = 0;
  let noticeRequest: Promise<void> | null = null;
  let userInfoRequest: Promise<any> | null = null;
  let userInfoLoaded = false;
  // 官网 CTA 单独等待 /me 的确定结果，避免 Pinia 初始游客值在登录态恢复前短暂露出注册入口。
  // 它不参与登录、会话或路由鉴权，只影响 Landing 的按钮展示与点击资格。
  const landingAuthStatus = ref<LandingAuthStatus>('pending');
  let landingAuthRetryTimer: number | null = null;
  let landingAuthRetryAttempt = 0;

  function clearLandingAuthRetry(resetAttempt = false) {
    if (landingAuthRetryTimer !== null) {
      window.clearTimeout(landingAuthRetryTimer);
      landingAuthRetryTimer = null;
    }
    if (resetAttempt) {
      landingAuthRetryAttempt = 0;
    }
  }

  function scheduleLandingAuthRetry() {
    if (router.currentRoute.value.name !== 'landing' || landingAuthRetryTimer !== null) return;

    const delay = getLandingAuthRetryDelay(landingAuthRetryAttempt);
    landingAuthRetryAttempt += 1;
    landingAuthRetryTimer = window.setTimeout(() => {
      landingAuthRetryTimer = null;
      if (router.currentRoute.value.name !== 'landing') return;
      if (document.visibilityState === 'hidden' || navigator.onLine === false) {
        scheduleLandingAuthRetry();
        return;
      }
      void retryLandingAuthNow();
    }, delay);
  }

  async function retryLandingAuthNow() {
    clearLandingAuthRetry();
    return getUserInfo(true);
  }

  function handleLandingAuthRecoverySignal() {
    if (
      router.currentRoute.value.name === 'landing' &&
      landingAuthStatus.value === 'error' &&
      document.visibilityState !== 'hidden'
    ) {
      void retryLandingAuthNow();
    }
  }

  provide(LANDING_AUTH_CONTEXT, {
    status: landingAuthStatus,
    retry: retryLandingAuthNow,
  });
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
    // 请求拦截器会在首个 API 前同步生成；这里复用同一结果，避免子组件先发请求时出现空指纹。
    window['fingerprint'] = getLogFingerprint();

    // 游客访问量埋点:fingerprint 就绪后再上报,每浏览器会话一次(后端只对游客落库,已登录不计)
    try {
      if (!sessionStorage.getItem('ln_pv_sent')) {
        sessionStorage.setItem('ln_pv_sent', '1');
        // page_view 的 source 只记规范页面名,不存完整 pathname(/share/:id 等含 ID/PII)
        const pvPage =
          location.pathname === '/' || location.pathname === '/landing'
            ? 'landing'
            : location.pathname.startsWith('/share')
              ? 'share'
              : location.pathname === '/home'
                ? 'home'
                : 'app';
        apiBasePost(
          '/api/common/recordConversion',
          { event: 'page_view', source: pvPage },
          { silent: true, feedback: false },
        ).catch(() => {});
      }
    } catch (e) {
      /* 隐私模式 sessionStorage 不可用时忽略 */
    }

    // 通过 onSystemThemeChange 而不是直接监听媒体查询：App 内 prefers-color-scheme 不可信，
    // 系统深浅色由原生推送（详见 utils/systemTheme.ts），这里两个来源共用一个回调。
    disposeSystemTheme = onSystemThemeChange(() => {
      // 仅当用户选择「跟随系统」时,OS 配色变化才重新应用主题——只切 DOM,不回写 preferences.theme,
      // 保留 'system' 语义(旧实现会把 theme 覆盖成具体 night/day,破坏语义且是隐藏写入口)
      if (user.preferences.theme === 'system') {
        applyTheme();
      }
    });
    console.log('初始屏幕尺寸：', user.preferences);
  }

  // 添加应用就绪状态
  // const isAppReady = ref(false); // 已移除，不再需要loading界面
  function applyUserInfo(data) {
    user.setUserInfo(data || {});
    // /me 会把共享游客账号的 preferences 一并返回；普通游客只保留主题、语言、视图等本地偏好，
    // 不提供默认首页能力，也不能继承共享游客账号或历史 localStorage 中的 homePage。
    if (!user.id || user.role === 'visitor') {
      const storedPreferences = withoutHomePagePreference(getStoredPreferences());
      user.preferences = {
        ...withoutHomePagePreference(user.preferences),
        ...storedPreferences,
      };
    }
    user.preferences.theme = user.preferences?.theme || 'day';
    user.preferences.lang = user.preferences?.lang || 'zh-CN';
    user.preferences.noteViewMode = user.preferences?.noteViewMode || DEFAULT_NOTE_VIEW_MODE;
    if (user.id && user.role !== 'visitor') {
      user.preferences.homePage = getHomePagePreference(user.preferences);
      setStoredPreferences(user.preferences);
    } else {
      // 同步清理旧版本曾写入的游客 homePage，避免后续 /app 误读到已经废弃的游客设置。
      setStoredPreferences(withoutHomePagePreference(user.preferences));
    }
    void setLocale(user.preferences.lang || 'zh-CN');
  }

  async function redirectLandingToApplicationIfNeeded() {
    if (router.currentRoute.value.name !== 'landing') return;

    const runtime = resolveLightNoteRuntime();
    const shouldRedirect = shouldRedirectLandingToApplication({
      runtime,
      isMobileLayout: bookmark.isMobile,
    });
    if (!shouldRedirect) return;

    const target = getRuntimeApplicationHomePath(user.preferences, bookmark.isMobile, { runtime });
    if (router.currentRoute.value.path !== target) {
      await router.replace(target);
    }
  }

  async function getUserInfo(force = false) {
    if (!force && userInfoLoaded) {
      return;
    }
    if (userInfoRequest) {
      return userInfoRequest;
    }

    landingAuthStatus.value = 'pending';
    userInfoRequest = (async () => {
      // 记录发起本次 /me 时的登录身份,用于识别并丢弃「陈旧的在途响应」
      const reqUserId = user.id || '';
      const isLandingRequest = router.currentRoute.value.name === 'landing';
      try {
        const res = await apiBaseGet('/api/user/me', undefined, {
          silent: isLandingRequest,
          // /me 是身份初始化的权威请求，由本函数统一处理游客/登录结果。
          // 禁止响应拦截器先把旧会话痕迹解释成“立即打开登录框”。
          suppressAuthExpired: true,
        });
        // 陈旧响应保护:请求在途期间登录身份已变(典型:退出时发出的游客 /me,晚于「重新登录」才返回),
        // 该响应已过时。若继续 applyUserInfo 会用游客数据覆盖刚登录的账号,导致登录态被冲掉且无从恢复,
        // 故整体丢弃——不写 user、不改登录框、不刷通知。当前身份的数据以登录时写入的为准。
        if ((user.id || '') !== reqUserId) {
          return res;
        }
        userInfoLoaded = true;
        const responseStatus: unknown = res.status;
        const hasDefinitiveAuthResult =
          responseStatus === 200 || responseStatus === 'visitor' || responseStatus === 401;
        if (isLandingRequest && !hasDefinitiveAuthResult) {
          // 官网认证探测异常不能覆盖现有身份、弹登录框或要求用户处理；
          // 页面继续正常浏览，并在后台按渐进退避自动恢复。
          landingAuthStatus.value = 'error';
          bookmark.isShowLogin = false;
          scheduleLandingAuthRetry();
          return res;
        }

        applyUserInfo(res.data);
        if (user.id && user.role !== RoleEnum.VISITOR) {
          // 兼容功能上线前已存在的有效 Cookie：本次 /me 确认后补写/续期本地记录，
          // 后续移动端访问根路径即可在官网首次绘制前直接进入资料模块。
          markLoggedIn();
        }
        // 只有服务端明确返回 visitor 才开放注册入口；接口异常、格式异常等未知状态保留重试，
        // 不能把已登录 Cookie 尚未确认的用户错误降级为游客。
        landingAuthStatus.value = resolveLandingAuthStatus(
          res.status,
          Boolean(user.id && user.role !== RoleEnum.VISITOR),
        );
        clearLandingAuthRetry(true);
        // 这里只兜底 APK 与移动 PWA。普通移动浏览器是否为首访已在 <head> 守卫中决定，
        // 不能在 /me 返回后半秒再跳，否则首次官网会产生闪屏。
        await redirectLandingToApplicationIfNeeded();
        if (res.status === 200) {
          bookmark.isShowLogin = false;
          await refreshOpinionNotice();
        } else {
          // 初始化确认当前是游客时保持资料页可浏览，不替用户打开登录/注册。
          bookmark.isShowLogin = false;
          stopOpinionNoticePolling();
        }
        return res;
      } catch (error) {
        userInfoLoaded = true;
        if (isLandingRequest) {
          // 官网是公开内容页：网络波动时静默保留页面与当前身份，由后台自动重试。
          // 不把“认证确认失败”转嫁为按钮、弹窗或手动刷新任务。
          landingAuthStatus.value = 'error';
          bookmark.isShowLogin = false;
          scheduleLandingAuthRetry();
          return null;
        }
        message.error(t('app.loadUserFailed'), error);
        handleUserLogout();
        // 非官网页面沿用既有会话失效处理；官网分支已在上方静默恢复。
        landingAuthStatus.value = 'error';
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
    // 同步 CSS 变量主题与浏览器原生配色；浅色使用 only light，避免鸿蒙等浏览器再次自动暗化页面。
    applyDocumentTheme(user.currentTheme);

    // 下一事件循环恢复动画
    setTimeout(() => {
      document.documentElement.classList.remove('disable-animations');
    }, 0);
  }

  // 手机布局和桌面布局的路由不一样，切换断点后需要切换对应路由地址
  // 工作台已支持移动端访问,不再强制跳回移动首页。
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
    const targetPath = getRuntimeGuestEntryPath(user.preferences, {
      isMobileLayout: bookmark.isMobile,
    });
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
      // 显式登出或会话失效已经完成本地退出，官网可安全恢复游客 CTA。
      landingAuthStatus.value = 'anonymous';
    }
    setStoredPreferences(withoutHomePagePreference(user.preferences));
    // 被动降级为游客时不替用户打开认证；主动登录/注册和受保护操作仍走各自入口。
    bookmark.isShowLogin = false;
    stopOpinionNoticePolling();
    localStorage.removeItem('rememberedSid');
  }

  async function handleAuthExpired(options: { refreshUser?: boolean; redirect?: boolean; resetUser?: boolean } = {}) {
    const { refreshUser = true, redirect = true, resetUser = true } = options;
    if (isHandlingAuthExpired) {
      return;
    }
    isHandlingAuthExpired = true;
    const appInitialized = userInfoLoaded;
    const isManualLogout = sessionStorage.getItem('manualLogout') === '1';
    sessionStorage.removeItem('manualLogout');
    const isLandingRoute = router.currentRoute.value.name === 'landing';
    const passiveAuthUi = resolvePassiveAuthUi({
      appInitialized,
      isLandingRoute,
      isManualLogout,
    });
    if (passiveAuthUi.showSessionExpiredMessage) {
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
    // getUserInfo 可能先写入游客结果；最终仍以统一被动认证策略收口。
    bookmark.isShowLogin = passiveAuthUi.showAuthModal;
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

  function syncOnlineStatus() {
    isOnline.value = navigator.onLine !== false;
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

  const skipRouter = [
    'help',
    'updateLogs',
    'githubCallBack',
    'not-found',
    'not-role',
    'landing',
    'banned',
    'quickSave',
  ];
  const mobileAdminRoute = ['/apiLog', '/operationLog', '/userMg', '/userOpinion', '/imageMg', '/resourceGovernance'];

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
        next(
          getRuntimeGuestEntryPath(user.preferences, {
            isMobileLayout: bookmark.isMobile,
          }),
        );
        return;
      }
      next('/403');
      return;
    }

    next();
  });

  // 每次路由切换后按目标页决定是否缩放：固定排版入口页清零，帮助中心等应用内页面按 uiScale。
  router.afterEach((to) => {
    applyScaleForRoute(<string>to.name);
    if (to.name === 'landing' && landingAuthStatus.value === 'error') {
      scheduleLandingAuthRetry();
    } else if (to.name !== 'landing') {
      clearLandingAuthRetry(true);
    }
  });

  // 只有第一次进入页面或者刷新页面才触发（简化）
  async function init() {
    window.addEventListener('resize', handleResize);
    window.addEventListener('light-note:auth-expired', handleAuthExpired);
    window.addEventListener('light-note:user-banned', handleUserBanned);
    window.addEventListener('light-note:auth-session', handleAuthSession);
    window.addEventListener('light-note:preview-blocked', handlePreviewBlocked);
    window.addEventListener('online', handleLandingAuthRecoverySignal);
    window.addEventListener('online', syncOnlineStatus);
    window.addEventListener('offline', syncOnlineStatus);
    document.addEventListener('visibilitychange', handleLandingAuthRecoverySignal);
    await router.isReady();
    await getUserInfo();
    handleRouteChange(bookmark.isMobile, router.currentRoute.value.path);
    if (skipRouter.includes(<string>router.currentRoute.value.name)) {
      bookmark.isShowLogin = false;
    }
  }

  onMounted(async () => {
    initApp();
    await init();
    // 根路径是纯官网展示页，不应该出现任何账号相关的通知/弹窗。
    if (router.currentRoute.value.name === 'landing') return;
    startOpinionNoticePolling();
  });

  // 解绑媒体查询监听，防止内存泄漏
  onBeforeUnmount(() => {
    aiAssistant.abortActiveRequest('app_shutdown');
    aiAssistant.flushPersistence();
    stopOpinionNoticePolling();
    document.documentElement.classList.remove('has-mobile-bottom-nav');
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('light-note:auth-expired', handleAuthExpired);
    window.removeEventListener('light-note:user-banned', handleUserBanned);
    window.removeEventListener('light-note:auth-session', handleAuthSession);
    window.removeEventListener('light-note:preview-blocked', handlePreviewBlocked);
    window.removeEventListener('online', handleLandingAuthRecoverySignal);
    window.removeEventListener('online', syncOnlineStatus);
    window.removeEventListener('offline', syncOnlineStatus);
    document.removeEventListener('visibilitychange', handleLandingAuthRecoverySignal);
    clearLandingAuthRetry(true);
    disposeSystemTheme?.();
    disposeSystemTheme = null;
  });

  // 监听布局断点变化
  watch(
    () => bookmark.isMobile,
    (val) => {
      handleRouteChange(val, router.currentRoute.value.path);
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
  :root.has-mobile-bottom-nav,
  .app-root.has-mobile-bottom-nav {
    --mobile-shell-bottom-height: calc(56px + env(safe-area-inset-bottom));
  }

  .app-offline-banner {
    position: fixed;
    z-index: 1190;
    top: 3px;
    left: 50%;
    transform: translateX(-50%);
    display: inline-flex;
    align-items: center;
    gap: 7px;
    max-width: calc(100vw - 24px);
    padding: 7px 13px;
    box-sizing: border-box;
    border: 1px solid var(--warning-color, #a05f00);
    border-radius: 0 0 10px 10px;
    color: var(--text-color);
    background: var(--card-background);
    box-shadow: 0 6px 18px rgba(31, 35, 48, 0.14);
    font-size: 12px;
    line-height: 18px;
    text-align: center;
  }

  .app-offline-banner__dot {
    width: 7px;
    height: 7px;
    flex: 0 0 7px;
    border-radius: 50%;
    background: var(--warning-color, #a05f00);
  }

  /* 只影响根元素下的主要内容，避免全局影响 */
  .disable-animations .app-root,
  .disable-animations .app-root * {
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
  @media (max-width: 768px) {
    *::-webkit-scrollbar {
      display: none;
    }
  }
  /* 100dvh 跟随移动浏览器动态地址栏伸缩,避免底部内容被遮;旧浏览器回退 100vh(双声明,后者不识别时用前者) */
  #app {
    width: 100%;
    height: 100vh;
    height: 100dvh;
  }
  .app-root {
    width: 100%;
    height: 100%;
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
