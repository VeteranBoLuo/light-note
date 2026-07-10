<template>
  <div class="view-body" :class="title !== '重置' ? 'hide' : ''">
    <div class="view-page">
      <span>
        <span class="dom-hover" style="color: var(--primary-text)" @click="title = '登录'">{{ t('common.back') }}</span>
        <b style="font-size: 30px; color: var(--text-color); position: absolute; left: 50%; transform: translateX(-50%)"
          >{{ t('auth.resetPassword') }}</b
        >
      </span>
      <a-form
        style="position: relative; top: 10%"
        :label-col="{
          span: 4,
        }"
        ref="resetRef"
        :model="formData"
      >
        <a-form-item
          label=""
          name="email"
          :rules="[
            {
              type: 'email',
              message: t('auth.emailInvalid'),
            },
          ]"
        >
          <b-input
            @blur="validateFun('email')"
            theme="al-day"
            height="40px"
            v-model:value="formData.email"
            :placeholder="t('auth.email')"
          >
            <template #prefix>
              <svg-icon :src="icon.login.email" size="16" />
            </template>
          </b-input>
        </a-form-item>
        <a-form-item
          label=""
          name="password"
          @blur="validateFun('password')"
          :rules="[
            {
              max: 15,
              message: t('auth.pwdMax15'),
            },
            {
              min: 6,
              message: t('auth.pwdMin6'),
            },
          ]"
        >
          <b-input
            height="40px"
            theme="al-day"
            type="password"
            autocomplete="new-password"
            @blur="validateFun('password')"
            v-model:value="formData.password"
            :placeholder="t('auth.newPassword')"
          >
            <template #prefix>
              <svg-icon :src="icon.login.password" size="16" />
            </template>
          </b-input>
        </a-form-item>
        <a-form-item
          label=""
          name="rPassword"
          :rules="[
            { required: true, message: t('auth.confirmPasswordRequired') },
            { validator: validatePasswordMatch, message: t('auth.passwordMismatch') },
          ]"
        >
          <b-input
            height="40px"
            theme="al-day"
            type="password"
            autocomplete="new-password"
            v-model:value="formData.rPassword"
            :placeholder="t('auth.confirmPassword')"
          >
            <template #prefix>
              <svg-icon :src="icon.login.password" size="16" />
            </template>
          </b-input>
        </a-form-item>
        <a-form-item label="" name="code" :rules="[{ required: true, message: t('auth.codeRequired') }]">
          <span class="flex-center">
            <b-input :maxlength="6" theme="al-day" height="40px" :placeholder="t('auth.code')" v-model:value="formData.code">
              <template #prefix>
                <svg-icon :src="icon.login.code" size="16" />
              </template>
              <template #suffix>
                <span style="color: var(--primary-text)" class="dom-hover" @click="sendEmail">{{
                  codeTime == 0 ? t('auth.getCode') : codeTime + 's'
                }}</span>
              </template>
            </b-input>
          </span>
        </a-form-item>
        <a-form-item>
          <b-button class="handle-btn" type="primary" @click="verifyCode" :class="{ 'disable-btn': disable }"
            >{{ t('auth.submit') }}</b-button
          >
        </a-form-item>
      </a-form>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { bookmarkStore } from '@/store';
  import { computed, reactive, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { apiBasePost } from '@/http/request.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { checkEndCondition } from '@/utils/validator.ts';

  const title = defineModel('title');
  const formData = reactive({
    email: '',
    password: '',
    rPassword: '',
    code: '',
  });

  const validatePasswordMatch = (_rule: any, value: string) => {
    if (value && value !== formData.password) {
      return Promise.reject(t('auth.passwordMismatch'));
    }
    return Promise.resolve();
  };

  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const disable = computed(() => {
    return !formData.password || !formData.rPassword || !formData.email || !formData.code;
  });
  const resetRef = ref();
  async function validateFun(names: any) {
    await resetRef.value.validate(names);
  }

  function handleReset() {
    if (disable.value) {
      return;
    }
  }

  const codeTime = ref(0);
  function sendEmail() {
    if (codeTime.value !== 0) {
      return;
    }
    if (!formData.email) {
      message.warning(t('auth.fillEmail'));
      return;
    }
    apiBasePost('/api/user/sendEmail', { email: formData.email }).then((res) => {
      if (res.status === 200) {
        message.success(t('auth.codeSent'));
        codeTime.value = 60;
        const timer = setInterval(() => {
          codeTime.value--;
          if (codeTime.value === 0) {
            clearInterval(timer);
          }
        }, 1000);
      }
    });
  }
  const emit = defineEmits(['update:success']);

  function verifyCode() {
    const condition = [
      {
        endCondition: formData.password !== formData.rPassword,
        message: t('auth.passwordMismatch'),
      },
      {
        endCondition: formData.password.length > 16,
        message: t('auth.pwdMax16'),
      },
      {
        endCondition: formData.password.length < 6,
        message: t('auth.pwdMin6'),
      },
    ];
    if (checkEndCondition(condition)) {
      return;
    }
    apiBasePost('/api/user/verifyCode', formData).then((res) => {
      if (res.status === 200) {
        title.value = '登录';
        message.success(t('auth.resetSuccess'));
        emit('update:success', formData);
      }
    });
  }

  defineExpose({
    handleReset,
  });
</script>
<style lang="less" scoped>
  :deep(:-webkit-autofill) {
    -webkit-text-fill-color: var(--text-color) !important;
  }
</style>
