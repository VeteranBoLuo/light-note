<template>
  <teleport to="body">
    <div class="auth-overlay" :class="{ 'auth-overlay--landing': isLanding }" @click.self="closeModal">
      <section
        class="auth-card"
        :class="{ 'auth-card--reset': title === '重置', 'auth-card--compact': title === '注册' }"
        role="dialog"
        aria-modal="true"
        :aria-label="panelMeta.title"
      >
        <div class="auth-card__glow auth-card__glow--top"></div>
        <div class="auth-card__glow auth-card__glow--bottom"></div>

        <BButton class="auth-close" :title="t('auth.closeEsc')" @click="closeModal">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </BButton>

        <header class="auth-brand">
          <span class="auth-brand__mark" aria-hidden="true"> <i></i><i></i><i></i> </span>
          <span class="auth-brand__name">LIGHT NOTE</span>
          <span class="auth-brand__line"></span>
          <span class="auth-brand__tagline">{{ t('auth.brandTagline') }}</span>
        </header>

        <div class="auth-heading">
          <span class="auth-heading__eyebrow">{{ panelMeta.eyebrow }}</span>
          <h2>{{ panelMeta.title }}</h2>
          <p>{{ panelMeta.description }}</p>
        </div>

        <Transition name="auth-panel" mode="out-in">
          <LoginPage
            v-if="title === '登录'"
            key="login"
            ref="login"
            v-model:title="title"
            v-model:formData="formData"
          />
          <RegisterPage
            v-else-if="title === '注册'"
            key="register"
            ref="register"
            v-model:title="title"
            @update:success="registerSuccess"
          />
          <ResetPage v-else key="reset" ref="reset" v-model:title="title" @update:success="registerSuccess" />
        </Transition>

        <div class="auth-assurance">
          <span class="auth-assurance__dot"></span>
          {{ t('auth.assurance') }}
        </div>
      </section>
    </div>
  </teleport>
</template>

<script lang="ts" setup>
  import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute } from 'vue-router';
  import { bookmarkStore } from '@/store';
  import { trackConversion } from '@/utils/conversion';
  import LoginPage from '@/components/login/LoginPage.vue';
  import ResetPage from '@/components/login/ResetPage.vue';
  import RegisterPage from '@/components/login/RegisterPage.vue';

  type AuthMode = '登录' | '注册' | '重置';

  const { t } = useI18n();
  const route = useRoute();
  const bookmark = bookmarkStore();
  const title = ref<AuthMode>(bookmark.authModalTab);
  const isLanding = computed(() => route.name === 'landing');
  const previousBodyOverflow = document.body.style.overflow;

  const panelMeta = computed(() => {
    const meta: Record<AuthMode, { eyebrow: string; title: string; description: string }> = {
      登录: {
        eyebrow: t('auth.loginEyebrow'),
        title: t('auth.login'),
        description: t('auth.loginDescription'),
      },
      注册: {
        eyebrow: t('auth.registerEyebrow'),
        title: t('auth.register'),
        description: t('auth.registerDescription'),
      },
      重置: {
        eyebrow: t('auth.resetEyebrow'),
        title: t('auth.resetPassword'),
        description: t('auth.resetDescription'),
      },
    };
    return meta[title.value];
  });

  interface FormData {
    email: string;
    password: string;
  }

  const formData = ref<FormData>({
    email: '',
    password: '',
  });

  const login = ref<InstanceType<typeof LoginPage> | null>(null);
  const register = ref<InstanceType<typeof RegisterPage> | null>(null);
  const reset = ref<InstanceType<typeof ResetPage> | null>(null);

  function registerSuccess(params: { email: string; password: string }) {
    formData.value.email = params.email;
    formData.value.password = params.password;
  }

  function closeModal() {
    bookmark.isShowLogin = false;
  }

  function focusFirstField() {
    nextTick(() => {
      const firstInput = document.querySelector<HTMLInputElement>('.auth-card input');
      firstInput?.focus();
    });
  }

  function submitActivePanel() {
    if (title.value === '登录') {
      login.value?.handleLogin();
    } else if (title.value === '注册') {
      register.value?.handleRegister();
    } else {
      reset.value?.handleReset();
    }
  }

  function handleKeyboard(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      closeModal();
      return;
    }
    if (e.key === 'Enter' && !e.isComposing) {
      submitActivePanel();
    }
  }

  watch(title, (newTitle, oldTitle) => {
    if (newTitle === '注册' && oldTitle !== '注册') {
      const source =
        bookmark.authModalSource && bookmark.authModalSource !== 'unknown' ? bookmark.authModalSource : 'auth_switch';
      trackConversion('signup_open', source);
    }
    focusFirstField();
  });

  onMounted(() => {
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyboard);
    bookmark.authModalTab = '登录';
    focusFirstField();
  });

  onUnmounted(() => {
    document.body.style.overflow = previousBodyOverflow;
    document.removeEventListener('keydown', handleKeyboard);
  });
