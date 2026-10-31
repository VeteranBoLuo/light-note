<template>
  <aside
    ref="sidebar"
    class="cloud-folder-sidebar"
    :class="{ 'is-collapsed': collapsed, 'is-collapse-pending': collapsePending }"
    :style="collapsed ? undefined : { width: `${width}px` }"
  >
    <!-- 收起时保留文件夹树实例：展开状态与已加载的目录不丢失。 -->
    <div v-show="!collapsed" class="cloud-folder-sidebar__content">
      <slot />
    </div>
    <WorkspaceSplitter
      v-if="!collapsed"
      side="start"
      :width="width"
      :min-width="minWidth"
      :max-width="maxWidth"
      :label="t('cloudSpace.folderSidebarResizeLabel')"
      @resize="resizeTo"
      @reset="resetWidth"
      @collapse="collapse"
      @collapse-pending="collapsePending = $event"
      @dragging="onDragging"
    />
    <!-- 收起后只留一个骑在文件卡片左边框上的小按钮；当前文件夹写在提示里，不占页头和列表宽度。 -->
    <BTooltip
      v-else
      class="cloud-folder-sidebar__expand-tooltip"
      :title="`${expandLabel} · ${getWorkspacePanelShortcutLabel('sidebar')}`"
    >
      <BButton
        ref="expandButton"
        class="cloud-folder-sidebar__expand"
        :aria-label="expandLabel"
        :aria-keyshortcuts="getWorkspacePanelAriaKeyShortcut('sidebar')"
        @click="expand"
      >
        <SvgIcon :src="icon.noteTree.sidebarClosed" size="16" aria-hidden="true" />
      </BButton>
    </BTooltip>
  </aside>
</template>

