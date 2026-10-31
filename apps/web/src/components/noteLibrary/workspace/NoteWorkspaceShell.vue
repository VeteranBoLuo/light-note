<template>
  <div
    ref="shellRef"
    class="note-workspace-shell"
    :class="[
      `is-${layout.mode}`,
      `has-sidebar-${effectiveSidebarPresentation}`,
      `has-ai-${effectiveAiPresentation}`,
      {
        'is-sidebar-open': sidebarOpen,
        'is-ai-open': aiOpen,
        'is-resizing': resizing,
      },
    ]"
    :style="shellStyle"
    :data-layout-mode="layout.mode"
  >
    <aside
      v-if="hasSidebar && effectiveSidebarPresentation === 'dock'"
      class="note-workspace-shell__sidebar note-workspace-shell__sidebar--dock"
      :class="{ 'is-collapsed': !sidebarOpen, 'is-collapse-pending': sidebarCollapsePending }"
      :aria-hidden="!sidebarOpen"
    >
      <div class="note-workspace-shell__sidebar-content">
        <slot name="sidebar" :collapse="closeSidebar" />
      </div>
      <WorkspaceSplitter
        v-if="sidebarOpen"
        side="start"
        :width="sidebarWidthPx"
        :min-width="NOTE_WORKSPACE_SIDEBAR_MIN_WIDTH"
        :max-width="NOTE_WORKSPACE_SIDEBAR_MAX_WIDTH"
        :label="t('note.resizePageSidebar')"
        @resize="emit('update:sidebarWidth', $event)"
        @reset="resetSidebarWidth"
        @collapse="closeSidebar"
        @collapse-pending="sidebarCollapsePending = $event"
        @dragging="resizing = $event"
      />
    </aside>

    <aside
      v-else-if="hasSidebar && effectiveSidebarPresentation === 'rail'"
      class="note-workspace-shell__rail"
      aria-hidden="true"
    />

    <main class="note-workspace-shell__main">
      <BTooltip
        v-if="showMainSidebarTrigger"
        class="note-workspace-shell__trigger-tooltip"
        follow-cursor
        :title="shortcutTitle(t('note.expandPageSidebar'), 'sidebar')"
      >
        <BButton
          class="note-workspace-shell__sidebar-boundary-toggle note-workspace-shell__sidebar-boundary-toggle--open"
          :aria-label="t('note.expandPageSidebar')"
          :aria-keyshortcuts="panelShortcuts ? getWorkspacePanelAriaKeyShortcut('sidebar') : undefined"
          @click.stop="openSidebar"
        >
          <SvgIcon :src="icon.arrow_right" size="15" aria-hidden="true" />
        </BButton>
      </BTooltip>
      <BTooltip
        v-if="showMainAiTrigger"
        class="note-workspace-shell__trigger-tooltip"
        follow-cursor
        :title="shortcutTitle(t('note.showAiPanel'), 'sidePanel')"
      >
        <BButton
          class="note-workspace-shell__ai-boundary-toggle note-workspace-shell__ai-boundary-toggle--open"
          :aria-label="t('note.showAiPanel')"
          :aria-keyshortcuts="panelShortcuts ? getWorkspacePanelAriaKeyShortcut('sidePanel') : undefined"
          @click.stop="openAi"
        >
          <SvgIcon :src="icon.ai.organize" size="18" aria-hidden="true" />
        </BButton>
      </BTooltip>
      <slot />
    </main>

    <div v-if="overlayVisible" class="note-workspace-shell__mask" aria-hidden="true" @click="closeOverlays" />

    <aside
      v-if="hasSidebar && (effectiveSidebarPresentation === 'overlay' || effectiveSidebarPresentation === 'rail')"
      class="note-workspace-shell__sidebar note-workspace-shell__sidebar--overlay"
      :class="{ 'is-open': sidebarOverlayVisible }"
      :aria-hidden="!sidebarOverlayVisible"
    >
      <slot name="sidebar" :collapse="closeSidebar" />
    </aside>

    <aside
      v-if="hasAi && effectiveAiPresentation !== 'hidden'"
      class="note-workspace-shell__ai"
      :class="[
        `note-workspace-shell__ai--${effectiveAiPresentation}`,
        { 'is-open': aiOverlayVisible, 'is-collapsed': !aiVisible, 'is-collapse-pending': aiCollapsePending },
      ]"
      :aria-hidden="!aiVisible"
    >
      <div class="note-workspace-shell__ai-content">
        <slot name="ai" :collapse="closeAi" />
      </div>
      <WorkspaceSplitter
        v-if="aiResizable && effectiveAiPresentation === 'dock' && aiVisible"
        side="end"
        :width="resolvedAiWidth"
        :min-width="aiMinWidth"
        :max-width="aiResizeMaxWidth"
        :label="t('note.resizeSidePanel')"
        @resize="emit('update:aiWidth', $event)"
        @reset="emit('update:aiWidth', null)"
        @collapse="closeAi"
        @collapse-pending="aiCollapsePending = $event"
        @dragging="resizing = $event"
      />
    </aside>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import WorkspaceSplitter from '@/components/workspace/WorkspaceSplitter.vue';
  import {
    getWorkspacePanelAriaKeyShortcut,
    getWorkspacePanelShortcutLabel,
    matchWorkspacePanelShortcut,
    type WorkspacePanelShortcut,
  } from '@/config/keyboardShortcuts';
  import {
    NOTE_WORKSPACE_DEFAULT_SIDEBAR_WIDTH,
    NOTE_WORKSPACE_SIDE_PANEL_DEFAULT_WIDTH,
    NOTE_WORKSPACE_SIDE_PANEL_MIN_WIDTH,
    NOTE_WORKSPACE_SIDEBAR_MAX_WIDTH,
    NOTE_WORKSPACE_SIDEBAR_MIN_WIDTH,
    clampNoteWorkspaceSidebarWidth,
    resolveNoteWorkspaceDockedLayout,
    resolveNoteWorkspaceLayout,
    resolveNoteWorkspacePanelWidth,
  } from '@/utils/noteWorkspaceLayout';

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
      /** 用户拖动记住的右侧卡片宽度；null 时使用默认宽度。 */
      aiWidth?: number | null;
      aiMinWidth?: number;
      aiMaxWidth?: number;
      /** 未记住宽度且没有比例时使用的默认宽度。 */
      aiDefaultWidth?: number;
      /** 大于 0 时默认宽度按去掉页面树后的可用宽度比例计算。 */
      aiDefaultRatio?: number;
      aiResizable?: boolean;
      /** 右侧卡片有参考内容时需要与编辑区并排常驻，不能作为浮层盖住正文。 */
      preferDockedAi?: boolean;
      mainMinWidth?: number;
      forceDockedPanels?: boolean;
      /** 启用面板快捷键：Mac ⌘ + \ / ⌃ + \，Windows / Linux Ctrl + \ / Alt + \。 */
      panelShortcuts?: boolean;
    }>(),
    {
      mobile: false,
      hasSidebar: true,
      hasAi: false,
      sidebarOpen: true,
      aiOpen: true,
      sidebarWidth: NOTE_WORKSPACE_DEFAULT_SIDEBAR_WIDTH,
      aiWidth: null,
      aiMinWidth: NOTE_WORKSPACE_SIDE_PANEL_MIN_WIDTH,
      aiMaxWidth: Number.POSITIVE_INFINITY,
      aiDefaultWidth: NOTE_WORKSPACE_SIDE_PANEL_DEFAULT_WIDTH,
      aiDefaultRatio: 0,
      aiResizable: false,
      preferDockedAi: false,
      mainMinWidth: 680,
      forceDockedPanels: false,
      panelShortcuts: false,
    },
  );

  const emit = defineEmits<{
    'update:sidebarOpen': [value: boolean];
    'update:aiOpen': [value: boolean];
    'update:sidebarOverlayOpen': [value: boolean];
    'update:aiOverlayOpen': [value: boolean];
    'update:sidebarWidth': [value: number];
    'update:aiWidth': [value: number | null];
    layoutChange: [value: ReturnType<typeof resolveNoteWorkspaceLayout>];
  }>();

  const { t } = useI18n();
  const shellRef = ref<HTMLElement | null>(null);
  // 首帧先按可见窗口推断，等 ResizeObserver 接管后再以工作区容器为准。
  // 不能用 0：那会让桌面端首帧短暂按 mobile 隐藏双侧栏，形成明显闪动。
  const containerWidth = ref(typeof window === 'undefined' ? 1420 : window.innerWidth);
  const sidebarCollapsePending = ref(false);
  const aiCollapsePending = ref(false);
  const resizing = ref(false);
  let resizeObserver: ResizeObserver | null = null;

  const sidebarWidthPx = computed(() => clampNoteWorkspaceSidebarWidth(props.sidebarWidth));
  const layout = computed(() => {
    const resolved = resolveNoteWorkspaceDockedLayout({
      width: containerWidth.value,
      mobile: props.mobile,
      preferDockedAi: props.hasAi && props.preferDockedAi,
      sidebarOpen: props.hasSidebar && props.sidebarOpen,
      sidebarWidth: sidebarWidthPx.value,
      aiMinWidth: props.aiMinWidth,
      mainMinWidth: props.mainMinWidth,
    });
    if (!props.forceDockedPanels || props.mobile) return resolved;
    return {
      mode: 'wide' as const,
      sidebarPresentation: props.hasSidebar ? ('dock' as const) : ('hidden' as const),
      aiPresentation: props.hasAi ? ('dock' as const) : ('hidden' as const),
    };
  });
  const effectiveSidebarPresentation = computed(() => (props.hasSidebar ? layout.value.sidebarPresentation : 'hidden'));
  const effectiveAiPresentation = computed(() => (props.hasAi ? layout.value.aiPresentation : 'hidden'));
  const sidebarOverlayVisible = computed(
    () =>
      (effectiveSidebarPresentation.value === 'overlay' || effectiveSidebarPresentation.value === 'rail') &&
      (props.sidebarOverlayOpen ?? props.sidebarOpen),
  );
  const aiOverlayVisible = computed(
    () => effectiveAiPresentation.value === 'overlay' && (props.aiOverlayOpen ?? props.aiOpen),
  );
  const aiVisible = computed(() => (effectiveAiPresentation.value === 'dock' ? props.aiOpen : aiOverlayVisible.value));
  const overlayVisible = computed(() => sidebarOverlayVisible.value || aiOverlayVisible.value);
  const showMainSidebarTrigger = computed(
    () =>
      props.hasSidebar &&
      ((effectiveSidebarPresentation.value === 'dock' && !props.sidebarOpen) ||
        ((effectiveSidebarPresentation.value === 'overlay' || effectiveSidebarPresentation.value === 'rail') &&
          !sidebarOverlayVisible.value)),
  );
  const showMainAiTrigger = computed(
    () => props.hasAi && effectiveAiPresentation.value !== 'hidden' && !aiVisible.value,
  );
  const sidebarDockedOpen = computed(() => effectiveSidebarPresentation.value === 'dock' && props.sidebarOpen);
  const mainMinWidthPx = computed(() => Math.max(0, props.mainMinWidth));
  /** 去掉常驻页面树后，编辑区与右侧卡片共享的宽度。 */
  const panelAvailableWidth = computed(
    () => containerWidth.value - (sidebarDockedOpen.value ? sidebarWidthPx.value : 0),
  );
  const resolvedAiWidth = computed(() =>
    resolveNoteWorkspacePanelWidth({
      available: panelAvailableWidth.value,
      preferred: props.aiWidth,
      minWidth: props.aiMinWidth,
      maxWidth: props.aiMaxWidth,
      defaultWidth: props.aiDefaultWidth,
      defaultRatio: props.aiDefaultRatio,
      mainMinWidth: mainMinWidthPx.value,
    }),
  );
  const aiResizeMaxWidth = computed(() =>
    Math.max(props.aiMinWidth, Math.min(props.aiMaxWidth, panelAvailableWidth.value - mainMinWidthPx.value)),
  );
  // 网格列按实际呈现计算：常驻页面树、编辑区、常驻右侧卡片；浮层与遮罩是绝对定位，不占列。
  const gridTemplateColumns = computed(() => {
    const columns: string[] = [];
    if (effectiveSidebarPresentation.value === 'dock') {
      columns.push(props.sidebarOpen ? 'var(--note-workspace-sidebar-width)' : '0px');
    } else if (effectiveSidebarPresentation.value === 'rail') {
      columns.push('0px');
    }
    columns.push(
      effectiveSidebarPresentation.value === 'dock' ? 'minmax(var(--note-workspace-main-min-width), 1fr)' : 'minmax(0, 1fr)',
    );
    if (effectiveAiPresentation.value === 'dock') {
      columns.push(aiVisible.value ? 'var(--note-workspace-ai-width)' : '0px');
    }
    return columns.join(' ');
  });
  // 用户拖动保存的侧栏宽度与正文阅读下限保持实际 CSS 像素。
  const shellStyle = computed(() => ({
    '--note-workspace-sidebar-width': `${sidebarWidthPx.value}px`,
    '--note-workspace-ai-width': `${resolvedAiWidth.value}px`,
    '--note-workspace-main-min-width': `${mainMinWidthPx.value}px`,
    gridTemplateColumns: gridTemplateColumns.value,
  }));

  function closeOverlays() {
    if (effectiveSidebarPresentation.value === 'overlay' || effectiveSidebarPresentation.value === 'rail') {
      emit('update:sidebarOverlayOpen', false);
    }
    if (effectiveAiPresentation.value === 'overlay') emit('update:aiOverlayOpen', false);
  }

  function openSidebar() {
    if (effectiveSidebarPresentation.value === 'dock') {
      emit('update:sidebarOpen', true);
      return;
    }
    emit('update:sidebarOverlayOpen', true);
  }

  function closeSidebar() {
    if (effectiveSidebarPresentation.value === 'dock') {
      emit('update:sidebarOpen', false);
      return;
    }
    emit('update:sidebarOverlayOpen', false);
  }

  function openAi() {
    if (effectiveAiPresentation.value === 'dock') {
      emit('update:aiOpen', true);
      return;
    }
    emit('update:aiOverlayOpen', true);
  }

  function closeAi() {
    if (effectiveAiPresentation.value === 'dock') {
      emit('update:aiOpen', false);
      return;
    }
    emit('update:aiOverlayOpen', false);
  }

  function shortcutTitle(action: string, target: WorkspacePanelShortcut) {
    return props.panelShortcuts ? `${action} · ${getWorkspacePanelShortcutLabel(target)}` : action;
  }

  function toggleSidebar() {
    if (!props.hasSidebar || effectiveSidebarPresentation.value === 'hidden') return false;
    const open =
      effectiveSidebarPresentation.value === 'dock' ? props.sidebarOpen : sidebarOverlayVisible.value;
    if (open) closeSidebar();
    else openSidebar();
    return true;
  }

  function toggleAi() {
    if (!props.hasAi || effectiveAiPresentation.value === 'hidden') return false;
    if (aiVisible.value) closeAi();
    else openAi();
    return true;
  }

  function handlePanelShortcut(event: KeyboardEvent) {
    if (!props.panelShortcuts || props.mobile) return;
    const target = matchWorkspacePanelShortcut(event);
    if (!target) return;
    // 弹框打开时由弹框自己处理键盘，不在背后开关面板。
    const element = event.target instanceof Element ? event.target : null;
    if (element?.closest('[role="dialog"], [role="alertdialog"]')) return;
    const handled = target === 'sidebar' ? toggleSidebar() : toggleAi();
    if (handled) event.preventDefault();
  }

  function resetSidebarWidth() {
    emit('update:sidebarWidth', NOTE_WORKSPACE_DEFAULT_SIDEBAR_WIDTH);
  }

  // 参考内容出现或移除也会改变呈现方式，不只在容器尺寸变化时通知页面。
  const layoutKey = computed(
    () => `${layout.value.mode}|${layout.value.sidebarPresentation}|${layout.value.aiPresentation}`,
  );
  watch(layoutKey, () => emit('layoutChange', layout.value));

  onMounted(() => {
    const element = shellRef.value;
    if (!element) return;
    const update = (width: number) => {
      containerWidth.value = width;
    };
    update(element.getBoundingClientRect().width);
    emit('layoutChange', layout.value);
    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) update(entry.contentRect.width);
    });
    resizeObserver.observe(element);
    // 捕获阶段监听：正文编辑器（内联 TinyMCE / CodeMirror）里同样可用。
    document.addEventListener('keydown', handlePanelShortcut, true);
  });

  onBeforeUnmount(() => {
    resizeObserver?.disconnect();
    document.removeEventListener('keydown', handlePanelShortcut, true);
  });
