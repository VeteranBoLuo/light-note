<template>
  <section class="pdf-workbench" :aria-label="workbenchLabel">
    <nav class="pdf-workbench__navigation" :aria-label="workbenchLabel">
      <BTabs v-model:active-tab="activeMode" variant="pill" :options="modeOptions" />
    </nav>

    <div class="pdf-workbench__content">
      <KeepAlive>
        <PdfOrganizer v-if="activeMode === 'organize'" key="organize" />
        <PdfImageConverter v-else-if="activeMode === 'images'" key="images" :tool-id="imageToolId" />
        <DocumentTextWorkbench v-else key="text" tool-id="pdf_text_extractor" />
      </KeepAlive>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { ToolboxToolId } from '@lightnote/shared/toolbox-protocol';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import DocumentTextWorkbench from './DocumentTextWorkbench.vue';
  import PdfImageConverter from './PdfImageConverter.vue';
  import PdfOrganizer from './PdfOrganizer.vue';

  type PdfWorkbenchToolId = Extract<
    ToolboxToolId,
    'pdf_organizer' | 'image_to_pdf' | 'pdf_to_images' | 'pdf_text_extractor'
  >;
  type PdfWorkbenchMode = 'organize' | 'images' | 'text';
  type PdfImageToolId = 'image_to_pdf' | 'pdf_to_images';

  const props = defineProps<{ toolId: PdfWorkbenchToolId }>();
  const { t } = useI18n();

  function resolveMode(toolId: PdfWorkbenchToolId): PdfWorkbenchMode {
    if (toolId === 'pdf_organizer') return 'organize';
    if (toolId === 'pdf_text_extractor') return 'text';
    return 'images';
  }

  const activeMode = ref<PdfWorkbenchMode>(resolveMode(props.toolId));
  const imageToolId = ref<PdfImageToolId>(props.toolId === 'pdf_to_images' ? 'pdf_to_images' : 'image_to_pdf');
  const modeOptions = computed(() => [
    { key: 'organize', label: t('toolbox.local.pdfWorkbench.organize') },
    { key: 'images', label: t('toolbox.local.pdfWorkbench.images') },
    { key: 'text', label: t('toolbox.local.pdfWorkbench.text') },
  ]);
  const workbenchLabel = computed(() => t(`toolbox.tool.${props.toolId}.name`));

  watch(
    () => props.toolId,
    (toolId) => {
      activeMode.value = resolveMode(toolId);
      if (toolId === 'image_to_pdf' || toolId === 'pdf_to_images') imageToolId.value = toolId;
    },
  );
</script>

<style scoped lang="less">
  .pdf-workbench {
    min-width: 0;
    display: grid;
    gap: 20px;
  }

  .pdf-workbench__navigation {
    min-width: 0;
    padding: 7px;
    overflow-x: auto;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--workspace-panel-bg-color);
    scrollbar-width: none;
  }

  .pdf-workbench__navigation::-webkit-scrollbar {
    display: none;
  }

  .pdf-workbench__navigation :deep(.tab-container) {
    width: max-content;
    min-width: 100%;
  }

  .pdf-workbench__navigation :deep(.tab) {
    min-height: 38px;
    flex: 1;
    justify-content: center;
    padding-right: 18px;
    padding-left: 18px;
  }

  .pdf-workbench__navigation :deep(.tab.is-active) {
    border-color: var(--primary-color);
    color: var(--primary-color);
  }

  .pdf-workbench__content {
    min-width: 0;
  }

  @media (max-width: 767px) {
    .pdf-workbench {
      gap: 15px;
    }

    .pdf-workbench__navigation {
      padding: 5px;
      border-radius: 12px;
    }

    .pdf-workbench__navigation :deep(.tab) {
      min-height: 44px;
      padding-right: 14px;
      padding-left: 14px;
    }
  }

  html.light-note-mobile-rendering .pdf-workbench__navigation {
    background: var(--card-background);
    box-shadow: none;
  }
</style>
