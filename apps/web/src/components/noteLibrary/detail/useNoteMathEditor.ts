import { ref, shallowRef, watch } from 'vue';
import { noteMathHtml, noteMathMarkdown, type NoteMathMode } from '@lightnote/shared/note-math';
import { readMathElement, renderNoteMathElements, serializeNoteMath } from '@/utils/noteMath';
import type { MarkdownCodeMirrorExpose } from './MarkdownCodeMirror.vue';

type Context = {
  noteId: string;
  type: string;
  readonly: boolean;
  source: string;
  richEditor: any;
  markdownEditor: MarkdownCodeMirrorExpose | null;
};
type MathValue = { source: string; mode: NoteMathMode };
type OpenOptions = { target?: HTMLElement; markdownRange?: { from: number; to: number }; richRange?: Range };
export function useNoteMathEditor(
  getContext: () => Context,
  translate: (key: string) => string,
  publishRich: (html: string) => void,
) {
  const dialog = shallowRef<(MathValue & { editing: boolean }) | null>(null);
  const saveError = ref('');
  let intent: (Context & OpenOptions & { bookmark?: unknown; original: string }) | null = null;
  const snapshot = (context: Context) =>
    context.type === 'html' ? serializeNoteMath(context.richEditor?.getContent?.() || '') : context.source;
  const close = () => {
    dialog.value = null;
    intent = null;
    saveError.value = '';
  };
  watch([() => getContext().noteId, () => getContext().type, () => getContext().readonly], close);

  function open(mode: NoteMathMode, options: OpenOptions = {}) {
    const ctx = getContext();
    if (ctx.readonly || (ctx.type === 'html' ? !ctx.richEditor : !ctx.markdownEditor)) return false;
    const existing = options.target && readMathElement(options.target);
    let range = options.markdownRange;
    if (ctx.type === 'markdown') {
      if (options.target) {
        const from = options.target.getAttribute('data-ln-math-from');
        const to = options.target.getAttribute('data-ln-math-to');
        if (from === null || to === null || !Number.isInteger(Number(from)) || !Number.isInteger(Number(to)))
          return false;
        range = { from: Number(from), to: Number(to) };
        if (range.from < 0 || range.to <= range.from || range.to > ctx.source.length) return false;
      }
      range ||= ctx.markdownEditor!.getSelection();
    }
    intent = {
      ...ctx,
      ...options,
      markdownRange: range,
      original: snapshot(ctx),
      bookmark: ctx.richEditor?.selection?.getBookmark(2, true),
    };
    saveError.value = '';
    dialog.value = { source: existing?.source || '', mode: existing?.mode || mode, editing: Boolean(existing) };
    return true;
  }

  function apply(value: MathValue) {
    const ctx = getContext();
    const captured = intent;
    if (
      !captured ||
      ctx.readonly ||
      captured.noteId !== ctx.noteId ||
      captured.type !== ctx.type ||
      snapshot(ctx) !== captured.original
    ) {
      saveError.value = translate('noteMath.changed');
      return;
    }
    if (ctx.type === 'markdown') {
      const range = captured.markdownRange!;
      let text = noteMathMarkdown(value.source, value.mode);
      const before = ctx.source.slice(0, range.from);
      const after = ctx.source.slice(range.to);
      if (value.mode === 'inline' && (before.endsWith('$') || /^[\d$]/u.test(after)))
        text = noteMathHtml(value.source, value.mode);
      const nested = captured.target?.closest('table, blockquote, li');
      // A single-line controlled node preserves surrounding table/quote/list syntax.
      if (nested && value.mode === 'block') text = noteMathHtml(value.source, value.mode);
      else if (value.mode === 'block') {
        text = `${before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : ''}${text}${after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n'}`;
      }
      if (
        captured.target &&
        (value.mode === 'inline' || nested) &&
        ctx.source.slice(range.from, range.to).endsWith('\n')
      )
        text += '\n';
      ctx.markdownEditor!.replaceRange(range.from, range.to, text);
      close();
      return;
    }
    const editor = ctx.richEditor;
    const body = editor.getBody?.() as HTMLElement | null;
    if (
      !body ||
      editor !== captured.richEditor ||
      (captured.target && !body.contains(captured.target)) ||
      (captured.richRange && !body.contains(captured.richRange.startContainer))
    ) {
      saveError.value = translate('noteMath.changed');
      return;
    }
    editor.focus();
    editor.undoManager.transact(() => {
      if (captured.target) editor.selection.select(captured.target);
      else if (captured.richRange) editor.selection.setRng(captured.richRange);
      else editor.selection.moveToBookmark(captured.bookmark);
      editor.insertContent(
        noteMathHtml(value.source, value.mode).replace(
          'class="ln-math"',
          'class="ln-math mceNonEditable" contenteditable="false"',
        ),
      );
      editor.nodeChanged?.();
      editor.setDirty?.(true);
      editor.dispatch?.('input');
    });
    publishRich(serializeNoteMath(editor.getContent()));
    void renderNoteMathElements(body, translate('noteMath.editTitle')).catch(() => {});
    close();
  }
  return { dialog, saveError, open, apply, close };
}
