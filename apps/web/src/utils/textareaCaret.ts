import { getRootZoom } from './zoom';

/**
 * 计算 textarea 内某个字符位置的屏幕坐标(镜像 div 法)。
 *
 * 资源提及浮层需要锚定在触发它的 `@` 上:
 * 如果浮层只相对输入框定位,用户继续打字导致输入框高度变化时,浮层就会跟着漂。
 */
const COPIED_STYLES = [
  'boxSizing',
  'width',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'lineHeight',
  'textTransform',
  'wordSpacing',
  'textIndent',
  'whiteSpace',
  'wordBreak',
  'overflowWrap',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
] as const;

export interface CaretRect {
  /** 相对视口 */
  left: number;
  top: number;
  height: number;
}

export function getTextareaCaretRect(textarea: HTMLTextAreaElement, index?: number): CaretRect {
  const sourceRect = textarea.getBoundingClientRect();
  const style = getComputedStyle(textarea);
  const zoom = getRootZoom();
  const caret = Number.isFinite(index) ? Number(index) : textarea.selectionStart;

  const mirror = document.createElement('div');
  const marker = document.createElement('span');
  mirror.style.position = 'fixed';
  mirror.style.visibility = 'hidden';
  mirror.style.pointerEvents = 'none';
  mirror.style.overflow = 'hidden';
  // fixed 样式使用布局像素，而 DOMRect / 最终 markerRect 使用已含根 zoom 的视觉像素。
  mirror.style.left = `${sourceRect.left / zoom}px`;
  mirror.style.top = `${sourceRect.top / zoom}px`;
  mirror.style.width = `${textarea.offsetWidth}px`;
  for (const key of COPIED_STYLES) mirror.style[key] = style[key];
  mirror.textContent = textarea.value.slice(0, Math.max(0, caret));
  marker.textContent = '​';
  mirror.append(marker);
  document.body.append(mirror);
  const markerRect = marker.getBoundingClientRect();
  mirror.remove();

  return {
    left: markerRect.left - textarea.scrollLeft * zoom,
    top: markerRect.top - textarea.scrollTop * zoom,
    height: markerRect.height || Number.parseFloat(style.lineHeight) || 20,
  };
}

/**
 * 把 caret 坐标换算成「相对某个定位父元素」的偏移,供 absolute 浮层直接使用。
 * 浮层默认画在该行下方;上方空间不足以外的判断交给调用方。
 */
export function toAnchorOffset(caret: CaretRect, container: HTMLElement) {
  const box = container.getBoundingClientRect();
  const zoom = getRootZoom();
  return {
    // getBoundingClientRect 返回视觉像素，absolute 样式使用布局像素；根节点 zoom 下必须统一换算。
    left: (caret.left - box.left) / zoom,
    top: (caret.top - box.top) / zoom,
    lineHeight: caret.height / zoom,
  };
}
