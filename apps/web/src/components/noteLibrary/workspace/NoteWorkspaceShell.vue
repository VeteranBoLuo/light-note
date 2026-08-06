<template>
  <div
    ref="shellRef"
    class="note-workspace-shell"
    :class="[
      `is-${layout.mode}`,
      `has-sidebar-${effectiveSidebarPresentation}`,
      `has-ai-${effectiveAiPresentation}`,
      { 'is-sidebar-open': sidebarOpen, 'is-ai-open': aiOpen },
    ]"
    :style="shellStyle"
    :data-layout-mode="layout.mode"
  >
    <aside
      v-if="hasSidebar && effectiveSidebarPresentation === 'dock' && sidebarOpen"
      class="note-workspace-shell__sidebar note-workspace-shell__sidebar--dock"
    >
      <slot name="sidebar" />
      <BButton
        class="note-workspace-shell__resizer"
        :aria-label="t('note.resizePageSidebar')"
        @pointerdown="startSidebarResize"
        @keydown.left.prevent="resizeSidebarBy(-12)"
        @keydown.right.prevent="resizeSidebarBy(12)"
      />
    </aside>

    <aside
      v-else-if="hasSidebar && effectiveSidebarPresentation === 'rail'"
      class="note-workspace-shell__rail"
      :aria-label="t('note.expandPageSidebar')"
    >
      <BTooltip :title="t('note.expandPageSidebar')">
        <BButton
          class="note-workspace-shell__rail-button"
          :aria-label="t('note.expandPageSidebar')"
          @click="emit('update:sidebarOverlayOpen', true)"
        >
          <SvgIcon :src="icon.noteTree.sidebarClosed" size="19" aria-hidden="true" />
        </BButton>
      </BTooltip>
    </aside>

    <main class="note-workspace-shell__main">
      <slot />
    </main>

    <div
      v-if="overlayVisible"
      class="note-workspace-shell__mask"
      aria-hidden="true"
      @click="closeOverlays"
    />

    <aside
      v-if="hasSidebar && (effectiveSidebarPresentation === 'overlay' || effectiveSidebarPresentation === 'rail')"
      class="note-workspace-shell__sidebar note-workspace-shell__sidebar--overlay"
      :class="{ 'is-open': sidebarOverlayVisible }"
      :aria-hidden="!sidebarOverlayVisible"
    >
      <slot name="sidebar" />
    </aside>

    <aside
      v-if="hasAi && effectiveAiPresentation !== 'hidden'"
      class="note-workspace-shell__ai"
      :class="[
        `note-workspace-shell__ai--${effectiveAiPresentation}`,
        { 'is-open': aiOverlayVisible, 'is-collapsed': !aiVisible },
      ]"
      :aria-hidden="!aiVisible"
    >
      <slot name="ai" />
    </aside>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { resolveNoteWorkspaceLayout } from '@/utils/noteWorkspaceLayout';

  const props = withDefaults(
    defineProps<{
      mobile?: boolean;
      hasSidebar?: boolean;
      hasAi?: boolean;
      sidebarOpen?: boolean;
      aiOpen?: boolean;
      sidebarOverlayOpen?: boolean;
      aiOverlayOpen?: boolean;
      sidebarWidth?: number;
      aiWidth?: number;
    }>(),
    {
      mobile: false,
      hasSidebar: true,
      hasAi: false,
      sidebarOpen: true,
      aiOpen: true,
      sidebarWidth: 270,
      aiWidth: 328,
    },
  );

  const emit = defineEmits<{
    'update:sidebarOpen': [value: boolean];
    'update:aiOpen': [value: boolean];
    'update:sidebarOverlayOpen': [value: boolean];
    'update:aiOverlayOpen': [value: boolean];
    'update:sidebarWidth': [value: number];
    'layoutChange': [value: ReturnType<typeof resolveNoteWorkspaceLayout>];
  }>();

  const { t } = useI18n();
  const shellRef = ref<HTMLElement | null>(null);
  // 首帧先按可见窗口推断，等 ResizeObserver 接管后再以工作区容器为准。
  // 不能用 0：那会让桌面端首帧短暂按 mobile 隐藏双侧栏，形成明显闪动。
  const containerWidth = ref(typeof window === 'undefined' ? 1420 : window.innerWidth);
  let resizeObserver: ResizeObserver | null = null;
  let resizeStartX = 0;
  let resizeStartWidth = 0;

  const layout = computed(() => resolveNoteWorkspaceLayout(containerWidth.value, props.mobile));
  const effectiveSidebarPresentation = computed(() =>
    props.hasSidebar ? layout.value.sidebarPresentation : 'hidden',
  );
  const effectiveAiPresentation = computed(() => (props.hasAi ? layout.value.aiPresentation : 'hidden'));
  const sidebarOverlayVisible = computed(
    () =>
      (effectiveSidebarPresentation.value === 'overlay' || effectiveSidebarPresentation.value === 'rail') &&
      (props.sidebarOverlayOpen ?? props.sidebarOpen),
  );
  const aiOverlayVisible = computed(
    () => effectiveAiPresentation.value === 'overlay' && (props.aiOverlayOpen ?? props.aiOpen),
  );
  const aiVisible = computed(() =>
    effectiveAiPresentation.value === 'dock' ? props.aiOpen : aiOverlayVisible.value,
  );
  const overlayVisible = computed(
    () => sidebarOverlayVisible.value || aiOverlayVisible.value,
  );
  const shellStyle = computed(() => ({
    '--note-workspace-sidebar-width': `${Math.min(360, Math.max(220, props.sidebarWidth))}px`,
    '--note-workspace-ai-width': `${Math.max(300, props.aiWidth)}px`,
  }));

  function closeOverlays() {
    if (effectiveSidebarPresentation.value === 'overlay' || effectiveSidebarPresentation.value === 'rail') {
      emit('update:sidebarOverlayOpen', false);
    }
    if (effectiveAiPresentation.value === 'overlay') emit('update:aiOverlayOpen', false);
  }

  function resizeSidebarBy(delta: number) {
    emit('update:sidebarWidth', Math.min(360, Math.max(220, props.sidebarWidth + delta)));
  }

  function onSidebarResize(event: PointerEvent) {
    emit('update:sidebarWidth', Math.min(360, Math.max(220, resizeStartWidth + event.clientX - resizeStartX)));
  }

  function stopSidebarResize() {
    document.removeEventListener('pointermove', onSidebarResize);
    document.removeEventListener('pointerup', stopSidebarResize);
    document.body.style.removeProperty('user-select');
  }

  function startSidebarResize(event: PointerEvent) {
    resizeStartX = event.clientX;
    resizeStartWidth = props.sidebarWidth;
    document.body.style.userSelect = 'none';
    document.addEventListener('pointermove', onSidebarResize);
    document.addEventListener('pointerup', stopSidebarResize, { once: true });
  }

  onMounted(() => {
    const element = shellRef.value;
    if (!element) return;
    const update = (width: number) => {
      containerWidth.value = width;
      emit('layoutChange', layout.value);
    };
    update(element.getBoundingClientRect().width);
    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) update(entry.contentRect.width);
    });
    resizeObserver.observe(element);
  });

  onBeforeUnmount(() => {
    resizeObserver?.disconnect();
    stopSidebarResize();
  });
