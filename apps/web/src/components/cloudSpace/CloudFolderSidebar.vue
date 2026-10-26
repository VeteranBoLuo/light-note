<template>
  <aside ref="sidebar" class="cloud-folder-sidebar" :style="{ width: `${width}px` }">
    <slot />
    <BTooltip
      class="cloud-folder-sidebar__resize-tooltip"
      :title="t('cloudSpace.folderSidebarResizeHint')"
      :delay="1000"
      follow-cursor
    >
      <BButton
        class="cloud-folder-sidebar__resize"
        role="separator"
        aria-orientation="vertical"
        :aria-label="t('cloudSpace.folderSidebarResizeLabel')"
        :aria-valuemin="Math.round(minWidth)"
        :aria-valuemax="Math.round(maxWidth)"
        :aria-valuenow="Math.round(width)"
        @pointerdown="startResize"
        @dblclick.stop.prevent="resetWidth"
        @keydown.left.stop.prevent="adjustWidth(-12)"
        @keydown.right.stop.prevent="adjustWidth(12)"
        @keydown.home.stop.prevent="resetWidth"
      />
    </BTooltip>
  </aside>
</template>

<script setup lang="ts">
  import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useUiDensity } from '@/composables/useUiDensity';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';

  const STORAGE_KEY = 'light-note:cloud-folder-sidebar-width';
  const { t } = useI18n();
  const { dimension, density } = useUiDensity();
  const sidebar = ref<HTMLElement>();
  const containerWidth = ref<number>();
  const preferredWidth = ref<number | null>(null);
  let observer: ResizeObserver | undefined;
  let pointerId: number | null = null;
  let startX = 0;
  let startWidth = 0;
  let previousPreference: number | null = null;
  let previousCursor = '';
  let previousUserSelect = '';

  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(stored) && stored > 0) preferredWidth.value = stored;
  } catch {
    // Restricted storage still permits adjustments for this session.
  }
  // Keep room for the files. Window changes clamp the visible width without replacing the saved preference.
  const maxWidth = computed(() =>
    Math.max(
      0,
      Math.min(dimension(420, 'layout'), (containerWidth.value ?? Infinity) - dimension(480, 'layout') - dimension(14)),
    ),
  );
  const minWidth = computed(() => Math.min(dimension(200, 'layout'), maxWidth.value));
  const clamp = (value: number) => Math.min(maxWidth.value, Math.max(minWidth.value, value));
  const width = computed(() => clamp(preferredWidth.value ?? dimension(230, 'layout')));

  function persistWidth() {
    try {
      if (preferredWidth.value === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, String(preferredWidth.value));
    } catch {
      // The layout remains usable without persistence.
    }
  }
  function resetWidth() {
    stopResize(false);
    preferredWidth.value = null;
    persistWidth();
  }
  function adjustWidth(delta: number) {
    const next = clamp(width.value + dimension(Math.abs(delta), 'space') * Math.sign(delta));
    if (next === width.value) return;
    preferredWidth.value = Math.round(next);
    persistWidth();
  }
  function onResize(event: PointerEvent) {
    if (event.pointerId !== pointerId) return;
    preferredWidth.value = Math.round(clamp(startWidth + event.clientX - startX));
  }
  function stopResize(save: boolean) {
    if (pointerId === null) return;
    document.removeEventListener('pointermove', onResize);
    document.removeEventListener('pointerup', finishResize);
    document.removeEventListener('pointercancel', cancelResize);
    window.removeEventListener('blur', onBlur);
    document.body.style.cursor = previousCursor;
    document.body.style.userSelect = previousUserSelect;
    pointerId = null;
    if (save && width.value !== startWidth) persistWidth();
    else preferredWidth.value = previousPreference;
  }
  function finishResize(event: PointerEvent) {
    if (event.pointerId === pointerId) stopResize(true);
  }
  function cancelResize(event: PointerEvent) {
    if (event.pointerId === pointerId) stopResize(false);
  }
  function onBlur() {
    stopResize(true);
  }
  function startResize(event: PointerEvent) {
    if (event.button !== 0 || pointerId !== null) return;
    event.preventDefault();
    event.stopPropagation();
    pointerId = event.pointerId;
    startX = event.clientX;
    startWidth = width.value;
    previousPreference = preferredWidth.value;
    previousCursor = document.body.style.cursor;
    previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('pointermove', onResize);
    document.addEventListener('pointerup', finishResize);
    document.addEventListener('pointercancel', cancelResize);
    window.addEventListener('blur', onBlur);
  }
  watch(density, () => stopResize(false));
  onMounted(() => {
    const container = sidebar.value?.parentElement;
    if (!container) return;
    containerWidth.value = container.getBoundingClientRect().width;
    observer = new ResizeObserver(() => {
      containerWidth.value = container.getBoundingClientRect().width;
    });
    observer.observe(container);
  });
  onBeforeUnmount(() => {
    stopResize(false);
    observer?.disconnect();
  });
</script>

<style scoped>
  .cloud-folder-sidebar {
    position: relative;
    flex: 0 0 auto;
    min-width: 0;
    min-height: 0;
  }
  .cloud-folder-sidebar__resize-tooltip {
    position: static;
    display: flex;
    width: 0;
    height: 0;
  }
  .cloud-folder-sidebar__resize.b_btn {
    position: absolute;
    inset-block: 0;
    right: calc(-1 * var(--ui-space-5, 5px));
    width: var(--ui-space-10, 10px);
    min-width: var(--ui-space-10, 10px);
    height: 100%;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    cursor: col-resize;
    touch-action: none;
    z-index: 1;
  }
  .cloud-folder-sidebar__resize.b_btn:focus-visible {
    outline: none;
  }
  .cloud-folder-sidebar__resize:focus-visible::after {
    content: '';
    width: var(--ui-space-1, 1px);
    height: var(--ui-layout-42, 42px);
    border-radius: 999px;
    background: var(--workspace-file-text);
  }
</style>
