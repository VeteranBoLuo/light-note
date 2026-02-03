import { onMounted, onUnmounted, ref } from 'vue';

/**
 * 表格滚动高度计算的组合式函数
 * 根据视窗高度动态调整表格的滚动区域，避免固定高度导致的显示问题
 */
type UseTableScrollYOptions = {
  /** 预留的高度，用于减去页面中其他固定元素（如头部、底部）的占用空间 */
  reservedHeight?: number;
  /** 最小高度，确保表格至少有此高度 */
  minHeight?: number;
};

export function useTableScrollY(options: UseTableScrollYOptions = {}) {
  const { reservedHeight = 520, minHeight = 240 } = options;
  const tableScrollY = ref(minHeight);

  /**
   * 更新表格滚动高度
   * 计算公式：max(minHeight, 视窗高度 - reservedHeight)
   */
  function updateTableScroll() {
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    tableScrollY.value = Math.max(minHeight, viewportHeight - reservedHeight);
  }

  onMounted(() => {
    updateTableScroll();
    window.addEventListener('resize', updateTableScroll);
  });

  onUnmounted(() => {
    window.removeEventListener('resize', updateTableScroll);
  });

  return {
    tableScrollY,
    updateTableScroll,
  };
}