</script>

<style scoped lang="less">
  .note-workspace-shell {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--color-background-soft, #f6f7fb);
  }

  .note-workspace-shell.has-sidebar-dock.is-sidebar-open {
    grid-template-columns: var(--note-workspace-sidebar-width) minmax(680px, 1fr);
  }

  .note-workspace-shell.has-sidebar-rail {
    grid-template-columns: 50px minmax(0, 1fr);
  }

  .note-workspace-shell.has-ai-dock.is-ai-open {
    grid-template-columns: minmax(0, 1fr) var(--note-workspace-ai-width);
  }

  .note-workspace-shell.has-sidebar-dock.is-sidebar-open.has-ai-dock.is-ai-open {
    grid-template-columns: var(--note-workspace-sidebar-width) minmax(680px, 1fr) var(--note-workspace-ai-width);
  }

  .note-workspace-shell__sidebar,
  .note-workspace-shell__ai,
  .note-workspace-shell__main,
  .note-workspace-shell__rail {
    position: relative;
    z-index: 1;
    min-width: 0;
    min-height: 0;
  }

  .note-workspace-shell__sidebar--dock,
  .note-workspace-shell__rail {
    border-right: 1px solid var(--color-border, #e4e7ef);
    background: var(--color-background, #fff);
  }

  .note-workspace-shell__resizer.b_btn {
    position: absolute;
    z-index: 4;
    top: 0;
    right: -5px;
    bottom: 0;
    width: 10px;
    height: 100%;
    min-width: 10px;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    cursor: col-resize;

    &::after {
      width: 2px;
      height: 42px;
      border-radius: 999px;
      background: transparent;
      content: '';
      transition: background 160ms ease;
    }

    &:hover::after,
    &:focus-visible::after {
      background: var(--resource-note-color, #00a884);
    }
  }

  .note-workspace-shell__ai--dock {
    border-left: 1px solid var(--color-border, #e4e7ef);
    background: var(--color-background, #fff);
  }

  .note-workspace-shell__ai--dock.is-collapsed {
    display: none;
  }

  .note-workspace-shell__rail {
    display: flex;
    justify-content: center;
    padding-top: 10px;

    :deep(.b-tooltip-wrap) {
      width: 36px;
      height: 36px;
      align-self: flex-start;
    }
  }

  .note-workspace-shell__rail-button {
    width: 36px;
    height: 36px;
    padding: 0;
    color: var(--color-primary, #6559f5);
    border: 1px solid var(--color-primary, #6559f5);
    background: var(--color-background, #fff);

    :deep(svg) {
      width: 19px;
      height: 19px;
    }
  }

  .note-workspace-shell__mask {
    position: absolute;
    z-index: 20;
    inset: 0;
    background: rgba(17, 24, 39, 0.22);
  }

  .note-workspace-shell__sidebar--overlay,
  .note-workspace-shell__ai--overlay {
    position: absolute;
    z-index: 21;
    top: 0;
    bottom: 0;
    background: var(--color-background, #fff);
    box-shadow: 0 18px 48px rgba(22, 30, 48, 0.18);
    transition: transform 180ms ease, visibility 180ms ease;
    visibility: hidden;
  }

  .note-workspace-shell__sidebar--overlay {
    left: 0;
    width: min(var(--note-workspace-sidebar-width), calc(100% - 56px));
    transform: translateX(-104%);
    border-right: 1px solid var(--color-border, #e4e7ef);
  }

  .note-workspace-shell__ai--overlay {
    right: 0;
    width: min(var(--note-workspace-ai-width), calc(100% - 56px));
    transform: translateX(104%);
    border-left: 1px solid var(--color-border, #e4e7ef);
  }

  .note-workspace-shell__sidebar--overlay.is-open,
  .note-workspace-shell__ai--overlay.is-open {
    visibility: visible;
    transform: translateX(0);
  }

  @media (prefers-reduced-motion: reduce) {
    .note-workspace-shell__sidebar--overlay,
    .note-workspace-shell__ai--overlay {
      transition: none;
    }
  }
</style>
