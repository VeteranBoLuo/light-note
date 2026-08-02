<template>
  <header v-if="!ownTopBar" class="mobile-top-bar">
    <template v-if="isSecondary">
      <BButton
        class="mobile-top-bar__back"
        :aria-label="t('common.back')"
        :title="t('common.back')"
        @click="activeBinding?.onBack?.()"
      >
        <SvgIcon :src="icon.arrow_left" size="20" aria-hidden="true" />
      </BButton>
      <h1 class="mobile-top-bar__title">{{ secondaryTitle }}</h1>
    </template>
    <BButton
      v-else
      class="mobile-top-bar__brand"
      :aria-label="t('mobileNavigation.backToToday')"
      :title="t('mobileNavigation.backToToday')"
      @click="goToToday"
      v-click-log="{ module: '移动端导航', operation: '返回今日' }"
    >
      <img src="/favicon.svg?v=7" width="25" height="25" alt="" />
      <span>{{ t('navigation.title') }}</span>
    </BButton>

    <!-- 移动端只保留这一个文本搜索入口:它始终是全局搜索,不再按页面变成局部搜索框。
         各资源页的关键词过滤已下沉到页面自身的筛选区。 -->
    <BButton
      v-if="showSearch"
      class="mobile-top-bar__search"
      :aria-label="t('globalSearch.trigger')"
      @click="openGlobalSearch"
      v-click-log="{ module: '全局搜索', operation: '打开移动端全局搜索' }"
    >
      <SvgIcon :src="icon.navigation.search" size="16" aria-hidden="true" />
      <span>{{ t('globalSearch.trigger') }}</span>
    </BButton>

    <div v-if="showActions" class="mobile-top-bar__actions">
      <!-- AI 等自带标题区的页面不放完整搜索框,只给一个放大镜打开同一个搜索层 -->
      <BButton
        v-if="!showSearch && !isSecondary"
        class="mobile-top-bar__action"
        :aria-label="t('globalSearch.trigger')"
        :title="t('globalSearch.trigger')"
        @click="openGlobalSearch"
        v-click-log="{ module: '全局搜索', operation: '打开移动端全局搜索' }"
      >
        <SvgIcon :src="icon.navigation.search" size="19" aria-hidden="true" />
      </BButton>
      <BButton
        v-if="
          activeBinding?.onAuxiliaryAction &&
          activeBinding.auxiliaryActionIcon?.() &&
          activeBinding.auxiliaryActionLabel?.()
        "
        class="mobile-top-bar__action mobile-top-bar__action--auxiliary"
        :aria-label="activeBinding.auxiliaryActionLabel()"
        :title="activeBinding.auxiliaryActionLabel()"
        @click="activeBinding.onAuxiliaryAction()"
        v-click-log="{ module: '移动端导航', operation: activeBinding.auxiliaryActionLabel() }"
      >
        <SvgIcon :src="activeBinding.auxiliaryActionIcon()" size="19" aria-hidden="true" />
      </BButton>
      <BButton
        v-if="activeBinding?.onAdd"
        class="mobile-top-bar__action"
        :aria-label="addLabel"
        :title="addLabel"
        @click="runAdd"
        v-click-log="{ module: '移动端导航', operation: addLabel }"
      >
        <SvgIcon :src="icon.common.plus" size="20" aria-hidden="true" />
      </BButton>
      <!-- 原「更多」菜单(书签管理/标签管理/回收站/设置)与「我的」页完全重复,改为移动端此前缺失的通知入口。
           NotificationBell 是多根组件(浮层+两个弹框),class 不会继承到按钮上,必须包一层容器再穿透。 -->
      <div v-if="showNotification && user.role !== 'visitor'" class="mobile-top-bar__bell">
        <NotificationBell />
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import NotificationBell from '@/components/notification/NotificationBell.vue';
  import icon from '@/config/icon';
  import { MOBILE_TODAY_PATH } from '@/config/mobileNavigation';
  import { getMobileTopBarBinding } from '@/composables/useMobileTopBar';
  import { useMobileGlobalSearch } from '@/composables/useMobileGlobalSearch';
  import { useUserStore } from '@/store';

  const route = useRoute();
  const router = useRouter();
  const user = useUserStore();
  const { t } = useI18n();
  const { openSearch } = useMobileGlobalSearch();

  const activeBinding = computed(() => getMobileTopBarBinding(route.name));
  // ownTopBar 允许是函数：同一路由可按查询参数决定用共享顶栏还是页面自画顶栏
  const ownTopBar = computed(() => {
    const value = activeBinding.value?.ownTopBar;
    return typeof value === 'function' ? value() : Boolean(value);
  });
  const isSecondary = computed(() => Boolean(activeBinding.value?.title && activeBinding.value?.onBack));
  const secondaryTitle = computed(() => activeBinding.value?.title?.() || '');
  const showSearch = computed(() => !isSecondary.value && activeBinding.value?.searchMode !== 'icon');
  const showNotification = computed(() => activeBinding.value?.showNotification !== false);
  const showActions = computed(() =>
    Boolean(!showSearch.value || activeBinding.value?.onAuxiliaryAction || activeBinding.value?.onAdd || showNotification.value),
  );
  const addLabel = computed(() => activeBinding.value?.addLabel?.() || t('common.add'));

  /**
   * Logo 回「今日」，与移动端所有默认落点一致（冷启动、登录后、注册后都是今日）。
   * 「回到上次的资料页签」由底部「资料」入口承担，且只在当前会话内有效。
   */
  function goToToday() {
    if (route.path !== MOBILE_TODAY_PATH) void router.push(MOBILE_TODAY_PATH);
  }

  function openGlobalSearch() {
    openSearch();
  }

  function runAdd() {
    activeBinding.value?.onAdd?.();
  }
