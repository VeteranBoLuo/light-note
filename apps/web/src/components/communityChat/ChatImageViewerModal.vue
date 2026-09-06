<template>
  <BImageViewer
    v-model:visible="visible"
    :images="viewerImages"
    :initial-id="initialPublicId"
    :title="t('communityChat.image.previewTitle')"
    @image-error="failedVersions[$event] = (failedVersions[$event] || 0) + 1"
  >
    <template v-if="imagePreviewsEnabled('chat')" #image-actions="{ image }">
      <ImagePreviewControls v-if="visible && image && imagePreviewsEnabled('chat')" :key="image.id" source="chat"
        :resource-id="image.id" :refresh-version="failedVersions[image.id]" :original-url="image.downloadSrc" @display="displaySources[image.id] = $event" />
    </template>
  </BImageViewer>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import ImagePreviewControls from '@/components/imagePreview/ImagePreviewControls.vue';
  import { EMPTY_IMAGE, imagePreviewsEnabled } from '@/api/imagePreviewApi';
  import { useI18n } from 'vue-i18n';
  import { useUserStore } from '@/store';
  import type { CommunityChatImage } from '@/api/communityChatApi';
  import BImageViewer from '@/components/base/Viewer/BImageViewer.vue';
  import type { ImageViewerItem } from '@/types/imageViewer';

  const props = withDefaults(
    defineProps<{
      images?: CommunityChatImage[];
      initialPublicId?: string;
    }>(),
    {
      images: () => [],
      initialPublicId: '',
    },
  );
  const visible = defineModel<boolean>('visible', { default: false });
  const { t } = useI18n();

  const failedVersions = ref<Record<string, number>>({});
  const displaySources = ref<Record<string, string>>({});
  const viewerUser = useUserStore();
  watch(() => [viewerUser.id, viewerUser.role, viewerUser.adminContext?.id, viewerUser.visitorWorkspace], () => {
    displaySources.value = {}; failedVersions.value = {}; visible.value = false;
  });
  watch(visible, () => { displaySources.value = {}; failedVersions.value = {}; });
  const viewerImages = computed<ImageViewerItem[]>(() =>
    props.images.map((item) => ({
      id: item.publicId,
      src: imagePreviewsEnabled('chat') ? displaySources.value[item.publicId] || EMPTY_IMAGE : item.url,
      downloadSrc: item.url,
      alt: t('communityChat.image.previewAlt'),
      width: item.width,
      height: item.height,
    })),
  );
</script>
