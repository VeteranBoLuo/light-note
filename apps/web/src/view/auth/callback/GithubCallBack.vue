<template>
  <div class="gh-callback">
    <div class="cube-loader">
      <div class="cube-top"></div>
      <div class="cube-wrapper">
        <span style="--i: 0" class="cube-span"></span>
        <span style="--i: 1" class="cube-span"></span>
        <span style="--i: 2" class="cube-span"></span>
        <span style="--i: 3" class="cube-span"></span>
      </div>
    </div>
    <b style="color: #ccc">{{ status === 200 ? 'github登录校验中...' : `登录失败，${time}秒后将会返回首页` }} </b>
    <a @click="goBack" style="cursor: pointer">返回</a>
  </div>
</template>

<script setup>
  import { onMounted, ref } from 'vue';
  import { useRouter } from 'vue-router';
  import { apiBasePost, apiBaseGet } from '@/http/request';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { markLoggedIn } from '@/utils/authStorage';
  import { getAppHomePath, getHomePagePreference } from '@/utils/preferences.ts';
  import { bookmarkStore, useUserStore } from '@/store';

  const router = useRouter();
  const bookmark = bookmarkStore();
  const user = useUserStore();
  const status = ref(200);
  const time = ref(3);
  function toHome() {
    router.push('/');
  }
  onMounted(async () => {
    const code = router.currentRoute.value.query.code;
    // 空 code 直接回首页,避免拿空 code 打后端
    if (!code) {
      status.value = 500;
      toHome();
      return;
    }
    // 一次性锁:GitHub 的 authorization code 只能用一次,重发第二次必在换 token 处失败报 500,
    // 造成"其实已注册/登录成功却显示登录失败",还会多出一条 /api/user/github 的 api 日志。
    // 用 sessionStorage 按 code 去重,刷新 / 浏览器后退 / dev HMR 重进都不再重发。
    const lockKey = `gh_oauth_handled:${code}`;
    if (sessionStorage.getItem(lockKey)) {
      toHome();
      return;
    }
    sessionStorage.setItem(lockKey, '1');
    // 立刻抹掉 URL 上的 code,让刷新 / 后退无 code 可重放(同路由仅去 query,不会重挂载本组件)
    router.replace({ path: '/auth/callback' }).catch(() => {});
    try {
      // 注册来源:GitHub 发起注册前暂存于 sessionStorage,这里透传给后端作 register 的 context(仅本次有效,用后即删)
      let signupSource = '';
      try {
        signupSource = sessionStorage.getItem('ln_signup_source') || '';
        sessionStorage.removeItem('ln_signup_source');
      } catch {
        /* 隐私模式忽略 */
      }
      // 发送 code 给后端换取 Token
      const cRes = await apiBasePost('/api/user/github', { code, signupSource });
      status.value = cRes.status;
      if (cRes.status === 200) {
        markLoggedIn();
        // 与邮箱登录一致:登录成功后按用户偏好落 localStorage 再跳默认首页;
        // 否则 push('/') 会读到登录前(游客)的偏好而落到官网首页。GitHub 接口不含 preferences,单独拉 /me。
        try {
          const me = await apiBaseGet('/api/user/me');
          user.setUserInfo(me?.data || {});
          const authenticatedUserId = String(user.id || '');
          const tags = await bookmark.loadTagList(authenticatedUserId, { showLoading: false });
          if (tags && String(user.id || '') === authenticatedUserId) {
            user.tagTotal = tags.length;
          }
          let prefs = me?.data?.preferences ?? {};
          if (typeof prefs === 'string') {
            try {
              prefs = JSON.parse(prefs);
            } catch {
              prefs = {};
            }
          }
          const finalPrefs = { ...prefs, homePage: getHomePagePreference(prefs) };
          localStorage.setItem('preferences', JSON.stringify(finalPrefs));
          await router.push(getAppHomePath(finalPrefs, bookmark.isMobile));
          bookmark.refreshTag();
        } catch {
          toHome();
        }
      } else {
        setInterval(() => {
          time.value = time.value - 1;
        }, 1000);
        setTimeout(() => {
          toHome();
        }, 2500);
      }
    } catch (e) {
      message.error(`github授权报错：${e}，请尝试重新授权或者通过账号密码手动登录`);
      status.value = 500;
      setInterval(() => {
        time.value = time.value - 1;
      }, 1000);
      setTimeout(() => {
        toHome();
      }, 2500);
    }
  });
  function goBack() {
    router.push('/');
  }
</script>
<style scoped>
  /* 整页垂直+水平居中(回调页独占视口、无导航) */
  .gh-callback {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    gap: 30px;
    align-items: center;
    justify-content: center;
  }

  /* From Uiverse.io by andrew-demchenk0 */
  .cube-loader {
    bottom: 20px;
    position: relative;
    /* u can choose any size */
    width: 75px;
    height: 75px;
    transform-style: preserve-3d;
    transform: rotateX(-30deg);
    animation: animate 4s linear infinite;
  }

  @keyframes animate {
    0% {
      transform: rotateX(-30deg) rotateY(0);
    }

    100% {
      transform: rotateX(-30deg) rotateY(360deg);
    }
  }

  .cube-loader .cube-wrapper {
    position: absolute;
    width: 100%;
    height: 100%;
    /* top: 0;
  left: 0; */
    transform-style: preserve-3d;
  }

  .cube-loader .cube-wrapper .cube-span {
    position: absolute;
    width: 100%;
    height: 100%;
    /* top: 0;
  left: 0; */
    /* width 75px / 2 = 37.5px */
    transform: rotateY(calc(90deg * var(--i))) translateZ(37.5px);
    background: linear-gradient(
      to bottom,
      hsl(330, 3.13%, 25.1%) 0%,
      hsl(177.27, 21.71%, 32.06%) 5.5%,
      hsl(176.67, 34.1%, 36.88%) 12.1%,
      hsl(176.61, 42.28%, 40.7%) 19.6%,
      hsl(176.63, 48.32%, 43.88%) 27.9%,
      hsl(176.66, 53.07%, 46.58%) 36.6%,
      hsl(176.7, 56.94%, 48.91%) 45.6%,
      hsl(176.74, 62.39%, 50.91%) 54.6%,
      hsl(176.77, 69.86%, 52.62%) 63.4%,
      hsl(176.8, 76.78%, 54.08%) 71.7%,
      hsl(176.83, 83.02%, 55.29%) 79.4%,
      hsl(176.85, 88.44%, 56.28%) 86.2%,
      hsl(176.86, 92.9%, 57.04%) 91.9%,
      hsl(176.88, 96.24%, 57.59%) 96.3%,
      hsl(176.88, 98.34%, 57.93%) 99%,
      hsl(176.89, 99.07%, 58.04%) 100%
    );
  }

  .cube-top {
    position: absolute;
    width: 75px;
    height: 75px;
    background: hsl(330, 3.13%, 25.1%) 0%;
    /* width 75px / 2 = 37.5px */
    transform: rotateX(90deg) translateZ(37.5px);
    transform-style: preserve-3d;
  }

  .cube-top::before {
    content: '';
    position: absolute;
    /* u can choose any size */
    width: 75px;
    height: 75px;
    background: hsl(176.61, 42.28%, 40.7%) 19.6%;
    transform: translateZ(-90px);
    filter: blur(10px);
    box-shadow:
      0 0 10px #323232,
      0 0 20px hsl(176.61, 42.28%, 40.7%) 19.6%,
      0 0 30px #323232,
      0 0 40px hsl(176.61, 42.28%, 40.7%) 19.6%;
  }
</style>
