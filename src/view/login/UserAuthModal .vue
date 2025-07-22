<template>
  <teleport to="body">
    <div class="index-container">
      <div class="index-view">
        <LoginPage ref="login" v-model:title="title" v-model:formData="formData" />
        <!------------注册------------->
        <RegisterPage ref="register" v-model:title="title" @update:success="registerSuccess" />
        <!------------重置------------->
        <ResetPage ref="reset" v-model:title="title" @update:success="registerSuccess"/>
      </div>
    </div>
  </teleport>
</template>

<script lang="ts" setup>
  import { onMounted, onUnmounted, ref } from 'vue';
  import { bookmarkStore, useUserStore } from '@/store';
  import LoginPage from '@/components/login/LoginPage.vue';
  import ResetPage from '@/components/login/ResetPage.vue';
  import RegisterPage from '@/components/login/RegisterPage.vue';

  // 是否反转
  const title = ref('登录');

  const user = useUserStore();

  const bookmark = bookmarkStore();

  const formData = ref({
    email: '',
    password: '',
  });

  function registerSuccess(params: any) {
    formData.value.email = params.email;
    formData.value.password = params.password;
  }

  onMounted(() => {
    document.addEventListener('keydown', clickEvent);
    document.addEventListener('click', clickHandler, true);
    localStorage.setItem('userId', '');
  });

  onUnmounted(() => {
    document.removeEventListener('keydown', clickEvent);
    document.removeEventListener('click', clickHandler, true);
  });

  const login = ref();
  const register = ref();
  const reset = ref();
  const handlers = {
    登录: { ref: login, method: 'handleLogin' },
    注册: { ref: register, method: 'handleRegister' },
    重置: { ref: reset, method: 'handleReset' },
  };

  function clickEvent(e) {
    if (e.keyCode === 27) {
      bookmark.isShowLogin = false;
    }
    if (e.key === 'Enter') {
      const handler = handlers[title.value];
      if (handler?.ref.value && handler?.method) {
        handler.ref.value[handler.method]();
      }
    }
  }

  function clickHandler(e) {
    if (!e.target.matches('.index-view *')) {
      bookmark.isShowLogin = false;
    }
  }
</script>

<style scoped>
  .index-container {
    position: absolute;
    height: 100vh;
    width: 100vw;
    background-color: rgba(0, 0, 0, 0.8);
    z-index: 1000;
    animation: in-animation 0.3s ease;
  }
  .index-view {
    width: 450px;
    height: 400px;
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    display: grid;
    place-items: center;
  }
  :deep(.ant-form-item .ant-form-item-label) {
    display: flex;
    align-items: center;
    justify-content: end;
  }

  :deep(.view-page) {
    position: relative;
    padding: 20px;
    border-radius: 6px;
    display: grid;
    height: 100%;
    width: 100%;
    box-sizing: border-box;
  }
  :deep(.view-body) {
    position: absolute;
    height: 100%;
    width: 100%;
    background-color: white;
    backface-visibility: hidden;
    transition: transform 0.6s linear;
    border: 1px solid #ccc;
    border-radius: 8px;
    background-image: var(--bg-image2);
  }
  :deep(.hide) {
    transform: rotateY(180deg);
  }
  :deep(.b-input) {
    line-height: 40px;
  }
  :deep(.tips-text) {
    font-size: 14px;
    position: absolute;
    right: 20px;
    bottom: 20px;
    color: black;
  }
  :deep(.handle-btn) {
    width: 80% !important;
    color: white !important;
    position: relative;
    left: 50%;
    transform: translateX(-50%);
  }

  :deep(.disable-btn) {
    background-color: #b3b0f5;
    cursor: unset;
    pointer-events: none;
  }
  :deep(.login-close-icon) {
    position: absolute;
    right: 20px;
    top: 20px;
    z-index: 99999;
    font-size: 14px;
  }
  @keyframes in-animation {
    0% {
      opacity: 0;
    }
    100% {
      opacity: 1;
    }
  }

  @media (max-width: 1000px) {
    .index-view {
      top: 45%;
      height: 400px;
    }
    :deep(.view-body) {
      width: 80%;
    }
  }
</style>
