<template>
  <nav class="mobile-resource-tabs" :aria-label="t('mobileNavigation.resourceSwitcher')">
    <BButton
      v-for="item in MOBILE_RESOURCE_NAVIGATION"
      :key="item.key"
      class="mobile-resource-tab"
      :class="[`mobile-resource-tab--${item.key}`, { 'mobile-resource-tab--active': activePath === item.path }]"
      :aria-current="activePath === item.path ? 'page' : undefined"
      @click="selectResource(item.path)"
      v-click-log="{ module: '移动端导航', operation: `切换${t(item.labelKey)}` }"
    >
      <SvgIcon :src="resourceIcons[item.key]" size="18" aria-hidden="true" />
      <span>{{ t(item.labelKey) }}</span>
    </BButton>
  </nav>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import {
    getMobileResourcePath,
    MOBILE_RESOURCE_NAVIGATION,
    type MobileResourcePath,
  } from '@/config/mobileNavigation';
  import { useMobileNavigationState } from '@/composables/useMobileNavigationState';

  const route = useRoute();
  const router = useRouter();
  const { t } = useI18n();
  const { scrollCurrentResourceToTop, setLastMobileResourcePath } = useMobileNavigationState();

  const resourceIcons = {
    bookmark: icon.resource.bookmark,
    note: icon.resource.note,
    cloud: icon.resource.file,
    tag: icon.resource.tag,
  } as const;

  const activePath = computed(() => getMobileResourcePath(route.name));

  function selectResource(path: MobileResourcePath) {
    if (activePath.value === path) {
      scrollCurrentResourceToTop();
      return;
    }
    setLastMobileResourcePath(path);
    router.push(path);
  }
</script>

<style scoped lang="less">
  .mobile-resource-tabs {
    position: relative;
    z-index: 3;
    width: 100%;
    height: 44px;
    padding: 0 18px;
    box-sizing: border-box;
    /* 每项按内容自适应宽 + 间隙均分:文字长短不一(书签/笔记库/云空间/标签)时间距仍然相等 */
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex: 0 0 44px;
    border-bottom: 1px solid var(--surface-divider-color);
    background: var(--surface-page-bg, var(--background-color));
  }

  .mobile-resource-tab {
    position: relative;
    width: auto;
    flex: 0 0 auto;
    height: 44px;
    padding: 0 2px;
    gap: 5px;
    border-radius: 0;
    color: var(--desc-color);
    background: transparent !important;
    font-size: 14px;
    font-weight: 600;
    line-height: 1;
    transition: color 0.18s ease;
  }

  .mobile-resource-tab::after {
    position: absolute;
    left: 50%;
    bottom: -1px;
    width: 24px;
    height: 3px;
    border-radius: 999px 999px 0 0;
    background: currentColor;
    content: '';
    opacity: 0;
    transform: translateX(-50%) scaleX(0.55);
    transition:
      opacity 0.18s ease,
      transform 0.18s ease;
  }

  .mobile-resource-tab--active::after {
    opacity: 1;
    transform: translateX(-50%) scaleX(1);
  }

  .mobile-resource-tab--bookmark.mobile-resource-tab--active {
    color: var(--resource-bookmark-color, #615ced);
  }

  .mobile-resource-tab--note.mobile-resource-tab--active {
    color: var(--resource-note-color, #00a884);
  }

  .mobile-resource-tab--cloud.mobile-resource-tab--active {
    color: var(--resource-file-color, #ff8a00);
  }

  .mobile-resource-tab--tag.mobile-resource-tab--active {
    color: var(--resource-tag-color, #615ced);
  }

  @media (prefers-reduced-motion: reduce) {
    .mobile-resource-tab,
    .mobile-resource-tab::after {
      transition: none;
    }
  }
</style>
