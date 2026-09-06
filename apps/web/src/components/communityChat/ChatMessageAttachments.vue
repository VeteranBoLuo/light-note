<template>
  <div v-if="attachments.length" class="chat-attachments">
    <div
      v-if="availableImages.length"
      class="chat-attachments__images community-message__images"
      :class="`has-${Math.min(availableImages.length, 4)}`"
    >
      <BButton
        v-for="attachment in availableImages"
        :key="attachment.publicId"
        class="chat-attachments__image community-message__image"
        :class="{ 'is-ready': readyImageIds.has(attachment.publicId) }"
        :style="imageLayoutStyle(attachment)"
        :aria-label="t('communityChat.image.preview')"
        @click.stop="emit('preview-image', attachment)"
      >
        <span class="chat-attachments__image-sizer community-message__image-sizer" aria-hidden="true"></span>
        <span
          v-if="!readyImageIds.has(attachment.publicId)"
          class="chat-attachments__image-placeholder community-message__image-placeholder"
        >
          <SvgIcon :src="icon.noteDetail.toolbar.image" size="22" aria-hidden="true" />
        </span>
        <DerivedImage
          source="chat"
          :resource-id="attachment.publicId"
          :original-url="attachment.url"
          :alt="t('communityChat.image.messageAlt', { name: authorName })"
          :width="positiveDimension(attachment.width)"
          :height="positiveDimension(attachment.height)"
          :loading="priorityImageIds.has(attachment.publicId) ? 'eager' : 'lazy'"
          :fetchpriority="priorityImageIds.has(attachment.publicId) ? 'high' : 'auto'"
          decoding="async"
          @load="emit('image-loaded', $event, attachment)"
          @error="emit('image-error', attachment)"
        />
      </BButton>
    </div>

    <div v-if="fileCards.length" class="chat-attachments__files">
      <div
        v-for="attachment in fileCards"
        :key="attachment.publicId"
        class="chat-attachments__file"
        :class="{ 'is-expired': attachment.availability === 'expired' }"
      >
        <BButton
          v-if="attachment.availability === 'available'"
          class="chat-attachments__file-main"
          :aria-label="fileActionLabel(attachment)"
          @click.stop="openAttachment(attachment)"
        >
          <SvgIcon :src="fileIcon(attachment)" size="32" aria-hidden="true" />
          <span class="chat-attachments__file-copy">
            <strong :title="attachment.fileName">{{ attachment.fileName }}</strong>
            <small>{{ fileMeta(attachment) }}</small>
          </span>
        </BButton>
        <div v-else class="chat-attachments__file-main" role="status">
          <SvgIcon :src="fileIcon(attachment)" size="32" aria-hidden="true" />
          <span class="chat-attachments__file-copy">
            <strong :title="attachment.fileName">{{ attachment.fileName }}</strong>
            <small>
              {{
                t(
                  attachment.kind === 'image'
                    ? 'communityChat.attachment.imageExpired'
                    : 'communityChat.attachment.resourceExpired',
                )
              }}
              · {{ fileMeta(attachment) }}
            </small>
          </span>
        </div>
        <BTooltip v-if="attachment.availability === 'available'" :title="t('communityChat.attachment.download')">
          <BButton
            class="chat-attachments__download"
            :aria-label="t('communityChat.attachment.downloadNamed', { name: attachment.fileName })"
            @click.stop="emit('download-file', attachment)"
          >
            <SvgIcon :src="icon.cloudSpace.download" size="17" aria-hidden="true" />
          </BButton>
        </BTooltip>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import DerivedImage from '@/components/imagePreview/DerivedImage.vue';
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { CommunityChatAttachment } from '@/api/communityChatApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { getCloudFileCategory, getCloudPreviewType } from '@/constants/cloudFileCategory';

  const props = withDefaults(
    defineProps<{
      attachments: CommunityChatAttachment[];
      authorName?: string;
      readyImageIds?: Set<string>;
      priorityImageIds?: Set<string>;
    }>(),
    {
      authorName: '',
      readyImageIds: () => new Set<string>(),
      priorityImageIds: () => new Set<string>(),
    },
  );
  const emit = defineEmits<{
    'preview-image': [attachment: CommunityChatAttachment];
    'open-file': [attachment: CommunityChatAttachment];
    'download-file': [attachment: CommunityChatAttachment];
    'image-loaded': [event: Event, attachment: CommunityChatAttachment];
    'image-error': [attachment: CommunityChatAttachment];
  }>();
  const { t } = useI18n();

  const availableImages = computed(() =>
    props.attachments.filter(
      (attachment) => attachment.kind === 'image' && attachment.availability === 'available' && attachment.url,
    ),
  );
  const fileCards = computed(() =>
    props.attachments.filter((attachment) => attachment.kind === 'file' || attachment.availability === 'expired'),
  );

  function positiveDimension(value?: number) {
    const normalized = Math.floor(Number(value));
    return Number.isFinite(normalized) && normalized > 0 ? normalized : undefined;
  }

  function imageLayoutStyle(attachment: CommunityChatAttachment) {
    const width = positiveDimension(attachment.width);
    const height = positiveDimension(attachment.height);
    const paddingPercent = width && height ? Math.min(400, Math.max(20, (height / width) * 100)) : 75;
    return {
      aspectRatio: width && height ? `${width} / ${height}` : '4 / 3',
      '--community-message-image-padding': `${paddingPercent}%`,
    };
  }

  function formatSize(bytes: number) {
    const value = Math.max(0, Number(bytes || 0));
    if (value < 1024) return `${value} B`;
    const units = ['KB', 'MB', 'GB'];
    let size = value / 1024;
    let index = 0;
    while (size >= 1024 && index < units.length - 1) {
      size /= 1024;
      index += 1;
    }
    return `${size.toFixed(size >= 100 ? 0 : 1)} ${units[index]}`;
  }

  function fileMeta(attachment: CommunityChatAttachment) {
    const extension = attachment.fileName.includes('.') ? attachment.fileName.split('.').pop()?.toUpperCase() : '';
    const type =
      extension || attachment.fileType.split('/').pop()?.split(';')[0]?.toUpperCase() || t('cloudSpace.other');
    return `${type} · ${formatSize(attachment.fileSize)}`;
  }

  function fileIcon(attachment: CommunityChatAttachment) {
    const category = getCloudFileCategory(attachment);
    return icon.cloudSpace.fileIcon[category] || icon.cloudSpace.fileIcon.other;
  }

  function isPreviewable(attachment: CommunityChatAttachment) {
    return getCloudPreviewType(attachment) !== 'unsupported';
  }

  function fileActionLabel(attachment: CommunityChatAttachment) {
    return t(
      isPreviewable(attachment) ? 'communityChat.attachment.previewNamed' : 'communityChat.attachment.downloadNamed',
      { name: attachment.fileName },
    );
  }

  function openAttachment(attachment: CommunityChatAttachment) {
    if (isPreviewable(attachment)) emit('open-file', attachment);
    else emit('download-file', attachment);
  }
