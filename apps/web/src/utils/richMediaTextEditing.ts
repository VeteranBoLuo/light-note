import type { Editor } from 'tinymce';
import { liftRichMediaTextOutOfLists } from './richMediaText';

/** 编辑器内的结构约束和块后光标。临时落点只使用 DOM 选区和可清理属性，不进入正文。 */
export function bindRichMediaTextEditing(
  editor: Editor,
  options: { isReadonly: () => boolean; onMutation: () => void; onBoundaryFocus: () => void },
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
  let afterBlock: HTMLElement | null = null;
  let restoringBoundary = false;
  let applyingList = false;
  const clear = () => {
    afterBlock?.removeAttribute('data-ln-media-after-caret');
    afterBlock = null;
  };
  const isAtBoundary = () => {
    if (!afterBlock?.isConnected || !editor.getBody()?.contains(afterBlock)) return false;
    const range = editor.selection.getRng();
    return (
      range.collapsed &&
      range.startContainer === afterBlock.parentNode &&
      range.startOffset === Array.prototype.indexOf.call(afterBlock.parentNode!.childNodes, afterBlock) + 1
    );
  };
  const syncBoundary = () => {
    if (!restoringBoundary && afterBlock && !isAtBoundary()) clear();
  };
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
  const continueAfterBlock = () => {
    if (options.isReadonly() || !isAtBoundary() || !afterBlock) return false;
    const block = afterBlock;
    clear();
    editor.undoManager.transact(() => {
      const next = block.nextElementSibling as HTMLElement | null;
      const reusable = next?.matches('p') && editor.dom.isEmpty(next);
      const paragraph = reusable ? next : createParagraph();
      if (!reusable) block.after(paragraph);
      focus(paragraph);
    });
    options.onMutation();
    return true;
  };

  const onMouseDown = (event: MouseEvent) => {
    if (options.isReadonly() || event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey)
      return;
    const body = editor.getBody();
    const target = event.target as Element | null;
    if (target?.closest?.('section.ln-media-text')) {
      clear();
      return;
    }
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
    if (!block) {
      clear();
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    clear();
    options.onBoundaryFocus();
    editor.focus();
    const range = editor.getDoc().createRange();
    range.setStartAfter(block);
    range.collapse(true);
    editor.selection.setRng(range);
    afterBlock = block;
    block.setAttribute('data-ln-media-after-caret', 'true');
    editor.nodeChanged();
  };

  const handleKeydown = (event: KeyboardEvent) => {
    if (options.isReadonly() || event.defaultPrevented || event.isComposing || !isAtBoundary() || !afterBlock)
      return false;
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopImmediatePropagation();
      return continueAfterBlock();
    }
    if (event.key === 'Backspace') {
      event.preventDefault();
      event.stopImmediatePropagation();
      const block = afterBlock;
      clear();
      editor.undoManager.transact(() => {
        const next = block.nextElementSibling as HTMLElement | null;
        const paragraph = next?.matches('p') ? next : createParagraph();
        if (paragraph !== next) block.after(paragraph);
        block.remove();
        focus(paragraph);
      });
      options.onMutation();
      return true;
    }
    if (['ArrowLeft', 'ArrowUp', 'Escape'].includes(event.key)) {
      const captions = afterBlock.querySelectorAll<HTMLElement>('.ln-media-text__content');
      const caption = captions[captions.length - 1];
      clear();
      if (caption) {
        event.preventDefault();
        event.stopImmediatePropagation();
        editor.selection.select(caption, true);
        editor.selection.collapse(false);
        editor.nodeChanged();
        return true;
      }
    }
    return false;
  };

  const normalizeLists = () => {
    const body = editor.getBody();
    if (!body || options.isReadonly()) return;
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
  const onBeforeInput = (event: InputEvent) => {
    if (!event.defaultPrevented && event.inputType.startsWith('insert')) continueAfterBlock();
  };
  const onBeforeCommand = (event: { command: string; ui?: boolean; value?: unknown; preventDefault: () => void }) => {
    if (event.command.toLowerCase() === 'mcefocus' && !event.value && isAtBoundary() && afterBlock) {
      // 普通 focus 会把块后选区规范化到图注。保留真实焦点与活动编辑器，只跳过这次选区改写。
      event.preventDefault();
      restoringBoundary = true;
      try {
        editor.focus(true);
        editor.getBody().focus({ preventScroll: true });
        const range = editor.getDoc().createRange();
        range.setStartAfter(afterBlock);
        range.collapse(true);
        editor.selection.setRng(range);
      } finally {
        restoringBoundary = false;
      }
      return;
    }
    if (
      /^(mceInsertContent|InsertContent|InsertUnorderedList|InsertOrderedList|ToggleNoteTodo|FormatBlock)$/iu.test(
        event.command,
      )
    ) {
      continueAfterBlock();
    }
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
  const onCompositionStart = () => {
    continueAfterBlock();
  };
  // TinyMCE 会在 mouseup 时再次校正选区，click 后重新锚定，避免落回下一段文字。
  editor.on('mousedown click', onMouseDown, true);
  editor.on('NodeChange SelectionChange', syncBoundary);
  editor.on('beforeinput', onBeforeInput);
  editor.on('compositionstart', onCompositionStart);
  editor.on('BeforeExecCommand', onBeforeCommand, true);
  editor.on('SetContent ExecCommand', normalizeLists);
  editor.on('undo redo SetContent SwitchMode', clear);
  editor.on('remove', clear);
  return { handleKeydown };
}
