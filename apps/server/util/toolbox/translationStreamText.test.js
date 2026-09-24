import { it, expect } from 'vitest';
import { translationDraftText, restoreTranslationDraft } from './translationStreamText.js';
import { splitTranslationText } from './translationText.js';
it('decodes incrementally before the tool call completes, including escaped Unicode and quotes', () => {
  const input = '{"id":"1","text":"你好\\n\\"世界\\"\\uD83D\\uDE00","complete":true}';
  let previous = '';
  for (let i = 0; i <= input.length; i++) {
    const text = translationDraftText(input.slice(0, i));
    expect(text.startsWith(previous)).toBe(true);
    previous = text;
  }
  expect(previous).toBe('你好\n"世界"😀');
  expect(translationDraftText('{"complete":true,"text":"Hello')).toBe('Hello');
  expect(translationDraftText('{"id":"text\\\":\\\"oops","text":"real')).toBe('real');
});
it('restores immutable code/links but never flashes incomplete placeholders', () => {
  const segment = splitTranslationText('Read `code` now')[0];
  const token = segment.tokens[0].token;
  expect(restoreTranslationDraft(segment, `阅读 ${token.slice(0, 8)}`)).toBe('阅读 ');
  expect(restoreTranslationDraft(segment, `阅读 ${token} 现在`)).toBe('阅读 `code` 现在');
});
