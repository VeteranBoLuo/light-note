import { expect, it } from 'vitest';
import { selectInlineEmoji, selectInlineEmojiParagraph, syncInlineEmojiSelection } from './inlineEmojiSelection';

it('selects the whole emoji on double click and clears its background with the selection', () => {
  const root = document.createElement('div');
  root.innerHTML = '前<span data-emoji-atom><img alt="微笑"></span>后';
  document.body.append(root);
  const atom = root.querySelector('span')!;
  root.addEventListener('dblclick', selectInlineEmoji);
  const event = new MouseEvent('dblclick', { bubbles: true, cancelable: true });
  atom.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  const range = window.getSelection()!.getRangeAt(0);
  expect(range.startContainer).toBe(root);
  expect(range.startOffset).toBe(1);
  expect(range.endOffset).toBe(2);
  syncInlineEmojiSelection(root);
  expect(atom.classList.contains('is-selected')).toBe(true);
  window.getSelection()!.collapse(root, 2);
  syncInlineEmojiSelection(root);
  expect(atom.classList.contains('is-selected')).toBe(false);
  const precedingText = document.createRange();
  precedingText.setStart(root, 0);
  precedingText.setEnd(root, 1);
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(precedingText);
  syncInlineEmojiSelection(root);
  expect(atom.classList.contains('is-selected')).toBe(false);
  precedingText.setEnd(atom, 0);
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(precedingText);
  syncInlineEmojiSelection(root);
  expect(atom.classList.contains('is-selected')).toBe(false);
  window.getSelection()!.removeAllRanges();
  root.remove();
});

for (const useBreakElement of [false, true]) {
  it(`triple-click selects the logical paragraph including emoji (${useBreakElement ? 'br' : 'newline'})`, () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<span>前文</span><span data-emoji-atom><img data-inline-emoji-token="token"></span><span>后文</span>' +
      (useBreakElement ? '<br>' : '\n') +
      '<span>下一段</span><span data-emoji-atom><img></span>';
    document.body.append(root);
    root.addEventListener('click', selectInlineEmojiParagraph);
    const range = document.createRange();
    range.setStart(root.firstChild!.firstChild!, 0);
    // Chromium's native triple click ends inside the first atom before its image.
    range.setEnd(root.children[1], 0);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    root.firstChild!.dispatchEvent(new MouseEvent('click', { detail: 3, bubbles: true, cancelable: true }));
    const fragment = selection.getRangeAt(0).cloneContents();
    expect(fragment.textContent).toBe('前文后文');
    expect(fragment.querySelectorAll('img')).toHaveLength(1);
    expect(fragment.querySelector('img')!.dataset.inlineEmojiToken).toBe('token');
    const second = root.querySelectorAll('span')[3].firstChild!;
    range.setStart(second, 0);
    range.setEnd(second, 1);
    selection.removeAllRanges();
    selection.addRange(range);
    second.dispatchEvent(new MouseEvent('click', { detail: 3, bubbles: true, cancelable: true }));
    expect(selection.toString()).toBe('下一段');
    expect(selection.getRangeAt(0).cloneContents().querySelectorAll('img')).toHaveLength(1);
    selection.removeAllRanges();
    root.remove();
  });
}
