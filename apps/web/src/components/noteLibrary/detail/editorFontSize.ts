export const EDITOR_FONT_SIZES = [
  8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 32, 36, 40, 48, 56, 64, 72, 96,
] as const;

export const NOTE_INLINE_FONT_STYLES =
  'a,abbr,b,bdi,bdo,cite,code,del,dfn,em,i,ins,kbd,mark,q,rp,rt,ruby,s,samp,small,strike,strong,sub,sup,time,u,var';

export interface EditorFontSizeState {
  enabled: boolean;
  value: string | null;
}

function readTextSize(body: HTMLElement, node: Node) {
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
  const editBoundary = element?.closest('[contenteditable]');
  if (editBoundary !== body && editBoundary?.getAttribute('contenteditable') === 'false') return undefined;
  if (element?.closest('pre, img, hr')) return undefined;

  for (let parent = element; parent && parent !== body; parent = parent.parentElement) {
    if (parent.style?.fontSize && (parent.localName === 'span' || parent.matches(NOTE_INLINE_FONT_STYLES))) {
      return parent.style.fontSize;
    }
  }
  return '';
}

export function readEditorFontSize(body: HTMLElement, range: Range): EditorFontSizeState {
  const unavailable = { enabled: false, value: '' };
  if (!body.contains(range.startContainer) || !body.contains(range.endContainer)) return unavailable;
  if (range.collapsed) {
    const value = readTextSize(body, range.startContainer);
    return value === undefined ? unavailable : { enabled: true, value };
  }

  const root = range.commonAncestorContainer;
  const walker = body.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  walker.currentNode = range.startContainer;
  let value: string | null | undefined;
  let text =
    range.startContainer.nodeType === Node.TEXT_NODE
      ? (range.startContainer as Text)
      : (walker.nextNode() as Text | null);
  while (text && range.comparePoint(text, 0) <= 0) {
    if (
      text.length &&
      range.intersectsNode(text) &&
      (text !== range.startContainer || range.startOffset < text.length) &&
      (text !== range.endContainer || range.endOffset > 0)
    ) {
      const size = readTextSize(body, text);
      if (size === undefined) return unavailable;
      value = value === undefined || value === size ? size : null;
    }
    text = walker.nextNode() as Text | null;
  }
  return value === undefined ? unavailable : { enabled: true, value };
}
