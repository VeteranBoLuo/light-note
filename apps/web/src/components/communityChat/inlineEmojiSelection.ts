// Native triple-click selection can stop at a non-editable image atom. Rebuild
// the logical paragraph, retaining emoji nodes and respecting explicit newlines.
export function selectInlineEmojiParagraph(event: MouseEvent) {
  if (event.detail !== 3 || !(event.currentTarget instanceof HTMLElement)) return;
  const root = event.currentTarget;
  if (!root.querySelector('[data-emoji-atom]')) return;
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const anchor = selection.getRangeAt(0).cloneRange();
  if (!root.contains(anchor.startContainer)) return;
  anchor.collapse(true);
  type Point = { node: Node; offset: number };
  const units: { text: string; start: Point; end: Point }[] = [];
  function visit(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      for (let offset = 0; offset < text.length; offset++)
        units.push({ text: text[offset], start: { node, offset }, end: { node, offset: offset + 1 } });
    } else if (node instanceof Element && (node.hasAttribute('data-emoji-atom') || node.tagName === 'BR')) {
      const parent = node.parentNode!;
      const offset = Array.from(parent.childNodes).indexOf(node);
      units.push({
        text: node.tagName === 'BR' ? '\n' : '\ufffc',
        start: { node: parent, offset },
        end: { node: parent, offset: offset + 1 },
      });
    } else {
      node.childNodes.forEach(visit);
    }
  }
  visit(root);
  if (!units.length) return;
  const point = document.createRange();
  let offset = 0;
  for (const unit of units) {
    point.setStart(unit.end.node, unit.end.offset);
    point.collapse(true);
    if (point.compareBoundaryPoints(Range.START_TO_START, anchor) > 0) break;
    offset++;
  }
  const text = units.map((unit) => unit.text).join('');
  const start = text.lastIndexOf('\n', offset - 1) + 1;
  const newline = text.indexOf('\n', offset);
  const end = newline < 0 ? units.length : newline;
  if (end <= start) return;
  const range = document.createRange();
  range.setStart(units[start].start.node, units[start].start.offset);
  range.setEnd(units[end - 1].end.node, units[end - 1].end.offset);
  event.preventDefault();
  selection.removeAllRanges();
  selection.addRange(range);
}

export function selectInlineEmoji(event: MouseEvent) {
  const atom = event.target instanceof Element ? event.target.closest('[data-emoji-atom]') : null;
  if (!atom) return;
  event.preventDefault();
  const range = document.createRange();
  range.selectNode(atom);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

export function syncInlineEmojiSelection(root: HTMLElement) {
  const selection = window.getSelection();
  const range = selection?.rangeCount && !selection.isCollapsed ? selection.getRangeAt(0) : null;
  const textRects: DOMRect[] = [];
  if (range) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const text = document.createRange();
      text.selectNodeContents(walker.currentNode);
      textRects.push(...Array.from(text.getClientRects?.() || []));
    }
  }
  root.querySelectorAll<HTMLElement>('[data-emoji-atom]').forEach((atom) => {
    const atomRange = document.createRange();
    atomRange.selectNodeContents(atom);
    const start = range?.cloneRange();
    const end = range?.cloneRange();
    const atomStart = atomRange.cloneRange();
    const atomEnd = atomRange.cloneRange();
    start?.collapse(true);
    end?.collapse(false);
    atomStart.collapse(true);
    atomEnd.collapse(false);
    const selected = Boolean(
      start &&
      end &&
      start.compareBoundaryPoints(Range.START_TO_START, atomEnd) < 0 &&
      end.compareBoundaryPoints(Range.START_TO_START, atomStart) > 0,
    );
    atom.classList.toggle('is-selected', selected);
    if (!selected) return;
    const box = atom.getBoundingClientRect();
    const line = textRects.find((rect) => rect.height && rect.top < box.bottom && rect.bottom > box.top);
    const height = Math.max(line?.height || 0, parseFloat(getComputedStyle(atom).lineHeight) || box.height * 1.2);
    atom.style.setProperty(
      '--emoji-selection-top',
      line ? `${line.top - box.top - (height - line.height) / 2}px` : `${(box.height - height) / 2}px`,
    );
    atom.style.setProperty('--emoji-selection-height', `${height}px`);
  });
}