</script>

<style scoped lang="less">
  @import (reference) "@/assets/css/workspace-surfaces.less";
  .note-workspace-shell {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    transition: grid-template-columns 240ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  // 拖动分隔条时列宽必须跟手，不能再叠加展开收起的过渡。
  .note-workspace-shell.is-resizing {
    transition: none;
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

  .note-workspace-shell__rail {
    border-right: 0;
    background: transparent;
  }

  .note-workspace-shell__sidebar--dock {
    z-index: 3;
    box-sizing: border-box;
    visibility: visible;
    transition: visibility 0s linear 0s;

    &::after {
      position: absolute;
      z-index: 3;
      top: 0;
      right: 0;
      bottom: 0;
      width: 1px;
      background: var(--note-workspace-divider-color, var(--surface-border-color, #e4e7ef));
      content: '';
      opacity: 1;
      pointer-events: none;
      transition: opacity 120ms ease;
    }
  }

  .note-workspace-shell__sidebar--dock.is-collapsed {
    pointer-events: none;
    visibility: hidden;
    transition-delay: 240ms;

    &::after {
      opacity: 0;
    }
  }

  .note-workspace-shell__sidebar-content {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    opacity: 1;
    transform: translateX(0);
    transform-origin: left center;
    transition:
      opacity 150ms ease,
      transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .note-workspace-shell__sidebar--dock.is-collapsed .note-workspace-shell__sidebar-content {
    opacity: 0;
    transform: translateX(-12px);
  }

  // 提示包装层不参与定位（跟随光标显示），按钮仍相对正文区贴边。
  .note-workspace-shell__trigger-tooltip {
    position: static;
    display: flex;
    flex: 0 0 0;
    width: 0;
    height: 0;
  }

  .note-workspace-shell__sidebar-boundary-toggle.b_btn,
  .note-workspace-shell__ai-boundary-toggle.b_btn {
    position: absolute;
    z-index: 8;
    top: 50%;
    width: var(--ui-control-28, 28px);
    min-width: var(--ui-control-28, 28px);
    height: var(--ui-control-44, 44px);
    min-height: var(--ui-control-44, 44px);
    padding: 0;
    transform: translateY(-50%);
    border: 1px solid var(--surface-border-color, #e4e7ef);
    color: var(--desc-color);
    background: var(--card-background, #fff);
    box-shadow: 0 6px 18px rgba(23, 29, 45, 0.1);

    &:hover,
    &:focus-visible {
      border-color: var(--resource-note-color, #00a884);
      color: var(--resource-note-color, #00a884);
    }
  }

  .note-workspace-shell__sidebar-boundary-toggle--open.b_btn {
    left: 0;
    border-left: 0;
    border-radius: 0 10px 10px 0;
  }

  .note-workspace-shell__ai-boundary-toggle.b_btn {
    border-color: var(--primary-color, #615ced);
    color: var(--primary-color, #615ced);

    &:hover,
    &:focus-visible {
      border-color: var(--primary-color, #615ced);
      color: var(--primary-color, #615ced);
    }
  }

  .note-workspace-shell__ai-boundary-toggle--open.b_btn {
    right: 0;
    width: var(--ui-control-34, 34px);
    min-width: var(--ui-control-34, 34px);
    border-right: 0;
    border-radius: 10px 0 0 10px;
  }

  .note-workspace-shell__ai-content {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .note-workspace-shell__ai--dock {
    box-sizing: border-box;
    border-left: 1px solid var(--surface-border-color, #e4e7ef);
    background: var(--workspace-panel-bg-color, #f6f7fb);
    opacity: 1;
    transform: translateX(0);
    visibility: visible;
    transition:
      opacity 150ms ease,
      transform 240ms cubic-bezier(0.22, 1, 0.36, 1),
      visibility 0s linear 0s;
  }

  .note-workspace-shell__ai--dock.is-collapsed {
    pointer-events: none;
    border-left-color: transparent;
    opacity: 0;
    transform: translateX(12px);
    visibility: hidden;
    transition:
      opacity 150ms ease,
      transform 240ms cubic-bezier(0.22, 1, 0.36, 1),
      visibility 0s linear 240ms;
  }

  // 拖过最小宽度、松手即收起：面板变暗并用虚线框提示，不只靠透明度。
  .note-workspace-shell__sidebar--dock.is-collapse-pending .note-workspace-shell__sidebar-content,
  .note-workspace-shell__ai--dock.is-collapse-pending .note-workspace-shell__ai-content {
    opacity: 0.38;
  }

  .note-workspace-shell__sidebar--dock.is-collapse-pending,
  .note-workspace-shell__ai--dock.is-collapse-pending {
    outline: 1px dashed var(--primary-color, #615ced);
    outline-offset: -1px;
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
    background: var(--workspace-panel-bg-color, #f6f7fb);
    box-shadow: 0 18px 48px rgba(22, 30, 48, 0.18);
    transition:
      transform 180ms ease,
      visibility 180ms ease;
    visibility: hidden;
  }

  .note-workspace-shell__sidebar--overlay {
    left: 0;
    width: min(var(--note-workspace-sidebar-width), calc(100% - 56px));
    transform: translateX(-104%);
    border-right: 1px solid var(--surface-border-color, #e4e7ef);
  }

  .note-workspace-shell__ai--overlay {
    right: 0;
    width: min(var(--note-workspace-ai-width), calc(100% - 56px));
    transform: translateX(104%);
    border-left: 1px solid var(--surface-border-color, #e4e7ef);
  }

  .note-workspace-shell__sidebar--overlay.is-open,
  .note-workspace-shell__ai--overlay.is-open {
    visibility: visible;
    transform: translateX(0);
  }

  @media (prefers-reduced-motion: reduce) {
    .note-workspace-shell,
    .note-workspace-shell__sidebar-content,
    .note-workspace-shell__sidebar--dock::after,
    .note-workspace-shell__ai--dock,
    .note-workspace-shell__ai--dock.is-collapsed,
    .note-workspace-shell__sidebar--overlay,
    .note-workspace-shell__ai--overlay {
      transition: none;
    }

    .note-workspace-shell__sidebar--dock.is-collapsed {
      transition-delay: 0s;
    }
  }

  // 共享工作区表面：仅改变颜色，布局与滚动由原组件负责。
  .note-workspace-shell {
    .workspace-canvas-surface();
  }
  .note-workspace-shell__sidebar--dock, .note-workspace-shell__sidebar--overlay {
    .workspace-open-surface();
  }
  .note-workspace-shell__ai {
    .workspace-content-surface();
  }
</style>