</script>

<style scoped lang="less">
  .chat-attachments {
    width: min(360px, 100%);
    display: grid;
    gap: 7px;
  }

  .chat-attachments__images {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 5px;
  }

  .chat-attachments__images.has-1 {
    width: min(320px, 100%);
    grid-template-columns: minmax(0, 1fr);
  }

  .chat-attachments__image {
    position: relative;
    isolation: isolate;
    display: block !important;
    width: 100%;
    min-width: 0;
    height: auto !important;
    min-height: 92px;
    max-height: 280px;
    line-height: 0 !important;
    padding: 0 !important;
    overflow: hidden;
    border: 1px solid var(--surface-border-color) !important;
    border-radius: 12px !important;
    background: var(--workspace-panel-bg-color) !important;
  }

  .chat-attachments__image-sizer {
    display: block;
    width: 100%;
    padding-top: var(--community-message-image-padding, 75%);
    pointer-events: none;
  }

  .chat-attachments__image-placeholder {
    position: absolute;
    inset: 0;
    z-index: 0;
    display: grid;
    place-items: center;
    color: var(--text-color-secondary);
    background: var(--workspace-panel-bg-color);
    pointer-events: none;
  }

  .chat-attachments__image :deep(img) {
    position: absolute;
    inset: 0;
    z-index: 1;
    width: 100%;
    height: 100%;
    min-height: 92px;
    max-height: 280px;
    display: block;
    object-fit: cover;
    opacity: 0;
    transition: opacity 0.12s ease-out;
  }

  .chat-attachments__image.is-ready :deep(img) {
    opacity: 1;
  }

  .chat-attachments__images.has-1 .chat-attachments__image :deep(img) {
    object-fit: contain;
  }

  .chat-attachments__files {
    display: grid;
    gap: 6px;
  }

  .chat-attachments__file {
    min-width: 0;
    min-height: 58px;
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 5px;
    border: 1px solid var(--surface-border-color);
    border-radius: 11px;
    background: var(--workspace-panel-bg-color);
  }

  .chat-attachments__file.is-expired {
    border-style: dashed;
    color: var(--text-color-secondary);
    opacity: 0.82;
  }

  .chat-attachments__file-main {
    min-width: 0;
    flex: 1;
    display: flex !important;
    justify-content: flex-start !important;
    gap: 9px;
    padding: 5px 6px !important;
    border: 0 !important;
    background: transparent !important;
    text-align: left;
  }

  .chat-attachments__file-copy {
    min-width: 0;
    flex: 1;
    display: grid;
    gap: 3px;
  }

  .chat-attachments__file-copy strong,
  .chat-attachments__file-copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chat-attachments__file-copy strong {
    color: var(--text-color);
    font-size: 13px;
    font-weight: 650;
  }

  .chat-attachments__file-copy small {
    color: var(--text-color-secondary);
    font-size: 11px;
  }

  .chat-attachments__download {
    width: 34px;
    min-width: 34px;
    height: 34px;
    padding: 0 !important;
    color: var(--text-color-secondary) !important;
  }

  @media (max-width: 767px) {
    .chat-attachments {
      width: min(300px, 100%);
    }

    .chat-attachments__file {
      min-height: 62px;
    }

    .chat-attachments__download {
      width: 40px;
      min-width: 40px;
      height: 40px;
    }
  }
</style>
