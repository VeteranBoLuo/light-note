<template>
  <span
    class="b-dropdown-wrap"
    ref="wrapRef"
    @mouseenter="onEnter"
    @mouseleave="onLeave"
    @click="onClick"
  >
    <slot />
    <Teleport to="body">
      <Transition name="b-dropdown-fade">
        <div
          v-show="visible"
          class="b-dropdown-popup"
          :class="overlayClassName"
          ref="popupRef"
          :style="popupStyle"
          @mouseenter="onEnter"
          @mouseleave="onLeave"
        >
          <div
            v-for="item in menuOptions"
            :key="item.label"
            class="b-dropdown-item"
            @click="itemClick(item)"
          >
            <svg-icon v-if="item.icon" :src="item.icon" size="16" />
            <span>{{ item.label }}</span>
          </div>
        </div>
      </Transition>
    </Teleport>
  </span>
</template>

<script setup lang="ts">
  import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';

  export type BDropdownTrigger = 'hover' | 'click';

  const props = withDefaults(
    defineProps<{
      menuOptions: { label: string; icon?: string; function?: () => void }[];
      trigger?: BDropdownTrigger | BDropdownTrigger[];
      placement?: string;
      overlayClassName?: string;
      /** @deprecated 自定义实现始终 Teleport 到 body，此 prop 保留兼容但无效 */
      getPopupContainer?: (trigger: HTMLElement) => HTMLElement;
    }>(),
    {
      trigger: 'hover',
    },
  );

  const emit = defineEmits<{
    openChange: [open: boolean];
  }>();

  const isClickTrigger = computed(() => {
    const t = props.trigger;
    return Array.isArray(t) ? t.includes('click') : t === 'click';
  });

  const isHoverTrigger = computed(() => {
    const t = props.trigger;
    return Array.isArray(t) ? t.includes('hover') : t !== 'click';
  });

  const visible = ref(false);
  const wrapRef = ref<HTMLElement>();
  const popupRef = ref<HTMLElement>();
  const popupStyle = reactive({ top: '0px', left: '0px' });
  let timer: ReturnType<typeof setTimeout> | null = null;

  function show() {
    if (timer) clearTimeout(timer);
    visible.value = true;
    emit('openChange', true);
    requestAnimationFrame(() => {
      positionPopup();
    });
  }

  function hide() {
    if (timer) clearTimeout(timer);
    visible.value = false;
    emit('openChange', false);
  }

  function positionPopup() {
    const wrap = wrapRef.value;
    const popup = popupRef.value;
    if (!wrap || !popup) return;
    const wrapRect = wrap.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();
    const centerX = wrapRect.left + wrapRect.width / 2 - popupRect.width / 2;
    popupStyle.top = `${wrapRect.bottom + 6}px`;
    popupStyle.left = `${Math.max(8, Math.min(centerX, window.innerWidth - popupRect.width - 8))}px`;
  }

  function onEnter() {
    if (!isHoverTrigger.value) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(show, 50);
  }

  function onLeave() {
    if (!isHoverTrigger.value) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(hide, 200);
  }

  function onClick(e: MouseEvent) {
    if (!isClickTrigger.value) return;
    e.stopPropagation();
    if (visible.value) {
      hide();
    } else {
      show();
    }
  }

  function onDocumentClick(e: MouseEvent) {
    if (!isClickTrigger.value || !visible.value) return;
    const target = e.target as Node;
    const wrap = wrapRef.value;
    const popup = popupRef.value;
    if (
      wrap &&
      !wrap.contains(target) &&
      popup &&
      !popup.contains(target)
    ) {
      hide();
    }
  }

  function itemClick(item: { label: string; icon?: string; function?: () => void }) {
    item.function?.();
    hide();
  }

  onMounted(() => {
    document.addEventListener('click', onDocumentClick, true);
  });

  onUnmounted(() => {
    document.removeEventListener('click', onDocumentClick, true);
  });
</script>

<style scoped>
  .b-dropdown-wrap {
    display: inline-flex;
    align-items: center;
    position: relative;
  }

  .b-dropdown-popup {
    position: fixed;
    z-index: 9999;
    min-width: 120px;
    padding: 6px 0;
    border-radius: 10px;
    background: var(--menu-body-bg-color);
    border: 1px solid var(--card-border-color);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
    overflow: hidden;
  }

  .b-dropdown-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 24px;
    font-size: 14px;
    line-height: 1.5;
    cursor: pointer;
    color: var(--text-color);
    white-space: nowrap;
    transition: background 0.15s;
  }

  .b-dropdown-item:hover {
    background: var(--menu-item-h-bg-color);
  }

  .b-dropdown-fade-enter-active,
  .b-dropdown-fade-leave-active {
    transition: opacity 0.15s ease, transform 0.15s ease;
  }

  .b-dropdown-fade-enter-from,
  .b-dropdown-fade-leave-to {
    opacity: 0;
    transform: translateY(-4px);
  }

  .b-dropdown-fade-enter-to,
  .b-dropdown-fade-leave-from {
    opacity: 1;
    transform: translateY(0);
  }
</style>
