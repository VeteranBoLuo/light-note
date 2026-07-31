import { onBeforeUnmount, onMounted } from 'vue';

/**
 * 浮层「点击外部 / 按 Esc 关闭」的统一实现。
 *
 * 资源提及浮层在 AI 输入区、待办说明、笔记正文各有一处,之前各自为政:
 * 有的只能选中资源才收起,有的完全没有关闭路径。这里统一收口,避免再漏。
 *
 * 用选择器而不是元素 ref 判定「内部」,因为部分浮层(如笔记用的 BPopover)
 * 会 teleport 到 body,父组件拿不到它的真实 DOM。
 */
export function useDismissOnOutside(options: {
  /** 浮层当前是否展开;未展开时不做任何事 */
  isActive: () => boolean;
  /** 命中这些选择器内部的点击不算「外部」 */
  ignoreSelectors: string[];
  onDismiss: () => void;
  /** 是否响应 Esc,默认 true */
  withEscape?: boolean;
}) {
  function isInsideIgnored(target: Node | null) {
    if (!(target instanceof Element)) return false;
    return options.ignoreSelectors.some((selector) => Boolean(target.closest(selector)));
  }

  function handlePointerDown(event: PointerEvent) {
    if (!options.isActive()) return;
    if (isInsideIgnored(event.target as Node | null)) return;
    options.onDismiss();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (options.withEscape === false) return;
    if (!options.isActive() || event.key !== 'Escape') return;
    options.onDismiss();
  }

  onMounted(() => {
    // 捕获阶段:浮层内部控件可能会 stopPropagation,冒泡阶段收不到
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeydown, true);
  });

  onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', handlePointerDown, true);
    document.removeEventListener('keydown', handleKeydown, true);
  });
}