</script>

<style scoped lang="less">
  .auth-overlay {
    --auth-card-bg: color-mix(in srgb, var(--background-color) 96%, #6861f0 4%);
    --auth-card-border: color-mix(in srgb, var(--card-border-color) 78%, #756ff5 22%);
    --auth-title: var(--text-color);
    --auth-muted: var(--desc-color);
    --auth-input-bg: color-mix(in srgb, var(--primary-btn-bg-color) 72%, transparent);
    --auth-input-hover: color-mix(in srgb, var(--primary-btn-h-bg-color) 82%, transparent);
    --auth-divider: color-mix(in srgb, var(--card-border-color) 76%, transparent);
    --auth-secondary-bg: color-mix(in srgb, var(--primary-btn-bg-color) 82%, transparent);
    --auth-secondary-hover: var(--primary-btn-h-bg-color);
    --auth-brand-bg: rgba(97, 92, 237, 0.1);

    position: fixed;
    inset: 0;
    z-index: 700;
    display: grid;
    place-items: center;
    padding: 20px;
    box-sizing: border-box;
    overflow-y: auto;
    background: rgba(12, 15, 28, 0.58);
    backdrop-filter: blur(12px) saturate(110%);
    animation: auth-overlay-in 0.22s ease-out;
  }

  .auth-overlay--landing {
    --auth-card-bg: rgba(12, 13, 25, 0.96);
    --auth-card-border: rgba(135, 128, 255, 0.27);
    --auth-title: #f7f7ff;
    --auth-muted: rgba(224, 225, 242, 0.66);
    --auth-input-bg: rgba(255, 255, 255, 0.065);
    --auth-input-hover: rgba(255, 255, 255, 0.095);
    --auth-divider: rgba(255, 255, 255, 0.11);
    --auth-secondary-bg: rgba(255, 255, 255, 0.055);
    --auth-secondary-hover: rgba(255, 255, 255, 0.1);
    --auth-brand-bg: rgba(116, 108, 255, 0.12);

    background: radial-gradient(circle at 50% 38%, rgba(101, 92, 237, 0.18), transparent 35%), rgba(3, 4, 10, 0.78);
  }

  .auth-card {
    position: relative;
    width: min(460px, calc(100vw - 40px));
    max-height: calc(100vh - 40px);
    padding: 28px 32px 22px;
    box-sizing: border-box;
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-width: none;
    color: var(--auth-title);
    border: 1px solid var(--auth-card-border);
    border-radius: 22px;
    background: var(--auth-card-bg);
    box-shadow:
      0 28px 90px rgba(7, 8, 20, 0.32),
      0 1px 0 rgba(255, 255, 255, 0.06) inset;
    isolation: isolate;
  }

  .auth-card::-webkit-scrollbar {
    display: none;
  }

  .auth-card__glow {
    position: absolute;
    z-index: -1;
    width: 180px;
    height: 180px;
    border-radius: 50%;
    filter: blur(62px);
    pointer-events: none;
  }

  .auth-card__glow--top {
    top: -115px;
    right: -65px;
    background: rgba(111, 102, 255, 0.3);
  }

  .auth-card__glow--bottom {
    bottom: 0;
    left: -105px;
    background: rgba(26, 184, 146, 0.17);
  }

  .auth-close {
    position: absolute;
    top: 18px;
    right: 18px;
    z-index: 2;
    width: 34px !important;
    height: 34px !important;
    padding: 0 !important;
    color: var(--auth-muted) !important;
    border: 1px solid transparent;
    border-radius: 10px !important;
    background: transparent !important;
  }

  .auth-close:hover {
    color: var(--auth-title) !important;
    border-color: var(--auth-divider);
    background: var(--auth-secondary-bg) !important;
  }

  .auth-brand {
    display: flex;
    align-items: center;
    min-height: 28px;
    padding-right: 42px;
  }

  .auth-brand__mark {
    position: relative;
    width: 28px;
    height: 28px;
    margin-right: 10px;
    border-radius: 9px;
    background: linear-gradient(145deg, #7772ff, #5148d7);
    box-shadow: 0 7px 20px rgba(97, 92, 237, 0.3);
  }

  .auth-brand__mark i {
    position: absolute;
    display: block;
    width: 4px;
    border-radius: 999px;
    background: #fff;
  }

  .auth-brand__mark i:nth-child(1) {
    left: 7px;
    bottom: 7px;
    height: 8px;
    opacity: 0.72;
  }
  .auth-brand__mark i:nth-child(2) {
    left: 12px;
    bottom: 7px;
    height: 13px;
    opacity: 0.88;
  }
  .auth-brand__mark i:nth-child(3) {
    left: 17px;
    bottom: 7px;
    height: 10px;
  }

  .auth-brand__name {
    font-size: 12px;
    font-weight: 750;
    letter-spacing: 0.18em;
  }

  .auth-brand__line {
    width: 1px;
    height: 13px;
    margin: 0 10px;
    background: var(--auth-divider);
  }

  .auth-brand__tagline {
    overflow: hidden;
    color: var(--auth-muted);
    font-size: 11px;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .auth-heading {
    margin: 30px 0 24px;
  }

  .auth-heading__eyebrow {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    padding: 0 9px;
    color: #817cff;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    border: 1px solid rgba(118, 111, 255, 0.2);
    border-radius: 999px;
    background: var(--auth-brand-bg);
  }

  .auth-heading h2 {
    margin: 12px 0 7px;
    color: var(--auth-title);
    font-size: 30px;
    line-height: 1.2;
    letter-spacing: -0.03em;
  }

  .auth-heading p {
    margin: 0;
    color: var(--auth-muted);
    font-size: 13px;
    line-height: 1.7;
  }

  .auth-card--reset .auth-heading {
    margin: 24px 0 18px;
  }

  .auth-card--reset :deep(.auth-fields) {
    gap: 10px;
  }

  .auth-card--reset :deep(.auth-field) {
    gap: 5px;
  }

  .auth-card--reset :deep(.auth-input .b-input) {
    height: 44px;
  }

  .auth-card--reset :deep(.auth-primary) {
    height: 44px !important;
    margin-top: 14px;
  }

  .auth-card--reset :deep(.auth-switch) {
    margin-top: 12px;
  }

  .auth-card--reset .auth-assurance {
    margin-top: 14px;
  }

  /* 注册页字段最多(昵称+邮箱+密码 + GitHub + 切换),用紧凑间距把多出的昵称行"吃回来",正常屏不出滚动条 */
  .auth-card--compact .auth-heading {
    margin: 22px 0 16px;
  }
  .auth-card--compact :deep(.auth-fields) {
    gap: 11px;
  }
  .auth-card--compact :deep(.auth-field) {
    gap: 6px;
  }
  .auth-card--compact :deep(.auth-input .b-input) {
    height: 44px;
  }
  .auth-card--compact :deep(.auth-primary) {
    height: 44px !important;
    margin-top: 14px;
  }
  .auth-card--compact :deep(.auth-divider) {
    margin: 14px 0;
  }
  .auth-card--compact :deep(.auth-switch) {
    margin-top: 13px;
  }
  .auth-card--compact .auth-assurance {
    margin-top: 14px;
  }

  .auth-assurance {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    margin-top: 18px;
    color: var(--auth-muted);
    font-size: 11px;
  }

  .auth-assurance__dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #25c997;
    box-shadow: 0 0 0 4px rgba(37, 201, 151, 0.1);
  }

  :deep(.auth-panel) {
    color: var(--auth-title);
  }

  :deep(.auth-fields) {
    display: grid;
    gap: 15px;
  }

  :deep(.auth-field) {
    display: grid;
    gap: 8px;
  }

  :deep(.auth-field__label) {
    color: var(--auth-title);
    font-size: 12px;
    font-weight: 600;
  }

  :deep(.auth-input .b-input) {
    height: 48px;
    padding-left: 42px !important;
    color: var(--auth-title) !important;
    border: 1px solid var(--auth-divider) !important;
    border-radius: 12px;
    background: var(--auth-input-bg) !important;
    transition:
      border-color 0.18s ease,
      background 0.18s ease,
      box-shadow 0.18s ease;
  }

  :deep(.auth-input .b-input:hover) {
    background: var(--auth-input-hover) !important;
  }

  :deep(.auth-input .b-input:focus-visible) {
    border-color: rgba(112, 105, 255, 0.76) !important;
    background: var(--auth-input-hover) !important;
    box-shadow: 0 0 0 3px rgba(97, 92, 237, 0.13) !important;
  }

  :deep(.auth-input .b-input::placeholder) {
    color: var(--auth-muted);
    opacity: 0.72;
  }

  :deep(.auth-input .prefix-icon) {
    left: 14px;
    color: #7772ff;
  }

  :deep(.auth-input--action .b-input) {
    padding-right: 112px !important;
  }

  :deep(.auth-input--action .suffix-icon) {
    right: 8px;
  }

  :deep(.auth-primary) {
    width: 100% !important;
    height: 46px !important;
    margin-top: 18px;
    border-radius: 12px !important;
    font-size: 14px;
    font-weight: 700;
    background: linear-gradient(100deg, #5d55e8, #756cff 65%, #8178ff) !important;
    box-shadow: 0 10px 24px rgba(97, 92, 237, 0.23);
  }

  :deep(.auth-primary:hover) {
    transform: translateY(-1px);
    box-shadow: 0 13px 28px rgba(97, 92, 237, 0.3);
  }

  :deep(.auth-secondary) {
    width: 100% !important;
    height: 44px !important;
    gap: 8px;
    color: var(--auth-title) !important;
    border: 1px solid var(--auth-divider);
    border-radius: 12px !important;
    background: var(--auth-secondary-bg) !important;
  }

  :deep(.auth-secondary:hover) {
    border-color: rgba(112, 105, 255, 0.36);
    background: var(--auth-secondary-hover) !important;
  }

  :deep(.auth-link) {
    height: auto !important;
    padding: 2px 0 !important;
    color: #7772ff !important;
    font-size: 12px;
    line-height: 1.4 !important;
    background: transparent !important;
  }

  :deep(.auth-link:hover) {
    color: #948fff !important;
  }

  :deep(.auth-options) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-top: 12px;
  }

  :deep(.auth-options .b-checkbox) {
    padding-left: 0;
  }

  :deep(.auth-options .b-checkbox__label) {
    color: var(--auth-muted);
    font-size: 12px;
  }

  :deep(.auth-divider) {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 18px 0;
    color: var(--auth-muted);
    font-size: 11px;
  }

  :deep(.auth-divider::before),
  :deep(.auth-divider::after) {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--auth-divider);
  }

  :deep(.auth-switch) {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin-top: 17px;
    color: var(--auth-muted);
    font-size: 12px;
  }

  :deep(.auth-inline-action) {
    min-width: 88px;
    height: 32px !important;
    padding: 0 10px !important;
    color: #817cff !important;
    font-size: 11px;
    background: transparent !important;
  }

  :deep(input:-webkit-autofill) {
    -webkit-text-fill-color: var(--auth-title) !important;
  }

  .auth-panel-enter-active,
  .auth-panel-leave-active {
    transition:
      opacity 0.16s ease,
      transform 0.16s ease;
  }

  .auth-panel-enter-from {
    opacity: 0;
    transform: translateX(10px);
  }

  .auth-panel-leave-to {
    opacity: 0;
    transform: translateX(-10px);
  }

  @keyframes auth-overlay-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @media (max-width: 600px) {
    .auth-overlay {
      align-items: end;
      padding: 0;
    }

    .auth-card {
      width: 100%;
      max-height: calc(100dvh - 16px);
      padding: 24px 22px 18px;
      border-right: 0;
      border-bottom: 0;
      border-left: 0;
      border-radius: 22px 22px 0 0;
    }

    .auth-brand__line,
    .auth-brand__tagline {
      display: none;
    }

    .auth-heading {
      margin: 24px 0 20px;
    }

    .auth-heading h2 {
      font-size: 27px;
    }
  }
</style>
