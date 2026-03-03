<template>
  <WorkbenchesCard :title="title" style="height: 100%">
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
  }
  :deep(.table-body) {
    gap: 0;
    flex: 1;
    overflow-y: auto;
    max-height: none;
  }
  :deep(.table-header) {
    flex-shrink: 0;
  }

  :deep(.table-row.is-clickable) {
    cursor: pointer;
  }
</style>
