<template>
  <span
    ref="triggerRef"
    class="b-dropdown-trigger"
    @mouseenter="onTriggerEnter"
    @mouseleave="onLeave"
    @click="onTriggerClick"
  >
    <slot :open="visible" />
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
          role="menu"
        >
          <template v-for="(item, index) in menuOptions" :key="item.key || item.label || `divider-${index}`">
            <div v-if="item.divider" class="b-dropdown-divider" />
            <BButton
              v-else
              class="b-dropdown-item"
              :class="{ 'b-dropdown-item--danger': item.danger, 'b-dropdown-item--active': item.active }"
              block
              role="menuitem"
              :aria-current="item.active ? 'page' : undefined"
              @click="onItemClick(item)"
            >
              <svg-icon v-if="item.icon" :src="item.icon" size="15" />
              <span>{{ item.label }}</span>
            </BButton>
          </template>
        </div>
      </transition>
    </Teleport>
  </span>
</template>

<script lang="ts" setup>
  import { computed, onBeforeUnmount, nextTick, reactive, ref } from 'vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import { getRootZoom } from '@/utils/zoom';

  type BDropdownTrigger = 'hover' | 'click';

  interface BDropdownOption {
    key?: string;
    label?: string;
    icon?: string;
    danger?: boolean;
    active?: boolean;
    divider?: boolean;
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
  const panelStyle = reactive<Record<string, string>>({
    position: 'fixed',
    top: '0px',
    left: '0px',
    minWidth: '0px',
    maxHeight: 'none',
    overflowY: 'auto',
    visibility: 'hidden',
  });
  let closeTimer: number | null = null;
  let positionFrame: number | null = null;
  let resizeObserver: ResizeObserver | null = null;
  /** 打开时刻，用于忽略上一次滑动的惯性余速(见 onScrollClose) */
  let openedAt = 0;
  const SCROLL_CLOSE_GRACE_MS = 250;

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
    const panelH = panelRef.value?.offsetHeight ?? 0;
    const viewportGap = 8;
    const triggerGap = 6;
    // 按 align 算浮层期望的视口左边界:left 对齐触发元素左边,center 居中,right 对齐右边
    let vLeft = rLeft;
    if (props.align === 'center') vLeft = rLeft + rWidth / 2 - panelW / 2;
    else if (props.align === 'right') vLeft = rRight - panelW;
    // 统一用 fixed(视口坐标),不依赖容器是否为定位元素 —— 原 absolute 分支在静态容器下会错位(缩放尤甚)。
    // 口径:getBoundingClientRect=视觉(÷zoom 得布局);offsetWidth=布局;clientWidth=视觉(÷zoom 得布局);style=布局。
    let left = vLeft;
    const vw = (document.documentElement.clientWidth || window.innerWidth) / zoom; // 视口宽(布局像素)
    const vh = (document.documentElement.clientHeight || window.innerHeight) / zoom; // 视口高(布局像素)
    const maxPanelHeight = Math.max(0, vh - viewportGap * 2);
    const visiblePanelHeight = panelH ? Math.min(panelH, maxPanelHeight) : 0;
    const belowTop = rBottom + triggerGap;
    const aboveTop = rTop - visiblePanelHeight - triggerGap;
    let top = belowTop;
    if (visiblePanelHeight && belowTop + visiblePanelHeight > vh - viewportGap) {
      // 靠近视口底部时优先向上展开；若上下都放不下，则选空间更大的一侧并把面板限制在视口内滚动。
      const spaceAbove = rTop - viewportGap - triggerGap;
      const spaceBelow = vh - rBottom - viewportGap - triggerGap;
      top = aboveTop >= viewportGap || spaceAbove >= spaceBelow ? Math.max(viewportGap, aboveTop) : belowTop;
    }
    if (visiblePanelHeight) top = Math.min(top, Math.max(viewportGap, vh - visiblePanelHeight - viewportGap));
    if (panelW && left + panelW > vw - viewportGap) left = vw - panelW - viewportGap;
    if (left < viewportGap) left = viewportGap;
    panelStyle.position = 'fixed';
    panelStyle.top = `${top}px`;
    panelStyle.left = `${left}px`;
    panelStyle.minWidth = `${Math.ceil(rWidth)}px`;
    panelStyle.maxHeight = `${maxPanelHeight}px`;
    panelStyle.visibility = 'visible';
  }

  function cancelPositionFrame() {
    if (positionFrame === null) return;
    cancelAnimationFrame(positionFrame);
    positionFrame = null;
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
    panelStyle.visibility = 'hidden';
    openedAt = Date.now();
    visible.value = true;
    emit('openChange', true);
    nextTick(() => {
      computePosition();
      // 旧 WebView 在 Teleport 节点首帧完成布局后，菜单宽度可能才稳定；再校准一次避免右对齐漂移。
      cancelPositionFrame();
      positionFrame = requestAnimationFrame(() => {
        positionFrame = null;
        computePosition();
      });
      resizeObserver?.disconnect();
      if (panelRef.value && typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(computePosition);
        resizeObserver.observe(panelRef.value);
      }
    });
    // 滚动关闭而不是跟随重定位：浮层是 fixed 层，内容一滚就与触发元素脱节，
    // 与其让它跟着飘，不如像右键菜单那样直接关掉。resize 仍然重定位(软键盘、窗口变化)。
    window.addEventListener('scroll', onScrollClose, true);
    window.addEventListener('resize', computePosition);
    if (isClick.value) document.addEventListener('mousedown', onDocMouseDown, true);
  }

  function close() {
    clearCloseTimer();
    if (!visible.value) return;
    visible.value = false;
    emit('openChange', false);
    cancelPositionFrame();
    resizeObserver?.disconnect();
    resizeObserver = null;
    window.removeEventListener('scroll', onScrollClose, true);
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

  /**
   * 内容滚动即关闭，和 RightMenu(右键菜单)一个手感，不必点空白处才能关。
   *
   * 用捕获阶段的 scroll 而不是 RightMenu 那样的 wheel：wheel 只覆盖鼠标滚轮，
   * 移动端的触摸与惯性滚动收不到，而这个菜单在手机上的笔记卡片/文件列表里最常用。
   * scroll 不冒泡，但捕获阶段能收到任意滚动容器的事件。
   */
  function onScrollClose(e: Event) {
    // 面板自身滚动(菜单项多到内部出滚动条)不算「内容滚动」
    const target = e.target;
    if (target instanceof Node && panelRef.value?.contains(target)) return;
    // 手机上滑完列表立刻点「更多」时，惯性滚动的余速会在菜单打开后继续派发 scroll，
    // 留一小段宽限期，免得菜单刚开就被上一次滑动的余速关掉。
    if (Date.now() - openedAt < SCROLL_CLOSE_GRACE_MS) return;
    close();
  }

  function onItemClick(item: BDropdownOption) {
    if (item.divider) return;
    item.function?.();
    close();
  }

  onBeforeUnmount(() => {
    clearCloseTimer();
    cancelPositionFrame();
    resizeObserver?.disconnect();
    window.removeEventListener('scroll', onScrollClose, true);
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
    z-index: 800; /* 高于导航栏 */
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
    height: auto;
    justify-content: flex-start;
    border: 0 !important;
    border-radius: 4px;
    background: transparent !important;
    font-size: 14px;
    line-height: 22px;
    color: var(--text-color);
    cursor: pointer;
    white-space: nowrap;
    transition: background-color 0.2s;
  }
  .b-dropdown-item:hover {
    background-color: var(--menu-item-h-bg-color) !important;
  }
  .b-dropdown-item--active {
    border-left: 3px solid var(--primary-color) !important;
    color: var(--primary-color);
    font-weight: 650;
    background: var(--menu-item-h-bg-color) !important;
  }
  .b-dropdown-item--danger {
    color: var(--danger-color, #f04455);
  }
  .b-dropdown-item--danger:hover {
    background: color-mix(in srgb, var(--danger-color, #f04455) 9%, var(--menu-body-bg-color));
  }
  .b-dropdown-divider {
    height: 1px;
    margin: 4px 8px;
    background: var(--card-border-color);
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
