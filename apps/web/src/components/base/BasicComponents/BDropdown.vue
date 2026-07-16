<template>
  <span
    ref="triggerRef"
    class="b-dropdown-trigger"
    @mouseenter="onTriggerEnter"
    @mouseleave="onLeave"
    @click="onTriggerClick"
  >
    <slot />
    <Teleport :to="teleportTarget">
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
            :class="{ 'b-dropdown-item--danger': item.danger }"
            @click="onItemClick(item)"
          >
            <svg-icon v-if="item.icon" :src="item.icon" />
            <span>{{ item.label }}</span>
          </div>
        </div>
      </transition>
    </Teleport>
  </span>
</template>

<script lang="ts" setup>
  import { computed, onBeforeUnmount, nextTick, reactive, ref } from 'vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { getRootZoom } from '@/utils/zoom';

  type BDropdownTrigger = 'hover' | 'click';

  interface BDropdownOption {
    label: string;
    icon?: string;
    danger?: boolean;
    function?: () => void;
  }

  const props = withDefaults(
    defineProps<{
      menuOptions: BDropdownOption[];
      trigger?: BDropdownTrigger | BDropdownTrigger[];
      overlayClassName?: string;
      // 浮层相对触发元素的水平对齐:left(默认,左边对齐)/ center(居中)/ right(右边对齐)
      align?: 'left' | 'center' | 'right';
      // 与 antd 一致:返回浮层挂载的容器(默认 body)。用于把浮层挂进某个定位容器,
      // 例如个人中心把设置下拉挂进 .user-card,使「鼠标移到下拉上」仍算在卡片内、悬浮卡不关闭。
      getPopupContainer?: (trigger: HTMLElement) => HTMLElement | null;
    }>(),
    {
      trigger: 'hover',
      align: 'left',
    },
  );

  const emit = defineEmits<{
    openChange: [open: boolean];
  }>();

  const triggerRef = ref<HTMLElement | null>(null);
  const panelRef = ref<HTMLElement | null>(null);
  const visible = ref(false);
  const teleportTarget = ref<HTMLElement | string>('body');
  const panelStyle = reactive<Record<string, string>>({ position: 'fixed', top: '0px', left: '0px', minWidth: '0px' });
  let closeTimer: number | null = null;

  const triggerModes = computed(() => (Array.isArray(props.trigger) ? props.trigger : [props.trigger]));
  const isHover = computed(() => triggerModes.value.includes('hover'));
  const isClick = computed(() => triggerModes.value.includes('click'));

  // 定位:贴触发元素正下方、左对齐(同 antd 默认 bottomLeft)。
  // 挂在 body 用 fixed(视口坐标);挂在自定义定位容器用相对容器的 absolute(规避容器 transform 破坏 fixed)。
  function computePosition() {
    const el = triggerRef.value;
    if (!el) return;
    const zoom = getRootZoom();
    const rect = el.getBoundingClientRect();
    const rTop = rect.top / zoom;
    const rBottom = rect.bottom / zoom;
    const rLeft = rect.left / zoom;
    const rRight = rect.right / zoom;
    const rWidth = rect.width / zoom;
    const panelW = panelRef.value?.offsetWidth ?? 0;
    // 按 align 算浮层期望的视口左边界:left 对齐触发元素左边,center 居中,right 对齐右边
    let vLeft = rLeft;
    if (props.align === 'center') vLeft = rLeft + rWidth / 2 - panelW / 2;
    else if (props.align === 'right') vLeft = rRight - panelW;
    // 统一用 fixed(视口坐标),不依赖容器是否为定位元素 —— 原 absolute 分支在静态容器下会错位(缩放尤甚)。
    // 口径:getBoundingClientRect=视觉(÷zoom 得布局);offsetWidth=布局;clientWidth=视觉(÷zoom 得布局);style=布局。
    let left = vLeft;
    const vw = document.documentElement.clientWidth / zoom; // 视口宽(布局像素)
    if (panelW && left + panelW > vw - 8) left = vw - panelW - 8;
    if (left < 8) left = 8;
    panelStyle.position = 'fixed';
    panelStyle.top = `${rBottom + 6}px`;
    panelStyle.left = `${left}px`;
    panelStyle.minWidth = `${Math.ceil(rWidth)}px`;
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
    teleportTarget.value = (props.getPopupContainer?.(triggerRef.value as HTMLElement) as HTMLElement | null) || 'body';
    visible.value = true;
    emit('openChange', true);
    nextTick(computePosition);
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

  // hover:移入触发元素/面板保持打开,移出延时关闭(留出从触发元素滑到面板的时间)
  function onTriggerEnter() {
    if (isHover.value) open();
  }
  function onPanelEnter() {
    if (isHover.value) clearCloseTimer();
  }
  function onLeave() {
    if (isHover.value) scheduleClose();
  }

  // click:点击切换;点击外部关闭
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
  /* 用 block 而非 inline-flex:antd 原来不加包裹层,触发元素直接参与父布局。
     block 在弹性/网格容器里是内容宽度的项(导航、文件菜单不受影响),
     在块级列表里是整行(个人中心主题/语言恢复各占一行,不再挤成一行)。 */
  .b-dropdown-trigger {
    display: block;
  }
</style>

<style lang="less">
  /* 非 scoped:面板 Teleport 到 body/自定义容器,scoped 选择器命不中 */
  .b-dropdown-panel {
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
  .b-dropdown-item--danger {
    color: var(--danger-color, #f04455);
  }
  .b-dropdown-item--danger:hover {
    background: color-mix(in srgb, var(--danger-color, #f04455) 9%, var(--menu-body-bg-color));
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
