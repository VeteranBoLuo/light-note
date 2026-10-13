<template>
  <div class="csv-preview">
    <BTable
      v-if="rows"
      :key="src"
      :data="pageRows"
      :columns="columns"
      row-key="rowNumber"
      fill
      :pagination="rows.length > 100"
      :total="rows.length"
      :current-page="page"
      :page-size="pageSize"
      @page-change="page = $event"
      @size-change="
        (_, size) => {
          pageSize = size;
          page = 1;
        }
      "
    >
      <template #bodyCell="{ text }"
        ><span class="csv-cell">{{ text }}</span></template
      >
    </BTable>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, ref, shallowRef, watch } from 'vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import { readTextPreviewSource } from '@/utils/textPreviewSource';
  import { parseCsvPreview, csvPreviewError, MAX_CSV_PREVIEW_CHARS } from '@/utils/csvPreview';

  const props = defineProps<{ src: string }>();
  const emit = defineEmits<{ rendered: []; error: [error: unknown] }>();
  const rows = shallowRef<string[][]>();
  const page = ref(1);
  const pageSize = ref(100);
  const columns = computed(() => [
    { key: 'rowNumber', title: '#', width: 56 },
    ...(rows.value?.[0] || []).map((_, index) => {
      let title = '';
      for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
        title = String.fromCharCode(65 + ((value - 1) % 26)) + title;
      }
      // 宽度由内容估算，交由 BTable 根据界面密度换算。
      let width = 120;
      for (const row of rows.value || []) {
        for (const line of row[index].split('\n')) {
          const length = Array.from(line).reduce((size, char) => size + (char.charCodeAt(0) > 255 ? 2 : 1), 0);
          width = Math.min(320, Math.max(width, length * 7 + 32));
        }
      }
      return { key: String(index), title, width };
    }),
  ]);
  const pageRows = computed(() => {
    const start = (page.value - 1) * pageSize.value;
    return (rows.value || []).slice(start, start + pageSize.value).map((row, index) => ({
      ...row,
      rowNumber: start + index + 1,
    }));
  });
  watch(
    () => props.src,
    async (src, _, onCleanup) => {
      const controller = new AbortController();
      onCleanup(() => controller.abort());
      rows.value = undefined;
      page.value = 1;
      pageSize.value = 100;
      try {
        const response = await fetch(src, { signal: controller.signal });
        if (!response.ok) throw Object.assign(new Error('CSV_FETCH_FAILED'), { status: response.status });
        const { content, truncated } = await readTextPreviewSource(response, MAX_CSV_PREVIEW_CHARS);
        if (controller.signal.aborted) return;
        // 截断可能切开引号内的记录，不能把半份 CSV 当作完整表格。
        if (truncated) throw csvPreviewError('FILE_SIZE_INVALID');
        rows.value = parseCsvPreview(content);
        await nextTick();
        if (!controller.signal.aborted) emit('rendered');
      } catch (error) {
        if (!controller.signal.aborted) emit('error', error);
      }
    },
    { immediate: true },
  );
</script>

<style scoped>
  .csv-preview {
    height: 100%;
    min-height: 0;
    padding: var(--ui-space-12, 12px) var(--ui-space-12, 12px) var(--ui-space-64, 64px);
    box-sizing: border-box;
  }
  .csv-cell {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    padding-block: var(--ui-space-8, 8px);
  }
  .csv-preview :deep(.table-row-window) {
    gap: 0;
  }
  .csv-preview :deep(.table-row) {
    border-bottom: 1px solid var(--border-color);
    border-radius: 0;
    align-items: start;
  }
</style>
