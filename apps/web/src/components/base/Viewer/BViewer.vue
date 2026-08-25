<template>
  <BImageViewer
    v-model:visible="visible"
    :images="images"
    :initial-id="initialId"
    :title="viewerTitle"
    :show-toolbar="showToolbar"
    :allow-download="allowDownload"
  />
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { bookmarkStore } from '@/store';
  import type { ImageViewerItem } from '@/types/imageViewer';
  import BImageViewer from './BImageViewer.vue';

  const bookmark = bookmarkStore();
  const visible = ref(false);
  const images = ref<ImageViewerItem[]>([]);
  const initialId = ref('');
  const viewerTitle = computed(() => bookmark.viewer.options.title || '');
  const showToolbar = computed(() => bookmark.viewer.options.toolbar !== false);
  const allowDownload = computed(() => bookmark.viewer.options.download !== false);

  watch(
    () => bookmark.viewerKey,
    (viewerKey) => {
      const src = String(bookmark.viewer.src || '').trim();
      if (!viewerKey || !src) {
        visible.value = false;
        return;
      }
      initialId.value = viewerKey;
      images.value = [
        {
          id: viewerKey,
          src,
          alt: bookmark.viewer.options.alt,
        },
      ];
      visible.value = true;
    },
    { immediate: true },
  );
</script>
