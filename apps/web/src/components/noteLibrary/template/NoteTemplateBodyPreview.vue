<template>
  <BLoading v-if="loading" inline loading :title="t('note.tplLoading')" />
  <p v-else-if="failed" role="alert">{{ t('note.templateManager.detailFailed') }}</p>
  <div v-else-if="html" class="note-template-body note-rich-content" v-html="html" v-mermaid></div>
  <p v-else class="note-template-body__empty">{{ t('note.templateManager.emptyPreview') }}</p>
</template>
<script setup lang="ts">
  import { onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import { normalizeNoteContentResourceUrls, noteContentToHtml } from '@/utils/common';
  const props = defineProps<{ content: string; type: 'html' | 'markdown' }>();
  const { t } = useI18n();
  const html = ref('');
  const loading = ref(false);
  const failed = ref(false);
  let sequence = 0;
  watch(
    () => [props.content, props.type],
    async () => {
      const current = ++sequence;
      loading.value = true;
      failed.value = false;
      try {
        const source = props.type === 'html' ? normalizeNoteContentResourceUrls(props.content) : props.content;
        const rendered = await noteContentToHtml(source, props.type);
        if (current !== sequence) return;
        html.value = rendered;
      } catch {
        if (current === sequence) {
          html.value = '';
          failed.value = true;
        }
      } finally {
        if (current === sequence) loading.value = false;
      }
    },
    { immediate: true },
  );
  onBeforeUnmount(() => {
    sequence++;
  });
</script>
<style scoped lang="less">
  .note-template-body {
    color: var(--text-color);
    line-height: 1.8;
    overflow-wrap: anywhere;
  }
  .note-template-body :deep(img) {
    max-width: 100%;
    height: auto;
  }
  .note-template-body :deep(pre) {
    overflow-x: auto;
  }
  .note-template-body__empty {
    color: var(--desc-color);
  }
</style>
