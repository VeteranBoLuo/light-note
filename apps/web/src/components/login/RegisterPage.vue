<template>
  <form class="auth-panel" @submit.prevent="handleRegister">
    <div class="auth-fields">
      <label class="auth-field" for="auth-register-alias">
        <span class="auth-field__label">{{ t('auth.nickname') }}</span>
        <BInput
          id="auth-register-alias"
          v-model:value="formData.alias"
          class="auth-input"
          height="48px"
          maxlength="20"
          :placeholder="t('auth.nicknameOptional')"
        >
          <template #prefix>
            <SvgIcon :src="icon.navigation.user" size="16" />
          </template>
        </BInput>
      </label>

      <label class="auth-field" for="auth-register-email">
        <span class="auth-field__label">{{ t('auth.email') }}</span>
        <BInput
          id="auth-register-email"
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

      <label class="auth-field" for="auth-register-password">
        <span class="auth-field__label">{{ t('auth.password') }}</span>
        <BInput
          id="auth-register-password"
          v-model:value="formData.password"
          class="auth-input"
          height="48px"
          maxlength="64"
          type="password"
          autocomplete="new-password"
          :placeholder="t('auth.passwordRulePlaceholder')"
        >
          <template #prefix>
            <SvgIcon :src="icon.login.password" size="16" />
          </template>
        </BInput>
      </label>
    </div>

    <BButton native-type="submit" type="primary" class="auth-primary" :loading="submitting" :disabled="disable">
      {{ t('auth.registerAndStart') }}
    </BButton>

    <div class="auth-divider">{{ t('auth.or') }}</div>

    <BButton class="auth-secondary" v-click-log="OPERATION_LOG_MAP.register.githubRegister" @click="registerWithGitHub">
      <SvgIcon :src="icon.github" size="17" />
      {{ t('auth.githubRegister') }}
    </BButton>

    <div class="auth-switch">
      <span>{{ t('auth.hasAccount') }}</span>
      <BButton class="auth-link" @click="title = '登录'">{{ t('auth.goLogin') }}</BButton>
    </div>

    <GithubOAuthConsentModal
      v-model:visible="githubConsentVisible"
      :loading="githubStarting"
      @confirm="confirmGitHubRegistration"
    />
  </form>
</template>

<script lang="ts" setup>
  import { computed, reactive, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { cloneDeep } from 'lodash-es';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { bookmarkStore, useUserStore } from '@/store';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  import { recordOperation } from '@/api/commonApi.ts';
  import { apiBasePost } from '@/http/request.ts';
  import { trackConversion } from '@/utils/conversion';
  import { checkEndCondition, isValidEmail } from '@/utils/validator.ts';
  import router from '@/router';
  import { markLoggedIn } from '@/utils/authStorage';
  import { DEFAULT_NOTE_VIEW_MODE, getHomePagePreference } from '@/utils/preferences.ts';
  import { getRuntimePostRegistrationPath } from '@/utils/appEntry.ts';
  import { setLocale } from '@/i18n';
  import { createGithubAuthorizationUrl, rememberGithubOAuthFlow } from '@/utils/githubOAuth';
  import { clearQuickSaveAuthReturnPath, resolveQuickSaveAuthReturnPath } from '@/utils/quickSaveAuthReturn.ts';
  import { persistAndroidAuthSession } from '@/utils/androidBridge.ts';
  import GithubOAuthConsentModal from './GithubOAuthConsentModal.vue';

  type AuthMode = '登录' | '注册' | '重置';

  const title = defineModel<AuthMode>('title', { required: true });
  const formData = reactive({ password: '', email: '', role: 'user', alias: '' });
  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const user = useUserStore();
  const submitting = ref(false);
  const githubConsentVisible = ref(false);
  const githubStarting = ref(false);
  const disable = computed(() => submitting.value || !formData.password || !formData.email);
  const emit = defineEmits<{ 'update:success': [formData: { email: string; password: string }] }>();

  function registerWithGitHub() {
    githubConsentVisible.value = true;
  }

  async function confirmGitHubRegistration() {
    if (githubStarting.value) return;
    githubStarting.value = true;
    const source = bookmark.authModalSource || 'unknown';
    trackConversion('signup_submit', source);
    try {
      const authorizationUrl = await createGithubAuthorizationUrl({
        flow: 'register',
        signupSource: source,
      });
      rememberGithubOAuthFlow('register');
      window.location.href = authorizationUrl;
    } catch {
      message.error(t('auth.githubStartFailed'));
      githubStarting.value = false;
    }
  }

  async function handleRegister() {
    formData.email = formData.email.trim();
    const condition = [
      { endCondition: !formData.email, message: t('auth.emailRequired') },
      { endCondition: !!formData.email && !isValidEmail(formData.email), message: t('auth.emailInvalid') },
      { endCondition: !formData.password, message: t('auth.passwordRequired') },
      { endCondition: formData.password.length > 64, message: t('auth.pwdMax64') },
      { endCondition: !!formData.password && formData.password.length < 6, message: t('auth.pwdMin6') },
    ];
    if (submitting.value || checkEndCondition(condition)) return;

    submitting.value = true;
    formData.role = 'user';
    const source = bookmark.authModalSource || 'unknown';
    trackConversion('signup_submit', source);
    const params = { ...cloneDeep(formData), signupSource: source };
    params.alias = (params.alias || '').trim(); // 去首尾空格;纯空格 → 空,由后端兜底成「默认昵称」

    try {
      const res: any = await apiBasePost('/api/user/registerUser', params);
      if (res.status !== 200) return;

      recordOperation(OPERATION_LOG_MAP.register.register);
      markLoggedIn();
      persistAndroidAuthSession();
      user.setUserInfo(res.data);
      const registeredUserId = String(user.id || '');
      const tags = await bookmark.loadTagList(registeredUserId, { showLoading: false });
      if (tags && String(user.id || '') === registeredUserId) {
        user.tagTotal = tags.length;
      }
      user.preferences.theme = res.data?.preferences?.theme || 'day';
      user.preferences.lang = res.data?.preferences?.lang || 'zh-CN';
      user.preferences.noteViewMode = res.data?.preferences?.noteViewMode || DEFAULT_NOTE_VIEW_MODE;
      user.preferences.homePage = getHomePagePreference(res.data?.preferences);
      localStorage.setItem('preferences', JSON.stringify(user.preferences));
      void setLocale(user.preferences.lang || 'zh-CN');
      bookmark.isShowLogin = false;
      bookmark.type = 'all';
      bookmark.refreshTag();
      const quickSaveReturnPath = resolveQuickSaveAuthReturnPath();
      await router.replace(quickSaveReturnPath || getRuntimePostRegistrationPath(bookmark.isMobile));
      if (quickSaveReturnPath) clearQuickSaveAuthReturnPath();
      message.success(t('auth.registerSuccess'));
      emit('update:success', { email: formData.email, password: formData.password });
    } finally {
      submitting.value = false;
    }
  }

  defineExpose({ handleRegister });
</script>