<script setup lang="ts">
  import { computed, nextTick, onMounted, onBeforeUnmount, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useUiDensity } from '@/composables/useUiDensity';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import WorkspaceSplitter from '@/components/workspace/WorkspaceSplitter.vue';
  import icon from '@/config/icon';
  import {
    getWorkspacePanelAriaKeyShortcut,
    getWorkspacePanelShortcutLabel,
    matchWorkspacePanelShortcut,
  } from '@/config/keyboardShortcuts';

  const props = withDefaults(defineProps<{ /** 当前文件夹路径；「全部文件」时为空。 */ currentFolder?: string }>(), {
    currentFolder: '',
  });

  const STORAGE_KEY = 'light-note:cloud-folder-sidebar-width';
  const COLLAPSED_STORAGE_KEY = 'light-note:cloud-folder-sidebar-collapsed';
  const { t } = useI18n();
  const { dimension } = useUiDensity();
  const expandLabel = computed(() =>
    props.currentFolder
      ? t('cloudSpace.expandFolderSidebarCurrent', { folder: props.currentFolder })
      : t('cloudSpace.expandFolderSidebar'),
  );
  const collapsed = ref(false);
  const sidebar = ref<HTMLElement>();
  const expandButton = ref<{ $el?: HTMLElement } | null>(null);
  const containerWidth = ref<number>();
  const preferredWidth = ref<number | null>(null);
  const collapsePending = ref(false);
  let dragging = false;
  let observer: ResizeObserver | undefined;

  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(stored) && stored > 0) preferredWidth.value = stored;
    collapsed.value = localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1';
  } catch {
    // Restricted storage still permits adjustments for this session.
  }
  function setCollapsed(value: boolean) {
    collapsed.value = value;
    try {
      if (value) localStorage.setItem(COLLAPSED_STORAGE_KEY, '1');
      else localStorage.removeItem(COLLAPSED_STORAGE_KEY);
    } catch {
      // 存储不可用时只在本次会话生效。
    }
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
  let settling = false;
  let preferenceBeforeDrag: number | null = null;
  let widthBeforeDrag = 0;
  function resizeTo(next: number) {
    preferredWidth.value = Math.round(next);
    // 拖动过程中只更新显示，松手后统一保存；键盘调宽立即保存。
    if (!dragging && !settling) persistWidth();
  }
  function onDragging(value: boolean) {
    dragging = value;
    if (value) {
      preferenceBeforeDrag = preferredWidth.value;
      widthBeforeDrag = width.value;
      return;
    }
    // 取消或拖到收起时，分隔条会紧接着发出拖动前的宽度；等这一轮结束再保存，
    // 回到起点就恢复原来的偏好（可能是「使用默认宽度」），而不是写死成数字。
    settling = true;
    void nextTick(() => {
      settling = false;
      if (Math.round(width.value) === Math.round(widthBeforeDrag)) preferredWidth.value = preferenceBeforeDrag;
      persistWidth();
    });
  }
  function resetWidth() {
    preferredWidth.value = null;
    persistWidth();
  }
  async function collapse() {
    const hadFocus = Boolean(sidebar.value?.contains(document.activeElement));
    collapsePending.value = false;
    setCollapsed(true);
    // 键盘收起时把焦点交给展开按钮，避免焦点落回页面顶部。
    if (!hadFocus) return;
    await nextTick();
    expandButton.value?.$el?.focus?.();
  }
  function expand() {
    setCollapsed(false);
  }

  function handlePanelShortcut(event: KeyboardEvent) {
    if (matchWorkspacePanelShortcut(event) !== 'sidebar') return;
    // 弹框打开时由弹框自己处理键盘，不在背后开关文件夹栏。
    const element = event.target instanceof Element ? event.target : null;
    if (element?.closest('[role="dialog"], [role="alertdialog"]')) return;
    event.preventDefault();
    if (collapsed.value) expand();
    else void collapse();
  }

  onMounted(() => {
    const container = sidebar.value?.parentElement;
    document.addEventListener('keydown', handlePanelShortcut, true);
    if (!container) return;
    // 按内容宽度计算：页面可能为展开按钮在左侧留出内边距，这部分不属于文件夹栏和列表。
    const style = getComputedStyle(container);
    containerWidth.value =
      container.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
    observer = new ResizeObserver(([entry]) => {
      if (entry) containerWidth.value = entry.contentRect.width;
    });
    observer.observe(container);
  });
  onBeforeUnmount(() => {
    document.removeEventListener('keydown', handlePanelShortcut, true);
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
  .cloud-folder-sidebar__content {
    height: 100%;
    min-height: 0;
    border-radius: 14px;
  }
  /* 拖过最小宽度、松手即收起：面板变暗并用虚线框提示，不只靠透明度。 */
  .cloud-folder-sidebar.is-collapse-pending .cloud-folder-sidebar__content {
    opacity: 0.38;
    outline: 1px dashed var(--primary-color, #615ced);
    outline-offset: -1px;
  }
  /* 收起后不占宽度，文件列表铺满；展开按钮压在文件卡片左边框上，靠近顶部。
     按钮尺寸和伸出卡片的距离由页面内容区声明，并由页面留出可见区域。 */
  .cloud-folder-sidebar.is-collapsed {
    z-index: 7;
    width: 0;
    margin-right: calc(-1 * var(--workspace-splitter-gap, 0px));
  }
  .cloud-folder-sidebar__expand-tooltip {
    position: absolute;
    top: var(--ui-space-16, 16px);
    left: calc(-1 * var(--cloud-folder-expand-overhang, 0px));
    display: flex;
  }
  .cloud-folder-sidebar__expand.b_btn {
    width: var(--cloud-folder-expand-size, var(--ui-control-28, 28px));
    height: var(--cloud-folder-expand-size, var(--ui-control-28, 28px));
    min-width: 0;
    min-height: 0;
    padding: 0;
    display: grid;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 90%, transparent);
    border-radius: 8px;
    color: var(--desc-color);
    background: var(--card-background, #fff);
    box-shadow: none;
  }
  .cloud-folder-sidebar__expand.b_btn:hover,
  .cloud-folder-sidebar__expand.b_btn:focus-visible {
    border-color: color-mix(in srgb, var(--resource-file-color, #ff8a00) 55%, transparent);
    color: var(--resource-file-color, #ff8a00);
    background: color-mix(in srgb, var(--resource-file-color, #ff8a00) 4%, var(--card-background, #fff));
  }
</style>
