import { describe, expect, it, vi } from 'vitest';
import { sanitizeNoteHtml, sanitizePersistedNoteContent } from './noteHtmlSanitizer.js';

describe('noteHtmlSanitizer', () => {
  it('保留富文本语义、任务清单、Mermaid、资源引用与安全排版', () => {
    const source =
      '<h2 style="text-align:center;color:#615ced">标题</h2>' +
      '<ul class="note-task-list"><li class="note-task-list-item"><input type="checkbox" checked="checked" data-note-task="true">完成</li></ul>' +
      '<pre class="language-mermaid" data-language="mermaid">flowchart TD\nA--&gt;B</pre>' +
      '<a href="/noteLibrary/n-1" target="_blank" contenteditable="false" data-ln-resource-type="note" data-ln-resource-id="n-1">引用</a>' +
      '<table style="width:100%"><tbody><tr><td colspan="2">单元格</td></tr></tbody></table>';

    const { html, report } = sanitizeNoteHtml(source);

    expect(html).toContain('<h2 style="text-align:center;color:#615ced">标题</h2>');
    expect(html).toContain('class="note-task-list"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('checked="checked"');
    expect(html).toContain('data-note-task="true"');
    expect(html).toContain('class="language-mermaid"');
    expect(html).toContain('data-ln-resource-id="n-1"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('colspan="2"');
    expect(report.removedTags).toBe(0);
  });

  it('删除脚本、事件属性、危险协议、危险样式与非复选框输入', () => {
    const source =
      '<script>alert(1)</script>' +
      '<p onclick="steal()" style="color:red;background-image:url(javascript:steal())">正文</p>' +
      '<a href="javascript:steal()">坏链接</a>' +
      '<img src="data:image/svg+xml;base64,PHN2Zz4=" onerror="steal()">' +
      '<input type="text" value="secret"><input type="checkbox" data-note-task="true">';

    const { html, report } = sanitizeNoteHtml(source);

    expect(html).not.toMatch(/script|onclick|onerror|javascript:|background-image|svg\+xml|type="text"/i);
    expect(html).toContain('type="checkbox"');
    expect(report.categories).toEqual(
      expect.arrayContaining(['active_tag', 'event_attribute', 'unsafe_url', 'unsafe_style']),
    );
  });

  it('Markdown 完全不经过 HTML 解析，安全日志不包含正文', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const markdown = '# 标题\n\n<script>这只是源码</script>\n';
    expect(sanitizePersistedNoteContent(markdown, 'markdown', 'test')).toBe(markdown);
    expect(warn).not.toHaveBeenCalled();

    sanitizePersistedNoteContent('<p onclick="secret-token">正文</p>', 'html', 'test-write');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls.flat().join(' ')).not.toContain('secret-token');
    expect(warn.mock.calls.flat().join(' ')).not.toContain('正文');
    warn.mockRestore();
  });
});
