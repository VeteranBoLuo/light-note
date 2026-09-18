<template>
  <div v-if="images?.length" class="community-post-images" :class="{ 'is-single': images.length === 1 }">
    <BButton
      v-for="(item, index) in images"
      :key="item.publicId"
      :aria-label="
        failed.has(item.publicId)
          ? t('community.feed.imageUnavailable')
          : t('community.feed.imagePreview', { index: index + 1 })
      "
      @click="openImage(item.publicId)"
    >
      <span v-if="failed.has(item.publicId)" class="image-unavailable">{{ t('community.feed.imageUnavailable') }}</span>
      <img
        v-else
        :src="item.url"
        :alt="t('community.feed.imagePreview', { index: index + 1 })"
        loading="lazy"
        :width="item.width"
        :height="item.height"
        @error="failed.add(item.publicId)"
      />
    </BButton>
  </div>
  <BImageViewer v-if="visible" v-model:visible="visible" :images="viewerImages" :initial-id="selected" />
</template>
<script setup lang="ts">
  import { computed, ref, defineAsyncComponent } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { FeedImage } from '@/api/communityFeedApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  const BImageViewer = defineAsyncComponent(() => import('@/components/base/Viewer/BImageViewer.vue'));
  const props = defineProps<{ images?: FeedImage[] }>();
  const { t } = useI18n();
  const failed = ref(new Set<string>());
  function openImage(id: string) {
    if (failed.value.has(id)) {
      failed.value.delete(id);
      return;
    }
    selected.value = id;
    visible.value = true;
  }
  const selected = ref(''),
    visible = ref(false);
  const viewerImages = computed(() =>
    (props.images || []).map((i) => ({
      id: i.publicId,
      src: i.url,
      width: i.width,
      height: i.height,
      alt: t('community.feed.imagePreview', { index: (props.images || []).indexOf(i) + 1 }),
    })),
  );
</script>
<style scoped>
  .image-unavailable {
    padding: 24px 12px;
    white-space: normal;
    color: var(--text-color-secondary);
  }
  .community-post-images {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    max-width: 560px;
    margin: 16px 0;
  }
  .community-post-images .b_btn {
    height: auto;
    width: 100%;
    min-width: 0;
    padding: 0;
    border: 1px solid var(--workspace-border);
    border-radius: 10px;
    overflow: hidden;
    background: var(--workspace-hover);
    aspect-ratio: 1;
  }
  .community-post-images img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .community-post-images.is-single {
    grid-template-columns: minmax(0, 1fr);
    max-width: 380px;
  }
  .community-post-images.is-single .b_btn {
    aspect-ratio: auto;
    max-height: 360px;
  }
  .community-post-images.is-single img {
    object-fit: contain;
    max-height: 360px;
    height: auto;
  }
</style>
