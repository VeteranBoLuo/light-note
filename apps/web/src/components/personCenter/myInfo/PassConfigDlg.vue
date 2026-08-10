<template>
  <component
    :is="shellComponent"
    v-bind="shellProps"
    @close="closeShell"
    @update:visible="handleShellVisible"
    @ok="submit"
  >
    <div class="password-shell" :class="{ 'password-shell--mobile': isMobile }">
      <div class="password-cfg-container">
        <div v-if="isMobile" class="password-mobile-intro">
          <span class="password-mobile-intro__icon" aria-hidden="true">
            <SvgIcon :src="icon.growth.lock" size="20" />
          </span>
          <span>
            <strong>{{ passwordTitle }}</strong>
            <small>{{ t('myInfo.passwordSecurityHint') }}</small>
          </span>
        </div>

        <!-- 常规:修改 / 设置密码 -->
        <template v-if="!forgotMode">
          <BForm ref="passCfgRef" form-id="userEditForm" :form-data="formData" :fields="formFields" layout="vertical" />
          <div v-if="type === t('myInfo.changePassword') && user.email" class="forgot-entry">
            <BButton class="forgot-link" @click="enterForgot">{{ t('myInfo.forgotOldPassword') }}</BButton>
          </div>
        </template>

        <!-- 忘记原密码:邮箱验证码重置(email 锁定为当前账号) -->
        <template v-else>
          <div class="forgot-back">
            <BButton class="forgot-link forgot-link--back" @click="exitForgot">
              <SvgIcon :src="icon.arrow_left" size="15" aria-hidden="true" />
              {{ t('myInfo.backToChange') }}
            </BButton>
          </div>
          <div class="forgot-email">
            <span class="forgot-email-label">{{ t('myInfo.email') }}</span>
            <span class="forgot-email-value">{{ user.email }}</span>
          </div>
          <div class="forgot-hint">{{ t('myInfo.emailCodeHint') }}</div>

          <div class="forgot-field">
            <label>{{ t('myInfo.verifyCodeLabel') }}</label>
            <BInput
              :maxlength="6"
              height="46px"
              autocomplete="one-time-code"
              v-model:value="forgotData.code"
              :placeholder="t('myInfo.enterCode')"
            >
              <template #suffix>
                <BButton class="code-btn" :disabled="codeTime !== 0" @click="sendResetEmail">
                  {{ codeTime === 0 ? t('myInfo.getCode') : codeTime + 's' }}
                </BButton>
              </template>
            </BInput>
          </div>
          <div class="forgot-field">
            <label>{{ t('myInfo.newPassword') }}</label>
            <BInput
              height="46px"
              type="password"
              autocomplete="new-password"
              :maxlength="64"
              v-model:value="forgotData.password"
              :placeholder="t('myInfo.newPassword')"
            />
          </div>
          <div class="forgot-field">
            <label>{{ t('myInfo.confirmNewPassword') }}</label>
            <BInput
              height="46px"
              type="password"
              autocomplete="new-password"
              :maxlength="64"
              v-model:value="forgotData.rPassword"
              :placeholder="t('myInfo.confirmNewPassword')"
            />
          </div>
        </template>
      </div>

      <div class="password-actions">
        <BButton class="password-actions__primary" type="primary" :loading="submitting" @click="submit">
          {{ t('common.confirm') }}
        </BButton>
        <BButton v-if="!isMobile" class="password-actions__cancel" @click="closeShell">
          {{ t('common.cancel') }}
        </BButton>
      </div>
    </div>
  </component>
</template>

