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
      <FloatQuestion v-if="!bookmark.isMobileDevice && !bookmark.isShowLogin" />
    </a-config-provider>
  </div>
</template>
<script setup lang="ts">
  import { bookmarkStore, useUserStore } from '@/store';
  import { h, nextTick, onMounted, onBeforeUnmount, watch } from 'vue';
  import Login from '@/view/login/UserAuthModal.vue';
  import BViewer from '@/components/base/Viewer/BViewer.vue';
  import { apiBaseGet } from '@/http/request';
  import { useRouter } from 'vue-router';
  import { fingerprint } from '@/utils/common';
  import { message, notification } from 'ant-design-vue';
  import FloatQuestion from './components/aiAssistant/FloatQuestion.vue';
  import { debounce } from 'lodash-es';
  import { setLocale } from './i18n';

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
        handleRouteChange(bookmark.isMobileDevice, to.path);
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
      handleRouteChange(bookmark.isMobileDevice, router.currentRoute.value.path);
      if (skipRouter.includes(<string>router.currentRoute.value.name)) {
        bookmark.isShowLogin = false;
      }
    });
  }
  onMounted(async () => {
    initApp();
    await init();
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
    () => bookmark.isMobileDevice,
    (val) => {
      console.log('val', val);
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
</style>
