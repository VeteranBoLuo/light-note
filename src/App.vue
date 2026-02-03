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
  import { h, nextTick, onMounted, onBeforeUnmount, watch, ref, computed } from 'vue';
  import Login from '@/view/login/UserAuthModal.vue';
  import BViewer from '@/components/base/Viewer/BViewer.vue';
  import { apiBaseGet } from '@/http/request';
  import { useRouter } from 'vue-router';
  import { fingerprint } from '@/utils/common';
  import { message, notification } from 'ant-design-vue';
  import FloatQuestion from './components/aiAssistant/FloatQuestion.vue';
  import { debounce } from 'lodash-es';
  import { setLocale } from './i18n';
  import { updateNotice } from '@/config/updateNotice';

  const router = useRouter();
  const user = useUserStore();
  const bookmark = bookmarkStore();

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
  // 路由映射表
  const phoneReplaceMap = {
    '/admin/apiLog': '/apiLog',
    '/admin/userMg': '/userMg',
    '/admin/userOpinion': '/userOpinion',
    '/admin/operationLog': '/operationLog',
    '/admin/imageMg': '/imageMg',
    '/workbenches': '/home',
    '/': '/home',
  };
  const deskReplaceMap = {
    '/apiLog': '/admin/apiLog',
    '/userMg': '/admin/userMg',
    '/userOpinion': '/admin/userOpinion',
    '/operationLog': '/admin/operationLog',
    '/imageMg': '/admin/imageMg',
    '/opinions': '/home',
    '/admin': '/admin/operationLog',
    '/personCenter': '/home',
  };

  let mq = null;
  let mqListener = null;
  const handleResize = debounce(() => {
    bookmark.screenWidth = window.innerWidth;
    bookmark.screenHeight = window.innerHeight;
  }, 50);
  function initApp() {
    // 页面加载前需要提前预设置主题，否则如果后台查询是黑夜主题，但是页面默认是白色的，页面会从白到黑闪一下，这种情况就需要提前设置为黑色
    const preferences = localStorage.getItem('preferences');
    if (preferences && preferences !== 'null') {
      user.preferences = JSON.parse(preferences);
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
  async function getUserInfo() {
    try {
      const res = await apiBaseGet('/api/user/getUserInfo');
      user.setUserInfo(res.data);
      if (res.data.role === 'root') {
        if (res.data.opinionTotal > 0) {
          notification.open({
            message: '有新反馈',
            description: h('a', `总计${res.data.opinionTotal}条反馈`),
            onClick: () => {
              router.push('/admin/userOpinion');
            },
          });
        }
      }
      user.preferences.theme = res.data?.preferences?.theme || 'day';
      user.preferences.lang = res.data?.preferences?.lang || 'zh-CN';
      user.preferences.noteViewMode = res.data?.preferences?.noteViewMode || 'list';
      localStorage.setItem('preferences', JSON.stringify(user.preferences));
      localStorage.setItem('userId', res.data.id);
      setLocale(user.preferences.lang || 'zh-CN');
      if (res.status !== 200) {
        handleUserLogout();
      }
    } catch (error) {
      message.error('获取用户信息失败：', error);
      handleUserLogout();
    }
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

  // 手机端路由和电脑端不一样，切换不同尺寸设备后需要切换对应路由地址
  function handleRouteChange(isMobileDevice: boolean, path: string) {
    // 电脑端切换至手机端
    if (isMobileDevice) {
      if (phoneReplaceMap[path]) {
        router.push(phoneReplaceMap[path]);
      }
    } else {
      if (deskReplaceMap[path]) {
        router.push(deskReplaceMap[path]);
      }
    }
  }
  function handleUserLogout() {
    localStorage.setItem('userId', '');
    bookmark.isShowLogin = true;
  }

  const skipRouter = ['help', 'noteDetail', 'updateLogs', 'githubCallBack', 'not-found', 'not-role'];

  // 路由发生变化触发
  router.beforeEach(async (to, from, next) => {
    router.isReady().then(async () => {
      if (to.name === 'workbenches') {
        handleRouteChange(bookmark.isMobile, to.path);
      }
      if (from.name === 'githubCallBack') {
        await getUserInfo();
      }
      if (skipRouter.includes(<string>to.name)) {
        bookmark.isShowLogin = false;
      }
    });
    next();
  });

  // 只有第一次进入页面或者刷新页面才触发（简化）
  async function init() {
    window.addEventListener('resize', handleResize);
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
    checkUpdateNotice();
  });

  // 解绑媒体查询监听，防止内存泄漏
  onBeforeUnmount(() => {
    window.removeEventListener('resize', handleResize);
    if (mq && mqListener) {
      mq.removeEventListener('change', mqListener);
    }
  });

  // 监听设备类型变化
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
