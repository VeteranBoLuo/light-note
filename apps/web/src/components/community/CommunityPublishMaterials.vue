<template>
  <section class="publish-materials">
    <div class="publish-topics" role="group" :aria-label="t('community.feed.topics')">
      <h2>{{ t('community.feed.topics') }}</h2>
      <BSelect
        v-if="topics.length > 6"
        :value="draft.topics[0] || ''"
        :options="topics"
        show-search
        allow-clear
        :disabled="busy || preview"
        :aria-label="t('community.feed.topics')"
        :placeholder="t('community.feed.topicSearch')"
        @update:value="$emit('topic', $event ? [String($event)] : [])"
      />
      <div v-else class="publish-topic-options"
        ><BButton
          v-for="topic in topics"
          :key="topic.value"
          :disabled="busy || preview"
          :aria-pressed="draft.topics.includes(topic.value)"
          @click="$emit('topic', draft.topics.includes(topic.value) ? [] : [topic.value])"
          ><span class="publish-topic-symbol" aria-hidden="true">{{
            draft.topics.includes(topic.value) ? '✓' : '#'
          }}</span
          ><span>{{ topic.label }}</span></BButton
        ></div
      >
    </div>
    <div v-if="imagesEnabled && !preview" class="writing-image-tools">
      <BUpload
        block
        raw-file
        multiple
        accept="image/jpeg,image/png,image/webp"
        :max-total-size="45 * 1024 * 1024"
        :disabled="busy || uploading || draft.images.length >= 9"
        @change="$emit('add-images', $event)"
      >
        <BButton
          class="material-add"
          :aria-label="t('community.feed.addImages')"
          :disabled="busy || uploading || draft.images.length >= 9"
          ><span class="material-add-symbol" aria-hidden="true">+</span>{{ t('community.feed.imageSection')
          }}<span class="material-count">{{ draft.images.length }}/9</span></BButton
        >
      </BUpload>
      <span>{{ t('community.feed.imageLimits') }}</span>
    </div>
    <p v-if="imageError" role="alert">{{ t('community.feed.imageFailure') }}</p>
    <div v-if="!preview && draft.images.length" class="writing-images">
      <div v-for="(item, index) in draft.images" :key="item.publicId" class="writing-image">
        <BButton
          v-if="item.url"
          class="writing-image-preview"
          :aria-label="t('community.feed.imagePreview', { index: index + 1 })"
          @click="$emit('preview-image', item.publicId)"
        >
          <img :src="item.url" :alt="t('community.feed.imagePreview', { index: index + 1 })" />
        </BButton>
        <span v-if="item.status !== 'ready'" role="status">{{
          t(
            item.status === 'uploading'
              ? 'community.feed.imageUploading'
              : item.errorCode === 'COMMUNITY_IMAGE_PENDING_LIMIT'
                ? 'community.feed.imagePendingLimit'
                : 'community.feed.imageUploadFailedShort',
          )
        }}</span>
        <div class="writing-image-actions">
          <BButton
            v-if="item.status === 'error' && retryableIds.includes(item.publicId)"
            :disabled="busy || uploading"
            @click="$emit('retry-image', item)"
            >{{ t('community.feed.retry') }}</BButton
          >
          <BButton
            :disabled="busy || uploading"
            :aria-label="t('community.feed.removeImage')"
            class="image-remove"
            @click="$emit('remove-image', item)"
            >×</BButton
          >
        </div>
      </div>
    </div>
    <div v-if="resourcesEnabled && !preview" class="writing-image-tools">
      <BButton
        class="material-add"
        :aria-label="t('community.feed.addResources')"
        :disabled="busy || pickingResource || draft.resources.length >= 3"
        @click="$emit('pick-resource')"
        ><span class="material-add-symbol" aria-hidden="true">+</span>{{ t('community.feed.resourceSection')
        }}<span class="material-count">{{ draft.resources.length }}/3</span></BButton
      >
      <span>{{ t('community.feed.resourceShortHint') }}</span>
    </div>
    <CommunityPostResources
      compact
      :resources="draft.resources"
      :editable="!preview"
      :disabled="busy"
      @remove="$emit('remove-resource', $event)" />
    <slot
  /></section>
