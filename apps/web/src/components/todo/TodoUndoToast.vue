<template>
  <section
    class="todo-undo-toast"
    :class="{ 'is-mobile': mobile }"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
    @focusin="focused = true"
    @focusout="onFocusOut"
  >
    <SvgIcon class="todo-undo-toast__success" :src="icon.message.success" size="20" aria-hidden="true" />
    <span class="todo-undo-toast__message" role="status" aria-live="polite" aria-atomic="true">{{
      t(action.kind === 'delete' ? 'inbox.todoDeletedCount' : 'inbox.todoCompletedCount', { count: action.ids.length })
    }}</span>
    <BButton class="todo-undo-toast__undo" type="text" size="small" :loading="loading" @click="emit('undo')">{{
      t('common.undo')
    }}</BButton>
    <BButton
      class="todo-undo-toast__close"
      type="text"
      size="small"
      icon-only
      :disabled="loading"
      :aria-label="t('common.close')"
      @click="emit('dismiss')"
    >
      <SvgIcon :src="icon.common.close" size="18" aria-hidden="true" />
    </BButton>
  </section>
</template>
<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  const props = defineProps<{
    action: { kind: 'complete' | 'delete'; ids: string[] };
    loading: boolean;
    mobile: boolean;
  }>();
  const emit = defineEmits<{ undo: []; dismiss: [] }>();
  const { t } = useI18n();
  const hovered = ref(false);
  const focused = ref(false);
  const paused = computed(() => hovered.value || focused.value || props.loading);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let remaining = 10_000;
  let started = 0;
  function stop() {
    if (timer !== undefined) {
      clearTimeout(timer);
      remaining = Math.max(0, remaining - (Date.now() - started));
      timer = undefined;
    }
  }
  function start() {
    if (paused.value) return;
    started = Date.now();
    timer = setTimeout(() => {
      timer = undefined;
      emit('dismiss');
    }, remaining);
  }
  function onFocusOut(event: FocusEvent) {
    focused.value = !!event.relatedTarget && (event.currentTarget as HTMLElement).contains(event.relatedTarget as Node);
  }
  watch(
    () => props.action,
    () => {
      stop();
      remaining = 10_000;
      start();
    },
    { immediate: true },
  );
  watch(paused, () => {
    stop();
    start();
  });
  onBeforeUnmount(stop);
</script>
<style scoped lang="less">
  .todo-undo-toast {
    position: fixed;
    z-index: 300;
    bottom: 18px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 8px;
    width: max-content;
    max-width: calc(100% - 24px);
    box-sizing: border-box;
    padding: 6px 8px 6px 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--card-background);
    color: var(--text-color);
    box-shadow: var(--action-menu-shadow);
  }
  .todo-undo-toast__success {
    color: var(--success-color);
    flex-shrink: 0;
  }
  .todo-undo-toast__message {
    min-width: 0;
    font-size: 13px;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
  .todo-undo-toast__undo {
    color: var(--workspace-purple-text);
    flex-shrink: 0;
  }
  .todo-undo-toast__close {
    color: var(--desc-color);
    flex-shrink: 0;
  }
  .todo-undo-toast.is-mobile {
    position: fixed;
    bottom: calc(68px + env(safe-area-inset-bottom));
    padding: 4px 6px 4px 12px;
    .todo-undo-toast__undo,
    .todo-undo-toast__close {
      min-width: 44px;
      min-height: 44px;
    }
  }
</style>
