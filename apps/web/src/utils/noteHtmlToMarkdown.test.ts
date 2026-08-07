// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { marked } from 'marked';
import { normalizeMarkdownTaskListHtml, noteHtmlToMarkdown, promoteEmptyMarkdownTaskToken } from './noteHtmlToMarkdown';

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

  it('Markdown 待办进入富文本后去掉列表圆点并可无损转回', () => {
    const richHtml = normalizeMarkdownTaskListHtml(
      '<ul><li><input disabled type="checkbox"> 未完成</li><li><input checked disabled type="checkbox"> 已完成</li></ul>',
      true,
    );

    expect(richHtml).not.toContain('<ul');
    expect(richHtml).not.toContain('disabled');
    expect(richHtml).toContain('class="note-todo-checkbox"');
    expect(richHtml).toContain('data-note-task="true"');
    expect(noteHtmlToMarkdown(richHtml)).toBe('- [ ] 未完成\n\n- [x] 已完成');
  });

  it('HTML 与 Markdown 连续往返时持续保留复选框与完成状态', () => {
    let html =
      '<p><input type="checkbox" class="note-todo-checkbox" /> 测试</p><p><input type="checkbox" class="note-todo-checkbox" checked="checked" /> 哈哈</p>';

    for (let round = 0; round < 3; round += 1) {
      const markdown = noteHtmlToMarkdown(html);
      expect(markdown).toBe('- [ ] 测试\n\n- [x] 哈哈');

      html = normalizeMarkdownTaskListHtml(marked.parse(markdown) as string, true);
      expect(html).not.toContain('<ul');
      expect(html).toContain('data-note-task="true"');
    }
  });

  it('Markdown 待办预览保留列表结构但提供无圆点样式标记', () => {
    const previewHtml = normalizeMarkdownTaskListHtml('<ul><li><input disabled type="checkbox"> 任务</li></ul>', false);

    expect(previewHtml).toContain('class="note-task-list"');
    expect(previewHtml).toContain('class="note-task-list-item"');
    expect(previewHtml).toContain('class="note-todo-checkbox"');
    expect(previewHtml).toContain('disabled');
  });

  it('工具栏刚插入的空 Markdown 待办也渲染为复选框', () => {
    const html = marked.parse('- [ ]\n- [x]', { walkTokens: promoteEmptyMarkdownTaskToken }) as string;
    const previewHtml = normalizeMarkdownTaskListHtml(html, false);

    expect(previewHtml.match(/type="checkbox"/g)).toHaveLength(2);
    expect(previewHtml).toContain('checked');
    expect(previewHtml).not.toContain('[ ]');
    expect(previewHtml).not.toContain('[x]');
    expect(previewHtml).not.toContain('\u200b');
  });

  it('空 Markdown 待办切到富文本再切回时不残留不可见占位符', () => {
    const markedHtml = marked.parse('- [ ]', { walkTokens: promoteEmptyMarkdownTaskToken }) as string;
    const richHtml = normalizeMarkdownTaskListHtml(markedHtml, true);
    const markdown = noteHtmlToMarkdown(richHtml);

    expect(richHtml).not.toContain('\u200b');
    expect(markdown).toBe('- [ ]');
  });

  it('空待办兼容有序列表但不会误改代码块', () => {
    const orderedHtml = marked.parse('1. [ ]', { walkTokens: promoteEmptyMarkdownTaskToken }) as string;
    const codeHtml = marked.parse('```\n- [ ]\n```', { walkTokens: promoteEmptyMarkdownTaskToken }) as string;

    expect(orderedHtml.match(/type="checkbox"/g)).toHaveLength(1);
    expect(codeHtml).not.toContain('type="checkbox"');
    expect(codeHtml).toContain('<code>- [ ]');
  });

  it('普通无序列表往返时统一使用短横线，不漂移成星号', () => {
    const markdown = noteHtmlToMarkdown('<ul><li>第一项</li><li>第二项</li></ul>');
    expect(markdown).toBe('-   第一项\n-   第二项');
    expect(markdown).not.toContain('*');
  });
});
