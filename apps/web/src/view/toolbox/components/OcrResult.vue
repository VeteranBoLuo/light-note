<template>
  <section class="ocr-result">
    <div v-if="pageOptions.length" class="ocr-result__toolbar">
      <BSelect
        v-model:value="selected"
        :options="[{ value: 'full', label: t('toolbox.ocrResult.fullReport') }, ...pageOptions]"
        :aria-label="t('toolbox.ocrResult.page')"
      />
      <BUpload
        v-if="activePage"
        raw-file
        :multiple="false"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        :max-total-size="null"
        :disabled="loading"
        @change="loadOriginal"
        ><BButton :loading="loading">{{ t('toolbox.ocrResult.compareOriginal') }}</BButton></BUpload
      >
    </div>
    <p v-if="activePage" class="ocr-result__hint">{{ t('toolbox.ocrResult.localComparison') }}</p>
    <p v-if="error" class="ocr-result__error" role="alert">{{ error }}</p>
    <div v-if="activePage" class="ocr-result__comparison" :class="{ 'has-original': originalName }">
      <section v-if="originalName" class="ocr-result__original"
        ><header
          ><strong>{{ t('toolbox.ocrResult.original') }}</strong
          ><small>{{ originalName }}</small></header
        ><BLoading v-if="loading" inline loading /><img v-else-if="preview" :src="preview" :alt="originalName"
      /></section>
      <section class="ocr-result__text"
        ><header
          ><strong>{{ activePage.title }} · {{ activePage.label }}</strong
          ><BButton size="small" @click="copyPage">{{ t('toolbox.local.copyResult') }}</BButton></header
        ><CommunityMarkdown :body="activePage.text"
      /></section>
    </div>
    <slot v-else />
  </section>
</template>
<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import CommunityMarkdown from '@/components/community/CommunityMarkdown.vue';
  import {
    parsePdfFiles,
    renderPdfPageThumbnail,
    releasePdfThumbnailSources,
    type PdfOrganizerSource,
  } from '@/utils/pdfOrganizer';
  import { copyTextToClipboard } from '@/utils/clipboard';
  interface OcrDocument {
    sourceId: string;
    title: string;
    pages: Array<{ number: number | null; label: string; text: string }>;
  }
  const props = defineProps<{ documents?: OcrDocument[] }>();
  const { t } = useI18n();
  const selected = ref('full'),
    preview = ref(''),
    originalName = ref(''),
    error = ref(''),
    loading = ref(false);
  const pdf = shallowRef<PdfOrganizerSource | null>(null);
  let version = 0,
    imageUrl = '';
  const pages = computed(() =>
    (props.documents || []).flatMap((document, sourceIndex) =>
      (document.pages || []).map((page, index) => ({
        ...page,
        sourceIndex,
        title: document.title,
        value: `${sourceIndex}:${index}`,
      })),
    ),
  );
  const pageOptions = computed(() =>
    pages.value.map((page) => ({ value: page.value, label: `${page.title} · ${page.label}` })),
  );
  const activePage = computed(() => pages.value.find((page) => page.value === selected.value));
  function clearOriginal() {
    version++;
    if (pdf.value) void releasePdfThumbnailSources([pdf.value.id]);
    pdf.value = null;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = '';
    preview.value = '';
    originalName.value = '';
    loading.value = false;
    error.value = '';
  }
  async function showPage() {
    if (!pdf.value || !activePage.value) return;
    const current = ++version;
    loading.value = true;
    preview.value = '';
    error.value = '';
    try {
      const page = activePage.value.number;
      if (!page || page > pdf.value.pageCount) throw new Error('PAGE_UNAVAILABLE');
      const rendered = await renderPdfPageThumbnail(pdf.value, page - 1, 1000);
      if (current === version) preview.value = rendered;
    } catch {
      if (current === version) error.value = t('toolbox.ocrResult.pageUnavailable');
    } finally {
      if (current === version) loading.value = false;
    }
  }
  async function loadOriginal(files: File[]) {
    const file = files?.[0];
    if (!file || !activePage.value || loading.value) return;
    clearOriginal();
    const current = version;
    loading.value = true;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('TOO_LARGE');
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
        const result = await parsePdfFiles([file]);
        if (current !== version) return;
        pdf.value = result.sources[0]!;
        originalName.value = file.name;
        await showPage();
      } else {
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('INVALID_TYPE');
        if (current !== version) return;
        imageUrl = URL.createObjectURL(file);
        preview.value = imageUrl;
        originalName.value = file.name;
      }
    } catch {
      if (current === version) error.value = t('toolbox.ocrResult.loadFailed');
    } finally {
      if (current === version) loading.value = false;
    }
  }
  async function copyPage() {
    if (activePage.value) await copyTextToClipboard(activePage.value.text);
  }
  watch(activePage, (next, previous) => {
    if (next?.sourceIndex !== previous?.sourceIndex) clearOriginal();
    else if (pdf.value) void showPage();
  });
  watch(
    () => props.documents,
    () => {
      selected.value = 'full';
      clearOriginal();
    },
  );
  onBeforeUnmount(clearOriginal);
</script>
<style scoped lang="less">
  .ocr-result {
    display: grid;
    gap: var(--ui-space-12, 12px);
  }
  .ocr-result__toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ui-space-8, 8px);
  }
  .ocr-result__toolbar > :first-child {
    flex: 1;
    min-width: var(--ui-layout-180, 180px);
  }
  .ocr-result__hint {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    margin: 0;
    line-height: 1.6;
  }
  .ocr-result__error {
    color: var(--danger-color);
  }
  .ocr-result__comparison {
    display: grid;
    gap: var(--ui-space-16, 16px);
  }
  .ocr-result__comparison.has-original {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
  .ocr-result__comparison section {
    min-width: 0;
  }
  .ocr-result__comparison header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--ui-space-8, 8px);
    margin-bottom: var(--ui-space-12, 12px);
    font-size: var(--ui-font-13, 13px);
  }
  .ocr-result__comparison header small {
    color: var(--desc-color);
    overflow-wrap: anywhere;
  }
  .ocr-result__original img {
    display: block;
    width: 100%;
    height: auto;
  }
  .ocr-result__text {
    overflow-wrap: anywhere;
  }
  @media (max-width: 767px) {
    .ocr-result__comparison.has-original {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