</script>

<style scoped lang="less">
  .mobile-top-bar {
    position: relative;
    z-index: 4;
    width: 100%;
    height: 56px;
    padding: 0 8px 0 12px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 0 0 56px;
    border-bottom: 1px solid var(--surface-divider-color);
    color: var(--text-color);
    background: var(--surface-page-bg, var(--background-color));
  }

  .mobile-top-bar__brand {
    flex: 0 0 auto;
    min-width: 0;
    height: 44px;
    padding: 0 6px 0 0;
    gap: 8px;
    border-radius: 10px;
    color: var(--text-color);
    background: transparent !important;
    font-size: 16px;
    font-weight: 720;
    letter-spacing: -0.01em;
  }

  .mobile-top-bar__brand img {
    width: 25px;
    height: 25px;
    display: block;
    flex: 0 0 auto;
  }

  .mobile-top-bar__back {
    width: 44px;
    min-width: 44px;
    height: 44px;
    padding: 0;
    border-radius: 11px;
    color: var(--text-color);
    background: transparent !important;
  }

  .mobile-top-bar__title {
    min-width: 0;
    margin: 0;
    flex: 1 1 auto;
    overflow: hidden;
    color: var(--text-color);
    font-size: 18px;
    font-weight: 720;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobile-top-bar__actions {
    margin-left: auto;
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 1px;
  }

  .mobile-top-bar__action {
    width: 44px;
    min-width: 44px;
    height: 44px;
    padding: 0;
    border-radius: 11px;
    color: var(--text-color);
    background: transparent !important;
  }

  .mobile-top-bar__action:active {
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 8%, transparent) !important;
  }

  @media (hover: hover) and (pointer: fine) {
    .mobile-top-bar__action:hover {
      color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 8%, transparent) !important;
    }
  }

  @media (hover: none), (pointer: coarse) {
    .mobile-top-bar__action:hover:not(:active) {
      color: var(--text-color);
      background: transparent !important;
    }
  }

  .mobile-top-bar__search {
    min-width: 0;
    height: 40px;
    padding: 0 12px;
    flex: 1 1 auto;
    justify-content: flex-start;
    gap: 7px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    color: var(--desc-color);
    background: var(--workspace-panel-bg-color) !important;
    font-size: 13px;
    font-weight: 400;
  }

  .mobile-top-bar__search span {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .mobile-top-bar__search:active {
    border-color: color-mix(in srgb, var(--primary-color) 55%, transparent);
  }

  .mobile-top-bar__bell {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
  }

  /* 通知铃铛与其余顶栏动作统一 44px 触控区。 */
  .mobile-top-bar__bell :deep(.nt-bell) {
    width: 44px;
    min-width: 44px;
    height: 44px;
    padding: 0;
    border-radius: 11px;
    color: var(--text-color);
    background: transparent !important;
  }

  .mobile-top-bar__bell :deep(.nt-bell:active) {
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 8%, transparent) !important;
  }

  @media (max-width: 359px) {
    .mobile-top-bar__brand span {
      display: none;
    }
  }
</style>
