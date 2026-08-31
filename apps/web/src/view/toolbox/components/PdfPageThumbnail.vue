<template>
  <div ref="rootRef" class="pdf-page-thumbnail" :class="{ 'is-loading': loading, 'is-error': failed }">
    <img v-if="src" :src="src" alt="" draggable="false" />
    <BLoading v-else-if="loading" inline loading :title="t('toolbox.local.preparing')" />
    <span v-else-if="failed" aria-hidden="true">PDF</span>
  </div>
</template>

<script setup lang="ts">
  import { onBeforeUnmount, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import { renderPdfPageThumbnail, type PdfOrganizerSource } from '@/utils/pdfOrganizer';

  const props = defineProps<{ source: PdfOrganizerSource; sourcePageIndex: number }>();
  const { t } = useI18n();
  const rootRef = ref<HTMLElement | null>(null);
  const src = ref('');
  const loading = ref(false);
  const failed = ref(false);
  let observer: IntersectionObserver | null = null;
  let active = true;

  async function render() {
    if (src.value || loading.value || failed.value) return;
    loading.value = true;
    try {
      const value = await renderPdfPageThumbnail(props.source, props.sourcePageIndex);
      if (active) src.value = value;
    } catch {
      if (active) failed.value = true;
    } finally {
      if (active) loading.value = false;
    }
  }

  onMounted(() => {
    if (typeof IntersectionObserver === 'undefined') {
      void render();
      return;
    }
    observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer?.disconnect();
        observer = null;
        void render();
      },
      { rootMargin: '240px' },
    );
    if (rootRef.value) observer.observe(rootRef.value);
  });

  onBeforeUnmount(() => {
    active = false;
    observer?.disconnect();
  });
</script>

<style scoped lang="less">
  .pdf-page-thumbnail {
    width: 100%;
    aspect-ratio: 0.707;
    display: grid;
    place-items: center;
    overflow: hidden;
    border-radius: 10px;
    color: var(--desc-color);
    background: var(--surface-subtle-bg, var(--hover-background));
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #fff;
  }
</style>
