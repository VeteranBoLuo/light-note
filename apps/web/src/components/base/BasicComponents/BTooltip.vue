<template>
  <span
    ref="wrapRef"
    class="b-tooltip-wrap"
    @mouseenter="show"
    @mouseleave="hide"
    @mousemove="trackCursor"
    @pointerdown.capture="dismissCursorTooltip"
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
  import { useUiDensity } from '@/composables/useUiDensity';
  import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';

  const props = defineProps<{
    title: string;
    always?: boolean;
    disabled?: boolean;
    delay?: number;
    followCursor?: boolean;
    zIndex?: number;
  }>();

  const visible = ref(false);
  const popupRef = ref<HTMLElement>();
  const wrapRef = ref<HTMLElement>();
  const popupStyle = reactive({ top: '0px', left: '0px' });
  const resolvedPopupStyle = computed(() => ({ ...popupStyle, zIndex: props.zIndex ?? 1100 }));
  let timer: ReturnType<typeof setTimeout> | null = null;
  let suppressedUntilPointerLeaves = false;
  let cursorX = 0;
  let cursorY = 0;

  function clearTimer() {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  }

  function updatePosition() {
    const wrap = wrapRef.value;
    const popup = popupRef.value;
    if (!visible.value || !wrap || !popup) return;

    const pW = popup.offsetWidth;
    const pH = popup.offsetHeight;
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    if (props.followCursor) {
      const x = cursorX;
      const y = cursorY;
      const gap = 12;
      const left = x + gap + pW <= viewportWidth - 4 ? x + gap : x - gap - pW;
      const top = y + gap + pH <= viewportHeight - 4 ? y + gap : y - gap - pH;
      popupStyle.left = `${Math.max(4, Math.min(left, viewportWidth - pW - 4))}px`;
      popupStyle.top = `${Math.max(4, Math.min(top, viewportHeight - pH - 4))}px`;
      return;
    }
    const rect = wrap.getBoundingClientRect();
    const top = rect.top;
    const centerX = rect.left + rect.width / 2 - pW / 2;
    popupStyle.top = `${top > pH + 10 ? top - pH - 6 : rect.bottom + 6}px`;
    popupStyle.left = `${Math.max(4, Math.min(centerX, viewportWidth - pW - 4))}px`;
  }

  function trackCursor(event: MouseEvent) {
    if (!props.followCursor) return;
    cursorX = event.clientX;
    cursorY = event.clientY;
    if (event.buttons) {
      dismissAfterActivation();
      return;
    }
    updatePosition();
  }

  function dismissCursorTooltip() {
    if (props.followCursor) dismissAfterActivation();
  }

  function show(event: MouseEvent) {
    trackCursor(event);
    if (suppressedUntilPointerLeaves || props.disabled || (!props.always && window.innerWidth < 1024)) return;
    clearTimer();
    timer = setTimeout(async () => {
      timer = null;
      visible.value = true;
      await nextTick();
      updatePosition();
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

  watch(
    () => visible.value,
    (tracking, _, onCleanup) => {
      if (!tracking) return;
      const viewport = window.visualViewport;
      const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updatePosition);
      if (wrapRef.value) observer?.observe(wrapRef.value);
      if (popupRef.value) observer?.observe(popupRef.value);
      viewport?.addEventListener('resize', updatePosition);
      viewport?.addEventListener('scroll', updatePosition);
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
      onCleanup(() => {
        observer?.disconnect();
        viewport?.removeEventListener('resize', updatePosition);
        viewport?.removeEventListener('scroll', updatePosition);
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
      });
    },
  );

  onBeforeUnmount(() => {
    clearTimer();
  });
  const { density } = useUiDensity();
  watch(density, () => {
    if (visible.value) nextTick(updatePosition);
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
    padding: var(--ui-space-6, 6px) var(--ui-space-12, 12px);
    border-radius: 8px;
    font-size: var(--ui-font-12, 12px);
    line-height: 1.5;
    color: var(--text-color);
    background: var(--menu-body-bg-color);
    /* 固定 1100,高于所有容器(弹框 700 / 抽屉 600 / 覆盖层 900 / 搜索 1000):任何容器内的 tooltip 都不会被盖。 */
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
    z-index: 1100;
    pointer-events: none;
    max-width: var(--ui-layout-280, 280px);
    white-space: normal;
    text-align: center;
  }
</style>
