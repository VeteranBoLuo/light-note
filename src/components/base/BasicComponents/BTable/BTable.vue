<template>
  <div class="table-container">
    <!-- 表头 -->
    <div class="table-header" :style="gridStyle">
      <div
        v-for="col in columns"
        :key="col.key"
        class="header-cell"
        :style="{ width: col.width || 'auto' }"
      >
        {{ col.title }}
      </div>
    </div>

    <!-- 表格内容 -->
    <div class="table-body" :style="{ maxHeight: props.pagination ? 'calc(100% - 100px)' : '100%' }">
      <div v-for="(item, rowIndex) in currentPageData" :key="rowIndex" class="table-row" :style="gridStyle">
        <div v-for="col in props.columns" :key="col.key" class="table-cell" :style="{ width: col.width || 'auto' }">
          <slot name="bodyCell" :text="item[col.key]" :record="item" :index="rowIndex" :column="col">
            <!-- 默认渲染（父组件未自定义时生效） -->
            {{ item[col.key] }}
          </slot>
        </div>
      </div>
    </div>

    <!-- 分页器 -->
    <div class="table-pagination" v-if="props.pagination">
      <a-pagination
        v-model:current="currentPage"
        v-model:pageSize="pageSize"
        :total="props.total"
        show-size-changer
        show-quick-jumper
        :page-size-options="['10', '20', '50', '100']"
        @change="handlePageChange"
        @showSizeChange="handleSizeChange"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, useSlots, ref, PropType } from 'vue';
  import { Column } from '@/components/base/BasicComponents/BTable/config.ts';

  const props = defineProps({
    data: {
      type: Array,
      default: () => [],
    },
    columns: {
      type: Array as PropType<Column[]>,
      default: () => [],
    },
    pagination: {
      type: Boolean,
      default: false,
    },
    total: {
      type: Number,
      default: 0,
    },
    pageSize: {
      type: Number,
      default: 10,
    },
    currentPage: {
      type: Number,
      default: 1,
    },
  });

  const emit = defineEmits(['pageChange', 'sizeChange']);
  const slots = useSlots();
  const currentPage = ref(props.currentPage);
  const pageSize = ref(props.pageSize);

  // 计算当前页数据
  const currentPageData = computed(() => {
    if (!props.pagination) return props.data;

    const start = (currentPage.value - 1) * pageSize.value;
    const end = start + pageSize.value;
    return props.data.slice(start, end);
  });

  // 生成网格列宽样式
  const gridStyle = computed(() => {
    const columns = props.columns.map((col) => col.width || '1fr');
    return {
      'grid-template-columns': columns.join(' '),
      gap: '10px',
    };
  });

  // 分页事件处理
  const handlePageChange = (page) => {
    currentPage.value = page;
    emit('pageChange', page);
  };

  const handleSizeChange = (current, size) => {
    pageSize.value = size;
    emit('sizeChange', current, size);
  };
</script>

<style lang="less" scoped>
  .table-container {
    display: flex;
    flex-direction: column;
    max-height: 100%;
    width: 100%;
    padding: 12px;
    background-color: var(--table-bg-color);
    box-shadow:
      0 0 5px 0 rgba(0, 0, 0, 0.02),
      0 2px 10px 0 rgba(0, 0, 0, 0.06),
      0 0 1px 0 rgba(0, 0, 0, 0.3);
    border-radius: 14px;
    gap: 8px;
  }

  .table-header {
    display: grid;
    background-color: var(--table-header-bg-color);
    height: 40px;
    border-radius: 8px;
    align-items: center;
    padding: 0 12px;
    flex-shrink: 0;
    overflow: hidden;
  }

  .header-cell {
    padding: 0 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 500;
    color: var(--desc-color);
    font-size: 14px;
  }

  .table-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
  }

  .table-row {
    display: grid;
    height: 40px;
    border-radius: 8px;
    align-items: center;
    padding: 0 12px;
    transition: background-color 0.2s;
    flex-shrink: 0;
    &:hover {
      background-color: var(--menu-item-h-bg-color);
    }
  }

  .table-cell {
    padding: 0 8px;
    box-sizing: border-box;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text-color);
  }

  .table-pagination {
    margin-top: auto;
    padding-top: 12px;
    border-top: 1px solid var(--menu-item-h-bg-color);

    :deep(.ant-pagination) {
      display: flex;
      justify-content: center;

      .ant-pagination-item,
      .ant-pagination-prev,
      .ant-pagination-next {
        background-color: #27272a;
        border-color: var(--menu-item-h-bg-color);

        a {
          color: #d4d4d8;
        }

        &:hover {
          border-color: #4e4b46;
        }

        &-active {
          background-color: #4e4b46;
          border-color: #4e4b46;
        }
      }

      .ant-pagination-options {
        .ant-select-selector {
          background-color: #27272a;
          border-color: var(--menu-item-h-bg-color);
          color: #d4d4d8;
        }
      }

      .ant-pagination-total-text {
        color: #a1a1aa;
      }
    }
  }
</style>
