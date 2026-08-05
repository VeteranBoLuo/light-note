import { recordOperation } from '@/api/commonApi.ts';
import { renderMermaidBlocks, watchMermaidTheme } from '@/utils/mermaidRender.ts';

export default function (app) {
  app.directive('drag', (el, binding) => {
    /*
     * 如果绑定了一个值，则将target设置为这个值，否则设置为el本身（即被拖拽的元素）
     * 传值主要用于只能按住元素上某个图标这种来拖动整个元素的场景
     * 此时需要把v-drag写在图标上，但是需要被拖动的元素需要传值给v-drag="拖动的元素"
     */
    const target = binding.value ? binding.value : el;
    
    // 要实现拖动改变位置还需设置元素为绝对定位或固定定位
    target.style.position = 'fixed';
    target.style.cursor = 'move'; // 添加可移动光标提示

    // 设置初始位置为右下角
    const offset = 20;
    target.style.right = `${offset}px`;
    target.style.bottom = `${offset}px`;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialX = 0;
    let initialY = 0;
    let hasMoved = false;
    const dragThreshold = 5; // 拖拽阈值，避免微小移动被误认为拖拽

    el.onmousedown = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      isDragging = true;
      hasMoved = false;
      
      startX = e.clientX;
      startY = e.clientY;
      
      // 获取当前元素的位置
      const rect = target.getBoundingClientRect();
      initialX = window.innerWidth - rect.right;
      initialY = window.innerHeight - rect.bottom;

      // 阻止选择文本，防止在拖拽过程中选中文字
      document.onselectstart = () => false;

      const onMouseMove = (e: MouseEvent) => {
        if (!isDragging) return;
        
        const deltaX = startX - e.clientX;
        const deltaY = startY - e.clientY;
        
        // 检查是否超过拖拽阈值
        if (Math.abs(deltaX) > dragThreshold || Math.abs(deltaY) > dragThreshold) {
          hasMoved = true;
        }
        
        if (hasMoved) {
          // 计算新的位置
          const newRight = Math.max(0, Math.min(window.innerWidth - target.offsetWidth, initialX + deltaX));
          const newBottom = Math.max(0, Math.min(window.innerHeight - target.offsetHeight, initialY + deltaY));
          
          // 应用新位置
          target.style.right = `${newRight}px`;
          target.style.bottom = `${newBottom}px`;
          target.style.margin = '0'; // 拖拽时要清空元素的外边距，否则位置会错乱
        }
      };

      const onMouseUp = (e: MouseEvent) => {
        // 如果是拖拽行为，阻止点击事件
        if (hasMoved) {
          e.stopPropagation();
          e.preventDefault();
          
          // 阻止后续的点击事件
          const preventClick = (clickEvent: Event) => {
            clickEvent.stopPropagation();
            clickEvent.preventDefault();
            target.removeEventListener('click', preventClick, true);
          };
          
          target.addEventListener('click', preventClick, true);
          setTimeout(() => {
            target.removeEventListener('click', preventClick, true);
          }, 100);
        }
        
        // 清理事件监听器
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.onselectstart = null;
        isDragging = false;
      };

      // 添加事件监听器
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);

      return false;
    };

    // 清理函数，用于组件卸载时移除事件监听
    el._cleanup = () => {
      document.onselectstart = null;
      el.onmousedown = null;
    };
  });
  // 用 click 而不是 mousedown/mouseup：click 同时覆盖鼠标、触摸和键盘激活，
  // 并且只在浏览器确认一次完整点击后记录，避免移动端入口长期漏记。
  app.directive('click-log', {
    mounted(el, binding) {
      el.__clickLogValue = binding.value;
      el.__clickLogHandler = () => recordOperation(el.__clickLogValue);
      el.addEventListener('click', el.__clickLogHandler);
    },
    updated(el, binding) {
      el.__clickLogValue = binding.value;
    },
    unmounted(el) {
      if (el.__clickLogHandler) el.removeEventListener('click', el.__clickLogHandler);
      delete el.__clickLogHandler;
      delete el.__clickLogValue;
    },
  });

  /*
   * v-auto-scrollbar:滚动时才显示滚动条,停手后缓慢淡出。
   *
   * 只切换滑块颜色,不切换滚动条宽度 —— 改宽度会在显隐瞬间挤压内容宽度,
   * 滚动过程中出现横向抖动比常显滚动条更难受。配套样式见 assets/css/common.less 的 .auto-scrollbar。
   * CSS 无法表达"正在滚动",所以用一个空闲定时器补上这个状态。
   */
  const SCROLLBAR_IDLE_MS = 700;
  app.directive('auto-scrollbar', {
    mounted(el) {
      el.classList.add('auto-scrollbar');
      el.__autoScrollbarHandler = () => {
        el.classList.add('is-scrolling');
        if (el.__autoScrollbarTimer) window.clearTimeout(el.__autoScrollbarTimer);
        el.__autoScrollbarTimer = window.setTimeout(() => {
          el.classList.remove('is-scrolling');
          el.__autoScrollbarTimer = null;
        }, SCROLLBAR_IDLE_MS);
      };
      el.addEventListener('scroll', el.__autoScrollbarHandler, { passive: true });
    },
    unmounted(el) {
      if (el.__autoScrollbarHandler) el.removeEventListener('scroll', el.__autoScrollbarHandler);
      if (el.__autoScrollbarTimer) window.clearTimeout(el.__autoScrollbarTimer);
      delete el.__autoScrollbarHandler;
      delete el.__autoScrollbarTimer;
    },
  });

  /*
   * v-mermaid:容器内 Markdown 渲染出的 ```mermaid 代码块就地换成图。
   *
   * 用在所有 v-html 渲染 Markdown 的地方(笔记预览、AI 回复、历史版本…),
   * 让"哪里能出图"只由这一个指令决定,不必每个组件各写一遍扫描逻辑。
   * v-html 更新后 DOM 是整片重建的,所以 updated 里要再扫一次;
   * 编辑时输入很密,用一个短防抖压掉中间态(mermaid 渲染是异步的,半截语法必然报错)。
   */
  const MERMAID_RENDER_DEBOUNCE_MS = 220;
  watchMermaidTheme();
  const scheduleMermaid = (el) => {
    if (el.__mermaidTimer) window.clearTimeout(el.__mermaidTimer);
    el.__mermaidTimer = window.setTimeout(() => {
      el.__mermaidTimer = null;
      void renderMermaidBlocks(el);
    }, MERMAID_RENDER_DEBOUNCE_MS);
  };
  app.directive('mermaid', {
    mounted(el, binding) {
      // v-mermaid="false" 用于流式输出等"内容还没写完"的场景,此时渲染只会不停报语法错
      if (binding.value === false) return;
      scheduleMermaid(el);
    },
    updated(el, binding) {
      if (binding.value === false) return;
      scheduleMermaid(el);
    },
    unmounted(el) {
      if (el.__mermaidTimer) window.clearTimeout(el.__mermaidTimer);
      delete el.__mermaidTimer;
    },
  });
}
