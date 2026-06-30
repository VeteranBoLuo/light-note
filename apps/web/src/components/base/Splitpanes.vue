<template>
  <div ref="containerRef" class="classic-splitpanes-wrap" :class="{ mobile: isMobile }">
    <div class="split-pane first-pane" :style="firstPaneStyle">
      <slot name="first"></slot>
    </div>
    <div
      v-if="!isMobile"
      class="splitter"
      role="separator"
      aria-orientation="vertical"
      @mousedown.prevent="handleMouseDown"
    >
      <span class="splitter-handle"></span>
    </div>
    <div class="split-pane second-pane" :style="secondPaneStyle">
      <slot name="second"></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, onUnmounted, ref } from 'vue';

  const props = withDefaults(
    defineProps<{
      mobileBreakpoint?: number;
      initialRatio?: number;
      minRatio?: number;
    }>(),
    {
      mobileBreakpoint: 1120,
      initialRatio: 50,
      minRatio: 20,
    },
  );

  const containerRef = ref<HTMLElement | null>(null);
  const paneRatio = ref(props.initialRatio);
  const isMobile = ref(false);

  let dragging = false;

  const clampRatio = (value: number) => {
    const min = Math.max(5, Math.min(props.minRatio, 45));
    const max = 100 - min;
    return Math.min(max, Math.max(min, value));
  };

  const firstPaneStyle = computed(() => {
    if (isMobile.value) return undefined;
    return { flexBasis: `${paneRatio.value}%` };
  });

  const secondPaneStyle = computed(() => {
    if (isMobile.value) return undefined;
    return { flexBasis: `${100 - paneRatio.value}%` };
  });

  const refreshMode = () => {
    isMobile.value = window.innerWidth <= props.mobileBreakpoint;
    if (isMobile.value) {
      dragging = false;
      clearGlobalCursor();
    }
  };

  const applyGlobalCursor = () => {
    document.body.style.cursor = 'col-resize';
    document.documentElement.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const clearGlobalCursor = () => {
    document.body.style.cursor = '';
    document.documentElement.style.cursor = '';
    document.body.style.userSelect = '';
  };

  const updateRatioByEvent = (event: MouseEvent) => {
    const container = containerRef.value;
    if (!container || isMobile.value) return;

    const rect = container.getBoundingClientRect();
    if (!rect.width) return;

    const ratio = ((event.clientX - rect.left) / rect.width) * 100;
    paneRatio.value = clampRatio(ratio);
  };

  const handleMouseDown = (event: MouseEvent) => {
    if (isMobile.value) return;
    dragging = true;
    updateRatioByEvent(event);
    applyGlobalCursor();
  };

  const handleMouseMove = (event: MouseEvent) => {
    if (!dragging) return;
    updateRatioByEvent(event);
  };

  const handleMouseUp = () => {
    if (!dragging) return;
    dragging = false;
    clearGlobalCursor();
  };

  onMounted(() => {
    paneRatio.value = clampRatio(props.initialRatio);
    refreshMode();

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('blur', clearGlobalCursor);
    window.addEventListener('resize', refreshMode);
  });

  onUnmounted(() => {
    dragging = false;
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
    window.removeEventListener('blur', clearGlobalCursor);
    window.removeEventListener('resize', refreshMode);
    clearGlobalCursor();
  });
</script>

<style scoped lang="less">
  .classic-splitpanes-wrap {
    display: flex;
    align-items: stretch;
    width: 100%;
    height: 100%;
    min-height: 0;

    &.mobile {
      flex-direction: column;
      gap: 8px;
    }
  }

  .split-pane {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    flex: 1 1 auto;
  }

  .splitter {
    width: 10px;
    flex: 0 0 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: col-resize;
    z-index: 2;
    user-select: none;

    .splitter-handle {
      width: 4px;
      height: 56px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--menu-item-h-bg-color) 100%, transparent);
    }
  }
</style>
