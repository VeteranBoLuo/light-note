<template>
  <section class="pdf-image-converter" :aria-label="activeLabel">
    <div class="pdf-image-converter__switcher">
      <BTabs v-model:active-tab="activeDirection" variant="segment" :options="directionOptions" />
    </div>

    <div class="pdf-image-converter__content">
      <KeepAlive>
        <ImageToPdf v-if="activeDirection === 'image-to-pdf'" key="image-to-pdf" />
        <PdfToImages v-else key="pdf-to-images" />
      </KeepAlive>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import ImageToPdf from './ImageToPdf.vue';
  import PdfToImages from './PdfToImages.vue';

  type PdfImageToolId = 'image_to_pdf' | 'pdf_to_images';
  type PdfImageDirection = 'image-to-pdf' | 'pdf-to-images';

  const props = defineProps<{ toolId: PdfImageToolId }>();
  const { t } = useI18n();

  const resolveDirection = (toolId: PdfImageToolId): PdfImageDirection =>
    toolId === 'pdf_to_images' ? 'pdf-to-images' : 'image-to-pdf';

  const activeDirection = ref<PdfImageDirection>(resolveDirection(props.toolId));
  const directionOptions = computed(() => [
    { key: 'image-to-pdf', label: t('toolbox.local.pdfWorkbench.imageToPdf') },
    { key: 'pdf-to-images', label: t('toolbox.local.pdfWorkbench.pdfToImages') },
  ]);
  const activeLabel = computed(() =>
    t(
      activeDirection.value === 'image-to-pdf'
        ? 'toolbox.local.pdfWorkbench.imageToPdf'
        : 'toolbox.local.pdfWorkbench.pdfToImages',
    ),
  );

  watch(
    () => props.toolId,
    (toolId) => {
      activeDirection.value = resolveDirection(toolId);
    },
  );
</script>

<style scoped lang="less">
  .pdf-image-converter {
    min-width: 0;
    display: grid;
    gap: 18px;
  }

  .pdf-image-converter__switcher {
    display: flex;
    justify-content: center;
  }

  .pdf-image-converter__switcher :deep(.tab-container) {
    width: min(100%, 520px);
    border-radius: 12px;
  }

  .pdf-image-converter__switcher :deep(.tab) {
    min-width: 0;
    min-height: 40px;
    flex: 1;
    justify-content: center;
    line-height: 40px;
  }

  .pdf-image-converter__switcher :deep(.tab.is-active) {
    color: var(--primary-color);
    box-shadow:
      inset 0 0 0 1px var(--primary-color),
      inset 0 -2px 0 var(--primary-color);
  }

  .pdf-image-converter__content {
    min-width: 0;
  }

  @media (max-width: 767px) {
    .pdf-image-converter {
      gap: 14px;
    }

    .pdf-image-converter__switcher :deep(.tab) {
      min-height: 44px;
      padding: 0 10px;
      line-height: 44px;
    }
  }

  html.light-note-mobile-rendering .pdf-image-converter__switcher :deep(.tab-container) {
    background: var(--card-background);
  }
</style>
