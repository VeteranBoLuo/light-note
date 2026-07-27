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
      @click="activate(item)"
      v-click-log="{ module: '移动端导航', operation: `打开${t(item.labelKey)}` }"
    >
      <span class="mobile-bottom-nav__icon">
        <SvgIcon :src="bottomIcons[item.key]" :size="item.key === 'ai' ? '21' : '20'" aria-hidden="true" />
        <span v-if="item.key === 'inbox' && inbox.actionTotal > 0" class="mobile-bottom-nav__badge">
          {{ inbox.actionTotal > 99 ? '99+' : inbox.actionTotal }}
        </span>
      </span>
      <span class="mobile-bottom-nav__label">{{ t(item.labelKey) }}</span>
    </BButton>
  </nav>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import {
    MOBILE_BOTTOM_NAVIGATION,
    type MobileBottomNavigationItem,
    type MobileShellSection,
  } from '@/config/mobileNavigation';
  import { useMobileNavigationState } from '@/composables/useMobileNavigationState';
  import { getMobileHomePath } from '@/utils/preferences';
  import { inboxStore, useUserStore } from '@/store';

  const route = useRoute();
  const router = useRouter();
  const user = useUserStore();
  const inbox = inboxStore();
  const { t } = useI18n();
  const { getLastMobileResourcePath, saveResourceScroll, scrollCurrentResourceToTop } = useMobileNavigationState();

  const bottomIcons = {
    resources: icon.navigation.portal,
    inbox: icon.contextMenu.inbox,
    ai: icon.ai.ask,
    search: icon.navigation.search,
    profile: icon.navigation.user,
  } as const;

  function isItemActive(key: MobileShellSection) {
    return route.meta.mobileShell === key;
  }

  function activate(item: MobileBottomNavigationItem) {
    if (item.key === 'resources' && route.meta.mobileShell === 'resources') {
      scrollCurrentResourceToTop();
      return;
    }
    saveResourceScroll(route.meta.mobileShell === 'resources' ? getMobileResourcePathFromRoute() : null);

    const target =
      item.key === 'resources' ? getLastMobileResourcePath(getMobileHomePath(user.preferences)) : item.path;
    if (target && route.path !== target) router.push(target);
  }

  function getMobileResourcePathFromRoute() {
    if (route.name === 'noteLibrary') return '/noteLibrary' as const;
    if (route.name === 'cloudSpace') return '/cloudSpace' as const;
    if (['home', 'home:id', 'home:search'].includes(String(route.name || ''))) return '/home' as const;
    return null;
  }
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
    color: #fff;
    background: var(--danger-color, #e5484d);
    font-size: 9px;
    line-height: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    .mobile-bottom-nav__item {
      transition: none;
    }
  }
</style>
