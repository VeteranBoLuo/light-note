<template>
  <div class="ai-attachment-picker" :class="{ 'has-attachment': modelValue.length > 0 }">
    <div
      v-if="currentAttachment && attachmentPresentation"
      class="attachment-card"
      :class="[`is-${currentAttachment.status}`, { 'is-processing': attachmentPresentation.isProcessing }]"
      :aria-busy="attachmentPresentation.isProcessing"
    >
      <span class="attachment-icon"><SvgIcon :src="icon.cloudSpace.preview.unknown" size="18" /></span>
      <span class="attachment-copy">
        <strong :title="currentAttachment.fileName">{{ currentAttachment.fileName }}</strong>
        <span class="attachment-meta">
          <span class="attachment-size">{{ formatBytes(currentAttachment.fileSize) }}</span>
          <template v-if="attachmentPresentation.showOriginalReady">
            <span class="attachment-separator" aria-hidden="true">·</span>
            <span class="attachment-original-ready">{{ t('ai.attachmentOriginalReady') }}</span>
          </template>
          <template v-if="attachmentPresentation.isProcessing">
            <span class="attachment-separator" aria-hidden="true">·</span>
            <BLoading
              inline
              :loading="true"
              :title="attachmentStatusText(currentAttachment)"
              class="attachment-processing"
            />
          </template>
          <template v-else>
            <span class="attachment-separator" aria-hidden="true">·</span>
            <span
              class="attachment-status"
              :class="`attachment-status--${attachmentPresentation.tone}`"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <SvgIcon v-if="attachmentStatusIcon" :src="attachmentStatusIcon" size="12" />
              <span>{{ attachmentStatusText(currentAttachment) }}</span>
            </span>
          </template>
          <template v-if="currentAttachment.fileId">
            <span class="attachment-separator" aria-hidden="true">·</span>
            <span class="attachment-saved">
              <SvgIcon :src="icon.message.success" size="12" />
              {{ t('ai.attachmentSavedToCloud') }}
            </span>
          </template>
        </span>
      </span>
      <BButton v-if="currentAttachment.status === 'failed'" size="small" :loading="busy" @click="retryAttachment">
        <SvgIcon :src="icon.cloudSpace.preview.retry" size="13" />
        {{ t('ai.retryAttachment') }}
      </BButton>
      <BButton size="small" :disabled="busy" @click="removeAttachment">{{ t('ai.removeAttachment') }}</BButton>
    </div>

    <div v-if="actionableAttachment" class="attachment-shortcuts">
      <BButton
        v-if="actionableAttachment.sourceType === 'temporary' && !actionableAttachment.fileId"
        size="small"
        role="button"
        tabindex="0"
        @click="openAction('save_attachment_to_cloud')"
        @keydown.enter.prevent="openAction('save_attachment_to_cloud')"
        @keydown.space.prevent="openAction('save_attachment_to_cloud')"
      >
        {{ t('ai.saveAttachmentToCloud') }}
      </BButton>
      <BButton
        v-if="imageAttachment"
        size="small"
        role="button"
        tabindex="0"
        @click="openAction('create_image_note')"
        @keydown.enter.prevent="openAction('create_image_note')"
        @keydown.space.prevent="openAction('create_image_note')"
      >
        {{ t('ai.createImageNoteFromAttachment') }}
      </BButton>
      <template v-if="textReadyAttachment">
        <BButton
          size="small"
          role="button"
          tabindex="0"
          @click="emit('prompt', t('ai.attachmentSummaryPrompt'))"
          @keydown.enter.prevent="emit('prompt', t('ai.attachmentSummaryPrompt'))"
          @keydown.space.prevent="emit('prompt', t('ai.attachmentSummaryPrompt'))"
        >
          {{ t('ai.summarizeAttachment') }}
        </BButton>
        <BButton
          size="small"
          role="button"
          tabindex="0"
          @click="emit('prompt', t('ai.attachmentNotePrompt'))"
          @keydown.enter.prevent="emit('prompt', t('ai.attachmentNotePrompt'))"
          @keydown.space.prevent="emit('prompt', t('ai.attachmentNotePrompt'))"
        >
          {{ t('ai.createNoteFromAttachment') }}
        </BButton>
      </template>
    </div>

    <AiAttachmentActionEditor
      v-if="activeAction && activeActionAttachment"
      :key="`${activeAction.toolName}:${activeAction.attachmentId}`"
      :attachment="activeActionAttachment"
      :initial-draft="activeAction"
      :submit-fn="submitDirectAction"
      @close="activeAction = null"
    />

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
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import icon from '@/config/icon';
  import type { AiAttachmentDirectActionName } from '@/config/aiTools';
  import AiAttachmentActionEditor from './AiAttachmentActionEditor.vue';
  import { getAiAttachmentPresentation } from './attachmentPresentation';
  import {
    createAttachmentActionDraft,
    type AiAttachmentActionDraft,
    type AiAttachmentActionRequest,
  } from './attachmentActions';
  import {
    attachAiCloudFile,
    deleteAiAttachment,
    fetchAiAttachmentStatuses,
    retryAiAttachment,
    uploadAiAttachment,
    type AiAttachment,
  } from '@/api/aiAttachmentApi';

  const props = defineProps<{
    modelValue: AiAttachment[];
    prepareActionFn: (request: AiAttachmentActionRequest) => Promise<void>;
  }>();
  const emit = defineEmits<{
    'update:modelValue': [value: AiAttachment[]];
    prompt: [value: string];
  }>();
  const { t } = useI18n();
  const busy = ref(false);
  const activeAction = ref<AiAttachmentActionDraft | null>(null);
  let pollTimer: number | null = null;
  let pollAttempts = 0;

  const currentAttachment = computed(() => props.modelValue[0] || null);
  const attachmentPresentation = computed(() =>
    currentAttachment.value ? getAiAttachmentPresentation(currentAttachment.value.status) : null,
  );
  const attachmentStatusIcon = computed(() => {
    if (attachmentPresentation.value?.tone === 'success') return icon.message.success;
    if (attachmentPresentation.value?.tone === 'warning') return icon.message.warning;
    if (attachmentPresentation.value?.tone === 'error') return icon.message.error;
    return '';
  });
  const actionableAttachment = computed(() => props.modelValue.find((item) => item.status !== 'awaiting_upload'));
  const textReadyAttachment = computed(() => props.modelValue.find((item) => item.status === 'ready'));
  const imageAttachment = computed(() => {
    const attachment = actionableAttachment.value;
    return attachment && isImageAttachment(attachment) ? attachment : null;
  });
  const activeActionAttachment = computed(() => {
    if (!activeAction.value) return null;
    return props.modelValue.find((item) => item.id === activeAction.value?.attachmentId) || null;
  });

  function isImageAttachment(attachment: AiAttachment) {
    return /^image\/(png|jpe?g|webp)$/i.test(attachment.fileType) || /\.(png|jpe?g|webp)$/i.test(attachment.fileName);
  }

  watch(
    () => props.modelValue.map((item) => `${item.id}:${item.status}`).join(','),
    () => {
      if (props.modelValue.some((item) => ['queued', 'parsing'].includes(item.status))) startPolling();
      else stopPolling();
    },
    { immediate: true },
  );

  watch(
    () => props.modelValue.map((item) => item.id).join(','),
    () => {
      if (activeAction.value && !activeActionAttachment.value) activeAction.value = null;
    },
  );

  function formatBytes(value: number) {
    const bytes = Number(value || 0);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function attachmentStatusText(attachment: AiAttachment) {
    if (attachment.status === 'failed') return attachment.errorMessage || t('ai.attachmentStatus.failed');
    if (attachment.status === 'no_text' && isImageAttachment(attachment)) {
      return t('ai.attachmentStatus.no_text_image');
    }
    return t(getAiAttachmentPresentation(attachment.status).statusKey);
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
    activeAction.value = null;
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

  function openAction(toolName: AiAttachmentDirectActionName, initialArgs: Record<string, unknown> = {}) {
    const requestedId = String(initialArgs.attachmentId || initialArgs.attachment_id || '');
    const attachment =
      props.modelValue.find((item) => (requestedId ? item.id === requestedId : item.status !== 'awaiting_upload')) ||
      null;
    if (!attachment) return false;
    if (toolName === 'create_image_note' && !isImageAttachment(attachment)) return false;
    activeAction.value = createAttachmentActionDraft(toolName, attachment, initialArgs);
    return true;
  }

  async function submitDirectAction(request: AiAttachmentActionRequest) {
    await props.prepareActionFn(request);
    activeAction.value = null;
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

  defineExpose({ attachCloudFile, openAction });
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
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-width: 0;
    padding: 7px 8px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--primary-color) 7%, var(--background-color));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary-color) 16%, transparent);
    transition:
      background 0.2s ease,
      box-shadow 0.2s ease;
  }
  .attachment-card.is-failed {
    background: color-mix(in srgb, var(--message-error-color) 8%, var(--background-color));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--message-error-color) 22%, transparent);
  }
  .attachment-card.is-no_text {
    background: color-mix(in srgb, var(--message-warning-color) 7%, var(--background-color));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--message-warning-color) 20%, transparent);
  }
  .attachment-card.is-ready {
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--message-success-color) 20%, transparent);
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
    gap: 2px;
  }
  .attachment-copy strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
  }
  .attachment-meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    min-width: 0;
    column-gap: 4px;
    row-gap: 2px;
    color: var(--desc-color);
    font-size: 11px;
    line-height: 16px;
  }
  .attachment-size,
  .attachment-original-ready,
  .attachment-status,
  .attachment-saved {
    white-space: nowrap;
  }
  .attachment-separator {
    color: color-mix(in srgb, var(--desc-color) 58%, transparent);
  }
  .attachment-status,
  .attachment-saved {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }
  .attachment-status--success,
  .attachment-saved {
    color: var(--message-success-color);
  }
  .attachment-status--success {
    animation: attachment-ready-in 0.38s ease-out both;
  }
  .attachment-status--warning {
    color: var(--message-warning-color);
  }
  .attachment-status--error {
    color: var(--message-error-color);
  }
  :deep(.attachment-processing.b-loading-inline) {
    min-height: 16px;
    gap: 5px;
    color: var(--primary-color);
    font-size: 11px;
  }
  :deep(.attachment-processing .b-loading-inline__indicator) {
    gap: 2px;
  }
  :deep(.attachment-processing .b-loading-inline__indicator i) {
    width: 4px;
    height: 4px;
  }
  :deep(.attachment-processing .b-loading-inline__title) {
    animation: attachment-processing-text 1.65s ease-in-out infinite;
  }
  .attachment-card.is-processing .attachment-icon {
    animation: attachment-processing-halo 1.65s ease-in-out infinite;
  }
  .attachment-card > :deep(.b_btn) {
    flex: 0 0 auto;
  }
  .attachment-shortcuts {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
  }

  @keyframes attachment-processing-text {
    0%,
    100% {
      opacity: 0.62;
    }
    50% {
      opacity: 1;
    }
  }

  @keyframes attachment-processing-halo {
    0%,
    100% {
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--primary-color) 0%, transparent);
    }
    50% {
      box-shadow: 0 0 0 4px color-mix(in srgb, var(--primary-color) 12%, transparent);
    }
  }

  @keyframes attachment-ready-in {
    from {
      opacity: 0;
      transform: translateY(2px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .attachment-card,
    .attachment-card.is-processing .attachment-icon,
    .attachment-status--success,
    :deep(.attachment-processing .b-loading-inline__title) {
      animation: none;
      transition: none;
    }
  }
</style>
