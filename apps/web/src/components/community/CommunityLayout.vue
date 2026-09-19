<template>
  <div
    ref="layout"
    class="community-layout"
    :style="availableHeight ? { '--community-available-height': availableHeight + 'px' } : undefined"
    :class="{ 'is-disabled': disabled, 'is-chat': chat, 'has-context': !disabled && $slots.aside }"
  >
    <aside v-show="!disabled" class="community-layout-nav"><slot name="navigation" /></aside>
    <div class="community-layout-content"><slot /></div>
    <aside v-if="!disabled && $slots.aside" class="community-layout-context"><slot name="aside" /></aside>
  </div>
</template>
<script setup lang="ts">
  import { onMounted, onBeforeUnmount, ref } from 'vue';
  defineProps<{ disabled?: boolean; chat?: boolean }>();
  const layout = ref<HTMLElement>();
  const availableHeight = ref(0);
  let observer: ResizeObserver | undefined;
  onMounted(() => {
    const parent = layout.value?.parentElement;
    if (!parent) return;
    const measure = () => {
      availableHeight.value = parent.clientHeight;
    };
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(parent);
    }
  });
  onBeforeUnmount(() => observer?.disconnect());
</script>
<style lang="less">
  // Every community route reserves the same scrollbar lane, including the fixed-height chat.
  .community-surface {
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: auto;
    box-sizing: border-box;
    background: var(--workspace-canvas);
  }
</style>
<style scoped lang="less">
  .community-layout {
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr);
    width: 100%;
    max-width: 1600px;
    box-sizing: border-box;
    border-inline: 1px solid var(--workspace-divider);
    min-height: 100%;
    margin: 0 auto;
    background: var(--workspace-open-canvas);
    color: var(--text-color);
  }
  .community-layout.has-context {
    grid-template-columns: 200px minmax(0, 1fr) 260px;
  }
  .community-layout-nav {
    position: sticky;
    top: 0;
    height: 100%;
    max-height: var(--community-available-height, calc(100vh - 80px));
    overflow: auto;
    box-sizing: border-box;
    border-right: 1px solid var(--workspace-divider);
    padding: 28px 20px 0;
    min-width: 0;
  }
  .community-layout-content {
    min-width: 0;
    padding: 32px 38px 72px;
    box-sizing: border-box;
  }
  .community-layout-context {
    padding: 32px 24px;
    border-left: 1px solid var(--workspace-divider);
    min-width: 0;
  }
  .community-layout.is-post-detail .community-layout-context {
    position: sticky;
    top: 0;
    align-self: start;
    max-height: var(--community-available-height, calc(100vh - 80px));
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }
  .is-post-detail .community-layout-context :deep(.post-detail-tools-target) {
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .community-layout.is-chat {
    left: 0;
    right: 0;
    grid-template-rows: minmax(0, 1fr);
    height: 100%;
    min-height: 0;
  }
  .is-chat .community-layout-content {
    padding: 0;
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .is-chat .community-layout-nav {
    max-height: none;
    overflow: auto;
  }
  .community-layout.is-disabled {
    display: block;
    padding: 18px;
    box-sizing: border-box;
  }
  .is-disabled .community-layout-content {
    max-width: 1080px;
    margin: 0 auto;
  }
  @media (max-width: 1199px) {
    .community-layout,
    .community-layout.has-context {
      grid-template-columns: 176px minmax(0, 1fr);
    }
    .community-layout-context,
    .community-layout.is-post-detail .community-layout-context {
      display: none;
    }
    .community-layout-content {
      padding: 28px 28px 72px;
    }
  }
  @media (max-width: 767px) {
    .community-layout {
      border-inline: 0;
    }
    // The mobile navigation already names the page; retain a heading for assistive technology.
    :deep(.community-page-title) {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    .community-layout,
    .community-layout.has-context {
      display: flex;
      flex-direction: column;
    }
    .community-layout-nav {
      position: static;
      height: auto;
      max-height: none;
      border-right: 0;
      border-bottom: 1px solid var(--workspace-divider);
      padding: 8px 12px;
      flex: 0 0 auto;
    }
    .community-layout-content {
      padding: 20px 16px 88px;
    }
    .is-chat .community-layout-content {
      flex: 1;
      height: 0;
    }
    .community-layout.is-disabled {
      display: flex;
      padding: 0;
    }
  }
</style>
