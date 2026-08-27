// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { marked } from 'marked';
import {
  makeNotePreviewCheckboxesReadonly,
  normalizeMarkdownTaskListHtml,
  noteHtmlToMarkdown,
  promoteEmptyMarkdownTaskToken,
} from './noteHtmlToMarkdown';

describe('noteHtmlToMarkdown', () => {
  it('切换到 Markdown 时保留轻笺图片尺寸元数据', () => {
    expect(
      noteHtmlToMarkdown(
        '<p><img src="/api/file/image.png" alt="截图" title="示例" width="320" data-ln-size="small"></p>',
      ),
    ).toContain('<img src="/api/file/image.png" alt="截图" title="示例" data-ln-size="small" />');
  });

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

  it('HTML 与 Markdown 的阅读预览复选框都不可点击或聚焦', () => {
    const previewHtml = makeNotePreviewCheckboxesReadonly(
      '<p><input type="checkbox" class="note-todo-checkbox"> 未完成</p><p><input checked disabled type="checkbox"> 已完成</p>',
    );
    const root = document.createElement('div');
    root.innerHTML = previewHtml;
    const checkboxes = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));

    expect(checkboxes).toHaveLength(2);
    expect(checkboxes.every((checkbox) => checkbox.disabled)).toBe(true);
    expect(checkboxes.every((checkbox) => checkbox.getAttribute('aria-disabled') === 'true')).toBe(true);
    expect(checkboxes.every((checkbox) => checkbox.tabIndex === -1)).toBe(true);
    expect(checkboxes[1].checked).toBe(true);
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

  it('普通 HTML 表格转换为 GFM 表格，不退化成连续纯文本', () => {
    const markdown = noteHtmlToMarkdown(
      '<table><thead><tr><th>名称</th><th>状态</th></tr></thead><tbody><tr><td>编辑器</td><td>完成</td></tr></tbody></table>',
    );

    expect(markdown).toContain('| 名称 | 状态 |');
    expect(markdown).toMatch(/\|\s*-+\s*\|\s*-+\s*\|/u);
    expect(markdown).toContain('| 编辑器 | 完成 |');
  });

  it('删除线转换为 GFM 双波浪线', () => {
    expect(noteHtmlToMarkdown('<p><s>旧内容</s></p>')).toBe('~~旧内容~~');
  });

  it('下划线转换为受控 u 标签，并保留嵌套的 Markdown 格式', () => {
    const markdown = noteHtmlToMarkdown('<p><u><strong>重要</strong> 内容</u></p>');

    expect(markdown).toBe('<u>**重要** 内容</u>');
    expect(marked.parse(markdown)).toContain('<u><strong>重要</strong> 内容</u>');
  });

  it('图文组合切到 Markdown 时保留一图一文的完整结构', () => {
    const markdown = noteHtmlToMarkdown(`
      <section class="ln-media-text" data-ln-media-position="right" data-ln-media-width="42">
        <figure class="ln-media-text__item">
          <div class="ln-media-text__media"><img src="/window.png" alt="主卧"></div>
          <figcaption class="ln-media-text__content"><p>房间名称：主卧</p></figcaption>
        </figure>
      </section>
    `);

    expect(markdown).toContain('<section class="ln-media-text"');
    expect(markdown).toContain('data-ln-media-position="right"');
    expect(markdown).toContain('<img src="/window.png" alt="主卧">');
    expect(markdown).toContain('<figcaption class="ln-media-text__content"><p>房间名称：主卧</p></figcaption>');
  });

  it('渐变文字切到 Markdown 时保留受控颜色、方向和安全文字样式', () => {
    const markdown = noteHtmlToMarkdown(
      '<p><span class="ln-text-gradient extra" data-ln-text-gradient="true" data-mce-style="temp" style="--ln-gradient-from:#615ced;--ln-gradient-to:#00a884;--ln-gradient-angle:135deg;font-weight:bold;background-image:url(https://example.com/x)">渐变重点</span></p>',
    );

    expect(markdown).toContain('class="ln-text-gradient"');
    expect(markdown).toContain('--ln-gradient-from: #615ced');
    expect(markdown).toContain('--ln-gradient-to: #00a884');
    expect(markdown).toContain('--ln-gradient-angle: 135deg');
    expect(markdown).toContain('font-weight: bold');
    expect(markdown).not.toContain('data-mce-style');
    expect(markdown).not.toContain('background-image');
  });
});
