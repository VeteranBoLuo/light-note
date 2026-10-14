<template>
  <div ref="rootRef" class="excel-preview" tabindex="-1">
    <section
      v-if="findVisible"
      class="excel-find"
      role="search"
      :aria-label="t('cloudSpace.previewPanel.findInWorkbook')"
      @keydown.stop="handleFindKeydown"
    >
      <label :for="findInputId" class="excel-find__label">{{ t('cloudSpace.previewPanel.findInWorkbook') }}</label>
      <BInput
        :id="findInputId"
        ref="inputRef"
        v-model:value="query"
        class="excel-find__input"
        :placeholder="t('cloudSpace.previewPanel.findInWorkbook')"
        clearable
      />
      <span class="excel-find__count" role="status" :class="{ 'is-empty': query && !searching && !matches.length }">
        {{
          searching
            ? t('cloudSpace.previewPanel.findSearching')
            : query
              ? matches.length
                ? `${activeIndex + 1} / ${matches.length}`
                : t('cloudSpace.previewPanel.findNoMatch')
              : t('cloudSpace.previewPanel.findAllSheets')
        }}
      </span>
      <div class="excel-find__actions">
        <BButton size="small" :disabled="!matches.length" @click="move(-1)">{{
          t('noteDetail.editor.findPrevious')
        }}</BButton>
        <BButton size="small" :disabled="!matches.length" @click="move(1)">{{
          t('noteDetail.editor.findNext')
        }}</BButton>
        <BButton size="small" :aria-label="t('cloudSpace.previewPanel.closeFind')" @click="closeFind"
          ><SvgIcon :src="icon.common.close" size="16"
        /></BButton>
      </div>
      <span
        v-if="activeMatch"
        class="excel-find__location"
        :title="`${activeMatch.sheetName} · ${activeMatch.address} · ${activeMatch.text}`"
        >{{ activeMatch.sheetName }} · {{ activeMatch.address }}</span
      >
    </section>
    <div ref="sheetHostRef" class="excel-preview__sheet">
      <VueOfficeExcel
        ref="officeRef"
        :key="src"
        :src="src"
        :options="options"
        class="excel-preview__renderer"
        @rendered="onRendered"
        @error="onError"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useId, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import VueOfficeExcel from '@vue-office/excel/lib/v3/vue-office-excel.mjs';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import {
    findExcelPreviewCells,
    indexExcelPreview,
    type ExcelPreviewCell,
    type ExcelPreviewSheet,
  } from '@/utils/excelPreviewSearch';

  const props = defineProps<{ src: string }>();
  const emit = defineEmits<{ rendered: []; error: [error: unknown] }>();
  const { t } = useI18n();
  const findInputId = `excel-find-${useId()}`;
  const rootRef = ref<HTMLElement>();
  const sheetHostRef = ref<HTMLElement>();
  const inputRef = ref<{ focus: () => void; select: () => void }>();
  // selectCell/resize are the narrow renderer API maintained in the pnpm patch.
  const officeRef = ref<{ selectCell: (sheet: number, row: number, column: number) => boolean; resize: () => void }>();
  const findVisible = ref(false);
  const query = ref('');
  const searching = ref(false);
  const cells = shallowRef<ExcelPreviewCell[]>([]);
  const matches = shallowRef<ExcelPreviewCell[]>([]);
  const activeIndex = ref(0);
  const activeMatch = computed(() => matches.value[activeIndex.value]);
  let previousFocus: HTMLElement | null = null;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let resizeObserver: ResizeObserver | undefined;
  const options = computed(() => {
    const source = props.src;
    return {
      transformData(sheets: ExcelPreviewSheet[]) {
        if (source === props.src) cells.value = indexExcelPreview(sheets);
        return sheets;
      },
    };
  });

  async function openFind() {
    if (!findVisible.value) {
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      findVisible.value = true;
    }
    await nextTick();
    officeRef.value?.resize();
    search();
    inputRef.value?.focus();
    inputRef.value?.select();
  }

  function closeFind() {
    if (!findVisible.value) return false;
    findVisible.value = false;
    clearTimeout(searchTimer);
    searching.value = false;
    const focus = previousFocus;
    void nextTick(() => {
      officeRef.value?.resize();
      if (focus?.isConnected && rootRef.value?.closest('.fullscreen-preview')?.contains(focus)) focus.focus();
      else rootRef.value?.focus({ preventScroll: true });
    });
    return true;
  }

  async function selectActive() {
    const cell = activeMatch.value;
    // Result location can add a toolbar line; navigate only after its new height is laid out.
    await nextTick();
    if (cell && cell === activeMatch.value && findVisible.value) {
      officeRef.value?.resize();
      officeRef.value?.selectCell(cell.sheet, cell.row, cell.column);
    }
  }

  function search() {
    clearTimeout(searchTimer);
    searchTimer = undefined;
    searching.value = false;
    matches.value = findExcelPreviewCells(cells.value, query.value);
    activeIndex.value = 0;
    selectActive();
  }

  function move(direction: number) {
    if (!matches.value.length) return;
    activeIndex.value = (activeIndex.value + direction + matches.value.length) % matches.value.length;
    selectActive();
  }

  function handleFindKeydown(event: KeyboardEvent) {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!event.repeat) closeFind();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (searchTimer) {
        search();
        searchTimer = undefined;
      } else move(event.shiftKey ? -1 : 1);
    }
  }

  function onRendered() {
    emit('rendered');
  }
  function onError(error: unknown) {
    clearTimeout(searchTimer);
    searching.value = false;
    cells.value = [];
    matches.value = [];
    findVisible.value = false;
    emit('error', error);
  }

  watch(query, () => {
    clearTimeout(searchTimer);
    matches.value = [];
    activeIndex.value = 0;
    searching.value = Boolean(query.value.trim());
    searchTimer = setTimeout(() => {
      searchTimer = undefined;
      search();
    }, 120);
  });
  watch(
    () => props.src,
    () => {
      clearTimeout(searchTimer);
      searching.value = false;
      findVisible.value = false;
      query.value = '';
      cells.value = [];
      matches.value = [];
      previousFocus = null;
    },
  );
  onMounted(() => {
    if (typeof ResizeObserver === 'undefined') return;
    resizeObserver = new ResizeObserver(() => officeRef.value?.resize());
    if (sheetHostRef.value) resizeObserver.observe(sheetHostRef.value);
  });
  onBeforeUnmount(() => {
    clearTimeout(searchTimer);
    resizeObserver?.disconnect();
  });
  defineExpose({ openFind, closeFind });
</script>

<style scoped>
  .excel-preview {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    outline: none;
  }
  .excel-preview__sheet {
    flex: 1;
    min-height: 0;
  }
  .excel-preview__renderer {
    height: 100%;
  }
  .excel-find {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    padding: var(--ui-space-8, 8px) var(--ui-space-12, 12px);
    border-bottom: 1px solid var(--border-color);
    background: var(--background-color);
    color: var(--text-color);
  }
  .excel-find__input {
    flex: 1 1 var(--ui-layout-240, 240px);
    min-width: 0;
  }
  .excel-find__label {
    position: absolute;
    clip-path: inset(50%);
    overflow: hidden;
    white-space: nowrap;
  }
  .excel-find__actions {
    display: flex;
    align-items: center;
    gap: var(--ui-space-4, 4px);
  }
  .excel-find__count,
  .excel-find__location {
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
  }
  .excel-find__count {
    white-space: nowrap;
  }
  .excel-find__count.is-empty {
    color: var(--error-color);
  }
  .excel-find__location {
    flex-basis: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
