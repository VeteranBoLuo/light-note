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
    <b class="callback-status">{{ status === 200 ? t('auth.githubCallbackChecking') : errorMessage }}</b>
    <span v-if="status !== 200 && requestId" class="callback-request-id">
      {{ t('auth.githubCallbackRequestId', { requestId }) }}
    </span>
    <div class="callback-actions">
      <template v-if="status !== 200">
        <BButton type="primary" :loading="restarting" @click="restartGithubOAuth">
          {{ t('auth.githubCallbackRetry') }}
        </BButton>
        <BButton @click="goEmailLogin">{{ t('auth.githubCallbackEmailLogin') }}</BButton>
      </template>
      <BButton v-else class="callback-back" @click="goBack">{{ t('common.back') }}</BButton>
    </div>
  </div>
</template>

<script setup>
  import { onBeforeUnmount, onMounted, ref } from 'vue';
  import { useRouter } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import { apiBasePost, apiBaseGet } from '@/http/request';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { markLoggedIn } from '@/utils/authStorage';
  import { getHomePagePreference } from '@/utils/preferences.ts';
  import { getRuntimeApplicationEntryPath, getRuntimePostRegistrationPath } from '@/utils/appEntry.ts';
  import {
    consumeGithubOAuthFlow,
    createGithubAuthorizationUrl,
    rememberGithubOAuthFlow,
  } from '@/utils/githubOAuth.ts';
  import { clearQuickSaveAuthReturnPath, resolveQuickSaveAuthReturnPath } from '@/utils/quickSaveAuthReturn.ts';
  import { persistAndroidAuthSession } from '@/utils/androidBridge.ts';
  import { bookmarkStore, useUserStore } from '@/store';
  import BButton from '@/components/base/BasicComponents/BButton.vue';

  const router = useRouter();
  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const user = useUserStore();
  const oauthFlow = consumeGithubOAuthFlow();
  const status = ref(200);
  const errorMessage = ref('');
  const requestId = ref('');
  const restarting = ref(false);
  // 用户点「返回」离开本页后:中止换票请求、不再弹提示/跳转,避免邮箱登录成功后又收到迟到的「GitHub 认证失败」。
  const abortController = new AbortController();
  let disposed = false;

  onBeforeUnmount(() => {
    disposed = true;
    abortController.abort();
  });

  function toHome() {
    router.push('/');
  }

  function showFailure(messageText, supportRequestId = '') {
    status.value = 500;
    errorMessage.value = messageText || t('auth.githubCallbackFailed');
    requestId.value = supportRequestId;
  }
  function getAuthenticatedEntryPath(preferences = {}) {
    if (oauthFlow === 'register') {
      return getRuntimePostRegistrationPath(bookmark.isMobile);
    }
    return getRuntimeApplicationEntryPath(preferences, window.innerWidth);
  }
  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function submitGithubCallback(code, state) {
    let transportRetryUsed = false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const cRes = await apiBasePost(
          '/api/user/github',
          { code, state },
          {
            silent: true,
            signal: abortController.signal,
          },
        );
        if (disposed) return null;
        if (cRes.data?.retryable && attempt < 2) {
          await wait(900 + attempt * 700);
          continue;
        }
        return cRes;
      } catch (error) {
        if (disposed || error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError') return null;
        // 仅重试本站回调请求；后端的 completed 状态会恢复会话，绝不会再次向 GitHub 重放授权码。
        if (!transportRetryUsed) {
          transportRetryUsed = true;
          await wait(1000);
          continue;
        }
        throw error;
      }
    }
    return null;
  }

  onMounted(async () => {
    const code = router.currentRoute.value.query.code;
    const state = router.currentRoute.value.query.state;
    // code/state 必须成对存在；state 还会由后端结合一次性 Redis 挑战和 HttpOnly Cookie 校验。
    if (typeof code !== 'string' || typeof state !== 'string' || !code || !state) {
      showFailure(t('auth.githubCallbackInvalid'));
      return;
    }
    // 页面级一次性锁：刷新 / 浏览器后退 / dev HMR 重挂载时不再开启一条新的回调流程。
    // 当前挂载内的本站请求恢复由 submitGithubCallback 控制，后端 completed 状态保证不会重放 GitHub code。
    const lockKey = `gh_oauth_handled:${code}`;
    if (sessionStorage.getItem(lockKey)) {
      toHome();
      return;
    }
    sessionStorage.setItem(lockKey, '1');
    // 立刻抹掉 URL 上的 code,让刷新 / 后退无 code 可重放(同路由仅去 query,不会重挂载本组件)
    router.replace({ path: '/auth/callback' }).catch(() => {});
    try {
      const cRes = await submitGithubCallback(code, state);
      if (disposed || !cRes) return;
      status.value = cRes.status;
      if (cRes.status === 200) {
        markLoggedIn();
        if (cRes.data?.sid) localStorage.setItem('rememberedSid', cRes.data.sid);
        persistAndroidAuthSession();
        // 与邮箱认证一致：成功后先把 /me 返回的偏好落到 localStorage，
        // 再按登录/注册流程进入应用。GitHub 换票接口不含 preferences，因此需要单独拉 /me。
        let finalPrefs = {};
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
          finalPrefs = { ...prefs, homePage: getHomePagePreference(prefs) };
          localStorage.setItem('preferences', JSON.stringify(finalPrefs));
          bookmark.refreshTag();
        } catch {
          // OAuth 已成功时，偏好恢复失败也不能把用户送回官网；应用页会再次恢复会话。
        }
        if (disposed) return;
        const quickSaveReturnPath = resolveQuickSaveAuthReturnPath();
        await router.replace(quickSaveReturnPath || getAuthenticatedEntryPath(finalPrefs));
        if (quickSaveReturnPath) clearQuickSaveAuthReturnPath();
      } else {
        const failureMessage = cRes.msg || t('auth.githubCallbackFailed');
        message.error(failureMessage);
        showFailure(failureMessage, String(cRes.data?.requestId || ''));
      }
    } catch (e) {
      // 主动中止(用户已离开本页)不提示、不跳转。
      if (disposed || e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError') return;
      const failureMessage = t('auth.githubCallbackNetworkFailed');
      message.error(failureMessage);
      showFailure(failureMessage);
    }
  });

  async function restartGithubOAuth() {
    if (restarting.value) return;
    restarting.value = true;
    try {
      const flow = oauthFlow || 'login';
      const authorizationUrl = await createGithubAuthorizationUrl({ flow });
      rememberGithubOAuthFlow(flow);
      window.location.href = authorizationUrl;
    } catch {
      message.error(t('auth.githubStartFailed'));
      restarting.value = false;
    }
  }

  async function goEmailLogin() {
    await router.push('/');
    bookmark.openAuthModal('登录', 'github_callback');
  }

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

  .callback-status {
    color: var(--sub-text-color);
    text-align: center;
  }

  .callback-request-id {
    margin-top: -18px;
    color: var(--disabled-text-color);
    font-size: 12px;
  }

  .callback-actions {
    display: flex;
    gap: 12px;
    align-items: center;
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
