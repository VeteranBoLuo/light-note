import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { currentMarkdownCodeLanguage } from './markdownCodeLanguage';

function state(source: string, position: number, to = position) {
  return EditorState.create({ doc: source, selection: { anchor: position, head: to }, extensions: [markdown()] });
}
describe('currentMarkdownCodeLanguage', () => {
  it.each([
    '```js\ncode\n```',
    '~~~python\ncode\n~~~',
    '```\ncode\n```',
    '> ```ts\n> code\n> ```',
    '- ```js\n  code\n  ```',
    '````js title="demo"\ncode\n````',
  ])('changes only the language in %s', (source) => {
    const current = currentMarkdownCodeLanguage(state(source, source.indexOf('code') + 2));
    expect(current).not.toBeNull();
    const changed = source.slice(0, current!.from) + 'sql' + source.slice(current!.to);
    expect(changed).toBe(source.replace(/(`{3,}|~{3})(?:js|python|ts)?/u, '$1sql'));
  });
  it('ignores inline/indented code, prose and selections crossing blocks', () => {
    for (const source of ['plain text', '`code`', '    code'])
      expect(currentMarkdownCodeLanguage(state(source, 5))).toBeNull();
    const source = '```js\ncode\n```\n\nprose';
    expect(currentMarkdownCodeLanguage(state(source, 8, source.length))).toBeNull();
  });
});
