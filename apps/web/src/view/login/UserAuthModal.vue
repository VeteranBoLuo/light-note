<template>
  <teleport to="body">
    <div class="index-container" @click.self="handleMaskClick">
      <div class="index-view">
        <LoginPage ref="login" v-model:title="title" v-model:formData="formData" />
        <!------------注册------------->
        <RegisterPage ref="register" v-model:title="title" @update:success="registerSuccess" />
        <!------------重置------------->
        <ResetPage ref="reset" v-model:title="title" @update:success="registerSuccess"/>
        <!-- 关闭按钮:放在卡片外层,不随登录/注册翻转动画翻面;点空白 + Esc 仍可用 -->
        <button class="auth-close-btn" :class="{ 'is-flipping': flipping }" :title="t('auth.closeEsc')" @click="handleMaskClick">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  </teleport>
</template>

<script lang="ts" setup>
  import { onMounted, onUnmounted, ref, Ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { bookmarkStore, useUserStore } from '@/store';
  import LoginPage from '@/components/login/LoginPage.vue';
  import ResetPage from '@/components/login/ResetPage.vue';
  import RegisterPage from '@/components/login/RegisterPage.vue';

  // Modal title, supports: '登录' | '注册' | '重置'
  const title = ref<'登录' | '注册' | '重置'>(bookmarkStore().authModalTab);

  // 登录/注册/重置切换时卡片有 0.6s 翻转动画,期间隐藏关闭按钮,避免 × 悬在翻转卡片外显得脱节
  const flipping = ref(false);
  let flipTimer = 0;
  watch(title, () => {
    flipping.value = true;
    clearTimeout(flipTimer);
    flipTimer = window.setTimeout(() => (flipping.value = false), 650);
  });

  const { t } = useI18n();
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

  // 点击弹框外部(遮罩层本身)关闭:@click.self 确保只在点到遮罩、而非点弹框内容时触发
  function handleMaskClick() {
    bookmark.isShowLogin = false;
  }

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
    // 消费一次性 tab：本次已按 authModalTab 初始化 title，重置以免影响下次普通打开（如点头像登录）
    bookmark.authModalTab = '登录';
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
    /* fixed + inset:0:界面缩放(html zoom)下遮罩始终铺满可视视口;
       原 absolute + 100vw/100vh 在缩放时会露白、定位漂移。 */
    position: fixed;
    inset: 0;
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
  /* 关闭按钮:克制风格——平时淡灰,hover 才加背景加深;定位在卡片右上角 */
  .auth-close-btn {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 100;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--desc-color);
    cursor: pointer;
    transition:
      background-color 0.15s ease,
      color 0.15s ease,
      opacity 0.2s ease;
  }
  .auth-close-btn.is-flipping {
    opacity: 0;
    pointer-events: none;
  }
  .auth-close-btn:hover {
    background: color-mix(in srgb, var(--text-color) 12%, transparent);
    color: var(--text-color);
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
    background-color: var(--background-color);
    backface-visibility: hidden;
    transition: transform 0.6s linear;
    border: 1px solid var(--card-border-color);
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
    color: var(--text-color);
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
