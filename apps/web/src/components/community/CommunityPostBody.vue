<template>
  <div class="community-post-body">
    <div
      v-if="!hideAttachments && attachments.length"
      class="body-attachments"
      :class="{ 'is-single': attachments.length === 1 }"
    >
      <BButton
        v-for="item in attachments"
        :key="item.publicId"
        :aria-label="t('community.feed.imagePreview', { index: ordered.indexOf(item) + 1 })"
        @click="open(item.publicId)"
      >
        <img
          v-if="available(item.publicId)"
          :src="source(item.publicId)"
          alt=""
          :width="item.width"
          :height="item.height"
          loading="lazy"
          @error="failed.add(item.publicId)"
        />
        <span v-else class="image-unavailable">{{ t('community.feed.imageUnavailable') }}</span>
      </BButton>
    </div>

    <template v-for="(block, index) in document.blocks" :key="index">
      <CommunityMarkdown
        v-if="block.kind === 'text'"
        :body="block.source + '\n\n' + document.definitions"
        :inert="disableLinks"
      />
      <div v-else class="inline-image">
        <BButton
          :aria-label="
            block.alt ||
            t('community.feed.imagePreview', { index: ordered.findIndex((i) => i.publicId === block.id) + 1 })
          "
          @click="open(block.id)"
        >
          <img
            v-if="available(block.id)"
            :src="source(block.id)"
            :alt="block.alt"
            :width="image(block.id)?.width || undefined"
            :height="image(block.id)?.height || undefined"
            loading="lazy"
            @error="failed.add(block.id)"
          />
          <span v-else class="image-unavailable">{{ t('community.feed.imageUnavailable') }}</span>
        </BButton>
      </div>
    </template>
    <BImageViewer v-if="visible" v-model:visible="visible" :images="viewerImages" :initial-id="selected" />
  </div>
</template>
<script setup lang="ts">
  import { computed, defineAsyncComponent, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { parseCommunityPostDocument } from '@lightnote/shared/community-feed';
  import type { FeedImage } from '@/api/communityFeedApi';
  import { useCommunityPreviewImages } from '@/composables/useCommunityPreviewImages';
  import { useCommunityPreview } from '@/composables/useCommunityPreview';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import CommunityMarkdown from './CommunityMarkdown.vue';
  const BImageViewer = defineAsyncComponent(() => import('@/components/base/Viewer/BImageViewer.vue'));
  const props = defineProps<{
    body: string;
    images?: FeedImage[];
    disableLinks?: boolean;
    hideAttachments?: boolean;
  }>();
  const { t } = useI18n();
  const document = computed(() => parseCommunityPostDocument(props.body));
  const image = (id: string) => props.images?.find((i) => i.publicId === id);
  const attachments = computed(() => (props.images || []).filter((i) => !document.value.imageIds.includes(i.publicId)));
  const ordered = computed(() => [
    ...(props.hideAttachments ? [] : attachments.value),
    ...document.value.imageIds.map(image).filter((i): i is FeedImage => Boolean(i)),
  ]);
  const { imageSource, imageUnavailable } = useCommunityPreviewImages(() => ordered.value.map((i) => i.url));
  const failed = ref(new Set<string>()),
    visible = ref(false),
    selected = ref('');
  const source = (id: string) => imageSource(image(id)?.url);
  const available = (id: string) => !failed.value.has(id) && !imageUnavailable(image(id)?.url) && Boolean(source(id));
  function open(id: string) {
    if (!available(id)) return;
    selected.value = id;
    visible.value = true;
  }
  const viewerImages = computed(() =>
    ordered.value
      .filter((i) => available(i.publicId))
      .map((i) => ({
        id: i.publicId,
        src: new URL(source(i.publicId)!, window.location.origin).href,
        fileName: `${i.publicId}.${i.contentType === 'image/jpeg' ? 'jpg' : i.contentType === 'image/webp' ? 'webp' : 'png'}`,
        width: i.width,
        height: i.height,
      })),
  );
  const { identity } = useCommunityPreview();
  watch([identity, () => props.body, () => props.images], () => {
    visible.value = false;
    failed.value.clear();
  });
</script>
<style scoped>
  .inline-image {
    margin: var(--ui-space-16, 16px) 0;
  }
  .inline-image .b_btn {
    display: block;
    width: fit-content;
    min-width: var(--ui-control-44, 44px);
    max-width: 100%;
    height: auto;
    margin-inline: auto;
    padding: 0;
    border: 1px solid var(--workspace-border);
    border-radius: 8px;
    overflow: hidden;
    background: var(--workspace-open-canvas);
    cursor: zoom-in;
  }
  .inline-image img {
    display: block;
    width: auto;
    max-width: 100%;
    height: auto;
    max-height: min(var(--ui-layout-400, 400px), 55vh);
    object-fit: contain;
    margin: auto;
  }
  .body-attachments {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(var(--ui-layout-160, 160px), 1fr));
    gap: var(--ui-space-8, 8px);
    margin: var(--ui-space-16, 16px) 0;
  }
  .body-attachments .b_btn {
    height: auto;
    width: 100%;
    max-height: var(--ui-layout-240, 240px);
    min-width: 0;
    padding: 0;
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: 10px;
    border: 1px solid var(--workspace-border);
    background: var(--workspace-hover);
  }
  .body-attachments img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .body-attachments.is-single {
    grid-template-columns: minmax(0, 1fr);
    max-width: var(--ui-layout-380, 380px);
  }
  .body-attachments.is-single .b_btn {
    aspect-ratio: auto;
    max-height: var(--ui-layout-360, 360px);
  }
  .body-attachments.is-single img {
    object-fit: contain;
    max-height: var(--ui-layout-360, 360px);
    height: auto;
  }
  @media (max-width: 767px) {
    .inline-image img {
      max-height: min(var(--ui-layout-320, 320px), 55vh);
    }
    .body-attachments:not(.is-single) {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
  .image-unavailable {
    display: block;
    padding: var(--ui-space-24, 24px) var(--ui-space-12, 12px);
    white-space: normal;
  }
</style>
