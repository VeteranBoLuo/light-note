<template>
  <div class="view-body" :class="title !== '注册' ? 'hide' : ''">
    <div class="view-page">
      <b style="font-size: 30px; justify-self: center; color: var(--text-color)">{{ t('auth.register') }}</b>
      <p class="register-benefits">{{ t('auth.registerBenefits') }}</p>
      <a-form
        :label-col="{
          span: 4,
        }"
        ref="registerRef"
        :model="formData"
      >
        <a-form-item
          label=""
          name="email"
          @blur="validateFun('email')"
          :rules="[
            {
              type: 'email',
              message: t('auth.emailInvalid'),
            },
          ]"
        >
          <b-input height="40px" theme="al-day" v-model:value="formData.email" :placeholder="t('auth.email')" @blur="validateFun">
            <template #prefix>
              <svg-icon :src="icon.login.email" size="16" />
            </template>
          </b-input>
        </a-form-item>
        <a-form-item
          label=""
          name="password"
          :rules="[
            {
              max: 16,
              message: t('auth.pwdMax16'),
            },
            {
              min: 6,
              message: t('auth.pwdMin6'),
            },
          ]"
        >
          <span class="flex-center">
            <b-input
              theme="al-day"
              height="40px"
              maxlength="20"
              type="password"
              autocomplete="new-password"
              :placeholder="t('auth.password')"
              @blur="validateFun('password')"
              v-model:value="formData.password"
            >
              <template #prefix>
                <svg-icon :src="icon.login.password" size="16" />
              </template>
            </b-input>
          </span>
        </a-form-item>
        <a-form-item>
          <b-button
            type="primary"
            class="handle-btn"
            :class="{ 'disable-btn': disable || submitting }"
            @click="handleRegister"
            >{{ t('auth.register') }}
          </b-button>
        </a-form-item>
        <a-form-item>
          <a
            class="dom-hover-click"
            style="display: block; text-align: center; color: #3b82f6; cursor: pointer"
            v-click-log="OPERATION_LOG_MAP.register.githubRegister"
            @click="registerWithGitHub"
            >{{ t('auth.githubRegister') }}</a
          >
        </a-form-item>
      </a-form>
      <span class="tips-text"
        >{{ t('auth.hasAccount') }}<a style="cursor: pointer !important; color: #3b82f6; margin-left: 2px" @click="title = '登录'"
          >{{ t('auth.goLogin') }}</a
        ></span
      >
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, reactive, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import userApi from '@/api/userApi.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { bookmarkStore, useUserStore } from '@/store';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  import { recordOperation } from '@/api/commonApi.ts';
  import { apiBasePost } from '@/http/request.ts';
  import { checkEndCondition } from '@/utils/validator.ts';
  import { cloneDeep } from 'lodash-es';
  import router from '@/router';
  import { markLoggedIn } from '@/utils/authStorage';
  import { getAppHomePath, getHomePagePreference } from '@/utils/preferences.ts';
  import { setLocale } from '@/i18n';
  const title = defineModel('title');
  const formData = reactive({
    password: '',
    email: '',
    role: 'admin',
  });
  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const user = useUserStore();
  const disable = computed(() => {
    return !formData.password || !formData.email;
  });
  const submitting = ref(false); // 防重复提交:请求在途时禁止再次提交

  async function validateFun(names?: any) {
    await registerRef.value.validate(names);
  }
  const registerRef = ref();
  const emit = defineEmits(['update:success']);

  // GitHub 一键注册/登录:与登录页同一 OAuth 流程(已有账号→登录,新账号→创建);多数 CTA 直开注册 Tab,补上最省事的入口
  const registerWithGitHub = () => {
    const clientId = 'Ov23liuOPhDka7KkXrpQ';
    const redirectUri = 'https://boluo66.top/auth/callback';
    const scope = 'user:email';
    const state = Math.random().toString(36).substring(7);
    const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
    window.location.href = authUrl;
  };
  async function handleRegister() {
    const condition = [
      {
        endCondition: formData.password.length > 16,
        message: t('auth.pwdMax16'),
      },
      {
        endCondition: formData.password.length < 6,
        message: t('auth.pwdMin6'),
      },
    ];
    if (submitting.value || checkEndCondition(condition) || disable.value) {
      return;
    }
    await validateFun();
    submitting.value = true;
    formData.role = 'admin';
    const params = cloneDeep(formData);
    apiBasePost('/api/user/registerUser', params)
      .then((res: any) => {
        if (res.status === 200) {
          // 注册成功埋点:从按钮 v-click-log 移到这里,代表"一次真实注册",双击也只记一条
          recordOperation(OPERATION_LOG_MAP.register.register);
          // 注册即登录:复用登录成功的入应用流程,直接进应用(新用户为空状态,由空态引导上手)
          markLoggedIn();
          user.setUserInfo(res.data);
          user.preferences.theme = res.data?.preferences?.theme || 'day';
          user.preferences.lang = res.data?.preferences?.lang || 'zh-CN';
          user.preferences.noteViewMode = res.data?.preferences?.noteViewMode || 'list';
          user.preferences.homePage = getHomePagePreference(res.data?.preferences);
          localStorage.setItem('preferences', JSON.stringify(user.preferences));
          // 标记「刚注册」,进入首页后由 HomeDefaultHint 引导设置默认首页
          localStorage.setItem('ln_just_registered', '1');
          router.push(getAppHomePath(user.preferences, bookmark.isMobile));
          message.success(t('auth.registerSuccess'));
          setLocale(user.preferences.lang || 'zh-CN');
          bookmark.isShowLogin = false;
          bookmark.type = 'all';
          bookmark.refreshTag();
          emit('update:success', formData);
        }
      })
      .finally(() => {
        submitting.value = false;
      });
  }

  defineExpose({
    handleRegister,
  });
</script>

<style lang="less" scoped>
  .register-benefits {
    justify-self: center;
    margin: 6px 0 14px;
    font-size: 12px;
    color: var(--text-color);
    opacity: 0.7;
    text-align: center;
  }

  :deep(:-webkit-autofill) {
    -webkit-text-fill-color: var(--text-color) !important;
  }
</style>
