<template>
  <div v-if="attachments.length" class="chat-pending-attachments" role="list">
    <div
      v-for="attachment in attachments"
      :key="attachment.localId"
      class="chat-pending-attachment"
      :class="[`is-${attachment.state}`, { 'is-image': attachment.kind === 'image' }]"
      role="listitem"
    >
      <BButton
        v-if="attachment.kind === 'image' && attachment.state === 'ready' && attachment.url"
        class="chat-pending-attachment__image community-composer__image"
        :aria-label="t('communityChat.image.preview')"
        @click="emit('preview', attachment)"
      >
        <img :src="attachment.url" :alt="t('communityChat.image.pendingAlt')" />
      </BButton>
      <div v-else class="chat-pending-attachment__file">
        <SvgIcon :src="fileIcon(attachment)" size="28" aria-hidden="true" />
        <span class="chat-pending-attachment__copy">
          <strong :title="attachment.fileName">{{ attachment.fileName }}</strong>
          <small v-if="attachment.state === 'uploading'">
            {{ t('communityChat.attachment.uploadProgress', { progress: attachment.progress }) }}
          </small>
          <small v-else-if="attachment.state === 'failed'" class="is-error">
            {{ t('communityChat.attachment.uploadFailed') }}
          </small>
          <small v-else>{{ formatSize(attachment.fileSize) }}</small>
        </span>
        <BButton
          v-if="attachment.state === 'failed'"
          size="small"
          class="chat-pending-attachment__retry"
          :aria-label="t('communityChat.attachment.retryNamed', { name: attachment.fileName })"
          @click="emit('retry', attachment)"
        >
          <SvgIcon :src="icon.cloudSpace.preview.retry" size="15" aria-hidden="true" />
        </BButton>
      </div>
      <span v-if="attachment.state === 'uploading'" class="chat-pending-attachment__progress" aria-hidden="true">
        <span :style="{ width: `${attachment.progress}%` }"></span>
      </span>
      <BButton
        icon-only
        class="chat-pending-attachment__remove"
        :disabled="removingIds.has(attachment.publicId)"
        :loading="removingIds.has(attachment.publicId)"
        :aria-label="t('communityChat.attachment.removeNamed', { name: attachment.fileName })"
        @click="emit('remove', attachment)"
      >
        <SvgIcon :src="icon.common.close" size="12" aria-hidden="true" />
      </BButton>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import type { CommunityChatPendingAttachment } from '@/api/communityChatApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { getCloudFileCategory } from '@/constants/cloudFileCategory';

  withDefaults(
    defineProps<{
      attachments: CommunityChatPendingAttachment[];
      removingIds?: Set<string>;
    }>(),
    { removingIds: () => new Set<string>() },
  );
  const emit = defineEmits<{
    preview: [attachment: CommunityChatPendingAttachment];
    retry: [attachment: CommunityChatPendingAttachment];
    remove: [attachment: CommunityChatPendingAttachment];
  }>();
  const { t } = useI18n();

  function fileIcon(attachment: CommunityChatPendingAttachment) {
    const category = getCloudFileCategory(attachment);
    return icon.cloudSpace.fileIcon[category] || icon.cloudSpace.fileIcon.other;
  }

  function formatSize(bytes: number) {
    const value = Math.max(0, Number(bytes || 0));
    if (value < 1024) return `${value} B`;
    const mb = value / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(mb >= 10 ? 0 : 1)} MB` : `${(value / 1024).toFixed(1)} KB`;
  }
</script>

<style scoped lang="less">
  .chat-pending-attachments {
    min-height: 58px;
    padding: 10px 12px 2px;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  .chat-pending-attachment {
    position: relative;
    min-width: 0;
    max-width: min(250px, 100%);
    height: 56px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--workspace-panel-bg-color);
  }

  .chat-pending-attachment.is-image {
    width: 56px;
  }

  .chat-pending-attachment.is-failed {
    border-color: var(--danger-color);
  }

  .chat-pending-attachment__image {
    width: 100%;
    height: 100%;
    padding: 0 !important;
    overflow: hidden;
    border: 0 !important;
    border-radius: 9px !important;
    background: transparent !important;
  }

  .chat-pending-attachment__image img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
  }

  .chat-pending-attachment__file {
    width: min(240px, 64vw);
    height: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    box-sizing: border-box;
  }

  .chat-pending-attachment__copy {
    min-width: 0;
    flex: 1;
    display: grid;
    gap: 2px;
  }

  .chat-pending-attachment__copy strong,
  .chat-pending-attachment__copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chat-pending-attachment__copy strong {
    font-size: 12px;
  }

  .chat-pending-attachment__copy small {
    color: var(--text-color-secondary);
    font-size: 10px;
  }

  .chat-pending-attachment__copy small.is-error {
    color: var(--danger-color);
    font-weight: 650;
  }

  .chat-pending-attachment__retry {
    width: 30px;
    min-width: 30px;
    height: 30px;
    padding: 0 !important;
    color: var(--danger-color) !important;
  }

  .chat-pending-attachment__progress {
    position: absolute;
    right: 5px;
    bottom: 4px;
    left: 5px;
    height: 3px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--surface-border-color);
  }

  .chat-pending-attachment__progress > span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--primary-color);
    transition: width 0.12s ease-out;
  }

  .chat-pending-attachment__remove {
    width: 24px;
    min-width: 24px;
    height: 24px;
    min-height: 24px;
    padding: 0 !important;
    position: absolute;
    top: -7px;
    right: -7px;
    border: 1px solid var(--danger-color) !important;
    border-radius: 50% !important;
    color: var(--danger-color) !important;
    background: var(--card-background) !important;
  }

  @media (max-width: 767px) {
    .chat-pending-attachments {
      padding: 9px 10px 2px;
    }

    .chat-pending-attachment,
    .chat-pending-attachment.is-image {
      height: 52px;
    }

    .chat-pending-attachment.is-image {
      width: 52px;
    }
  }
</style>
