<template>
  <WorkbenchesCard :title="title" :titleType="titleType" style="height: 100%">
    <BTable
      :data="tableData"
      :columns="columns"
      :rowClickable="rowClickable"
      style="height: 100%"
      @rowClick="(record, index) => emit('rowClick', record, index)"
    >
      <template #bodyCell="{ column, index }">
        <template v-if="column.key === 'index'">
          <template v-if="index === 0">
            <svg-icon :src="icon.workbenches.first" />
          </template>
          <template v-if="index === 1">
            <svg-icon :src="icon.workbenches.second" />
          </template>
          <template v-if="index === 2">
            <svg-icon :src="icon.workbenches.third" />
          </template>
        </template>
      </template>
    </BTable>
  </WorkbenchesCard>
</template>

<script lang="ts" setup>
  import { PropType } from 'vue';
  import WorkbenchesCard from '@/components/workbenches/WorkbenchesCard.vue';
  import { Column } from '@/components/base/BasicComponents/BTable/config.ts';
  import icon from '@/config/icon.ts';

  const emit = defineEmits(['rowClick']);

  defineProps({
    tableData: {
      type: Array,
      default: () => [],
    },
    title: {
      type: String,
      default: '常用书签',
    },
    titleType: {
      type: String as PropType<'bookmark' | 'tag' | 'note' | 'file' | ''>,
      default: '',
    },
    columns: {
      type: Array as PropType<Column[]>,
      default: () => [],
    },
    rowClickable: {
      type: Boolean,
      default: false,
    },
  });
</script>

<style lang="less" scoped>
  :deep(.table-container) {
    background-color: unset;
    box-shadow: unset;
    padding: unset;
    height: 100%;
    display: flex;
    flex-direction: column;
    border-radius: 10px;
    overflow: hidden;
  }
  :deep(.table-body) {
    gap: 6px;
    flex: 1;
    overflow-y: auto;
    max-height: none;
    padding: 2px;
  }
  :deep(.table-header) {
    flex-shrink: 0;
    height: 38px;
    border-radius: 9px;
    background: linear-gradient(180deg, var(--workbench-table-header-bg), transparent 190%);
    border: 1px solid var(--workbench-table-inner-border);
    padding: 0 10px;
  }

  :deep(.header-cell) {
    font-size: 12px;
    font-weight: 600;
    color: var(--desc-color);
  }

  :deep(.table-row) {
    height: 38px;
    border-radius: 9px;
    border: 1px solid transparent;
    transition:
      background-color 0.2s ease,
      border-color 0.2s ease;
  }

  :deep(.table-cell) {
    font-size: 13px;
  }

  :deep(.table-row:hover) {
    background-color: var(--workbench-table-row-hover-bg);
    border-color: var(--workbench-table-row-hover-border);
  }

  :deep(.table-row.is-clickable) {
    cursor: pointer;
  }
</style>
