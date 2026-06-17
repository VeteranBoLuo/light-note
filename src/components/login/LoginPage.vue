<template>
  <iframe
    style="position: fixed; z-index: 99999"
    src="https://boluo66.top"
    width="430"
    height="900"
    v-if="viewPhoneVisible"
  />
  <div v-else class="view-body" :class="title !== '登录' ? 'hide' : ''">
    <a @click="bookmark.isShowLogin = false" class="dom-hover login-close-icon" style="color: var(--primary-text)">
      游客体验
    </a>
    <div class="view-page">
      <b style="font-size: 30px; justify-self: center; color: var(--text-color)">登录</b>
      <span
        style="
          font-size: 12px;
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          top: 65px;
          color: var(--desc-color);
          width: 100%;
          text-align: center;
        "
        >欢迎使用轻笺</span
      >
      <a-form
        :label-col="{
          span: 4,
        }"
        ref="formDataRef"
        :model="formData"
      >
        <a-form-item
          label=""
          name="email"
          :rules="[
            { required: true, message: '请输入邮箱' },
            { type: 'email', message: '请输入正确的邮箱格式' },
          ]"
        >
          <b-input theme="al-day" height="40px" v-model:value="formData.email" placeholder="邮箱">
            <template #prefix>
              <svg-icon :src="icon.login.email" size="16" />
            </template>
          </b-input>
        </a-form-item>
        <a-form-item
          label=""
          name="password"
          :rules="[{ required: true, message: '请输入密码' }]"
        >
          <span class="flex-center">
            <b-input
              theme="al-day"
              height="40px"
              maxlength="20"
              type="password"
              autocomplete="new-password"
              placeholder="密码"
              v-model:value="formData.password"
            >
              <template #prefix>
                <svg-icon :src="icon.login.password" size="16" />
              </template>
              <template #suffix>
                <span class="dom-hover forget-text" @click="title = '重置'">Forget Password?</span>
              </template>
            </b-input>
          </span>
        </a-form-item>
        <a-form-item>
          <div class="login-tips-text">
            <span class="remember-text"><b-checkbox type="circle" v-model:checked="isCheck" />记住账号</span>
            <a class="dom-hover-click" @click="loginWithGitHub">GitHub快捷登录</a>
          </div>
        </a-form-item>
        <a-form-item>
          <b-button type="primary" class="handle-btn" :class="{ 'disable-btn': disable }" @click="handleLogin"
            >登录
          </b-button>
        </a-form-item>
      </a-form>
      <a
        v-click-log="OPERATION_LOG_MAP.login.previewMobile"
        class="tips-text dom-hover"
        style="left: 20px; font-size: 12px; width: max-content"
        v-if="!bookmark.isMobile"
        @click="viewPhoneVisible = true"
        >移动端预览</a
      >
      <span class="tips-text"
        >还没有账号？前往<a style="cursor: pointer !important; color: #3b82f6; margin-left: 2px" @click="title = '注册'"
          >注册</a
        ></span
      >
    </div>
  </div>
  <div
    @click="viewPhoneVisible = false"
    v-if="viewPhoneVisible"
    class="dom-hover"
    style="position: fixed; left: 50%; transform: translate(220px, -440px)"
  >
    <img src="../../assets/icons/close.svg" width="20" height="20" alt=""
  /></div>
</template>

<script lang="ts" setup>
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import router from '@/router';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { computed, onMounted, ref, watch } from 'vue';
  import { bookmarkStore, useUserStore } from '@/store';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  import { apiBasePost } from '@/http/request.ts';
  import { setLocale } from '@/i18n';
  import { getAppHomePath, getHomePagePreference } from '@/utils/preferences.ts';
  const title = defineModel('title');
  const formData: any = defineModel('formData');
  const REMEMBERED_EMAIL_KEY = 'rememberedLoginEmail';
  const isCheck = ref(true);
  const disable = computed(() => {
    return !formData.value.email || !formData.value.password;
  });
  const formDataRef = ref();
  const bookmark = bookmarkStore();
  const user = useUserStore();
  const viewPhoneVisible = ref(false);
  async function handleLogin() {
    if (disable.value) {
      return;
    }
    await formDataRef.value.validate();

    apiBasePost('/api/user/login', { ...formData.value, rememberMe: isCheck.value }).then((res: any) => {
      if (res.status === 200) {
        if (isCheck.value) {
          localStorage.setItem(REMEMBERED_EMAIL_KEY, formData.value.email || '');
        } else {
          localStorage.removeItem(REMEMBERED_EMAIL_KEY);
        }
        user.setUserInfo(res.data);
        user.preferences.theme = res.data?.preferences?.theme || 'day';
        user.preferences.lang = res.data?.preferences?.lang || 'zh-CN';
        user.preferences.noteViewMode = res.data?.preferences?.noteViewMode || 'list';
        user.preferences.homePage = getHomePagePreference(res.data?.preferences);
        localStorage.setItem('preferences', JSON.stringify(user.preferences));
        router.push(getAppHomePath(user.preferences, bookmark.isMobile));
        message.success('登录成功');
        setLocale(user.preferences.lang || 'zh-CN');
        bookmark.isShowLogin = false;
        bookmark.type = 'all';
        bookmark.refreshTag();
      }
    });
  }

  const loginWithGitHub = () => {
    const clientId = 'Ov23liuOPhDka7KkXrpQ';
    const redirectUri = 'https://boluo66.top/auth/callback';
    const scope = 'user:email';
    const state = Math.random().toString(36).substring(7);

    // 关键：URL 必须为单行无空格
    const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
    window.location.href = authUrl;
  };

  onMounted(() => {
    const rememberedEmail = localStorage.getItem(REMEMBERED_EMAIL_KEY) || '';
    if (rememberedEmail) {
      isCheck.value = true;
      formData.value.email = rememberedEmail;
    }
  });

  watch(
    () => viewPhoneVisible.value,
    (val) => {
      const bg: any = document.getElementsByClassName('index-container');

      if (val) {
        bg[0].style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
      } else {
        bg[0].style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
      }
    },
  );

  defineExpose({
    handleLogin,
  });
</script>

<style lang="less" scoped>
  :deep(:-webkit-autofill) {
    -webkit-text-fill-color: var(--text-color) !important;
  }
  .login-tips-text {
    height: 40px;
    line-height: 40px;
    display: flex;
    width: 100%;
    justify-content: space-between;
    padding: 0 5px;
    box-sizing: border-box;
  }

  .remember-text {
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--text-color) !important;
  }

  .forget-text {
    width: max-content;
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 12px;
    color: var(--primary-color) !important;
  }
</style>
