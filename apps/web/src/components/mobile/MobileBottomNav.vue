<template>
  <nav class="mobile-bottom-nav" :aria-label="t('mobileNavigation.primaryNavigation')">
    <BButton
      v-for="item in MOBILE_BOTTOM_NAVIGATION"
      :key="item.key"
      class="mobile-bottom-nav__item"
      :class="{
        'mobile-bottom-nav__item--active': isItemActive(item.key) || pendingKey === item.key,
        'mobile-bottom-nav__item--capture': item.key === 'capture',
      }"
      :aria-current="isItemActive(item.key) ? 'page' : undefined"
      :aria-busy="pendingKey === item.key ? 'true' : undefined"
      :aria-haspopup="item.key === 'capture' ? 'dialog' : undefined"
      :aria-expanded="item.key === 'capture' ? createHubOpen : undefined"
      @pointerdown="prefetchItem(item)"
      @focus="prefetchItem(item)"
      @click="activate(item)"
      v-click-log="{ module: '移动端导航', operation: `打开${t(item.labelKey)}` }"
    >
      <span class="mobile-bottom-nav__icon">
        <SvgIcon :src="bottomIcons[item.key]" size="20" aria-hidden="true" />
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
  <MobilePageActionsDrawer
    v-model:open="createHubOpen"
    :title="t('mobileNavigation.createHub.title')"
    :actions="createActions"
    @action="runCreateAction"
  />
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import MobilePageActionsDrawer, { type MobilePageActionItem } from '@/components/mobile/MobilePageActionsDrawer.vue';
  import icon from '@/config/icon';
  import {
    isMobileResourceInboxTab,
    MOBILE_BOTTOM_NAVIGATION,
    type MobileBottomNavigationKey,
    type MobileBottomNavigationItem,
    type MobileShellSection,
  } from '@/config/mobileNavigation';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import { getMobileResourceEntryPath, useMobileNavigationState } from '@/composables/useMobileNavigationState';
  import { useCommunityChatUnread } from '@/composables/useCommunityChatUnread';
  import { inboxStore, useUserStore } from '@/store';
  import { prefetchResolvedRoute } from '@/utils/routePrefetch';

  const route = useRoute();
  const router = useRouter();
  const user = useUserStore();
  const inbox = inboxStore();
  const { t } = useI18n();
  const { saveResourceScroll, scrollCurrentResourceToTop } = useMobileNavigationState();
  const communityUnread = useCommunityChatUnread();
  const { totalUnread: communityUnreadTotal } = communityUnread;
  const pendingKey = ref<MobileShellSection | null>(null);
  const createHubOpen = ref(false);

  // 屏幕阅读器听到的是完整语义，而不是一个孤立数字
  const todoAttentionLabel = computed(() =>
    t('navigation.todoAttention', {
      count: inbox.todoAttentionTotal,
      overdue: inbox.todoOverdueTotal,
      dueToday: inbox.todoDueTodayTotal,
    }),
  );
  const communityUnreadLabel = computed(() => t('communityChat.unreadBadge', { count: communityUnreadTotal.value }));
  const bottomIcons = {
    today: icon.common.calendar,
    resources: icon.navigation.portal,
    capture: icon.common.plus,
    todo: icon.noteDetail.toolbar.todo,
    community: icon.ai.conversations,
  } as const;

  const createActions = computed<MobilePageActionItem[]>(() => [
    {
      key: 'note',
      label: t('mobileNavigation.createHub.note'),
      description: t('mobileNavigation.createHub.noteDescription'),
      icon: icon.resource.note,
    },
    {
      key: 'todo',
      label: t('mobileNavigation.createHub.todo'),
      description: t('mobileNavigation.createHub.todoDescription'),
      icon: icon.noteDetail.toolbar.todo,
    },
    {
      key: 'bookmark',
      label: t('mobileNavigation.createHub.bookmark'),
      description: t('mobileNavigation.createHub.bookmarkDescription'),
      icon: icon.resource.bookmark,
    },
    {
      key: 'file',
      label: t('mobileNavigation.createHub.file'),
      description: t('mobileNavigation.createHub.fileDescription'),
      icon: icon.resource.file,
    },
    {
      key: 'toolbox',
      label: t('mobileNavigation.createHub.toolbox'),
      description: t('mobileNavigation.createHub.toolboxDescription'),
      icon: icon.toolbox.home,
      dividerBefore: true,
    },
  ]);

  function isItemActive(key: MobileBottomNavigationKey) {
    if (key === 'capture') return false;
    if (route.name === 'inbox') {
      // 待整理是资料处理而不是待办：/inbox?tab=all|bookmark|note|file 归「资料」
      return key === (isMobileResourceInboxTab(route.query.tab) ? 'resources' : 'todo');
    }
    return route.meta.mobileShell === key;
  }

  function getItemTarget(item: MobileBottomNavigationItem) {
    return item.key === 'resources'
      ? getMobileResourceEntryPath()
      : item.key === 'todo'
        ? { path: '/inbox', query: { tab: 'todo' } }
        : item.path;
  }

  function prefetchItem(item: MobileBottomNavigationItem) {
    const target = getItemTarget(item);
    if (!target) return;
    // 手指按下到 click 之间就启动目标路由分包下载；不做全量后台预热，避免弱网下与当前页面抢带宽。
    void prefetchResolvedRoute(router, target).catch(() => {
      // 预取失败不阻断导航，正式跳转仍走 Router 的统一错误恢复。
    });
  }

  async function activate(item: MobileBottomNavigationItem) {
    if (pendingKey.value === item.key) return;
    if (item.key === 'capture') {
      createHubOpen.value = true;
      return;
    }
    if (item.key === 'resources' && route.meta.mobileShell === 'resources') {
      scrollCurrentResourceToTop();
      return;
    }
    saveResourceScroll(route.meta.mobileShell === 'resources' ? getMobileResourcePathFromRoute() : null);

    const target = getItemTarget(item);
    // 一级导航切换不应堆叠浏览历史；否则 Android 返回手势会在底栏页面间倒退。
    if (!target || router.resolve(target).fullPath === route.fullPath) return;
    pendingKey.value = item.key;
    try {
      await router.replace(target);
    } catch {
      // Router 会统一处理分包加载失败与刷新自愈；这里消费事件处理器 Promise，避免控制台出现未处理拒绝。
    } finally {
      if (pendingKey.value === item.key) pendingKey.value = null;
    }
  }

  function runCreateAction(action: MobilePageActionItem) {
    if (action.key === 'toolbox') {
      void router.push('/toolbox');
      return;
    }
    if (blockGuestWrite('inbox-capture', t('inbox.guestPrompt'))) return;
    if (['note', 'todo', 'bookmark', 'file'].includes(action.key)) {
      inbox.openQuickCapture(action.key as 'note' | 'todo' | 'bookmark' | 'file');
    }
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

  .mobile-bottom-nav__item--capture {
    color: var(--primary-color);
  }

  .mobile-bottom-nav__item--capture .mobile-bottom-nav__icon {
    width: 38px;
    min-height: 38px;
    margin-top: -8px;
    border: 1px solid var(--primary-color);
    border-radius: 13px;
    color: #fff;
    background: var(--primary-color);
    box-shadow: 0 8px 20px -12px var(--primary-color);
  }

  .mobile-bottom-nav__item--capture .mobile-bottom-nav__label {
    margin-top: -5px;
    color: var(--primary-color);
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
  }

  :global(html.light-note-mobile-rendering .mobile-bottom-nav__item--capture .mobile-bottom-nav__icon) {
    border-color: var(--primary-color);
    background: var(--primary-color);
    box-shadow: none;
  }
</style>