<script lang="ts" setup>
  import { bookmarkStore, useUserStore } from '@/store';
  import { computed, ref, watch } from 'vue';
  import BForm from '@/components/base/BasicComponents/BForm/BForm.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { apiBasePost } from '@/http/request.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { checkEndCondition, EndCondition } from '@/utils/validator.ts';
  import { useI18n } from 'vue-i18n';
  const user = useUserStore();
  const bookmark = bookmarkStore();
  const visible = defineModel<boolean>('visible');
  const { t } = useI18n();
  const isMobile = computed(() => bookmark.isMobile);
  const type = computed(() => {
    return user.password ? t('myInfo.changePassword') : t('myInfo.setPassword');
  });

  const formData = ref<{ type?: string; password: string; confirmPassword: string; oldPassword?: string }>({
    confirmPassword: '',
    password: '',
  });

  const formFields: any = computed(() => {
    if (type.value === t('myInfo.changePassword')) {
      return [
        {
          label: t('myInfo.oldPassword'),
          name: 'oldPassword',
          required: true,
          type: 'password',
          autocomplete: 'current-password',
          maxlength: 64,
        },
        {
          label: t('myInfo.newPassword'),
          name: 'password',
          required: true,
          type: 'password',
          autocomplete: 'new-password',
          maxlength: 64,
        },
        {
          label: t('myInfo.confirmNewPassword'),
          name: 'confirmPassword',
          required: true,
          type: 'password',
          autocomplete: 'new-password',
          maxlength: 64,
        },
      ];
    }
    return [
      {
        label: t('myInfo.password'),
        name: 'password',
        required: true,
        type: 'password',
        autocomplete: 'new-password',
        maxlength: 64,
      },
      {
        label: t('myInfo.confirmPassword'),
        name: 'confirmPassword',
        required: true,
        type: 'password',
        autocomplete: 'new-password',
        maxlength: 64,
      },
    ];
  });
  const passCfgRef = ref<InstanceType<typeof BForm> | null>(null);
  const submitting = ref(false);

  // ===== 忘记原密码:邮箱验证码重置 =====
  const forgotMode = ref(false);
  const forgotData = ref({ code: '', password: '', rPassword: '' });
  const codeTime = ref(0);
  let codeTimer: ReturnType<typeof setInterval> | null = null;
  const passwordTitle = computed(() =>
    forgotMode.value ? t('myInfo.resetByEmail') : user.password ? t('myInfo.changePassword') : t('myInfo.setPassword'),
  );
  const shellComponent = computed(() => (isMobile.value ? BDrawer : BModal));
  const shellProps = computed(() =>
    isMobile.value
      ? {
          open: visible.value === true,
          title: passwordTitle.value,
          placement: 'bottom' as const,
          height: 'min(86vh, 720px)',
          bodyPadding: '0',
          mobileCenteredHeader: true,
          maskClosable: false,
        }
      : {
          visible: visible.value === true,
          title: passwordTitle.value,
          width: '640px',
          maskClosable: false,
          showFooter: false,
        },
  );

  function enterForgot() {
    forgotMode.value = true;
  }
  function exitForgot() {
    forgotMode.value = false;
    forgotData.value = { code: '', password: '', rPassword: '' };
  }

  function closeShell() {
    visible.value = false;
  }

  function handleShellVisible(value: boolean) {
    visible.value = value;
  }

  async function sendResetEmail() {
    if (codeTime.value !== 0) return;
    if (!user.email) {
      message.warning(t('myInfo.enterEmail'));
      return;
    }
    // email 锁定为当前登录账号,验证码只会发到本人邮箱
    const res = await apiBasePost('/api/user/sendEmail', { email: user.email });
    if (res.status === 200) {
      message.success(t('myInfo.codeSent'));
      codeTime.value = 60;
      codeTimer = setInterval(() => {
        codeTime.value--;
        if (codeTime.value <= 0 && codeTimer) {
          clearInterval(codeTimer);
          codeTimer = null;
        }
      }, 1000);
    }
  }

  async function submitForgot() {
    const condition: EndCondition[] = [
      { endCondition: !forgotData.value.code, message: t('myInfo.enterCode') },
      { endCondition: forgotData.value.password !== forgotData.value.rPassword, message: t('myInfo.passwordMismatch') },
      { endCondition: forgotData.value.password.length > 64, message: t('myInfo.passwordMax64') },
      { endCondition: forgotData.value.password.length < 6, message: t('myInfo.newPasswordTooShort') },
    ];
    if (checkEndCondition(condition)) return;
    // 关键:email 强制锁定为当前登录用户邮箱。后端 verifyCode 按 email 定位账号改密,
    // 若放开 email 就等于"知道任意邮箱验证码即可改任意账号密码",这里必须锁死本人邮箱。
    submitting.value = true;
    try {
      const res = await apiBasePost('/api/user/verifyCode', {
        email: user.email,
        code: forgotData.value.code,
        password: forgotData.value.password,
        rPassword: forgotData.value.rPassword,
      });
      if (res.status === 200) {
        user.password = forgotData.value.password;
        message.success(t('myInfo.resetPasswordSuccess'));
        visible.value = false;
      }
    } finally {
      submitting.value = false;
    }
  }

  async function submit() {
    if (submitting.value) return;
    if (forgotMode.value) {
      await submitForgot();
      return;
    }
    const isPass = passCfgRef.value?.validateForm();
    if (!isPass) return;
    // 提交前快照:有密码=修改密码,无密码=首次设置。不依赖 i18n 文案比较,避免英文环境误判。
    const isUpdate = !!user.password;
    let condition: EndCondition[];
    if (!isUpdate) {
      condition = [
        {
          endCondition: formData.value.password !== formData.value.confirmPassword,
          message: t('myInfo.passwordMismatch'),
        },
        { endCondition: formData.value.password.length > 64, message: t('myInfo.passwordMax64') },
        { endCondition: formData.value.password.length < 6, message: t('myInfo.passwordTooShort') },
      ];
    } else {
      condition = [
        {
          endCondition: formData.value.password !== formData.value.confirmPassword,
          message: t('myInfo.passwordMismatch'),
        },
        { endCondition: formData.value.password.length > 64, message: t('myInfo.passwordMax64') },
        { endCondition: formData.value.password.length < 6, message: t('myInfo.newPasswordTooShort') },
      ];
    }
    if (checkEndCondition(condition)) return;
    formData.value.type = isUpdate ? 'update' : 'sZet';
    submitting.value = true;
    try {
      const res = await apiBasePost('/api/user/configPassword', formData.value);
      if (res.status === 200) {
        user.password = formData.value.password;
        message.success(isUpdate ? t('myInfo.changePasswordSuccess') : t('myInfo.setPasswordSuccess'));
        visible.value = false;
        formData.value = { confirmPassword: '', password: '' };
      }
    } finally {
      submitting.value = false;
    }
  }

  watch(
    () => visible.value,
    (val) => {
      if (!val) {
        formData.value = { confirmPassword: '', password: '' };
        forgotMode.value = false;
        forgotData.value = { code: '', password: '', rPassword: '' };
        submitting.value = false;
        codeTime.value = 0;
        if (codeTimer) {
          clearInterval(codeTimer);
          codeTimer = null;
        }
      }
    },
  );
