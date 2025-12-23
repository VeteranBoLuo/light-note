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
  import { onMounted, onUnmounted, ref, Ref } from 'vue';
  import { bookmarkStore, useUserStore } from '@/store';
  import LoginPage from '@/components/login/LoginPage.vue';
  import ResetPage from '@/components/login/ResetPage.vue';
  import RegisterPage from '@/components/login/RegisterPage.vue';

  // Modal title, supports: '登录' | '注册' | '重置'
  const title = ref<'登录' | '注册' | '重置'>('登录');

  const user = useUserStore();
  const bookmark = bookmarkStore();

  // 登录表单数据
  interface FormData {
    email: string;
    password: string;
  }
  const formData = ref<FormData>({
    email: '',
    password: '',
  });

  // 注册/重置成功后自动填充表单
  function registerSuccess(params: { email: string; password: string }) {
    setFormData(params.email, params.password);
  }
  function setFormData(email: string, password: string) {
    formData.value.email = email;
    formData.value.password = password;
  }

  // refs with type
  const login = ref<InstanceType<typeof LoginPage> | null>(null);
  const register = ref<InstanceType<typeof RegisterPage> | null>(null);
  const reset = ref<InstanceType<typeof ResetPage> | null>(null);

  // Handler key enum
  const HANDLER_KEY = {
    LOGIN: '登录',
    REGISTER: '注册',
    RESET: '重置',
  } as const;
  type HandlerKey = typeof HANDLER_KEY[keyof typeof HANDLER_KEY];

  // Handlers map
  const handlers: Record<HandlerKey, { ref: Ref<any>; method: string }> = {
    [HANDLER_KEY.LOGIN]: { ref: login, method: 'handleLogin' },
    [HANDLER_KEY.REGISTER]: { ref: register, method: 'handleRegister' },
    [HANDLER_KEY.RESET]: { ref: reset, method: 'handleReset' },
  };

  // Keyboard event handler
  function clickEvent(e: KeyboardEvent) {
    if (e.key === 'Escape' || e.keyCode === 27) {
      bookmark.isShowLogin = false;
    }
    if (e.key === 'Enter') {
      const handler = handlers[title.value];
      if (handler?.ref.value && handler?.method) {
        handler.ref.value[handler.method]();
      }
    }
  }

  // Mount/unmount event listeners
  onMounted(() => {
    document.addEventListener('keydown', clickEvent);
    localStorage.setItem('userId', '');
  });

  onUnmounted(() => {
    // 健壮性：解绑前判断函数是否存在
    if (clickEvent) {
      document.removeEventListener('keydown', clickEvent);
    }
  });

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
