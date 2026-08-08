export interface NoteTreeDragScrollOptions {
  clientX: number;
  clientY: number;
  rect: Pick<DOMRect, 'top' | 'right' | 'bottom' | 'left' | 'height'>;
  rootZoom?: number;
  edgeSize?: number;
  maxStep?: number;
}

export const NOTE_TREE_DRAG_SCROLL_EDGE = 40;
export const NOTE_TREE_DRAG_SCROLL_MAX_STEP = 12;

/**
 * 计算目录树拖拽时的单帧纵向滚动量。
 * client 坐标和 DOMRect 都是视觉坐标，edgeSize/maxStep 是布局坐标，因此热区需乘根缩放，
 * 而返回的 scrollTop 增量保持布局坐标。
 */
export function resolveNoteTreeDragScrollStep({
  clientX,
  clientY,
  rect,
  rootZoom = 1,
  edgeSize = NOTE_TREE_DRAG_SCROLL_EDGE,
  maxStep = NOTE_TREE_DRAG_SCROLL_MAX_STEP,
}: NoteTreeDragScrollOptions): number {
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return 0;

  const zoom = Number.isFinite(rootZoom) && rootZoom > 0 ? rootZoom : 1;
  const visualEdgeSize = Math.min(Math.max(1, edgeSize * zoom), Math.max(1, rect.height / 2));
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