</script>

<style lang="less" scoped>
  .password-shell {
    width: 600px;
    max-width: 100%;
  }

  .password-cfg-container {
    width: 100%;
    box-sizing: border-box;
  }

  .password-mobile-intro {
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 12px;
    margin-bottom: 16px;
    border: 1px solid var(--surface-border-color);
    border-radius: 13px;
    background: var(--surface-panel-bg);
  }

  .password-mobile-intro__icon {
    width: 38px;
    height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 38px;
    border: 1px solid var(--surface-border-color);
    border-radius: 11px;
    color: var(--primary-color);
    background: var(--card-background);
  }

  .password-mobile-intro > span:last-child {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .password-mobile-intro strong {
    color: var(--text-color);
    font-size: 14px;
    line-height: 1.35;
  }

  .password-mobile-intro small {
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.45;
  }

  .password-cfg-container :deep(.form-container) {
    gap: 18px;
  }

  .password-cfg-container :deep(.form-item) {
    gap: 7px;
  }

  .password-cfg-container :deep(.form-item-label) {
    flex: none !important;
    color: var(--text-color);
    font-size: 13px;
    font-weight: 600;
    line-height: 1.4;
    text-align: left;
  }

  .password-cfg-container :deep(.form-item-content) {
    flex: none !important;
  }

  .password-cfg-container :deep(.b-input) {
    height: 42px !important;
    border: 1px solid var(--surface-border-color) !important;
    border-radius: 10px;
    background: var(--surface-panel-bg);
  }

  .password-cfg-container :deep(.b-input:focus-visible) {
    border-color: var(--primary-color) !important;
    background: var(--card-background);
  }

  .password-cfg-container :deep(.require-tip) {
    position: static;
    min-height: 0;
    margin-top: 3px;
  }

  .forgot-entry {
    margin-top: 10px;
    display: flex;
    justify-content: flex-end;
  }

  .forgot-link {
    width: max-content;
    height: auto;
    min-height: 32px;
    gap: 5px;
    padding: 0 4px;
    border: 0;
    color: var(--primary-color);
    background: transparent;
    font-size: 12px;
  }

  .forgot-back {
    margin-bottom: 14px;
  }

  .forgot-link--back {
    padding-left: 0;
  }

  .forgot-email {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    color: var(--text-color);
    font-size: 13px;
  }

  .forgot-email-label {
    flex: 0 0 auto;
    color: var(--desc-color);
  }

  .forgot-email-value {
    min-width: 0;
    font-weight: 600;
    word-break: break-all;
  }

  .forgot-hint {
    margin: 6px 0 16px;
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.45;
  }

  .forgot-field {
    margin-bottom: 14px;
  }

  .forgot-field label {
    display: block;
    margin-bottom: 7px;
    color: var(--text-color);
    font-size: 13px;
    font-weight: 600;
  }

  .forgot-field :deep(.b-input) {
    border: 1px solid var(--surface-border-color) !important;
    border-radius: 10px;
    background: var(--surface-panel-bg);
  }

  .code-btn {
    width: max-content;
    height: 28px;
    min-height: 28px;
    padding: 0;
    border: 0;
    color: var(--primary-color);
    background: transparent;
    font-size: 12px;
  }

  .password-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 20px;
  }

  .password-actions__primary,
  .password-actions__cancel {
    min-width: 84px;
    min-height: 40px;
  }

  .password-shell--mobile {
    width: 100%;
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .password-shell--mobile .password-cfg-container {
    min-height: 0;
    flex: 1 1 auto;
    padding: 16px;
    overflow-y: auto;
    overscroll-behavior-y: contain;
  }

  .password-shell--mobile .password-cfg-container :deep(.form-container) {
    gap: 15px;
  }

  .password-shell--mobile .password-cfg-container :deep(.b-input) {
    height: 46px !important;
  }

  .password-shell--mobile .forgot-entry {
    justify-content: flex-start;
  }

  .password-shell--mobile .password-actions {
    flex: 0 0 auto;
    margin: 0;
    padding: 11px 16px calc(11px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--surface-border-color);
    background: var(--card-background);
  }

  .password-shell--mobile .password-actions__primary {
    width: 100%;
    min-height: 46px;
    border-radius: 11px;
  }

  :global(html.light-note-mobile-rendering) .password-mobile-intro,
  :global(html.light-note-mobile-rendering) .password-cfg-container :deep(.b-input) {
    border-color: var(--surface-border-color) !important;
    box-shadow: none;
  }
</style>
