import { apiBasePost } from '@/http/request';

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
  app.directive('click-log', (el, binding) => {
    let isMouseDown = false;
    el.onmousedown = () => {
      isMouseDown = true;
    };
    el.onmouseup = () => {
      if (isMouseDown) {
        apiBasePost('/api/common/recordOperationLogs', binding.value).then(() => {});
      }
      isMouseDown = false;
    };
    // 如果鼠标按下后移出元素再释放，也需要重置状态
    el.onmouseleave = () => {
      isMouseDown = false;
    };
  });
}
