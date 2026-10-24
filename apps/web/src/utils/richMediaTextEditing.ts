import type { Editor } from 'tinymce';
import { liftRichMediaTextOutOfLists, restoreRichMediaTextBlockTags } from './richMediaText';

/** 图文保持独立块；文字区的列表继续使用原生编辑行为。 */
export function bindRichMediaTextEditing(
  editor: Editor,
  options: { isReadonly: () => boolean; onMutation: () => void },
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
  editor.on('BeforeExecCommand', onBeforeCommand, true);
  editor.on('SetContent ExecCommand', normalizeLists);
}
