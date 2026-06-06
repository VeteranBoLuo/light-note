import { onMounted, onUnmounted, ref, type Ref } from 'vue';

/**
 * 表格滚动高度计算的组合式函数
 * 根据视窗高度动态调整表格的滚动区域，避免固定高度导致的显示问题
 * 
 * 用法：
 *   // 方式一：容器 ref（推荐，精确测量）
 *   const tableCardRef = ref<HTMLElement | null>(null);
 *   const { tableScrollY } = useTableScrollY({ ref: tableCardRef });
 *   // template: <div ref="tableCardRef"><a-table :scroll="{ y: tableScrollY }" /></div>
 * 
 *   // 方式二：预留高度（旧方式，向后兼容）
 *   const { tableScrollY } = useTableScrollY({ reservedHeight: 520 });
 */
type UseTableScrollYOptions = {
  /** 表格外层容器的 DOM ref。传此参数时从容器顶部精确计算可用高度 */
  ref?: Ref<HTMLElement | null>;
  /** 预留的高度（仅 ref 未传时作为回退值），用于减去页面中其他固定元素（如头部、底部）的占用空间 */
  reservedHeight?: number;
  /** 最小高度，确保表格至少有此高度 */
  minHeight?: number;
};

export function useTableScrollY(options: UseTableScrollYOptions = {}) {
  const { reservedHeight = 520, minHeight = 240 } = options;
  const containerRef = options.ref;
  const tableScrollY = ref(minHeight);

  /**
   * 更新表格滚动高度
   * - 有容器 ref：测量容器顶部到视口底部的实际距离 - 2px 防溢出
   * - 无容器 ref：回退到 视窗高度 - reservedHeight
   */
  function updateTableScroll() {
    if (containerRef?.value) {
      const rect = containerRef.value.getBoundingClientRect();
      tableScrollY.value = Math.max(
        minHeight,
        Math.floor(window.innerHeight - rect.top - 2),
      );
    } else {
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      tableScrollY.value = Math.max(minHeight, viewportHeight - reservedHeight);
    }
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
