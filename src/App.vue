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
      <login v-if="bookmark.isShowLogin" />
      <BViewer />
    </a-config-provider>
  </div>
</template>
<script setup lang="ts">
  // 检查本地存储中是否有用户数据
  import { bookmarkStore, useUserStore } from '@/store';
  import { h, nextTick, onMounted, watch } from 'vue';
  import login from '@/view/login/UserAuthModal .vue';
  import BViewer from '@/components/base/Viewer/BViewer.vue';
  import { apiBaseGet } from '@/http/request';
  import { useRouter } from 'vue-router';
  import { fingerprint } from '@/utils/common';
  import { message, notification } from 'ant-design-vue';

  const router = useRouter();
  const user = useUserStore();
  const bookmark = bookmarkStore();

  // 监听主题变化
  watch(
    () => bookmark.theme,
    () => {
      applyTheme();
    },
  );

  function initApp() {
    // 页面加载前需要提前预设置主题，否则如果后台查询是黑夜主题，但是页面默认是白色的，页面会从白到黑闪一下，这种情况就需要提前设置为黑色
    const theme = localStorage.getItem('theme');
    if (theme) {
      bookmark.theme = theme;
    }
    applyTheme();
    // 设置指纹
    window['fingerprint'] = fingerprint();

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', (e) => {
      bookmark.theme = e.matches ? 'night' : 'day';
    });
    handleRouteChange(bookmark.isMobile, router.currentRoute.value.path);
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
      bookmark.theme = res.data.theme || 'day';
      localStorage.setItem('theme', bookmark.theme);
      if (res.status !== 200) {
        handleUserLogout();
      }
    } catch (error) {
      message.error('获取用户信息失败：', error);
      bookmark.theme = 'day';
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
    document.documentElement.setAttribute('data-theme', bookmark.currentTheme);

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
  function handleRouteChange(isMobile: boolean, path: string) {
    // 电脑端切换至手机端
    if (isMobile) {
      const phoneReplaceMap = {
        '/admin/apiLog': '/apiLog',
        '/admin/userMg': '/userMg',
        '/admin/userOpinion': '/userOpinion',
        '/admin/operationLog': '/operationLog',
        '/admin/imageMg': '/imageMg',
        '/workbenches': '/home',
      };
      if (phoneReplaceMap[path]) {
        router.push(phoneReplaceMap[path]);
      }
    } else {
      const deskReplaceMap = {
        '/apiLog': '/admin/apiLog',
        '/userMg': '/admin/userMg',
        '/userOpinion': '/admin/userOpinion',
        '/operationLog': '/admin/operationLog',
        '/imageMg': '/admin/imageMg',
        '/opinions': '/home',
        '/admin': '/admin/operationLog',
      };
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
      if (from.name === 'githubCallBack') {
        await getUserInfo();
      }
      if (skipRouter.includes(<string>to.name)) {
        bookmark.isShowLogin = false;
      }
    });
    next();
  });

  // 只有第一次进入页面或者刷新页面才触发
  async function init() {
    router.isReady().then(async () => {
      await getUserInfo();
      if (skipRouter.includes(<string>router.currentRoute.value.name)) {
        bookmark.isShowLogin = false;
      }
    });
  }
  onMounted(async () => {
    initApp();
    await init();
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
  .disable-animations * {
    animation: none !important;
    transition: none !important;
    animation-play-state: paused !important;
  }

  /* 2. 系统级动画禁用（尊重用户偏好） */
  @media (prefers-reduced-motion: reduce) {
    * {
      animation: none !important;
      transition: none !important;
    }
  }
</style>
