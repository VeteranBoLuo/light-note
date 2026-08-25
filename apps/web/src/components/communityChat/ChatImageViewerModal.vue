<template>
  <BImageViewer
    v-model:visible="visible"
    :images="viewerImages"
    :initial-id="initialPublicId"
    :title="t('communityChat.image.previewTitle')"
  />
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
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

  const viewerImages = computed<ImageViewerItem[]>(() =>
    props.images.map((item) => ({
      id: item.publicId,
      src: item.url,
      alt: t('communityChat.image.previewAlt'),
      width: item.width,
      height: item.height,
    })),
  );
</script>
