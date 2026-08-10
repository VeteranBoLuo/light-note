<template>
  <nav class="mobile-bottom-nav" :aria-label="t('mobileNavigation.primaryNavigation')">
    <BButton
      v-for="item in MOBILE_BOTTOM_NAVIGATION"
      :key="item.key"
      class="mobile-bottom-nav__item"
      :class="{
        'mobile-bottom-nav__item--active': isItemActive(item.key),
        'mobile-bottom-nav__item--ai': item.key === 'ai',
      }"
      :aria-current="isItemActive(item.key) ? 'page' : undefined"
      :aria-label="item.key === 'ai' && aiStatusText ? aiAccessibleLabel : undefined"
      :aria-busy="item.key === 'ai' && aiEdgeStatus === 'generating' ? 'true' : undefined"
      @click="activate(item)"
      v-click-log="{ module: '移动端导航', operation: `打开${t(item.labelKey)}` }"
    >
      <span class="mobile-bottom-nav__icon">
        <SvgIcon :src="bottomIcons[item.key]" :size="item.key === 'ai' ? '21' : '20'" aria-hidden="true" />
        <span
          v-if="item.key === 'ai' && aiEdgeStatus !== 'idle'"
          class="mobile-bottom-nav__ai-status"
          :class="`is-${aiEdgeStatus}`"
          aria-hidden="true"
        ></span>
        <!--
          与桌面顶栏同一口径：只提醒「逾期 + 今天到期」。原来用全部未完成待办，
          那个数字永不清零，挂成常驻角标会被用户学会忽略。两端必须一致，
          否则同一个账号在手机和电脑上看到两个不同的待办数字。
        -->
        <span
          v-if="item.key === 'todo' && inbox.todoAttentionTotal > 0"
          class="mobile-bottom-nav__badge"
          :class="{ 'is-due-today': inbox.todoOverdueTotal === 0 }"
          role="status"
          :aria-label="todoAttentionLabel"
        >
          {{ inbox.todoAttentionTotal > 99 ? '99+' : inbox.todoAttentionTotal }}
        </span>
        <span
          v-if="item.key === 'community' && communityUnreadTotal > 0"
          class="mobile-bottom-nav__badge"
          role="status"
          :aria-label="communityUnreadLabel"
        >
          {{ communityUnreadTotal > 99 ? '99+' : communityUnreadTotal }}
        </span>
      </span>
      <span class="mobile-bottom-nav__label">{{ t(item.labelKey) }}</span>
    </BButton>
  </nav>
</template>

