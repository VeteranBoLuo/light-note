import { describe, it, expect, vi } from 'vitest';
import { effectScope, nextTick, reactive } from 'vue';
import { useNoteMathEditor } from './useNoteMathEditor';

function setup(source = 'Before $x$ after $x$.') {
  const replaceRange = vi.fn();
  const context = reactive({
    noteId: 'note-1',
    type: 'markdown',
    readonly: false,
    source,
    richEditor: null,
    markdownEditor: { getSelection: () => ({ from: 0, to: 6 }), replaceRange } as any,
  });
  const scope = effectScope();
  const math = scope.run(() =>
    useNoteMathEditor(
      () => context,
      (key) => key,
      vi.fn(),
    ),
  )!;
  return { context, math, replaceRange, stop: () => scope.stop() };
}

describe('formula edit transactions', () => {
  it('replaces exactly the selected occurrence and keeps the captured source until apply', () => {
    const test = setup();
    const target = document.createElement('span');
    Object.assign(target.dataset, { lnMath: 'inline', lnLatex: 'x', lnMathFrom: '17', lnMathTo: '20' });
    expect(test.math.open('inline', { target })).toBe(true);
    expect(test.replaceRange).not.toHaveBeenCalled();
    test.math.apply({ source: 'x^2', mode: 'inline' });
    expect(test.replaceRange).toHaveBeenCalledWith(17, 20, '$x^2$');
    expect(test.math.dialog.value).toBeNull();
    test.stop();
  });
  it('keeps slash text on cancel, and adds paragraph boundaries when inserting a block', () => {
    const test = setup('before /math after');
    test.math.open('block', { markdownRange: { from: 7, to: 12 } });
    test.math.close();
    expect(test.replaceRange).not.toHaveBeenCalled();
    test.math.open('block', { markdownRange: { from: 7, to: 12 } });
    test.math.apply({ source: 'x', mode: 'block' });
    expect(test.replaceRange).toHaveBeenCalledWith(7, 12, '\n\n$$\nx\n$$\n\n');
    test.stop();
  });
  it('refuses stale source or readonly edits, and closes the dialog on note changes', async () => {
    const test = setup();
    test.math.open('inline');
    test.context.source = 'changed elsewhere';
    test.math.apply({ source: 'x', mode: 'inline' });
    expect(test.replaceRange).not.toHaveBeenCalled();
    expect(test.math.saveError.value).toBe('noteMath.changed');
    test.context.noteId = 'note-2';
    await nextTick();
    expect(test.math.dialog.value).toBeNull();
    test.context.readonly = true;
    expect(test.math.open('inline')).toBe(false);
    test.stop();
  });
});
