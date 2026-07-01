<template>
  <transition name="home-hint-slide">
    <div v-if="show" class="home-default-hint">
      <span class="home-default-hint__text">要把登录后的默认首页设为哪个？</span>
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
      <button class="home-default-hint__close" aria-label="关闭" @click="dismiss">×</button>
    </div>
  </transition>
</template>

<script setup lang="ts">
  import { ref, onMounted, watch } from 'vue';
  import { useUserStore } from '@/store';
  import userApi from '@/api/userApi.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { recordOperation } from '@/api/commonApi.ts';
  import type { HomePagePreference } from '@/utils/preferences.ts';

  // 新用户注册后:引导设置登录后默认首页(注册成功由 RegisterPage 打上 ln_just_registered 标记)
  const FLAG = 'ln_just_registered';
  const user = useUserStore();
  const show = ref(false);

  const options: { label: string; value: HomePagePreference }[] = [
    { label: '书签', value: 'bookmark' },
    { label: '笔记', value: 'noteLibrary' },
    { label: '云空间', value: 'cloudSpace' },
    { label: '工作台', value: 'workbench' },
  ];

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

  function pick(value: HomePagePreference, label: string) {
    user.preferences.homePage = value;
    try {
      localStorage.setItem('preferences', JSON.stringify(user.preferences));
    } catch {
      /* 忽略 */
    }
    // 登录用户同步到服务器
    if (user.id && user.role !== 'visitor') {
      userApi
        .updateUserInfo({ id: user.id, preferences: JSON.stringify(user.preferences) })
        .then(() => recordOperation({ module: '个人偏好', operation: `设置默认首页【${label}】` }))
        .catch((err) => console.error('后台错误：' + err));
    }
    message.success(`已设为默认首页：${label}`);
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
