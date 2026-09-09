<template>
  <BModal
    v-if="exportMode"
    :visible="visible"
    @update:visible="emit('update:visible', $event)"
    :title="title"
    :width="width"
    :close-disabled="busy"
    :mask-closable="!busy"
    :esc-closable="!busy"
    :history-closable="!busy"
    fullscreen-mobile
  >
    <slot /><template #footer><slot name="footer" /></template>
  </BModal>
  <BDrawer
    v-else
    :open="visible"
    :title="title"
    width="760px"
    mobile-full-screen
    body-padding="0"
    :close-disabled="busy"
    :mask-closable="false"
    :history-closable="false"
    @close="emit('update:visible', false)"
  >
    <div class="transfer-shell">
      <div class="transfer-shell__navigation"><slot name="navigation" /></div>
      <slot />
      <slot name="footer" />
    </div>
  </BDrawer>
</template>
<script setup lang="ts">
  import { nextTick, onBeforeUnmount, watch } from 'vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import { useMobileLayout } from '@/composables/useMobileLayout';
  import {
    registerMobileOverlayHistory,
    releaseMobileOverlayHistory,
    type MobileOverlayHistoryHandle,
  } from '@/utils/mobileOverlayHistory';
  const props = defineProps<{
    visible: boolean;
    title: string;
    width: string;
    exportMode: boolean;
    busy: boolean;
    canBack: boolean;
  }>();
  const emit = defineEmits<{ 'update:visible': [value: boolean]; back: [] }>();
  const mobile = useMobileLayout();
  let handle: MobileOverlayHistoryHandle | null = null;
  function onBack() {
    handle = null;
    if (!props.visible) return;
    if (!props.busy) {
      if (props.canBack) emit('back');
      else emit('update:visible', false);
    }
    // One drawer history entry survives internal navigation; nested previews retain their own entries.
    void nextTick(() => {
      if (props.visible && mobile.value && !props.exportMode && !handle) handle = registerMobileOverlayHistory(onBack);
    });
  }
  watch(
    () => [props.visible, props.exportMode, mobile.value],
    () => {
      if (props.visible && !props.exportMode && mobile.value) {
        if (!handle) handle = registerMobileOverlayHistory(onBack);
      } else {
        releaseMobileOverlayHistory(handle);
        handle = null;
      }
    },
    { immediate: true },
  );
  onBeforeUnmount(() => releaseMobileOverlayHistory(handle));
</script>
<style scoped lang="less">
  .transfer-shell {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--workspace-open-canvas);
  }
  .transfer-shell__navigation {
    flex: none;
    padding: 12px 24px;
    border-bottom: 1px solid var(--surface-border-color);
  }
  .transfer-shell :deep(.note-transfer) {
    flex: 1;
    height: auto;
    min-height: 0;
    overflow-y: auto;
    padding: 24px;
    gap: 18px;
    overscroll-behavior: contain;
  }
  .transfer-shell :deep(.note-transfer.is-mobile) {
    padding: 16px;
  }
  .transfer-shell :deep(.note-transfer__footer) {
    background: var(--workspace-open-canvas);
  }
</style>
