export interface NoteTreeDragScrollOptions {
  clientX: number;
  clientY: number;
  rect: Pick<DOMRect, 'top' | 'right' | 'bottom' | 'left' | 'height'>;
  edgeSize?: number;
  maxStep?: number;
}

export const NOTE_TREE_DRAG_SCROLL_EDGE = 40;
export const NOTE_TREE_DRAG_SCROLL_MAX_STEP = 12;

/**
 * 计算目录树拖拽时的单帧纵向滚动量。
 * client 坐标、DOMRect 与滚动量统一使用 CSS 像素。
 */
export function resolveNoteTreeDragScrollStep({
  clientX,
  clientY,
  rect,
  edgeSize = NOTE_TREE_DRAG_SCROLL_EDGE,
  maxStep = NOTE_TREE_DRAG_SCROLL_MAX_STEP,
}: NoteTreeDragScrollOptions): number {
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return 0;

  const visualEdgeSize = Math.min(Math.max(1, edgeSize), Math.max(1, rect.height / 2));
  const topDistance = clientY - rect.top;
  const bottomDistance = rect.bottom - clientY;

  if (topDistance < visualEdgeSize) {
    const strength = 1 - topDistance / visualEdgeSize;
    return -Math.max(2, Math.ceil(maxStep * strength * strength));
  }
  if (bottomDistance < visualEdgeSize) {
    const strength = 1 - bottomDistance / visualEdgeSize;
    return Math.max(2, Math.ceil(maxStep * strength * strength));
  }
  return 0;
}
