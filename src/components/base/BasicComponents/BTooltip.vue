<template>
  <span class="b-tooltip-wrap" @mouseenter="show" @mouseleave="hide" ref="wrapRef">
    <slot />
    <Teleport to="body">
      <div v-show="visible" class="b-tooltip-popup" ref="popupRef" :style="popupStyle">
        {{ title }}
      </div>
    </Teleport>
  </span>
</template>

<script setup lang="ts">
  import { ref, reactive } from 'vue';

  const props = defineProps<{
    title: string;
    always?: boolean;
    delay?: number;
  }>();

  const visible = ref(false);
  const popupRef = ref<HTMLElement>();
  const wrapRef = ref<HTMLElement>();
  const popupStyle = reactive({ top: '0px', left: '0px' });
  let timer: ReturnType<typeof setTimeout> | null = null;

  function show() {
    if (!props.always && window.innerWidth < 1024) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      visible.value = true;
      // 等待 DOM 更新后计算位置
      requestAnimationFrame(() => {
        const wrap = wrapRef.value;
        const popup = popupRef.value;
        if (!wrap || !popup) return;
        const wrapRect = wrap.getBoundingClientRect();
        const popupRect = popup.getBoundingClientRect();
        const centerX = wrapRect.left + wrapRect.width / 2 - popupRect.width / 2;
        if (wrapRect.top > popupRect.height + 10) {
          popupStyle.top = `${wrapRect.top - popupRect.height - 6}px`;
        } else {
          popupStyle.top = `${wrapRect.bottom + 6}px`;
        }
        popupStyle.left = `${Math.max(4, Math.min(centerX, window.innerWidth - popupRect.width - 4))}px`;
      });
    }, props.delay ?? 0);
  }
  function hide() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      visible.value = false;
    }, 150);
  }
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
    box-shadow: 0 4px 16px rgba(0,0,0,0.12);
    z-index: 9999;
    pointer-events: none;
    max-width: 280px;
    white-space: normal;
    text-align: center;
  }
</style>
