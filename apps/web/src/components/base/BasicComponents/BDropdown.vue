<template>
  <span
    ref="triggerRef"
    class="b-dropdown-trigger"
    @mouseenter="onTriggerEnter"
    @mouseleave="onLeave"
    @click="onTriggerClick"
  >
    <slot />
  </span>
  <Teleport to="body">
    <transition name="b-dropdown-fade">
      <div
        v-if="visible"
        ref="panelRef"
        class="b-dropdown-panel"
        :class="overlayClassName"
        :style="panelStyle"
        @mouseenter="onPanelEnter"
        @mouseleave="onLeave"
      >
        <div
          v-for="item in menuOptions"
          :key="item.label"
          class="b-dropdown-item"
          @click="onItemClick(item)"
        >
          <svg-icon v-if="item.icon" :src="item.icon" />
          <span>{{ item.label }}</span>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script lang="ts" setup>
  import { computed, onBeforeUnmount, nextTick, reactive, ref } from 'vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';

  type BDropdownTrigger = 'hover' | 'click';

  interface BDropdownOption {
    label: string;
    icon?: string;
    function?: () => void;
  }

  const props = withDefaults(
    defineProps<{
      menuOptions: BDropdownOption[];
      trigger?: BDropdownTrigger | BDropdownTrigger[];
      overlayClassName?: string;
    }>(),
    {
      trigger: 'hover',
    },
  );

  const emit = defineEmits<{
    openChange: [open: boolean];
  }>();

  const triggerRef = ref<HTMLElement | null>(null);
  const panelRef = ref<HTMLElement | null>(null);
  const visible = ref(false);
  const panelStyle = reactive<Record<string, string>>({ top: '0px', left: '0px', minWidth: '0px' });
  let closeTimer: number | null = null;

  const triggerModes = computed(() => (Array.isArray(props.trigger) ? props.trigger : [props.trigger]));
  const isHover = computed(() => triggerModes.value.includes('hover'));
  const isClick = computed(() => triggerModes.value.includes('click'));

  // 定位:与 antd 默认 bottomLeft 一致——面板贴在触发元素正下方、左对齐;宽度不小于触发元素;越界则回收
  function computePosition() {
    const el = triggerRef.value;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    panelStyle.top = `${rect.bottom + 6}px`;
    panelStyle.left = `${rect.left}px`;
    panelStyle.minWidth = `${Math.ceil(rect.width)}px`;
    nextTick(() => {
      const panel = panelRef.value;
      if (!panel) return;
      const w = panel.offsetWidth;
      let left = rect.left;
      if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
      if (left < 8) left = 8;
      panelStyle.left = `${left}px`;
    });
  }

  function clearCloseTimer() {
    if (closeTimer !== null) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
  }

  function open() {
    clearCloseTimer();
    if (visible.value) return;
    computePosition();
    visible.value = true;
    emit('openChange', true);
    window.addEventListener('scroll', computePosition, true);
    window.addEventListener('resize', computePosition);
    if (isClick.value) document.addEventListener('mousedown', onDocMouseDown, true);
  }

  function close() {
    clearCloseTimer();
    if (!visible.value) return;
    visible.value = false;
    emit('openChange', false);
    window.removeEventListener('scroll', computePosition, true);
    window.removeEventListener('resize', computePosition);
    document.removeEventListener('mousedown', onDocMouseDown, true);
  }

  function scheduleClose() {
    clearCloseTimer();
    closeTimer = window.setTimeout(close, 150);
  }

  // hover 触发:移入触发元素/面板保持打开,移出后延时关闭(留出鼠标从触发元素滑到面板的时间)
  function onTriggerEnter() {
    if (isHover.value) open();
  }
  function onPanelEnter() {
    if (isHover.value) clearCloseTimer();
  }
  function onLeave() {
    if (isHover.value) scheduleClose();
  }

  // click 触发:点击切换;点击外部关闭
  function onTriggerClick() {
    if (!isClick.value) return;
    visible.value ? close() : open();
  }
  function onDocMouseDown(e: MouseEvent) {
    const target = e.target as Node;
    if (triggerRef.value?.contains(target) || panelRef.value?.contains(target)) return;
    close();
  }

  function onItemClick(item: BDropdownOption) {
    item.function?.();
    close();
  }

  onBeforeUnmount(() => {
    clearCloseTimer();
    window.removeEventListener('scroll', computePosition, true);
    window.removeEventListener('resize', computePosition);
    document.removeEventListener('mousedown', onDocMouseDown, true);
  });
</script>

<style lang="less" scoped>
  .b-dropdown-trigger {
    display: inline-flex;
    align-items: center;
  }
</style>

<style lang="less">
  /* 非 scoped:面板 Teleport 到 body,scoped 选择器命不中 */
  .b-dropdown-panel {
    position: fixed;
    z-index: 100050; /* 高于导航栏 */
    padding: 4px;
    border-radius: 8px;
    background: var(--menu-body-bg-color);
    color: var(--text-color);
    box-shadow:
      0 6px 16px 0 rgba(0, 0, 0, 0.08),
      0 3px 6px -4px rgba(0, 0, 0, 0.12),
      0 9px 28px 8px rgba(0, 0, 0, 0.05);
  }
  .b-dropdown-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 12px;
    border-radius: 4px;
    font-size: 14px;
    line-height: 22px;
    color: var(--text-color);
    cursor: pointer;
    white-space: nowrap;
    transition: background-color 0.2s;
  }
  .b-dropdown-item:hover {
    background-color: var(--menu-item-h-bg-color);
  }
  .b-dropdown-fade-enter-active,
  .b-dropdown-fade-leave-active {
    transition:
      opacity 0.15s ease,
      transform 0.15s ease;
  }
  .b-dropdown-fade-enter-from,
  .b-dropdown-fade-leave-to {
    opacity: 0;
    transform: translateY(-4px);
  }
</style>
