<template>
  <div class="table-container">
    <!-- 表头 -->
    <div class="table-header" :style="gridStyle">
      <div v-if="props.selectable" class="header-cell" style="width: 50px">
        <BCheckbox
          :indeterminate="isIndeterminate"
          :checked="isAllSelected"
          @change="(checked) => handleSelectAllChange(checked)"
        />
      </div>
      <div v-for="col in columns" :key="col.key" class="header-cell" :style="{ width: col.width || 'auto' }">
        <span class="header-cell-title">{{ col.title }}</span>
        <span
          v-if="col.sortable"
          class="sort-icons"
          @click="col.sortable && handleSortToggle(col.key)"
          :class="{ 'is-sortable': col.sortable }"
        >
          <svg
            class="sort-arrow"
            :class="{ active: sortState.key === col.key && sortState.order === 'asc' }"
            viewBox="0 0 10 6"
            width="10"
            height="6"
          >
            <path
              d="M1 5l4-4 4 4"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <svg
            class="sort-arrow"
            :class="{ active: sortState.key === col.key && sortState.order === 'desc' }"
            viewBox="0 0 10 6"
            width="10"
            height="6"
          >
            <path
              d="M1 1l4 4 4-4"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </span>
      </div>
    </div>

    <!-- 表格内容 -->
    <div class="table-body" :style="{ maxHeight: props.pagination ? 'calc(100% - 100px)' : '100%' }">
      <div
        v-for="(item, rowIndex) in sortedData"
        :key="rowIndex"
        class="table-row"
        :class="{ 'is-clickable': props.rowClickable }"
        :style="gridStyle"
        @click="handleRowClick(item, rowIndex)"
      >
        <div v-if="props.selectable" class="table-cell" style="width: 50px" @click.stop>
          <BCheckbox :checked="isRowSelected(item)" @change="(checked) => handleRowSelectChange(item, checked)" />
        </div>
        <div v-for="col in props.columns" :key="col.key" class="table-cell" :style="{ width: col.width || 'auto' }">
          <slot name="bodyCell" :text="item[col.key]" :record="item" :index="rowIndex" :column="col">
            <BTooltip v-if="col.ellipsis !== false" :title="String(item[col.key] ?? '')">
              <span class="cell-text">{{ item[col.key] }}</span>
            </BTooltip>
            <template v-else>{{ item[col.key] }}</template>
          </slot>
        </div>
      </div>
      <!-- 展开行 -->
      <div
        v-if="
          props.expandedRows?.length && item[props.rowKey] != null && props.expandedRows.includes(item[props.rowKey])
        "
        class="table-expand-row"
      >
        <slot name="expandedRow" :record="item" />
      </div>
    </div>

    <!-- 分页器 -->
    <div class="table-pagination" v-if="props.pagination">
      <BPagination
        :current="props.currentPage"
        :page-size="props.pageSize"
        :total="props.total"
        @page-change="emit('pageChange', $event)"
        @size-change="emit('sizeChange', props.currentPage, $event)"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, useSlots, PropType, ref } from 'vue';
  import { Column } from '@/components/base/BasicComponents/BTable/config.ts';
  import BPagination from '@/components/base/BasicComponents/BPagination.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';

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
    selectable: {
      type: Boolean,
      default: false,
    },
    selectedRows: {
      type: Array,
      default: () => [],
    },
    rowKey: {
      type: String,
      default: 'id',
    },
    rowClickable: {
      type: Boolean,
      default: false,
    },
    expandedRows: {
      type: Array as PropType<string[]>,
      default: () => [],
    },
  });

  const emit = defineEmits(['pageChange', 'sizeChange', 'selectionChange', 'rowClick']);
  const slots = useSlots();

  // 生成网格列宽样式
  const gridStyle = computed(() => {
    const columns = props.selectable
      ? ['50px', ...props.columns.map((col) => col.width || '1fr')]
      : props.columns.map((col) => col.width || '1fr');
    return {
      'grid-template-columns': columns.join(' '),
      gap: '10px',
    };
  });

  // 排序状态
  const sortState = ref<{ key: string | null; order: 'asc' | 'desc' | null }>({ key: null, order: null });

  const handleSortToggle = (key: string) => {
    if (sortState.value.key !== key) {
      sortState.value = { key, order: 'desc' };
    } else if (sortState.value.order === 'desc') {
      sortState.value = { key, order: 'asc' };
    } else {
      sortState.value = { key: null, order: null };
    }
  };

  // 排序后的数据
  const sortedData = computed(() => {
    const { key, order } = sortState.value;
    if (!key || !order) return props.data;
    const data = [...props.data];
    data.sort((a, b) => {
      const va = a[key] ?? '';
      const vb = b[key] ?? '';
      // 尝试数值排序
      const na = Number(va);
      const nb = Number(vb);
      if (!isNaN(na) && !isNaN(nb)) {
        return order === 'asc' ? na - nb : nb - na;
      }
      // 字符串排序（兼容时间字符串）
      return order === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
    return data;
  });

  // 全选状态
  const isAllSelected = computed(() => {
    return props.data.length > 0 && props.data.every((item) => props.selectedRows.includes(item[props.rowKey]));
  });

  // 部分选中状态
  const isIndeterminate = computed(() => {
    const selectedInPage = props.data.filter((item) => props.selectedRows.includes(item[props.rowKey]));
    return selectedInPage.length > 0 && selectedInPage.length < props.data.length;
  });

  const isRowSelected = (item: any) => {
    return props.selectedRows.includes(item[props.rowKey]);
  };

  const handleSelectAllChange = (checked: boolean) => {
    const selectedKeys = checked ? props.data.map((item) => item[props.rowKey]) : [];
    emit('selectionChange', selectedKeys);
  };

  const handleRowSelectChange = (item: any, checked: boolean) => {
    const key = item[props.rowKey];
    const newSelected = checked ? [...props.selectedRows, key] : props.selectedRows.filter((k) => k !== key);
    emit('selectionChange', newSelected);
  };

  const handleRowClick = (item, rowIndex: number) => {
    if (!props.rowClickable) return;
    emit('rowClick', item, rowIndex);
  };
</script>

<style lang="less" scoped>
  .table-container {
    display: flex;
    flex-direction: column;
    max-height: 100%;
    width: 100%;
    padding: 12px;
    box-sizing: border-box;
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
    padding: 0 4px;
    display: flex;
    align-items: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 500;
    color: var(--desc-color);
    font-size: 14px;
  }

  .is-sortable {
    cursor: pointer;
    user-select: none;
  }

  .header-cell-title {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sort-icons {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    margin-left: 4px;
    vertical-align: middle;
    flex-shrink: 0;
  }

  .sort-arrow {
    color: var(--desc-color);
    opacity: 0.3;
    transition:
      opacity 0.15s,
      color 0.15s;
  }

  .sort-arrow.active {
    opacity: 1;
    color: var(--primary-color, #615ced);
  }

  .table-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
    min-height: 100px;
  }

  .table-row {
    display: grid;
    min-height: 40px;
    border-radius: 8px;
    align-items: center;
    padding: 0 12px;
    transition: background-color 0.2s;
    flex-shrink: 0;
    &:hover {
      background-color: var(--menu-item-h-bg-color);
    }
  }

  .table-row.is-clickable {
    cursor: pointer;
  }

  .table-expand-row {
    padding: 0 20px 16px;
    margin-bottom: 4px;
  }

  .table-cell {
    padding: 0 8px;
    box-sizing: border-box;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text-color);
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .cell-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
    display: inline-block;
  }

  /* 表格内 BTooltip 需要约束宽度，否则内层 ellipsis 不生效 */
  .table-cell :deep(.b-tooltip-wrap) {
    display: block;
    overflow: hidden;
  }

  .table-pagination {
    margin-top: auto;
    padding-top: 12px;
    border-top: 1px solid var(--menu-item-h-bg-color);
  }
</style>
