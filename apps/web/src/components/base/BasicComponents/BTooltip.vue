<template>
  <span
    ref="wrapRef"
    class="b-tooltip-wrap"
    @mouseenter="show"
    @mouseleave="hide"
    @click.capture="dismissAfterActivation"
  >
    <slot />
    <Teleport to="body">
      <div v-show="visible" class="b-tooltip-popup" ref="popupRef" :style="resolvedPopupStyle">
        {{ title }}
      </div>
    </Teleport>
  </span>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
  import { getRootZoom } from '@/utils/zoom';

  const props = defineProps<{
    title: string;
    always?: boolean;
    disabled?: boolean;
    delay?: number;
    zIndex?: number;
  }>();

  const visible = ref(false);
  const popupRef = ref<HTMLElement>();
  const wrapRef = ref<HTMLElement>();
  const popupStyle = reactive({ top: '0px', left: '0px' });
  const resolvedPopupStyle = computed(() => ({ ...popupStyle, zIndex: props.zIndex ?? 1100 }));
  let timer: ReturnType<typeof setTimeout> | null = null;
  let suppressedUntilPointerLeaves = false;

  function clearTimer() {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  }

  function show() {
    if (suppressedUntilPointerLeaves || props.disabled || (!props.always && window.innerWidth < 1024)) return;
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      visible.value = true;
      // 等待 DOM 更新后计算位置
      requestAnimationFrame(() => {
        const wrap = wrapRef.value;
        const popup = popupRef.value;
        if (!wrap || !popup) return;
        // 界面缩放(html zoom):gBCR 含 zoom → ÷ zoom 换布局坐标;popup 尺寸用 offsetWidth/Height(布局像素)
        const zoom = getRootZoom();
        const wrapRect = wrap.getBoundingClientRect();
        const wTop = wrapRect.top / zoom;
        const wBottom = wrapRect.bottom / zoom;
        const wLeft = wrapRect.left / zoom;
        const wWidth = wrapRect.width / zoom;
        const pW = popup.offsetWidth;
        const pH = popup.offsetHeight;
        const centerX = wLeft + wWidth / 2 - pW / 2;
        if (wTop > pH + 10) {
          popupStyle.top = `${wTop - pH - 6}px`;
        } else {
          popupStyle.top = `${wBottom + 6}px`;
        }
        // documentElement.clientWidth 是视口宽(视觉像素),÷zoom 换布局坐标再与 centerX/pW(布局)比较
        popupStyle.left = `${Math.max(4, Math.min(centerX, document.documentElement.clientWidth / zoom - pW - 4))}px`;
      });
    }, props.delay ?? 0);
  }
  function hide() {
    suppressedUntilPointerLeaves = false;
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      visible.value = false;
    }, 150);
  }

  function dismissAfterActivation() {
    suppressedUntilPointerLeaves = true;
    clearTimer();
    visible.value = false;
  }

  watch(
    () => props.disabled,
    (disabled) => {
      if (!disabled) return;
      clearTimer();
      suppressedUntilPointerLeaves = false;
      visible.value = false;
    },
  );

  onBeforeUnmount(() => {
    clearTimer();
  });
</script>

<style scoped>
  .b-tooltip-wrap {
    display: inline-flex;
    align-items: center;
    position: relative;
  }
  .b-tooltip-popup {
    position: fixed;
    padding: 6px 12px;
    border-radius: 8px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-color);
    background: var(--menu-body-bg-color);
    /* 固定 1100,高于所有容器(弹框 700 / 抽屉 600 / 覆盖层 900 / 搜索 1000):任何容器内的 tooltip 都不会被盖。 */
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
    z-index: 1100;
    pointer-events: none;
    max-width: 280px;
    white-space: normal;
    text-align: center;
  }
</style>
