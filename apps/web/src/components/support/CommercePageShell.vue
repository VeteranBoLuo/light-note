<template>
  <div class="commerce-page" :class="{ 'is-mobile': bookmark.isMobile, 'is-tablet': bookmark.isTablet }">
    <MobileTopBar v-if="bookmark.isMobile" />
    <div ref="scrollContainer" v-auto-scrollbar class="commerce-page__scroll">
      <main class="commerce-page__content">
        <header v-if="!bookmark.isMobile" class="commerce-page__heading">
          <h1
            ><SvgIcon :src="pageIcon" size="24" color="var(--workspace-purple-text)" aria-hidden="true" />{{
              title
            }}</h1
          >
          <div class="commerce-page__actions"><slot name="actions" /></div>
        </header>
        <slot />
      </main>
    </div>
    <slot name="overlays" />
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue';
  import MobileTopBar from '@/components/mobile/MobileTopBar.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { bookmarkStore } from '@/store';
  import { useDensityScrollAnchor } from '@/composables/useDensityScrollAnchor';

  defineProps<{ title: string; pageIcon: string }>();
  const bookmark = bookmarkStore();
  const scrollContainer = ref<HTMLElement | null>(null);
  useDensityScrollAnchor(scrollContainer);
</script>

<style scoped lang="less">
  .commerce-page {
    width: 100%;
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    color: var(--text-color);
    background: var(--surface-panel-bg);
    font-size: var(--ui-font-14, 14px);
  }
  .commerce-page__scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior-y: contain;
  }
  .commerce-page__content {
    width: calc(100% - var(--ui-space-64, 64px));
    /* ui-density-fixed: 原型确认的大屏内容上限，宽松档也不扩大版心。 */
    max-width: 1280px;
    margin: 0 auto;
    padding: var(--ui-space-26, 26px) 0 var(--ui-space-30, 30px);
  }
  .commerce-page__heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-16, 16px);
    margin-bottom: var(--ui-space-20, 20px);
  }
  h1 {
    display: flex;
    align-items: center;
    gap: var(--ui-space-10, 10px);
    margin: 0;
    font-size: var(--ui-font-22, 22px);
    line-height: 1.4;
    font-weight: 600;
  }
  .commerce-page__actions {
    display: flex;
    align-items: center;
    gap: var(--ui-space-20, 20px);
    flex-shrink: 0;
  }
  .commerce-page__actions :deep(.b_btn) {
    gap: var(--ui-space-6, 6px);
    font-size: var(--ui-font-13, 13px);
  }
  .is-mobile .commerce-page__content {
    width: 100%;
    padding: var(--ui-space-16, 16px) var(--ui-space-14, 14px) var(--ui-space-24, 24px);
  }
</style>
