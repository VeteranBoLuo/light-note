<template>
  <WorkbenchesCard title="常用书签">
    <BTable :data="tableData" :columns="columns" style="height: calc(100% - 200px)"
      ><template #bodyCell="{ column, text, record, index }">
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
        </template> </template
    ></BTable>
  </WorkbenchesCard>
</template>

<script lang="ts" setup>
  import { onMounted, ref } from 'vue';
  import WorkbenchesCard from '@/components/workbenches/WorkbenchesCard.vue';
  import { apiBasePost } from '@/http/request.ts';
  import icon from '@/config/icon.ts';

  defineProps({
    tableData: {
      type: Array,
      default: () => [],
    },
  });

  const columns = ref<{ title: string; key: string; width?: string | number }[]>([
    {
      title: '排名',
      key: 'index',
    },
    {
      title: '书签',
      key: 'name',
      width: '400px',
    },
    {
      title: '访问次数',
      key: 'count',
    },
  ]);

  onMounted(() => {});
</script>

<style lang="less" scoped>
  :deep(.table-container) {
    background-color: unset;
    box-shadow: unset;
    padding: unset;
  }
  :deep(.table-body) {
    gap: 0;
  }
</style>
