<template>
  <div class="auth-panel">
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
          autocomplete="on"
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
          maxlength="16"
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

    <BButton type="primary" class="auth-primary" :loading="submitting" :disabled="disable" @click="handleRegister">
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
  </div>
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
  import { getAppHomePath, getHomePagePreference } from '@/utils/preferences.ts';
  import { setLocale } from '@/i18n';

  type AuthMode = '登录' | '注册' | '重置';

  const title = defineModel<AuthMode>('title', { required: true });
  const formData = reactive({ password: '', email: '', role: 'user', alias: '' });
  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const user = useUserStore();
  const submitting = ref(false);
  const disable = computed(() => submitting.value || !formData.password || !formData.email);
  const emit = defineEmits<{ 'update:success': [formData: { email: string; password: string }] }>();

  function registerWithGitHub() {
    const source = bookmark.authModalSource || 'unknown';
    trackConversion('signup_submit', source);
    try {
      sessionStorage.setItem('ln_signup_source', source);
    } catch {
      // 隐私模式下 sessionStorage 可能不可用，不影响 OAuth 跳转。
    }
    const clientId = 'Ov23liuOPhDka7KkXrpQ';
    const redirectUri = 'https://boluo66.top/auth/callback';
    const scope = 'user:email';
    const state = Math.random().toString(36).substring(7);
    window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
  }

  async function handleRegister() {
    formData.email = formData.email.trim();
    const condition = [
      { endCondition: !formData.email, message: t('auth.emailRequired') },
      { endCondition: !!formData.email && !isValidEmail(formData.email), message: t('auth.emailInvalid') },
      { endCondition: !formData.password, message: t('auth.passwordRequired') },
      { endCondition: formData.password.length > 16, message: t('auth.pwdMax16') },
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
      user.setUserInfo(res.data);
      user.preferences.theme = res.data?.preferences?.theme || 'day';
      user.preferences.lang = res.data?.preferences?.lang || 'zh-CN';
      user.preferences.noteViewMode = res.data?.preferences?.noteViewMode || 'list';
      user.preferences.homePage = getHomePagePreference(res.data?.preferences);
      localStorage.setItem('preferences', JSON.stringify(user.preferences));
      router.push(getAppHomePath(user.preferences, bookmark.isMobile));
      message.success(t('auth.registerSuccess'));
      setLocale(user.preferences.lang || 'zh-CN');
      bookmark.isShowLogin = false;
      bookmark.type = 'all';
      bookmark.refreshTag();
      emit('update:success', { email: formData.email, password: formData.password });
    } finally {
      submitting.value = false;
    }
  }

  defineExpose({ handleRegister });
</script>
