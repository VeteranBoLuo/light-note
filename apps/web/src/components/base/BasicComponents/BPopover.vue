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
      // 浮层水平对齐:bottom-left(触发元素左对齐)/ bottom-right(右对齐)
      placement?: 'bottom-left' | 'bottom-right';
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

  const isHover = computed(() => props.trigger === 'hover');
  const isClick = computed(() => props.trigger === 'click');

  function computePosition() {
    const el = triggerRef.value;
    if (!el) return;
    const zoom = getRootZoom();
    const r = el.getBoundingClientRect();
    const rBottom = r.bottom / zoom;
    const rLeft = r.left / zoom;
    const rRight = r.right / zoom;
    const panelW = panelRef.value?.offsetWidth ?? 0;
    const vLeft = props.placement === 'bottom-right' ? rRight - panelW : rLeft;
    const container = teleportTarget.value;
    if (container instanceof HTMLElement && container !== document.body) {
      const c = container.getBoundingClientRect();
      let left = vLeft - c.left / zoom + container.scrollLeft;
      if (left < 8) left = 8;
      panelStyle.position = 'absolute';
      panelStyle.top = `${rBottom - c.top / zoom + container.scrollTop + 6}px`;
      panelStyle.left = `${left}px`;
    } else {
      let left = vLeft;
      const vw = document.documentElement.clientWidth;
      if (panelW && left + panelW > vw - 8) left = vw - panelW - 8;
      if (left < 8) left = 8;
      panelStyle.position = 'fixed';
      panelStyle.top = `${rBottom + 6}px`;
      panelStyle.left = `${left}px`;
    }
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
      nextTick(computePosition);
      window.addEventListener('scroll', computePosition, true);
      window.addEventListener('resize', computePosition);
      if (isClick.value) document.addEventListener('mousedown', onDocMouseDown, true);
    } else {
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
    doClose();
  }

  defineExpose({ close: doClose, open: doOpen });

  onBeforeUnmount(() => {
    clearCloseTimer();
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
