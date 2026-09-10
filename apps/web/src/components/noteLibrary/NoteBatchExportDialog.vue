<template>
  <BModal
    :visible="visible"
    @update:visible="emit('update:visible', $event)"
    :title="t('note.batchExportTitle')"
    width="min(760px, 92vw)"
    fullscreen-mobile
    :close-disabled="busy"
    :mask-closable="!busy"
    :esc-closable="!busy"
    :history-closable="!busy"
  >
    <div class="export-dialog-body" :class="{ 'is-mobile': mobile }" v-auto-scrollbar>
      <NoteExportOptions v-model="settings" :notes="notes" :busy="busy" />
      <p v-if="error" class="export-dialog-error" role="alert">{{ error }}</p>
      <p v-if="busy" role="status">{{ t('noteExportSettings.preparing', { completed, total: notes.length }) }}</p>
    </div>
    <template #footer>
      <div class="export-dialog-footer" :class="{ 'is-mobile': mobile }">
        <BButton :disabled="busy" @click="emit('update:visible', false)">{{ t('noteExportSettings.close') }}</BButton>
        <BButton
          type="primary"
          :disabled="
            busy || !notes.length || (settings.packaging === 'merged' && notes.some((n) => n.type === 'drawing'))
          "
          :loading="busy"
          @click="emit('export')"
          >{{ t('noteExportSettings.export') }}</BButton
        >
      </div>
    </template>
  </BModal>
</template>
<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import { useMobileLayout } from '@/composables/useMobileLayout';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import NoteExportOptions from './NoteExportOptions.vue';
  import type { BatchExportNote, NoteExportSettings } from '@/utils/noteBatchExport';
  defineProps<{ visible: boolean; notes: BatchExportNote[]; busy: boolean; error: string; completed: number }>();
  const settings = defineModel<NoteExportSettings>('settings', { required: true });
  const emit = defineEmits<{ 'update:visible': [value: boolean]; export: [] }>();
  const { t } = useI18n();
  const mobile = useMobileLayout();
</script>
<style scoped lang="less">
  .export-dialog-body.is-mobile {
    height: 100%;
    min-height: 0;
    overflow-y: auto;
    padding: 16px;
    overscroll-behavior: contain;
  }
  .export-dialog-footer {
    flex-shrink: 0;
    padding: 10px 20px calc(10px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--surface-border-color);
    display: flex;
    justify-content: flex-end;
    gap: 12px;
  }
  .export-dialog-footer.is-mobile :deep(.b_btn) {
    height: 44px;
  }
  .export-dialog-error {
    color: var(--error-color);
    line-height: 1.6;
  }
</style>
