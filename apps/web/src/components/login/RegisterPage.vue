<template>
  <div class="view-body" :class="title !== '注册' ? 'hide' : ''">
    <span @click="bookmark.isShowLogin = false" class="dom-hover login-close-icon" style="color: var(--primary-text)">
      稍后再说
    </span>
    <div class="view-page">
      <b style="font-size: 30px; justify-self: center; color: var(--text-color)">注册</b>
      <p class="register-benefits">秒注册 · 自动登录 · 已备好示例数据 · 永久免费</p>
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
              message: '请输入正确的邮箱格式',
            },
          ]"
        >
          <b-input height="40px" theme="al-day" v-model:value="formData.email" placeholder="邮箱" @blur="validateFun">
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
              message: '密码长度不能超过16个字符',
            },
            {
              min: 6,
              message: '密码长度不能少于6个字符',
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
              placeholder="密码"
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
            :class="{ 'disable-btn': disable }"
            @click="handleRegister"
            v-click-log="OPERATION_LOG_MAP.register.register"
            >注册
          </b-button>
        </a-form-item>
        <a-form-item>
          <a
            class="dom-hover-click"
            style="display: block; text-align: center; color: #3b82f6; cursor: pointer"
            @click="registerWithGitHub"
            >GitHub 一键注册 / 登录</a
          >
        </a-form-item>
      </a-form>
      <span class="tips-text"
        >已有账号？前往<a style="cursor: pointer !important; color: #3b82f6; margin-left: 2px" @click="title = '登录'"
          >登录</a
        ></span
      >
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, reactive, ref, watch } from 'vue';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import userApi from '@/api/userApi.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { bookmarkStore, useUserStore } from '@/store';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
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
  const bookmark = bookmarkStore();
  const user = useUserStore();
  const disable = computed(() => {
    return !formData.password || !formData.email;
  });

  // 转化埋点:游客到达注册表单(register_view),补齐 cta_click→register_view→register 分段漏斗
  let registerViewSent = false;
  watch(
    () => title.value,
    (val) => {
      if (val === '注册' && !registerViewSent && (!user.id || user.role === 'visitor')) {
        registerViewSent = true;
        apiBasePost('/api/common/recordConversion', { event: 'register_view', source: 'register-page' }).catch(() => {});
      }
    },
    { immediate: true },
  );
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
        message: '密码长度不能大于16位',
      },
      {
        endCondition: formData.password.length < 6,
        message: '密码长度不能小于6位',
      },
    ];
    if (checkEndCondition(condition) || disable.value) {
      return;
    }
    await validateFun();
    formData.role = 'admin';
    const params = cloneDeep(formData);
    apiBasePost('/api/user/registerUser', params).then((res: any) => {
      if (res.status === 200) {
        // 注册即登录:复用登录成功的入应用流程,直接进应用看到预置示例数据
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
        message.success('注册成功，已为你自动登录');
        setLocale(user.preferences.lang || 'zh-CN');
        bookmark.isShowLogin = false;
        bookmark.type = 'all';
        bookmark.refreshTag();
        emit('update:success', formData);
      }
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