</template>
<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import CommunityPostResources from './CommunityPostResources.vue';
  import type { FeedImage, FeedResource } from '@/api/communityFeedApi';
  type DraftImage = FeedImage & { status: 'uploading' | 'ready' | 'error'; errorCode?: string };
  defineProps<{
    draft: { topics: string[]; images: DraftImage[]; resources: FeedResource[] };
    topics: { value: string; label: string }[];
    busy: boolean;
    preview: boolean;
    uploading: boolean;
    pickingResource: boolean;
    imagesEnabled?: boolean;
    resourcesEnabled?: boolean;
    imageError: boolean;
    retryableIds: string[];
  }>();
  defineEmits<{
    topic: [values: string[]];
    'pick-resource': [];
    'add-images': [files: File[]];
    'retry-image': [item: DraftImage];
    'remove-image': [item: DraftImage];
    'preview-image': [id: string];
    'remove-resource': [item: FeedResource];
  }>();
  const { t } = useI18n();
</script>
<style scoped>
  .publish-materials {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-20, 20px);
    min-width: 0;
  }
  h2 {
    font-size: var(--ui-font-14, 14px);
    margin: 0 0 var(--ui-space-12, 12px);
  }
  .publish-topic-options {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--ui-space-8, 8px);
  }
  .publish-topic-options .b_btn {
    width: 100%;
    padding: var(--ui-space-12, 12px) var(--ui-space-8, 8px);
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    background: var(--workspace-hover);
    border: 0;
    border-radius: 8px;
    font-size: var(--ui-font-13, 13px);
  }
  .publish-topic-symbol {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 var(--ui-layout-18, 18px);
    width: var(--ui-layout-18, 18px);
    height: var(--ui-layout-18, 18px);
    line-height: 1;
  }
  .publish-topic-options [aria-pressed='true'] {
    color: var(--primary-color);
    border-color: var(--primary-color);
    background: var(--workspace-hover);
  }
  .writing-image-tools {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-6, 6px);
  }
  .writing-image-tools > span {
    font-size: var(--ui-font-11, 11px);
    color: var(--desc-color);
    line-height: 1.6;
  }
  .material-add.b_btn {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    padding: var(--ui-space-8, 8px) 0;
    background: transparent;
    font-size: var(--ui-font-14, 14px);
    text-align: left;
  }
  .material-add-symbol {
    order: 3;
    margin-left: auto;
    border: 0;
    border-radius: 7px;
    width: var(--ui-layout-28, 28px);
    height: var(--ui-layout-28, 28px);
    line-height: var(--ui-layout-26, 26px);
    text-align: center;
    color: var(--primary-color);
    font-size: var(--ui-font-22, 22px);
  }
  .material-count {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .writing-images {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--ui-space-8, 8px);
    margin-top: calc(-1 * var(--ui-space-12, 12px));
  }
  .writing-image {
    position: relative;
    min-width: 0;
  }
  .writing-image-preview.b_btn {
    display: block;
    padding: 0;
    width: 100%;
    height: auto;
    aspect-ratio: 1;
    overflow: hidden;
    border: 0;
    border-radius: 8px;
    cursor: zoom-in;
  }
  .writing-image img {
    display: block;
    width: 100%;
    height: 100%;
    aspect-ratio: 1;
    object-fit: cover;
  }
  .writing-image [role='status'] {
    font-size: var(--ui-font-11, 11px);
    color: var(--desc-color);
  }
  .writing-image-actions {
    display: flex;
    gap: var(--ui-space-4, 4px);
  }
  .image-remove.b_btn {
    position: absolute;
    right: var(--ui-space-4, 4px);
    top: var(--ui-space-4, 4px);
    background: #252530d9;
    color: white;
    border: 1px solid #ffffff80;
    border-radius: 50%;
    padding: 0;
    width: var(--ui-layout-22, 22px);
    height: var(--ui-layout-22, 22px);
    font-size: var(--ui-font-17, 17px);
    line-height: var(--ui-layout-20, 20px);
  }
  .publish-materials :deep(.community-resources) {
    margin: calc(-1 * var(--ui-space-12, 12px)) 0 0;
  }
  .publish-materials :deep(.resource-row.is-compact .resource-card) {
    padding: var(--ui-space-10, 10px);
    border: 0;
    background: var(--workspace-hover);
  }
  .publish-materials :deep(.resource-row.is-compact .resource-read) {
    padding-top: var(--ui-space-4, 4px);
  }
  @media (prefers-reduced-motion: no-preference) {
    .b_btn {
      transition:
        background-color 0.15s,
        border-color 0.15s,
        color 0.15s;
    }
  }
</style>
