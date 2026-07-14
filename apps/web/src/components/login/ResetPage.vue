<template>
  <div class="auth-panel auth-panel--reset">
    <div class="auth-fields">
      <label class="auth-field" for="auth-reset-email">
        <span class="auth-field__label">{{ t('auth.email') }}</span>
        <BInput
          id="auth-reset-email"
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

      <label class="auth-field" for="auth-reset-password">
        <span class="auth-field__label">{{ t('auth.newPassword') }}</span>
        <BInput
          id="auth-reset-password"
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

      <label class="auth-field" for="auth-reset-confirm">
        <span class="auth-field__label">{{ t('auth.confirmPassword') }}</span>
        <BInput
          id="auth-reset-confirm"
          v-model:value="formData.rPassword"
          class="auth-input"
          height="48px"
          maxlength="16"
          type="password"
          autocomplete="new-password"
          :placeholder="t('auth.confirmPasswordPlaceholder')"
        >
          <template #prefix>
            <SvgIcon :src="icon.login.password" size="16" />
          </template>
        </BInput>
      </label>

      <label class="auth-field" for="auth-reset-code">
        <span class="auth-field__label">{{ t('auth.code') }}</span>
        <BInput
          id="auth-reset-code"
          v-model:value="formData.code"
          class="auth-input auth-input--action"
          height="48px"
          :maxlength="6"
          :placeholder="t('auth.codePlaceholder')"
        >
          <template #prefix>
            <SvgIcon :src="icon.login.code" size="16" />
          </template>
          <template #suffix>
            <BButton class="auth-inline-action" :loading="sendingCode" :disabled="codeTime > 0" @click="sendEmail">
              {{ codeTime === 0 ? t('auth.getCode') : `${codeTime}s` }}
            </BButton>
          </template>
        </BInput>
      </label>
    </div>

    <BButton type="primary" class="auth-primary" :loading="submitting" :disabled="disable" @click="verifyCode">
      {{ t('auth.resetAndLogin') }}
    </BButton>

    <div class="auth-switch">
      <BButton class="auth-link" @click="title = '登录'">{{ t('auth.backToLogin') }}</BButton>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, onUnmounted, reactive, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { apiBasePost } from '@/http/request.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { checkEndCondition, isValidEmail } from '@/utils/validator.ts';

  type AuthMode = '登录' | '注册' | '重置';

  const title = defineModel<AuthMode>('title', { required: true });
  const formData = reactive({ email: '', password: '', rPassword: '', code: '' });
  const { t } = useI18n();
  const codeTime = ref(0);
  const sendingCode = ref(false);
  const submitting = ref(false);
  let countdownTimer: ReturnType<typeof setInterval> | null = null;
  const disable = computed(
    () => submitting.value || !formData.password || !formData.rPassword || !formData.email || !formData.code,
  );
  const emit = defineEmits<{ 'update:success': [formData: { email: string; password: string }] }>();

  async function sendEmail() {
    if (codeTime.value > 0 || sendingCode.value) return;
    if (!formData.email) {
      message.warning(t('auth.fillEmail'));
      return;
    }
    if (!isValidEmail(formData.email)) {
      message.warning(t('auth.emailInvalid'));
      return;
    }

    sendingCode.value = true;
    try {
      const res: any = await apiBasePost('/api/user/sendEmail', { email: formData.email });
      if (res.status !== 200) return;
      message.success(t('auth.codeSent'));
      codeTime.value = 60;
      countdownTimer = setInterval(() => {
        codeTime.value--;
        if (codeTime.value <= 0 && countdownTimer) {
          clearInterval(countdownTimer);
          countdownTimer = null;
        }
      }, 1000);
    } finally {
      sendingCode.value = false;
    }
  }

  async function verifyCode() {
    const condition = [
      { endCondition: !formData.email, message: t('auth.emailRequired') },
      { endCondition: !!formData.email && !isValidEmail(formData.email), message: t('auth.emailInvalid') },
      { endCondition: !formData.password, message: t('auth.passwordRequired') },
      { endCondition: formData.password.length > 16, message: t('auth.pwdMax16') },
      { endCondition: !!formData.password && formData.password.length < 6, message: t('auth.pwdMin6') },
      { endCondition: !formData.rPassword, message: t('auth.confirmPasswordRequired') },
      { endCondition: formData.password !== formData.rPassword, message: t('auth.passwordMismatch') },
      { endCondition: !formData.code, message: t('auth.codeRequired') },
    ];
    if (submitting.value || checkEndCondition(condition)) return;

    submitting.value = true;
    try {
      const res: any = await apiBasePost('/api/user/verifyCode', formData);
      if (res.status !== 200) return;
      title.value = '登录';
      message.success(t('auth.resetSuccess'));
      emit('update:success', { email: formData.email, password: formData.password });
    } finally {
      submitting.value = false;
    }
  }

  function handleReset() {
    return verifyCode();
  }

  onUnmounted(() => {
    if (countdownTimer) clearInterval(countdownTimer);
  });

  defineExpose({ handleReset });
</script>
