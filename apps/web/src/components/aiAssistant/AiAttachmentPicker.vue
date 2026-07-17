<template>
  <div class="ai-attachment-picker" :class="{ 'has-attachment': modelValue.length > 0 }">
    <div v-if="modelValue.length" class="attachment-card" :class="`is-${modelValue[0].status}`">
      <span class="attachment-icon"><SvgIcon :src="icon.cloudSpace.preview.unknown" size="18" /></span>
      <span class="attachment-copy">
        <strong>{{ modelValue[0].fileName }}</strong>
        <small>{{ statusLabel(modelValue[0]) }}</small>
      </span>
      <BButton v-if="modelValue[0].status === 'failed'" size="small" :loading="busy" @click="retryAttachment">
        <SvgIcon :src="icon.cloudSpace.preview.retry" size="13" />
        {{ t('ai.retryAttachment') }}
      </BButton>
      <BButton size="small" :disabled="busy" @click="removeAttachment">{{ t('ai.removeAttachment') }}</BButton>
    </div>

    <div v-if="readyAttachment" class="attachment-shortcuts">
      <BButton size="small" @click="emit('prompt', t('ai.attachmentSummaryPrompt'))">
        {{ t('ai.summarizeAttachment') }}
      </BButton>
      <BButton size="small" @click="emit('prompt', t('ai.attachmentNotePrompt'))">
        {{ t('ai.createNoteFromAttachment') }}
      </BButton>
    </div>

    <BUpload
      v-if="!modelValue.length"
      :multiple="false"
      raw-file
      accept=".txt,.md,.markdown,.csv,.pdf,.docx,.png,.jpg,.jpeg,.webp"
      :max-total-size="20 * 1024 * 1024"
      @change="uploadLocal"
    >
      <BButton size="small" :loading="busy">
        <SvgIcon :src="icon.file_upload" size="14" />
        {{ t('ai.uploadFile') }}
      </BButton>
    </BUpload>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import icon from '@/config/icon';
  import {
    attachAiCloudFile,
    deleteAiAttachment,
    fetchAiAttachmentStatuses,
    retryAiAttachment,
    uploadAiAttachment,
    type AiAttachment,
  } from '@/api/aiAttachmentApi';

  const props = defineProps<{ modelValue: AiAttachment[] }>();
  const emit = defineEmits<{
    'update:modelValue': [value: AiAttachment[]];
    prompt: [value: string];
  }>();
  const { t } = useI18n();
  const busy = ref(false);
  let pollTimer: number | null = null;
  let pollAttempts = 0;

  const readyAttachment = computed(() => props.modelValue.find((item) => item.status === 'ready'));

  watch(
    () => props.modelValue.map((item) => `${item.id}:${item.status}`).join(','),
    () => {
      if (props.modelValue.some((item) => ['queued', 'parsing'].includes(item.status))) startPolling();
      else stopPolling();
    },
    { immediate: true },
  );

  function formatBytes(value: number) {
    const bytes = Number(value || 0);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function statusLabel(attachment: AiAttachment) {
    if (attachment.status === 'ready') return `${formatBytes(attachment.fileSize)} · ${t('ai.attachmentReady')}`;
    if (attachment.status === 'failed') return attachment.errorMessage || t('ai.attachmentFailed');
    return `${formatBytes(attachment.fileSize)} · ${t(`ai.attachmentStatus.${attachment.status}`)}`;
  }

  function showAttachmentError(error: any, fallback: string) {
    // HTTP 层已经对 429 做了带 key 的全局提示，这里不再重复弹第二条。
    if (error?.code === 'HTTP_429') return;
    message.error(error?.message || fallback);
  }

  async function uploadLocal(files: File[]) {
    const file = files?.[0];
    if (!file || busy.value) return;
    busy.value = true;
    try {
      const attachment = await uploadAiAttachment(file);
      emit('update:modelValue', [attachment]);
      startPolling();
    } catch (error: any) {
      showAttachmentError(error, t('ai.attachmentUploadFailed'));
    } finally {
      busy.value = false;
    }
  }

  async function attachCloudFile(fileId: string) {
    if (busy.value) return;
    const current = props.modelValue[0];
    if (current) {
      if (current.sourceType === 'cloud' && String(current.fileId || '') === String(fileId)) return;
      message.warning(t('ai.removeCurrentAttachmentFirst'));
      return;
    }
    busy.value = true;
    try {
      const attachment = await attachAiCloudFile(fileId);
      emit('update:modelValue', [attachment]);
      startPolling();
    } catch (error: any) {
      showAttachmentError(error, t('ai.attachmentAttachFailed'));
    } finally {
      busy.value = false;
    }
  }

  function stopPolling() {
    if (pollTimer !== null) window.clearTimeout(pollTimer);
    pollTimer = null;
  }

  function startPolling() {
    stopPolling();
    if (!props.modelValue.length) return;
    pollAttempts = 0;
    const poll = async () => {
      const ids = props.modelValue.map((item) => item.id);
      if (!ids.length) return;
      try {
        const statuses = await fetchAiAttachmentStatuses(ids);
        if (statuses.length) emit('update:modelValue', statuses);
        if (statuses.some((item) => ['queued', 'parsing'].includes(item.status)) && pollAttempts < 120) {
          pollAttempts += 1;
          pollTimer = window.setTimeout(poll, 1200);
        }
      } catch {
        if (pollAttempts < 8) {
          pollAttempts += 1;
          pollTimer = window.setTimeout(poll, 1800);
        }
      }
    };
    void poll();
  }

  async function removeAttachment() {
    const attachment = props.modelValue[0];
    if (!attachment) return;
    busy.value = true;
    stopPolling();
    try {
      await deleteAiAttachment(attachment.id);
      emit('update:modelValue', []);
    } catch (error: any) {
      showAttachmentError(error, t('ai.attachmentRemoveFailed'));
      if (['queued', 'parsing'].includes(attachment.status)) startPolling();
    } finally {
      busy.value = false;
    }
  }

  async function retryAttachment() {
    const attachment = props.modelValue[0];
    if (!attachment || busy.value) return;
    busy.value = true;
    try {
      const next = await retryAiAttachment(attachment);
      emit('update:modelValue', [next]);
      startPolling();
    } catch (error: any) {
      showAttachmentError(error, t('ai.attachmentFailed'));
    } finally {
      busy.value = false;
    }
  }

  onBeforeUnmount(() => {
    stopPolling();
  });

  defineExpose({ attachCloudFile });
</script>

<style scoped lang="less">
  .ai-attachment-picker {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    width: auto;
    max-width: 100%;
    min-width: 0;
  }
  .ai-attachment-picker.has-attachment {
    flex: 0 0 100%;
    width: 100%;
  }
  .ai-attachment-picker :deep(.b_btn) {
    gap: 6px;
  }
  .attachment-card {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-width: 0;
    padding: 7px 8px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--primary-color) 7%, var(--background-color));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary-color) 16%, transparent);
  }
  .attachment-card.is-failed {
    background: color-mix(in srgb, #ef4444 8%, var(--background-color));
  }
  .attachment-icon {
    display: grid;
    flex: 0 0 30px;
    height: 30px;
    place-items: center;
    border-radius: 8px;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 11%, transparent);
  }
  .attachment-copy {
    display: grid;
    flex: 1;
    min-width: 0;
    gap: 1px;
  }
  .attachment-copy strong,
  .attachment-copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .attachment-copy strong {
    font-size: 12px;
  }
  .attachment-copy small {
    color: var(--desc-color);
    font-size: 11px;
  }
  .attachment-shortcuts {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
  }
</style>
