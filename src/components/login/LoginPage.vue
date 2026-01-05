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
      <b style="font-size: 30px; justify-self: center; color: #161824">登录</b>
      <span
        style="
          font-size: 12px;
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          top: 65px;
          color: #a9a1ad;
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
        <a-form-item label="" name="email">
          <b-input theme="al-day" height="40px" v-model:value="formData.email" placeholder="邮箱">
            <template #prefix>
              <svg-icon :src="icon.login.email" size="16" />
            </template>
          </b-input>
        </a-form-item>
        <a-form-item label="" name="password">
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
            <span class="remember-text"><b-checkbox type="circle" v-model:isCheck="isCheck" />Remember Me</span>
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
        v-if="!bookmark.isMobileDevice"
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
  import { message } from 'ant-design-vue';
  import { computed, onMounted, ref, watch } from 'vue';
  import { bookmarkStore, useUserStore } from '@/store';
  import { cloneDeep } from 'lodash-es';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  import { apiBasePost } from '@/http/request.ts';

  const title = defineModel('title');
  const formData: any = defineModel('formData');
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

    apiBasePost('/api/user/login', formData.value).then((res: any) => {
      if (res.status === 200) {
        localStorage.setItem('userId', res.data.id);
        localStorage.setItem('theme', res.data.theme);
        user.preferences.theme = res.data?.theme || 'day';
        user.setUserInfo(res.data);
        router.push('/');
        message.success('登录成功');
        if (isCheck.value) {
          const params = cloneDeep(formData.value);
          params.password = encrypt(params.password);
          localStorage.setItem('loginInfo', JSON.stringify(params));
        } else {
          localStorage.setItem('loginInfo', '');
        }
        bookmark.isShowLogin = false;
        bookmark.type = 'all';
        bookmark.refreshTag();
      }
    });
  }

  const loginWithGitHub = () => {
    const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID;
    const redirectUri = encodeURIComponent(import.meta.env.VITE_GITHUB_REDIRECT_URI);
    const scope = 'user:email';
    const state = Math.random().toString(36).substring(7);

    // 关键：URL 必须为单行无空格
    const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
    window.location.href = authUrl;
  };

  watch(
    () => isCheck.value,
    () => {
      if (!isCheck.value) {
        localStorage.setItem('loginInfo', '');
      }
    },
  );
  // 加密映射表
  const encryptionMap = {
    a: '!',
    b: 'a',
    c: '#',
    d: '$',
    e: '%',
    f: '^',
    g: '&',
    h: '*',
    i: 'm',
    j: ')',
    k: '-',
    l: '_',
    m: '=',
    n: '+',
    o: 'g',
    p: 'b',
    q: '{',
    r: 'j',
    s: 'x',
    t: ':',
    u: "'",
    v: '"',
    w: '<',
    x: '>',
    y: ',',
    z: '.',
    '0': ']',
    '1': 'n',
    '2': 'd',
    '3': ';',
    '4': 'u',
    '5': 'l',
    '6': '[',
    '7': 'z',
    '8': 'm',
    '9': 'e',
  };
  // 反向加密映射表
  const decryptionMap = {};
  for (const key in encryptionMap) {
    decryptionMap[encryptionMap[key]] = key;
  }
  // 加密函数
  function encrypt(text) {
    let result = '';
    for (let i = 0; i < text.length; i++) {
      const char = text[i].toLowerCase();
      result += encryptionMap[char] || char;
    }
    return result;
  }
  // 解密函数
  function decrypt(text) {
    let result = '';
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      result += decryptionMap[char] || char;
    }
    return result;
  }

  onMounted(() => {
    const loginInfo = localStorage.getItem('loginInfo');
    if (loginInfo) {
      isCheck.value = true;
      Object.assign(formData.value, JSON.parse(loginInfo));
      formData.value.password = decrypt(formData.value.password);
    } else {
      isCheck.value = false;
    }
    localStorage.setItem('userId', '');
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
    -webkit-text-fill-color: #161824 !important; //这个地方的颜色是字体颜色，可以根据实际情况修改
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
    color: #1f1f1f !important;
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
