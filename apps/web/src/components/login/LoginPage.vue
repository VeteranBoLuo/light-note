<template>
  <form class="auth-panel" @submit.prevent="handleLogin">
    <div class="auth-fields">
      <label class="auth-field" for="auth-login-email">
        <span class="auth-field__label">{{ t('auth.email') }}</span>
        <BInput
          id="auth-login-email"
          v-model:value="formData.email"
          class="auth-input"
          height="48px"
          autocomplete="email"
          :placeholder="t('auth.emailPlaceholder')"
        >
          <template #prefix>
            <SvgIcon :src="icon.login.email" size="16" />
          </template>
        </BInput>
      </label>

      <label class="auth-field" for="auth-login-password">
        <span class="auth-field__label">{{ t('auth.password') }}</span>
        <BInput
          id="auth-login-password"
          v-model:value="formData.password"
          class="auth-input"
          height="48px"
          maxlength="64"
          type="password"
          autocomplete="current-password"
          :placeholder="t('auth.passwordPlaceholder')"
        >
          <template #prefix>
            <SvgIcon :src="icon.login.password" size="16" />
          </template>
        </BInput>
      </label>
    </div>

    <div class="auth-options">
      <BCheckbox v-model:checked="isCheck">{{ t('auth.rememberMe') }}</BCheckbox>
      <BButton class="auth-link" @click="title = '重置'">{{ t('auth.forgotPassword') }}</BButton>
    </div>

    <BButton native-type="submit" type="primary" class="auth-primary" :loading="submitting" :disabled="disable">
      {{ t('auth.login') }}
    </BButton>

    <div class="auth-divider">{{ t('auth.or') }}</div>

    <BButton class="auth-secondary" v-click-log="OPERATION_LOG_MAP.login.githubLogin" @click="loginWithGitHub">
      <SvgIcon :src="icon.github" size="17" />
      {{ t('auth.githubLogin') }}
    </BButton>

    <div class="auth-switch">
      <span>{{ t('auth.noAccount') }}</span>
      <BButton class="auth-link" @click="title = '注册'">{{ t('auth.goRegister') }}</BButton>
    </div>

    <GithubOAuthConsentModal
      v-model:visible="githubConsentVisible"
      :loading="githubStarting"
      @confirm="confirmGitHubLogin"
    />
  </form>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import router from '@/router';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { bookmarkStore, useUserStore } from '@/store';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  import { apiBasePost } from '@/http/request.ts';
  import { setLocale } from '@/i18n';
  import { DEFAULT_NOTE_VIEW_MODE, getHomePagePreference } from '@/utils/preferences.ts';
  import { getRuntimeApplicationHomePath } from '@/utils/appEntry.ts';
  import { markLoggedIn } from '@/utils/authStorage';
  import { createGithubAuthorizationUrl, rememberGithubOAuthFlow } from '@/utils/githubOAuth';
  import { isValidEmail } from '@/utils/validator.ts';
  import GithubOAuthConsentModal from './GithubOAuthConsentModal.vue';

  type AuthMode = '登录' | '注册' | '重置';
  interface LoginFormData {
    email: string;
    password: string;
  }

  const title = defineModel<AuthMode>('title', { required: true });
  const formData = defineModel<LoginFormData>('formData', { required: true });
  const REMEMBERED_EMAIL_KEY = 'rememberedLoginEmail';
  const isCheck = ref(true);
  const submitting = ref(false);
  const githubConsentVisible = ref(false);
  const githubStarting = ref(false);
  const disable = computed(() => submitting.value || !formData.value.email || !formData.value.password);
  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const user = useUserStore();

  async function handleLogin() {
    if (submitting.value) return;
    formData.value.email = formData.value.email.trim();
    if (!formData.value.email) {
      message.warning(t('auth.emailRequired'));
      return;
    }
    if (!isValidEmail(formData.value.email)) {
      message.warning(t('auth.emailInvalid'));
      return;
    }
    if (!formData.value.password) {
      message.warning(t('auth.passwordRequired'));
      return;
    }

    submitting.value = true;
    try {
      const res: any = await apiBasePost('/api/user/login', { ...formData.value, rememberMe: isCheck.value });
      if (res.status !== 200) return;

      markLoggedIn();
      if (isCheck.value) {
        localStorage.setItem(REMEMBERED_EMAIL_KEY, formData.value.email || '');
        if (res.data?.sid) localStorage.setItem('rememberedSid', res.data.sid);
      } else {
        localStorage.removeItem(REMEMBERED_EMAIL_KEY);
        localStorage.removeItem('rememberedSid');
      }
      user.setUserInfo(res.data);
      const authenticatedUserId = String(user.id || '');
      const tags = await bookmark.loadTagList(authenticatedUserId, { showLoading: false });
      if (tags && String(user.id || '') === authenticatedUserId) {
        user.tagTotal = tags.length;
      }
      user.preferences.theme = res.data?.preferences?.theme || 'day';
      user.preferences.lang = res.data?.preferences?.lang || 'zh-CN';
      user.preferences.noteViewMode = res.data?.preferences?.noteViewMode || DEFAULT_NOTE_VIEW_MODE;
      user.preferences.homePage = getHomePagePreference(res.data?.preferences);
      localStorage.setItem('preferences', JSON.stringify(user.preferences));
      await router.push(getRuntimeApplicationHomePath(user.preferences, bookmark.isMobile));
      message.success(t('auth.loginSuccess'));
      void setLocale(user.preferences.lang || 'zh-CN');
      bookmark.isShowLogin = false;
      bookmark.type = 'all';
      bookmark.refreshTag();
    } finally {
      submitting.value = false;
    }
  }

  function loginWithGitHub() {
    githubConsentVisible.value = true;
  }

  async function confirmGitHubLogin() {
    if (githubStarting.value) return;
    githubStarting.value = true;
    try {
      const authorizationUrl = await createGithubAuthorizationUrl({ flow: 'login' });
      rememberGithubOAuthFlow('login');
      window.location.href = authorizationUrl;
    } catch {
      message.error(t('auth.githubStartFailed'));
      githubStarting.value = false;
    }
  }

  onMounted(() => {
    const rememberedEmail = localStorage.getItem(REMEMBERED_EMAIL_KEY) || '';
    if (rememberedEmail) {
      isCheck.value = true;
      formData.value.email = rememberedEmail;
    }
  });

  defineExpose({ handleLogin });
</script>
