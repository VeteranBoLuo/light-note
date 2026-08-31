<template>
  <header v-if="!ownTopBar" class="mobile-top-bar">
    <template v-if="isSecondary">
      <BButton
        class="mobile-top-bar__back"
        :class="{ 'mobile-top-bar__back--text': leadingActionLabel }"
        :aria-label="leadingActionLabel || t('common.back')"
        :title="leadingActionLabel || t('common.back')"
        @click="activeBinding?.onBack?.()"
      >
        <span v-if="leadingActionLabel">{{ leadingActionLabel }}</span>
        <SvgIcon v-else :src="icon.arrow_left" size="20" aria-hidden="true" />
      </BButton>
      <h1 class="mobile-top-bar__title">{{ secondaryTitle }}</h1>
    </template>
    <BButton
      v-else
      class="mobile-top-bar__profile"
      :aria-label="t('mobileNavigation.profile')"
      :title="t('mobileNavigation.profile')"
      :aria-current="route.meta.mobileShell === 'profile' ? 'page' : undefined"
      @click="goToProfile"
      v-click-log="{ module: '移动端导航', operation: '打开我的' }"
    >
      <AvatarFramePreview
        v-if="equippedFrameId"
        :frame-id="equippedFrameId"
        :src="profileAvatarSource"
        :size="26"
        layout-mode="slot"
        aria-hidden="true"
      />
      <SvgIcon v-else class="mobile-top-bar__profile-avatar" :src="profileAvatarSource" size="36" aria-hidden="true" />
      <span
        v-if="profileAttentionLabel"
        class="mobile-top-bar__profile-dot"
        role="status"
        :aria-label="profileAttentionLabel"
      ></span>
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
        v-if="activeBinding?.onAuxiliaryAction && activeBinding.auxiliaryActionLabel?.()"
        class="mobile-top-bar__action mobile-top-bar__action--auxiliary"
        :class="{ 'mobile-top-bar__action--text': !activeBinding.auxiliaryActionIcon?.() }"
        :aria-label="activeBinding.auxiliaryActionLabel()"
        :title="activeBinding.auxiliaryActionLabel()"
        @click="activeBinding.onAuxiliaryAction()"
        v-click-log="{ module: '移动端导航', operation: activeBinding.auxiliaryActionLabel() }"
      >
        <SvgIcon
          v-if="activeBinding.auxiliaryActionIcon?.()"
          :src="activeBinding.auxiliaryActionIcon()"
          size="19"
          aria-hidden="true"
        />
        <span v-else>{{ activeBinding.auxiliaryActionLabel() }}</span>
      </BButton>
      <BButton
        v-if="activeBinding?.onAdd && showAdd"
        class="mobile-top-bar__action"
        :class="{ 'mobile-top-bar__action--text': addActionMode === 'text' }"
        :aria-label="addLabel"
        :title="addLabel"
        @click="runAdd"
        v-click-log="{ module: '移动端导航', operation: addLabel }"
      >
        <span v-if="addActionMode === 'text'">{{ addLabel }}</span>
        <SvgIcon v-else :src="icon.common.plus" size="20" aria-hidden="true" />
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
  import { computed, onMounted } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import AvatarFramePreview from '@/components/growth/AvatarFramePreview.vue';
  import NotificationBell from '@/components/notification/NotificationBell.vue';
  import icon from '@/config/icon';
  import { frameVariant } from '@/config/growthFrames';
  import { useAndroidAppUpdate } from '@/composables/useAndroidAppUpdate';
  import { useGrowth } from '@/composables/useGrowth';
  import { getMobileTopBarBinding } from '@/composables/useMobileTopBar';
  import { useMobileGlobalSearch } from '@/composables/useMobileGlobalSearch';
  import { useUserStore } from '@/store';

  const route = useRoute();
  const router = useRouter();
  const user = useUserStore();
  const { t } = useI18n();
  const { openSearch } = useMobileGlobalSearch();
  const { growth: growthInfo, load: loadGrowth } = useGrowth();
  const appUpdate = useAndroidAppUpdate();

  const activeBinding = computed(() => getMobileTopBarBinding(route.name));
  // ownTopBar 允许是函数：同一路由可按查询参数决定用共享顶栏还是页面自画顶栏
  const ownTopBar = computed(() => {
    const value = activeBinding.value?.ownTopBar;
    return typeof value === 'function' ? value() : Boolean(value);
  });
  const isSecondary = computed(() => Boolean(activeBinding.value?.title && activeBinding.value?.onBack));
  const secondaryTitle = computed(() => activeBinding.value?.title?.() || '');
  const leadingActionLabel = computed(() => activeBinding.value?.leadingActionLabel?.() || '');
  const showSearch = computed(() => !isSecondary.value && activeBinding.value?.searchMode !== 'icon');
  const showNotification = computed(() => activeBinding.value?.showNotification !== false);
  const showAdd = computed(() => activeBinding.value?.showAdd?.() !== false);
  const showActions = computed(() =>
    Boolean(
      !showSearch.value ||
      activeBinding.value?.onAuxiliaryAction ||
      (activeBinding.value?.onAdd && showAdd.value) ||
      showNotification.value,
    ),
  );
  const addLabel = computed(() => activeBinding.value?.addLabel?.() || t('common.add'));
  const addActionMode = computed(() => activeBinding.value?.addActionMode?.() || 'icon');
  const equippedFrameId = computed(() => {
    const id = growthInfo.value?.equippedFrame;
    return frameVariant(id) ? id : null;
  });
  const profileAvatarSource = computed(() => user.headPicture || icon.navigation.user);
  const profileAttentionLabel = computed(() => {
    const notices: string[] = [];
    if (growthInfo.value?.hasUnreadLevelUp) notices.push(t('growth.levelUpTitle'));
    if (appUpdate.showBadge.value) {
      notices.push(t('appUpdate.newVersionShort', { version: appUpdate.latestVersion.value }));
    }
    return notices.join(' · ');
  });

  onMounted(() => {
    // 顶栏头像是移动端固定入口，不能依赖用户先打开成长页后才出现头像框或升级提醒。
    void loadGrowth();
  });

  /** 顶栏头像是「我的」的新一级入口；与底栏切换一致，不在 Android 返回栈堆叠一级页面。 */
  function goToProfile() {
    if (route.path !== '/personCenter') void router.replace('/personCenter');
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

  .mobile-top-bar__profile {
    position: relative;
    width: 44px;
    min-width: 44px;
    height: 44px;
    padding: 0;
    border: 2px solid transparent;
    border-radius: 50%;
    color: var(--text-color);
    background: transparent !important;
    overflow: visible;
  }

  .mobile-top-bar__profile-avatar {
    overflow: hidden;
    border-radius: 50%;
  }

  .mobile-top-bar__profile-dot {
    position: absolute;
    top: 3px;
    right: 2px;
    width: 9px;
    height: 9px;
    box-sizing: border-box;
    border: 2px solid var(--surface-page-bg, var(--background-color));
    border-radius: 50%;
    background: var(--danger-fill-bg, #d93b3b);
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

  .mobile-top-bar__back--text {
    width: auto;
    min-width: 52px;
    padding-inline: 8px;
    color: var(--primary-color);
    font-weight: 650;
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

  .mobile-top-bar__action--text {
    width: auto;
    min-width: 52px;
    padding-inline: 8px;
    color: var(--primary-color);
    font-size: 14px;
    font-weight: 650;
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
</style>
