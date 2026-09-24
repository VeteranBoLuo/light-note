<template>
  <section class="translation-result">
    <div v-if="showToolbar" class="translation-result-toolbar"
      ><BTabs
        :active-tab="modelValue"
        :options="options"
        @update:active-tab="emit('update:modelValue', $event as 'translationOnly' | 'bilingual')" />
      <div class="translation-result-actions"><slot name="actions" /></div
    ></div>
    <article
      class="translation-only"
      v-if="modelValue === 'translationOnly'"
      v-html="renderStreamingMarkdown(content)"
    ></article>
    <div v-else class="translation-pairs">
      <div v-for="(pair, index) in pairs" :key="pair.id" class="translation-pair">
        <div
          ><strong>{{ t('translation.original') }}</strong
          ><article v-html="renderStreamingMarkdown(pair.original)"></article
        ></div>
        <div
          ><strong>{{ t('translation.translated') }}</strong
          ><article v-html="renderStreamingMarkdown(pair.translated)"></article
        ></div>
      </div>
    </div>
  </section>
</template>
<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import { renderStreamingMarkdown } from '@/utils/aiMessageRender';
  import type { TranslationPair } from '@/utils/translationResult';
  withDefaults(
    defineProps<{
      modelValue: 'translationOnly' | 'bilingual';
      content: string;
      pairs: TranslationPair[];
      showToolbar?: boolean;
    }>(),
    { showToolbar: true },
  );
  const emit = defineEmits<{ 'update:modelValue': [value: 'translationOnly' | 'bilingual'] }>();
  const { t } = useI18n();
  const options = computed(() => [
    { key: 'translationOnly', label: t('translation.translationOnly') },
    { key: 'bilingual', label: t('translation.bilingual') },
  ]);
</script>
<style scoped lang="less">
  .translation-result-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-12, 12px);
  }
  .translation-result-toolbar > :deep(.tab-container) {
    margin-bottom: 0;
    border-bottom: 0;
  }
  .translation-result-actions {
    display: flex;
    align-items: center;
    gap: var(--ui-space-12, 12px);
  }
  .translation-pairs,
  .translation-only {
    border: 1px solid var(--surface-border-color);
    border-radius: 4px;
  }
  .translation-only {
    padding: var(--ui-space-20, 20px);
  }
  .translation-pair > div + div {
    border-left: 1px solid var(--surface-border-color);
  }
  .translation-pair:last-child {
    border-bottom: 0;
  }

  .translation-pair {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 0;
    border-bottom: 1px solid var(--card-border-color);
    padding: 0;
  }
  .translation-pair > div {
    min-width: 0;
    padding: var(--ui-space-16, 16px) var(--ui-space-20, 20px);
  }
  strong {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  article {
    font-size: var(--ui-font-14, 14px);
    line-height: 1.8;
    overflow-wrap: anywhere;
  }
  article :deep(h1) {
    font-size: var(--ui-font-18, 18px);
    line-height: 1.4;
    margin-block: var(--ui-space-16, 16px);
  }
  article :deep(h2) {
    font-size: var(--ui-font-16, 16px);
    line-height: 1.5;
  }
  article :deep(h3) {
    font-size: var(--ui-font-16, 16px);
    line-height: 1.5;
  }
  article :deep(p) {
    margin-block: var(--ui-space-12, 12px);
  }
  article :deep(th),
  article :deep(td) {
    padding: var(--ui-space-8, 8px) var(--ui-space-12, 12px);
    border: 1px solid var(--card-border-color);
  }
  article :deep(table) {
    border-collapse: collapse;
  }
  article :deep(pre) {
    padding: var(--ui-space-12, 12px);
    background: var(--background-color);
  }
  article :deep(blockquote) {
    margin-inline: 0;
    padding-inline-start: var(--ui-space-12, 12px);
    border-inline-start: 3px solid var(--primary-color);
  }
  article :deep(pre),
  article :deep(table) {
    max-width: 100%;
    overflow-x: auto;
    display: block;
  }
  @media (max-width: 767px) {
    .translation-result {
      display: flex;
      flex-direction: column;
    }
    .translation-result-toolbar {
      display: contents;
    }
    .translation-pairs,
    .translation-only {
      order: 1;
    }
    .translation-result-actions {
      order: 2;
      position: sticky;
      bottom: 0;
      background: var(--background-color);
      width: 100%;
      padding: var(--ui-space-12, 12px) 0;
      justify-content: flex-end;
    }
    .translation-pair > div + div {
      border-left: 0;
      border-top: 1px solid var(--surface-border-color);
    }

    .translation-pair {
      grid-template-columns: 1fr;
      gap: var(--ui-space-16, 16px);
    }
  }
</style>
