<template>
  <b-modal
    :mask-closable="false"
    v-model:visible="visible"
    :title="forgotMode ? t('myInfo.resetByEmail') : user.password ? t('myInfo.changePassword') : t('myInfo.setPassword')"
    @ok="submit"
  >
    <div class="password-cfg-container">
      <!-- 常规:修改 / 设置密码 -->
      <template v-if="!forgotMode">
        <b-form ref="passCfgRef" form-id="userEditForm" :form-data="formData" :fields="formFields" layout="vertical" />
        <div v-if="type === t('myInfo.changePassword') && user.email" class="forgot-entry">
          <span class="forgot-link dom-hover" @click="enterForgot">{{ t('myInfo.forgotOldPassword') }}</span>
        </div>
      </template>

      <!-- 忘记原密码:邮箱验证码重置(email 锁定为当前账号) -->
      <template v-else>
        <div class="forgot-back">
          <span class="forgot-link dom-hover" @click="exitForgot">← {{ t('myInfo.backToChange') }}</span>
        </div>
        <div class="forgot-email">
          <span class="forgot-email-label">{{ t('myInfo.email') }}</span>
          <span class="forgot-email-value">{{ user.email }}</span>
        </div>
        <div class="forgot-hint">{{ t('myInfo.emailCodeHint') }}</div>

        <div class="forgot-field">
          <label>{{ t('myInfo.verifyCodeLabel') }}</label>
          <b-input :maxlength="6" height="38px" v-model:value="forgotData.code" :placeholder="t('myInfo.enterCode')">
            <template #suffix>
              <span
                class="code-btn dom-hover"
                :class="{ 'code-btn--disabled': codeTime !== 0 }"
                @click="sendResetEmail"
                >{{ codeTime === 0 ? t('myInfo.getCode') : codeTime + 's' }}</span
              >
            </template>
          </b-input>
        </div>
        <div class="forgot-field">
          <label>{{ t('myInfo.newPassword') }}</label>
          <b-input
            height="38px"
            type="password"
            autocomplete="new-password"
            v-model:value="forgotData.password"
            :placeholder="t('myInfo.newPassword')"
          />
        </div>
        <div class="forgot-field">
          <label>{{ t('myInfo.confirmNewPassword') }}</label>
          <b-input
            height="38px"
            type="password"
            autocomplete="new-password"
            v-model:value="forgotData.rPassword"
            :placeholder="t('myInfo.confirmNewPassword')"
          />
        </div>
      </template>
    </div>
  </b-modal>
</template>

