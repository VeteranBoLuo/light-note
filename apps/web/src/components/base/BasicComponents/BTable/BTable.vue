<template>
  <div class="table-container" :class="{ 'is-fill': props.fill, 'has-pagination': props.pagination }">
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
          <SvgIcon
            class="sort-arrow"
            :class="{ active: activeSort.key === col.key && activeSort.order === 'asc' }"
            :src="icon.table_sort_up"
            size="10"
          />
          <SvgIcon
            class="sort-arrow"
            :class="{ active: activeSort.key === col.key && activeSort.order === 'desc' }"
            :src="icon.table_sort_down"
            size="10"
          />
        </span>
      </div>
    </div>

    <!-- 表格内容 -->
    <div
      ref="tableBodyRef"
      class="table-body"
      :class="{ 'is-virtual': props.virtual }"
      @scroll.passive="handleBodyScroll"
    >
      <div class="table-row-sizer" :class="{ 'is-virtual': props.virtual }" :style="virtualSizerStyle">
        <div class="table-row-window" :class="{ 'is-virtual': props.virtual }" :style="virtualWindowStyle">
          <template v-for="entry in renderedRows" :key="entry.item[props.rowKey] ?? entry.index">
            <div
              class="table-row"
              :class="{ 'is-clickable': props.rowClickable }"
              :style="[gridStyle, virtualRowStyle]"
              @click="handleRowClick(entry.item, entry.index)"
            >
              <div v-if="props.selectable" class="table-cell" style="width: 50px" @click.stop>
                <BCheckbox
                  :checked="isRowSelected(entry.item)"
                  @change="(checked) => handleRowSelectChange(entry.item, checked)"
                />
              </div>
              <div
                v-for="col in props.columns"
                :key="col.key"
                class="table-cell"
                :class="{ 'table-cell--overflow-visible': col.overflowVisible }"
                :style="{ width: col.width || 'auto' }"
              >
                <slot
                  name="bodyCell"
                  :text="entry.item[col.key]"
                  :record="entry.item"
                  :index="entry.index"
                  :column="col"
                >
                  <BTooltip v-if="col.ellipsis !== false" :title="String(entry.item[col.key] ?? '')">
                    <span class="cell-text">{{ entry.item[col.key] }}</span>
                  </BTooltip>
                  <template v-else>{{ entry.item[col.key] }}</template>
                </slot>
              </div>
            </div>
            <div
              v-if="
                !props.virtual &&
                props.expandedRows?.length &&
                entry.item[props.rowKey] != null &&
                props.expandedRows.includes(entry.item[props.rowKey])
              "
              class="table-expand-row"
            >
              <slot name="expandedRow" :record="entry.item" />
            </div>
          </template>
        </div>
      </div>
      <div v-if="props.loading" class="table-loading">
        <BLoading inline :loading="true" :title="props.loadingText" />
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
  import { computed, nextTick, onBeforeUnmount, onMounted, PropType, ref, watch } from 'vue';
  import { Column } from '@/components/base/BasicComponents/BTable/config.ts';
  import BPagination from '@/components/base/BasicComponents/BPagination.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';

  type SortOrder = 'asc' | 'desc' | null;
  type TableSort = { key: string | null; order: SortOrder };

  const props = defineProps({
    data: {
      type: Array as PropType<any[]>,
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
    fill: {
      type: Boolean,
      default: false,
    },
    virtual: {
      type: Boolean,
      default: false,
    },
    rowHeight: {
      type: Number,
      default: 40,
    },
    overscan: {
      type: Number,
      default: 8,
    },
    loading: {
      type: Boolean,
      default: false,
    },
    loadingText: {
      type: String,
      default: '',
    },
    hasMore: {
      type: Boolean,
      default: false,
    },
    remoteSort: {
      type: Boolean,
      default: false,
    },
    sort: {
      type: Object as PropType<TableSort>,
      default: () => ({ key: null, order: null }),
    },
  });

  const emit = defineEmits(['pageChange', 'sizeChange', 'selectionChange', 'rowClick', 'loadMore', 'sortChange']);
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
  const sortState = ref<TableSort>({ key: null, order: null });
  const activeSort = computed(() => (props.remoteSort ? props.sort : sortState.value));

  const handleSortToggle = (key: string) => {
    let nextSort: TableSort;
    if (activeSort.value.key !== key) {
      nextSort = { key, order: 'desc' };
    } else if (activeSort.value.order === 'desc') {
      nextSort = { key, order: 'asc' };
    } else {
      nextSort = { key: null, order: null };
    }
    if (!props.remoteSort) sortState.value = nextSort;
    emit('sortChange', nextSort);
  };

  // 排序后的数据
  const sortedData = computed(() => {
    if (props.remoteSort) return props.data;
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

  const tableBodyRef = ref<HTMLElement | null>(null);
  const scrollTop = ref(0);
  const viewportHeight = ref(0);
  const rowGap = 8;
  const rowPitch = computed(() => Math.max(1, props.rowHeight) + rowGap);
  const startIndex = computed(() => {
    if (!props.virtual) return 0;
    return Math.max(0, Math.floor(scrollTop.value / rowPitch.value) - Math.max(0, props.overscan));
  });
  const endIndex = computed(() => {
    if (!props.virtual) return sortedData.value.length;
    const visible = Math.ceil(viewportHeight.value / rowPitch.value);
    return Math.min(sortedData.value.length, startIndex.value + visible + Math.max(0, props.overscan) * 2);
  });
  const renderedRows = computed(() =>
    sortedData.value.slice(startIndex.value, endIndex.value).map((item, offset) => ({
      item,
      index: startIndex.value + offset,
    })),
  );
  const virtualSizerStyle = computed(() => {
    if (!props.virtual) return undefined;
    const rowCount = sortedData.value.length;
    const totalHeight = rowCount ? rowCount * Math.max(1, props.rowHeight) + Math.max(0, rowCount - 1) * rowGap : 0;
    return {
      height: `${totalHeight}px`,
    };
  });
  const virtualWindowStyle = computed(() =>
    props.virtual ? { transform: `translateY(${startIndex.value * rowPitch.value}px)` } : undefined,
  );
  const virtualRowStyle = computed(() =>
    props.virtual
      ? { height: `${Math.max(1, props.rowHeight)}px`, minHeight: `${Math.max(1, props.rowHeight)}px` }
      : undefined,
  );

  let resizeObserver: ResizeObserver | null = null;
  let loadMoreQueued = false;
  function updateViewport() {
    viewportHeight.value = tableBodyRef.value?.clientHeight || 0;
  }
  function maybeLoadMore() {
    const body = tableBodyRef.value;
    if (!body || props.loading || !props.hasMore || loadMoreQueued) return;
    if (body.scrollHeight - body.scrollTop - body.clientHeight > rowPitch.value * 4) return;
    loadMoreQueued = true;
    emit('loadMore');
    nextTick(() => {
      loadMoreQueued = false;
    });
  }
  function handleBodyScroll() {
    scrollTop.value = tableBodyRef.value?.scrollTop || 0;
    maybeLoadMore();
  }
  function scrollToTop() {
    if (tableBodyRef.value) tableBodyRef.value.scrollTop = 0;
    scrollTop.value = 0;
  }

  watch(
    () => [props.data.length, props.hasMore, props.loading],
    () =>
      nextTick(() => {
        updateViewport();
        maybeLoadMore();
      }),
  );

  onMounted(() => {
    updateViewport();
    if (typeof ResizeObserver !== 'undefined' && tableBodyRef.value) {
      resizeObserver = new ResizeObserver(updateViewport);
      resizeObserver.observe(tableBodyRef.value);
    }
    maybeLoadMore();
  });

  onBeforeUnmount(() => resizeObserver?.disconnect());
  defineExpose({ scrollToTop });

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

  .table-container.is-fill {
    height: 100%;
    max-height: none;
    min-height: 0;
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
    overflow-y: auto;
    min-height: 100px;
    max-height: 100%;
    box-sizing: border-box;
  }

  .table-body.is-virtual {
    overflow-anchor: none;
  }

  .table-container.has-pagination:not(.is-fill) .table-body {
    max-height: calc(100% - 100px);
  }

  .table-container.is-fill .table-body {
    flex: 1;
    min-height: 0;
    max-height: none;
  }

  .table-row-sizer {
    width: 100%;
    min-width: 0;
    flex: 0 0 auto;
  }

  .table-row-sizer.is-virtual {
    position: relative;
  }

  .table-row-window {
    width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .table-row-window.is-virtual {
    position: absolute;
    top: 0;
    right: 0;
    left: 0;
    will-change: transform;
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

  .table-loading {
    min-height: 32px;
    margin-top: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
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

  .table-cell.table-cell--overflow-visible {
    overflow: visible;
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
