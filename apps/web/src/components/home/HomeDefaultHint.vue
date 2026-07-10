<template>
  <transition name="home-hint-slide">
    <div v-if="show" class="home-default-hint">
      <span class="home-default-hint__text">{{ $t('home.defaultHintText') }}</span>
      <div class="home-default-hint__opts">
        <button
          v-for="o in options"
          :key="o.value"
          class="home-default-hint__btn"
          :class="{ active: user.preferences.homePage === o.value }"
          @click="pick(o.value, o.label)"
        >
          {{ o.label }}
        </button>
      </div>
      <button class="home-default-hint__close" :aria-label="$t('common.close')" @click="dismiss">×</button>
    </div>
  </transition>
</template>

<script setup lang="ts">
  import { ref, computed, onMounted, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useUserStore } from '@/store';
  import { updatePreference } from '@/utils/savePreference';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { recordOperation } from '@/api/commonApi.ts';
  import type { HomePagePreference } from '@/utils/preferences.ts';

  // 新用户注册后:引导设置登录后默认首页(注册成功由 RegisterPage 打上 ln_just_registered 标记)
  const FLAG = 'ln_just_registered';
  const { t } = useI18n();
  const user = useUserStore();
  const show = ref(false);

  const options = computed<{ label: string; value: HomePagePreference }[]>(() => [
    { label: t('home.pageBookmark'), value: 'bookmark' },
    { label: t('home.pageNote'), value: 'noteLibrary' },
    { label: t('home.pageCloud'), value: 'cloudSpace' },
    { label: t('home.pageWorkbench'), value: 'workbench' },
  ]);

  function clearFlag() {
    try {
      localStorage.removeItem(FLAG);
    } catch {
      /* 隐私模式忽略 */
    }
  }

  function dismiss() {
    show.value = false;
    clearFlag();
  }

  async function pick(value: HomePagePreference, label: string) {
    // 统一走 updatePreference(本地生效 + 游客只本地 + 登录同步后端并失败回滚)
    try {
      await updatePreference({ homePage: value });
      if (user.id && user.role !== 'visitor') {
        recordOperation({ module: '个人偏好', operation: `设置默认首页【${label}】` });
      }
      message.success(t('home.defaultHintSet', { label }));
    } catch (err) {
      console.error('后台错误：' + err);
      message.error(t('home.setFailed'));
    }
    dismiss();
  }

  function maybeShow() {
    if (show.value) return;
    let flagged = false;
    try {
      flagged = localStorage.getItem(FLAG) === '1';
    } catch {
      flagged = false;
    }
    // 仅新注册的登录用户展示一次(显示即清标记)
    if (flagged && user.id && user.role !== 'visitor') {
      show.value = true;
      clearFlag();
    }
  }

  onMounted(maybeShow);
  // 注册成功后 role 由 visitor→已登录:即使 Home 已挂载(onMounted 不再触发)也能弹出
  watch(
    () => user.role,
    () => maybeShow(),
  );
</script>

<style lang="less" scoped>
  .home-default-hint {
    position: fixed;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%);
    z-index: 2000;
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: calc(100vw - 32px);
    padding: 10px 12px 10px 18px;
    border-radius: 999px;
    background: var(--background-color);
    color: var(--text-color);
    border: 1px solid var(--card-border-color);
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
    flex-wrap: wrap;
  }
  .home-default-hint__text {
    font-size: 13px;
    white-space: nowrap;
  }
  .home-default-hint__opts {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .home-default-hint__btn {
    border: 1px solid var(--card-border-color);
    background: transparent;
    color: var(--text-color);
    cursor: pointer;
    font-size: 13px;
    padding: 5px 12px;
    border-radius: 999px;
    transition:
      background 0.2s,
      border-color 0.2s;
  }
  .home-default-hint__btn:hover {
    border-color: #615ced;
    color: #615ced;
  }
  .home-default-hint__btn.active {
    background: #615ced;
    border-color: #615ced;
    color: #fff;
  }
  .home-default-hint__close {
    flex: 0 0 auto;
    border: 0;
    background: transparent;
    cursor: pointer;
    color: var(--text-color);
    opacity: 0.5;
    font-size: 18px;
    line-height: 1;
  }
  .home-default-hint__close:hover {
    opacity: 0.85;
  }
  .home-hint-slide-enter-active,
  .home-hint-slide-leave-active {
    transition:
      transform 0.3s ease,
      opacity 0.3s ease;
  }
  .home-hint-slide-enter-from,
  .home-hint-slide-leave-to {
    transform: translate(-50%, 140%);
    opacity: 0;
  }
</style>
