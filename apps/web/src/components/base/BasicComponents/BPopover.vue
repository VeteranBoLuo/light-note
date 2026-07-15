<template>
  <span
    ref="triggerRef"
    class="b-popover-trigger"
    @mouseenter="onTriggerEnter"
    @mouseleave="onLeave"
    @click="onTriggerClick"
  >
    <slot />
    <Teleport :to="teleportTarget">
      <transition name="b-popover-fade">
        <div
          v-if="open"
          ref="panelRef"
          class="b-popover-panel"
          :class="overlayClassName"
          :style="panelStyle"
          @mouseenter="onPanelEnter"
          @mouseleave="onLeave"
          @click.stop
        >
          <slot name="content" />
        </div>
      </transition>
    </Teleport>
  </span>
</template>

<script lang="ts" setup>
  import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
  import { getRootZoom } from '@/utils/zoom';

  // 项目自研通用浮层(替代 ant a-popover):任意内容(content 插槽),按实时 getBoundingClientRect 定位。
  // 关键:定位与 fixed 都基于同一视口坐标系,与 <html> zoom(界面缩放)自洽,不会像 a-popover 那样在缩放下错位。
  const props = withDefaults(
    defineProps<{
      // hover/click 由组件自身管理开关;manual 为纯受控(只跟随 v-model:open,适合调用方自己管 hover 逻辑)
      trigger?: 'hover' | 'click' | 'manual';
      // 浮层对齐方向；空间不足时会自动翻转到另一侧，避免超出视口。
      placement?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
      overlayClassName?: string;
      // 与 antd 一致:返回浮层挂载容器(默认 body)。挂进定位容器可让"鼠标移到浮层上"仍算容器内(hover 卡不关闭)。
      getPopupContainer?: (trigger: HTMLElement) => HTMLElement | null;
      disabled?: boolean;
    }>(),
    {
      trigger: 'click',
      placement: 'bottom-left',
    },
  );

  const open = defineModel<boolean>('open', { default: false });
  const emit = defineEmits<{ openChange: [boolean] }>();

  const triggerRef = ref<HTMLElement | null>(null);
  const panelRef = ref<HTMLElement | null>(null);
  const teleportTarget = ref<HTMLElement | string>('body');
  const panelStyle = reactive<Record<string, string>>({ position: 'fixed', top: '0px', left: '0px' });
  let closeTimer: number | null = null;
  let resizeObserver: ResizeObserver | null = null;

  const isHover = computed(() => props.trigger === 'hover');
  const isClick = computed(() => props.trigger === 'click');

  function computePosition() {
    const el = triggerRef.value;
    if (!el) return;
    const zoom = getRootZoom();
    const r = el.getBoundingClientRect();
    const rTop = r.top / zoom;
    const rBottom = r.bottom / zoom;
    const rLeft = r.left / zoom;
    const rRight = r.right / zoom;
    const panelW = panelRef.value?.offsetWidth ?? 0;
    const panelH = panelRef.value?.offsetHeight ?? 0;
    const alignRight = props.placement.endsWith('right');
    const vLeft = alignRight ? rRight - panelW : rLeft;
    // 统一用 fixed(视口坐标):无论 teleport 到 body 还是某容器,fixed 都相对视口定位,
    // 不依赖容器是否为定位元素 —— 原 absolute 分支在静态容器(如 #tag-container)下会把面板顶到页首(缩放时 c.top≠0 尤甚)。
    // 坐标口径:getBoundingClientRect=视觉像素(÷zoom 得布局);offsetWidth=布局像素;
    // documentElement.clientWidth=视觉像素(÷zoom 得布局);style.top/left=布局像素(渲染再 ×zoom)。
    let left = vLeft;
    const vw = document.documentElement.clientWidth / zoom; // 视口宽(布局像素),与 left/panelW 同口径
    const vh = document.documentElement.clientHeight / zoom;
    if (panelW && left + panelW > vw - 8) left = vw - panelW - 8;
    if (left < 8) left = 8;

    // 优先使用调用方指定的方向；指定方向放不下时自动翻转。两侧都放不下时，
    // 选择空间更大的一侧并钳制到视口内，面板自身可再通过 max-height 滚动。
    const spaceAbove = rTop - 8;
    const spaceBelow = vh - rBottom - 8;
    let placeAbove = props.placement.startsWith('top');
    if (panelH) {
      if (placeAbove && panelH > spaceAbove && spaceBelow > spaceAbove) placeAbove = false;
      if (!placeAbove && panelH > spaceBelow && spaceAbove > spaceBelow) placeAbove = true;
    }
    let top = placeAbove ? rTop - panelH - 6 : rBottom + 6;
    if (panelH) top = Math.max(8, Math.min(top, vh - panelH - 8));

    panelStyle.position = 'fixed';
    panelStyle.top = `${top}px`;
    panelStyle.left = `${left}px`;
  }

  function clearCloseTimer() {
    if (closeTimer !== null) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
  }

  function doOpen() {
    clearCloseTimer();
    if (open.value || props.disabled) return;
    open.value = true; // 定位/监听统一在 watch(open) 处理,兼容外部受控(trigger=manual)
  }

  function doClose() {
    clearCloseTimer();
    if (!open.value) return;
    open.value = false;
  }

  // 开关副作用集中在此,覆盖"内部 hover/click 触发"与"外部 v-model:open 受控"两条路径
  watch(open, (val) => {
    emit('openChange', val);
    if (val) {
      teleportTarget.value = props.getPopupContainer?.(triggerRef.value as HTMLElement) || 'body';
      nextTick(() => {
        computePosition();
        resizeObserver?.disconnect();
        if (panelRef.value && typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(computePosition);
          resizeObserver.observe(panelRef.value);
        }
      });
      window.addEventListener('scroll', computePosition, true);
      window.addEventListener('resize', computePosition);
      if (isClick.value) document.addEventListener('mousedown', onDocMouseDown, true);
    } else {
      resizeObserver?.disconnect();
      resizeObserver = null;
      window.removeEventListener('scroll', computePosition, true);
      window.removeEventListener('resize', computePosition);
      document.removeEventListener('mousedown', onDocMouseDown, true);
    }
  });

  function scheduleClose() {
    clearCloseTimer();
    closeTimer = window.setTimeout(doClose, 150);
  }

  function onTriggerEnter() {
    if (isHover.value) doOpen();
  }
  function onPanelEnter() {
    if (isHover.value) clearCloseTimer();
  }
  function onLeave() {
    if (isHover.value) scheduleClose();
  }
  function onTriggerClick() {
    if (!isClick.value) return;
    open.value ? doClose() : doOpen();
  }
  function onDocMouseDown(e: MouseEvent) {
    const t = e.target as Node;
    if (triggerRef.value?.contains(t) || panelRef.value?.contains(t)) return;
    // BSelect 的下拉层会 Teleport 到 body。只有“触发器确实位于当前 Popover 内”的下拉层
    // 才属于内部交互；页面上其他 BSelect 仍应关闭当前 Popover，避免旧浮层残留并遮挡新控件。
    if (t instanceof Element) {
      const dropdown = t.closest<HTMLElement>('.select-dropdown[data-b-select-id]');
      const selectId = dropdown?.dataset.bSelectId;
      const ownedByPanel = Array.from(
        panelRef.value?.querySelectorAll<HTMLElement>('.b-select[data-b-select-id]') || [],
      ).some((select) => select.dataset.bSelectId === selectId);
      if (selectId && ownedByPanel) return;
    }
    doClose();
  }

  defineExpose({ close: doClose, open: doOpen });

  onBeforeUnmount(() => {
    clearCloseTimer();
    resizeObserver?.disconnect();
    window.removeEventListener('scroll', computePosition, true);
    window.removeEventListener('resize', computePosition);
    document.removeEventListener('mousedown', onDocMouseDown, true);
  });
</script>

<style lang="less" scoped>
  .b-popover-trigger {
    display: inline-flex;
  }
</style>

<style lang="less">
  /* 非 scoped:面板 Teleport 到 body/自定义容器,scoped 选择器命不中 */
  .b-popover-panel {
    z-index: 100050;
    border-radius: 12px;
    background: var(--menu-body-bg-color, var(--background-color));
    color: var(--text-color);
    box-shadow:
      0 6px 16px 0 rgba(0, 0, 0, 0.08),
      0 3px 6px -4px rgba(0, 0, 0, 0.12),
      0 9px 28px 8px rgba(0, 0, 0, 0.05);
  }
  .b-popover-fade-enter-active,
  .b-popover-fade-leave-active {
    transition:
      opacity 0.15s ease,
      transform 0.15s ease;
  }
  .b-popover-fade-enter-from,
  .b-popover-fade-leave-to {
    opacity: 0;
    transform: translateY(-4px);
  }
</style>