<script setup lang="ts">
  import { computed, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import {
    isMobileResourceInboxTab,
    MOBILE_BOTTOM_NAVIGATION,
    type MobileBottomNavigationItem,
    type MobileShellSection,
  } from '@/config/mobileNavigation';
  import { getMobileResourceEntryPath, useMobileNavigationState } from '@/composables/useMobileNavigationState';
  import { useCommunityChatUnread } from '@/composables/useCommunityChatUnread';
  import { inboxStore, useAiAssistantStore, useUserStore } from '@/store';
  import { storeToRefs } from 'pinia';

  const route = useRoute();
  const router = useRouter();
  const user = useUserStore();
  const inbox = inboxStore();
  const aiAssistant = useAiAssistantStore();
  const { edgeStatus: aiEdgeStatus } = storeToRefs(aiAssistant);
  const { t } = useI18n();
  const { saveResourceScroll, scrollCurrentResourceToTop } = useMobileNavigationState();
  const communityUnread = useCommunityChatUnread();
  const { totalUnread: communityUnreadTotal } = communityUnread;

  // 屏幕阅读器听到的是完整语义，而不是一个孤立数字
  const todoAttentionLabel = computed(() =>
    t('navigation.todoAttention', {
      count: inbox.todoAttentionTotal,
      overdue: inbox.todoOverdueTotal,
      dueToday: inbox.todoDueTodayTotal,
    }),
  );
  const communityUnreadLabel = computed(() => t('communityChat.unreadBadge', { count: communityUnreadTotal.value }));
  const aiStatusText = computed(() => (aiEdgeStatus.value === 'idle' ? '' : t(`ai.edgeStatus.${aiEdgeStatus.value}`)));
  const aiAccessibleLabel = computed(() =>
    t('ai.edgeStatus.triggerLabel', {
      title: t('mobileNavigation.ai'),
      status: aiStatusText.value,
    }),
  );

  const bottomIcons = {
    today: icon.common.calendar,
    resources: icon.navigation.portal,
    todo: icon.noteDetail.toolbar.todo,
    ai: icon.ai.ask,
    community: icon.ai.conversations,
  } as const;

  function isItemActive(key: MobileShellSection) {
    if (route.name === 'inbox') {
      // 待整理是资料处理而不是待办：/inbox?tab=all|bookmark|note|file 归「资料」
      return key === (isMobileResourceInboxTab(route.query.tab) ? 'resources' : 'todo');
    }
    return route.meta.mobileShell === key;
  }

  function activate(item: MobileBottomNavigationItem) {
    if (item.key === 'resources' && route.meta.mobileShell === 'resources') {
      scrollCurrentResourceToTop();
      return;
    }
    saveResourceScroll(route.meta.mobileShell === 'resources' ? getMobileResourcePathFromRoute() : null);

    const target =
      item.key === 'resources'
        ? getMobileResourceEntryPath()
        : item.key === 'todo'
          ? { path: '/inbox', query: { tab: 'todo' } }
          : item.path;
    // 一级导航切换不应堆叠浏览历史；否则 Android 返回手势会在底栏页面间倒退。
    if (target && router.resolve(target).fullPath !== route.fullPath) router.replace(target);
  }

  function getMobileResourcePathFromRoute() {
    if (route.name === 'noteLibrary') return '/noteLibrary' as const;
    if (route.name === 'cloudSpace') return '/cloudSpace' as const;
    if (['home', 'home:id', 'home:search'].includes(String(route.name || ''))) return '/home' as const;
    return null;
  }

  watch(
    () => [user.id, user.role],
    ([id, role]) => {
      if (id && role !== 'visitor') {
        void inbox.refreshCount();
      }
    },
    { immediate: true },
  );
</script>

<style scoped lang="less">
  .mobile-bottom-nav {
    position: relative;
    z-index: 4;
    width: 100%;
    height: calc(56px + env(safe-area-inset-bottom));
    padding: 4px 6px env(safe-area-inset-bottom);
    box-sizing: border-box;
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    flex: 0 0 calc(56px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--surface-divider-color);
    background: var(--surface-page-bg, var(--background-color));
  }

  .mobile-bottom-nav__item {
    width: 100%;
    height: 48px;
    padding: 2px 0;
    gap: 1px;
    border-radius: 11px;
    flex-direction: column;
    color: var(--desc-color);
    background: transparent !important;
    line-height: 1;
    transition:
      color 0.18s ease,
      background 0.18s ease;
  }

  .mobile-bottom-nav__item--active {
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 8%, transparent) !important;
  }

  .mobile-bottom-nav__item--ai .mobile-bottom-nav__icon {
    width: 30px;
    height: 25px;
    border-radius: 9px;
    color: #fff;
    background: linear-gradient(145deg, var(--primary-color), color-mix(in srgb, var(--primary-color) 64%, #9b8cff));
  }

  .mobile-bottom-nav__item--ai.mobile-bottom-nav__item--active .mobile-bottom-nav__icon {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary-color) 14%, transparent);
  }

  .mobile-bottom-nav__ai-status {
    position: absolute;
    top: -2px;
    right: -4px;
    width: 9px;
    height: 9px;
    box-sizing: border-box;
    border: 2px solid var(--surface-page-bg, var(--background-color));
    border-radius: 50%;
    background: var(--primary-color);
  }

  .mobile-bottom-nav__ai-status.is-generating {
    animation: mobile-ai-status-pulse 1.2s ease-in-out infinite;
  }

  .mobile-bottom-nav__ai-status.is-completed {
    background: var(--success-color);
  }

  .mobile-bottom-nav__ai-status.is-needs_attention {
    background: var(--warning-color);
  }

  .mobile-bottom-nav__ai-status.is-failed {
    background: var(--danger-color);
  }

  @keyframes mobile-ai-status-pulse {
    0%,
    100% {
      transform: scale(0.82);
      opacity: 0.72;
    }
    50% {
      transform: scale(1);
      opacity: 1;
    }
  }

  .mobile-bottom-nav__icon {
    position: relative;
    min-height: 25px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .mobile-bottom-nav__label {
    font-size: 10px;
    font-weight: 600;
    line-height: 14px;
  }

  /* 没有历史逾期、只有今天到期：降一档为警示色，与桌面顶栏同一套语义。
     实色变量，不经 color-mix —— 旧 WebView 会把混色塌缩掉。 */
  .mobile-bottom-nav__badge.is-due-today {
    background: var(--warning-fill-bg, #a05f00);
    color: var(--warning-fill-fg, #fff);
  }
  .mobile-bottom-nav__badge {
    position: absolute;
    top: -4px;
    left: calc(50% + 6px);
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 2px solid var(--surface-page-bg, var(--background-color));
    border-radius: 999px;
    /* 前景色变量（--danger-color）深色主题会提亮，配白字只有 2.78:1；用填充色对 */
    color: var(--danger-fill-fg, #fff);
    background: var(--danger-fill-bg, #d93b3b);
    font-size: 9px;
    line-height: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    .mobile-bottom-nav__item {
      transition: none;
    }

    .mobile-bottom-nav__ai-status.is-generating {
      animation: none;
    }
  }
</style>
