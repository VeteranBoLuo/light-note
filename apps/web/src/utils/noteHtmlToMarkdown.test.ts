// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { noteHtmlToMarkdown } from './noteHtmlToMarkdown';

describe('noteHtmlToMarkdown', () => {
  it('保留已勾选和未勾选的轻笺待办状态', () => {
    const markdown = noteHtmlToMarkdown(`
      <p><input type="checkbox" class="note-todo-checkbox" checked="checked" /> 已完成</p>
      <p><input type="checkbox" class="note-todo-checkbox" /> 未完成</p>
    `);

    expect(markdown).toContain('- [x] 已完成');
    expect(markdown).toContain('- [ ] 未完成');
  });

  it('普通复选框不冒充轻笺待办', () => {
    const markdown = noteHtmlToMarkdown('<p><input type="checkbox" checked="checked" /> 普通表单</p>');

    expect(markdown).not.toContain('[x]');
    expect(markdown).toContain('普通表单');
  });
});
