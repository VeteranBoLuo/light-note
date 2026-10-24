import type { Editor } from 'tinymce';
import { liftRichMediaTextOutOfLists, restoreRichMediaTextBlockTags } from './richMediaText';

/** 图文保持独立块；点击右侧外沿时直接在块下方进入普通段落。 */
export function bindRichMediaTextEditing(
  editor: Editor,
  options: { isReadonly: () => boolean; onMutation: () => void; onParagraphFocus: () => void },
) {
  editor.on('PreInit', () => {
    // 提示和选中标记只属于展示层；原生临时属性机制也会将它们排除出撤销快照比较。
    [
      'data-mce-placeholder',
      'data-ln-media-selected',
      'data-ln-media-item-selected',
      'data-ln-media-after-caret',
    ].forEach((attribute) => editor.serializer.addTempAttr(attribute));
  });
  let applyingList = false;
  const createParagraph = () => {
    const paragraph = editor.getDoc().createElement('p');
    paragraph.append(editor.dom.create('br', { 'data-mce-bogus': '1' }));
    return paragraph;
  };
  const focus = (node: HTMLElement) => {
    editor.selection.setCursorLocation(node, 0);
    editor.selection.scrollIntoView(node);
    editor.nodeChanged();
  };
  const onClick = (event: MouseEvent) => {
    if (options.isReadonly() || event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey)
      return;
    const body = editor.getBody();
    const target = event.target as Element | null;
    if (target?.closest?.('section.ln-media-text')) return;
    const edge = body.getBoundingClientRect().right;
    const gutter = Number.parseFloat(editor.dom.getStyle(body, 'padding-right', true)) || 0;
    const scope = target && body.contains(target) ? target : body;
    // 图文右侧到正文外沿之间的留白属于块后落点，文字区和图片自身继续使用原交互。
    const block = Array.from(scope.querySelectorAll<HTMLElement>('section.ln-media-text')).find((candidate) => {
      const rectangle = candidate.getBoundingClientRect();
      const cell = candidate.closest('td,th');
      if (cell !== (target?.closest?.('td,th') || null)) return false;
      const rightEdge = cell ? Math.min(edge, cell.getBoundingClientRect().right) : edge;
      return (
        event.clientX >= rectangle.right &&
        event.clientX <= Math.min(rightEdge, rectangle.right + gutter) &&
        event.clientY >= rectangle.top &&
        event.clientY <= rectangle.bottom
      );
    });
    if (!block) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    options.onParagraphFocus();
    editor.focus();
    const next = block.nextElementSibling as HTMLElement | null;
    if (next?.matches('p') && editor.dom.isEmpty(next)) {
      focus(next);
      return;
    }
    editor.undoManager.transact(() => {
      const paragraph = createParagraph();
      block.after(paragraph);
      focus(paragraph);
    });
    options.onMutation();
  };

  const normalizeLists = () => {
    const body = editor.getBody();
    if (!body || options.isReadonly()) return;
    restoreRichMediaTextBlockTags(body);
    const blocks = body.querySelectorAll<HTMLElement>('li section.ln-media-text');
    if (!blocks.length) return;
    const range = editor.selection.getRng();
    const { startContainer, startOffset, endContainer, endOffset } = range;
    for (const block of blocks) liftRichMediaTextOutOfLists(block, body);
    // 拆分只移动原节点，使用原端点还原图注内光标，避免路径书签因列表层级变化而失效。
    if (body.contains(startContainer) && body.contains(endContainer)) {
      const restored = editor.getDoc().createRange();
      restored.setStart(
        startContainer,
        Math.min(
          startOffset,
          startContainer.nodeType === 3 ? startContainer.textContent!.length : startContainer.childNodes.length,
        ),
      );
      restored.setEnd(
        endContainer,
        Math.min(
          endOffset,
          endContainer.nodeType === 3 ? endContainer.textContent!.length : endContainer.childNodes.length,
        ),
      );
      editor.selection.setRng(restored);
    }
  };
  const onBeforeCommand = (event: { command: string; ui?: boolean; value?: unknown; preventDefault: () => void }) => {
    if (!options.isReadonly() && !applyingList && /^(InsertUnorderedList|InsertOrderedList)$/iu.test(event.command)) {
      const range = editor.selection.getRng();
      const captionFor = (node: Node) =>
        (node.nodeType === 1 ? (node as Element) : node.parentElement)?.closest('.ln-media-text__content');
      const caption = captionFor(range.startContainer);
      if (caption && caption === captionFor(range.endContainer)) return;
      const blocks = Array.from(editor.getBody().querySelectorAll<HTMLElement>('section.ln-media-text')).filter(
        (block) => range.intersectsNode(block),
      );
      if (!blocks.length) return;
      // 原生 lists 会拆掉跨块选区中的 section。临时将图文作为不可拆分内容，复用其余列表行为。
      event.preventDefault();
      editor.undoManager.transact(() => {
        const editable = blocks.map((block) => block.getAttribute('contenteditable'));
        applyingList = true;
        try {
          blocks.forEach((block) => block.setAttribute('contenteditable', 'false'));
          editor.execCommand(event.command, event.ui, event.value);
        } finally {
          blocks.forEach((block, index) => {
            if (editable[index] === null) block.removeAttribute('contenteditable');
            else block.setAttribute('contenteditable', editable[index]!);
          });
          applyingList = false;
          normalizeLists();
        }
      });
      options.onMutation();
    }
  };
  // 在原生 mouseup 选区处理之后落到真实段落，仅处理一次 click，避免重复换行。
  editor.on('click', onClick, true);
  editor.on('BeforeExecCommand', onBeforeCommand, true);
  editor.on('SetContent ExecCommand', normalizeLists);
}