<script lang="ts" setup>
  import { useUserStore } from '@/store';
  import { computed, ref, watch } from 'vue';
  import BForm from '@/components/base/BasicComponents/BForm/BForm.vue';
  import { apiBasePost } from '@/http/request.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { checkEndCondition, EndCondition } from '@/utils/validator.ts';
  import { useI18n } from 'vue-i18n';
  import { recordOperation } from '@/api/commonApi.ts';
  const user = useUserStore();
  const visible = defineModel('visible');
  const { t } = useI18n();
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
        },
        {
          label: t('myInfo.newPassword'),
          name: 'password',
          required: true,
        },
        {
          label: t('myInfo.confirmNewPassword'),
          name: 'confirmPassword',
          required: true,
        },
      ];
    }
    return [
      {
        label: t('myInfo.password'),
        name: 'password',
        required: true,
      },
      {
        label: t('myInfo.confirmPassword'),
        name: 'confirmPassword',
        required: true,
      },
    ];
  });
  const passCfgRef = ref(null);

  // ===== 忘记原密码:邮箱验证码重置 =====
  const forgotMode = ref(false);
  const forgotData = ref({ code: '', password: '', rPassword: '' });
  const codeTime = ref(0);
  let codeTimer: ReturnType<typeof setInterval> | null = null;

  function enterForgot() {
    forgotMode.value = true;
  }
  function exitForgot() {
    forgotMode.value = false;
    forgotData.value = { code: '', password: '', rPassword: '' };
  }

  function sendResetEmail() {
    if (codeTime.value !== 0) return;
    if (!user.email) {
      message.warning(t('myInfo.enterEmail'));
      return;
    }
    // email 锁定为当前登录账号,验证码只会发到本人邮箱
    apiBasePost('/api/user/sendEmail', { email: user.email }).then((res) => {
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
    });
  }

  function submitForgot() {
    const condition: EndCondition[] = [
      { endCondition: !forgotData.value.code, message: t('myInfo.enterCode') },
      { endCondition: forgotData.value.password !== forgotData.value.rPassword, message: t('myInfo.passwordMismatch') },
      { endCondition: forgotData.value.password.length > 16, message: t('myInfo.newPasswordTooLong') },
      { endCondition: forgotData.value.password.length < 6, message: t('myInfo.newPasswordTooShort') },
    ];
    if (checkEndCondition(condition)) return;
    // 关键:email 强制锁定为当前登录用户邮箱。后端 verifyCode 按 email 定位账号改密,
    // 若放开 email 就等于"知道任意邮箱验证码即可改任意账号密码",这里必须锁死本人邮箱。
    apiBasePost('/api/user/verifyCode', {
      email: user.email,
      code: forgotData.value.code,
      password: forgotData.value.password,
      rPassword: forgotData.value.rPassword,
    }).then((res) => {
      if (res.status === 200) {
        user.password = forgotData.value.password;
        message.success(t('myInfo.resetPasswordSuccess'));
        recordOperation({ module: '我的信息', operation: '邮箱验证码重置密码成功' });
        visible.value = false;
      }
    });
  }

  function submit() {
    if (forgotMode.value) {
      submitForgot();
      return;
    }
    const isPass = passCfgRef.value?.validateForm();
    if (!isPass) return;
    // 提交前快照:有密码=修改密码,无密码=首次设置。不依赖 i18n 文案比较,避免英文环境误判。
    const isUpdate = !!user.password;
    let condition: EndCondition[];
    if (!isUpdate) {
      condition = [
        { endCondition: formData.value.password !== formData.value.confirmPassword, message: t('myInfo.passwordMismatch') },
        { endCondition: formData.value.password.length > 12, message: t('myInfo.passwordTooLong') },
        { endCondition: formData.value.password.length < 6, message: t('myInfo.passwordTooShort') },
      ];
    } else {
      condition = [
        { endCondition: formData.value.password !== formData.value.confirmPassword, message: t('myInfo.passwordMismatch') },
        { endCondition: formData.value.password.length > 16, message: t('myInfo.newPasswordTooLong') },
        { endCondition: formData.value.password.length < 6, message: t('myInfo.newPasswordTooShort') },
      ];
    }
    if (checkEndCondition(condition)) return;
    formData.value.type = isUpdate ? 'update' : 'sZet';
    apiBasePost('/api/user/configPassword', formData.value).then((res) => {
      if (res.status === 200) {
        user.password = formData.value.password;
        message.success(isUpdate ? t('myInfo.changePasswordSuccess') : t('myInfo.setPasswordSuccess'));
        recordOperation({ module: '我的信息', operation: isUpdate ? '修改密码成功' : '设置密码成功' });
        visible.value = false;
        formData.value = { confirmPassword: '', password: '' };
      }
    });
  }

  watch(
    () => visible.value,
    (val) => {
      if (!val) {
        formData.value = { confirmPassword: '', password: '' };
        forgotMode.value = false;
        forgotData.value = { code: '', password: '', rPassword: '' };
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
  .password-cfg-container {
    width: 600px;
    max-width: 100%;
  }
  .forgot-entry {
    margin-top: 8px;
    text-align: right;
  }
  .forgot-link {
    font-size: 13px;
    color: var(--primary-color);
    cursor: pointer;
  }
  .forgot-back {
    margin-bottom: 14px;
  }
  .forgot-email {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: var(--text-color);
  }
  .forgot-email-label {
    color: var(--sub-text-color);
  }
  .forgot-email-value {
    font-weight: 600;
    word-break: break-all;
  }
  .forgot-hint {
    margin: 6px 0 18px;
    font-size: 12px;
    color: var(--sub-text-color);
  }
  .forgot-field {
    margin-bottom: 14px;
  }
  .forgot-field label {
    display: block;
    margin-bottom: 6px;
    font-size: 13px;
    color: var(--text-color);
  }
  .code-btn {
    font-size: 13px;
    color: var(--primary-color);
    cursor: pointer;
    white-space: nowrap;
  }
  .code-btn--disabled {
    color: var(--sub-text-color);
    cursor: default;
  }
</style>
