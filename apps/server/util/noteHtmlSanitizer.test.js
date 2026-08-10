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

  it('保留图文组合的一图一文结构与布局属性', () => {
    const source =
      '<section class="ln-media-text" data-ln-media-position="right" data-ln-media-width="42">' +
      '<figure class="ln-media-text__item"><div class="ln-media-text__media">' +
      '<img src="https://example.com/window.png" alt="主卧"></div>' +
      '<figcaption class="ln-media-text__content"><p>房间名称：主卧</p></figcaption></figure></section>';

    const { html } = sanitizeNoteHtml(source);

    expect(html).toContain('<section class="ln-media-text"');
    expect(html).toContain('data-ln-media-position="right"');
    expect(html).toContain('data-ln-media-width="42"');
    expect(html).toContain('<figure class="ln-media-text__item">');
    expect(html).toContain('<figcaption class="ln-media-text__content"><p>房间名称：主卧</p></figcaption>');
  });

  it('只保留渐变文字协议中的合法颜色和方向', () => {
    const source =
      '<span class="ln-text-gradient" data-ln-text-gradient="true" ' +
      'style="--ln-gradient-from:#615ced;--ln-gradient-to:#00a884;--ln-gradient-angle:135deg">安全渐变</span>' +
      '<span class="ln-text-gradient" data-ln-text-gradient="true" ' +
      'style="--ln-gradient-from:red;--ln-gradient-to:url(https://example.com/a);--ln-gradient-angle:13deg">非法配置</span>';

    const { html } = sanitizeNoteHtml(source);

    expect(html).toContain('--ln-gradient-from:#615ced');
    expect(html).toContain('--ln-gradient-to:#00a884');
    expect(html).toContain('--ln-gradient-angle:135deg');
    expect(html).not.toMatch(/--ln-gradient-from:red|url\(|13deg/iu);
  });

  it('把历史富文本示例的任意内联效果升级为受控语义类', () => {
    const source =
      '<h2 style="background:linear-gradient(90deg,#615ced,#ec4899);-webkit-background-clip:text;color:transparent">渐变</h2>' +
      '<p style="background:linear-gradient(135deg,#615ced,#764ba2);color:#fff;border-radius:16px;padding:20px;box-shadow:0 12px 32px rgba(0,0,0,.3)">卡片</p>' +
      '<span style="color:#615ced;text-shadow:0 0 12px #615ced">发光</span>' +
      '<span style="animation:spin 1.2s linear infinite">转圈</span>' +
      '<span style="animation:backgroundShift 3s ease-in-out infinite">漂浮</span>';

    const { html } = sanitizeNoteHtml(source);

    expect(html).toContain('class="ln-text-gradient"');
    expect(html).toContain('data-ln-text-gradient="true"');
    expect(html).toContain('class="ln-rich-card"');
    expect(html).toContain('class="ln-rich-text-glow"');
    expect(html).toContain('class="ln-rich-effect-spin"');
    expect(html).toContain('class="ln-rich-effect-float"');
    expect(html).toContain('background-color:#615ced');
    expect(html).toContain('color:#615ced');
    expect(html).not.toMatch(/linear-gradient|background-clip|box-shadow|text-shadow|animation\s*:|border-radius/iu);
  });

  it('恢复已经被旧白名单保存过的透明文字、白字卡片和静态动画占位', () => {
    const source =
      '<h2 style="color:transparent">渐变与发光</h2>' +
      '<p style="color:#ffffff;padding:20px 24px"><strong>渐变卡片</strong><br>白字内容</p>' +
      '<span style="display:inline-block;padding:6px 18px;color:#ffffff;font-weight:bold">同步进行中</span>' +
      '<span style="display:inline-block;width:26px;height:26px;border:4px solid rgba(97,92,237,.25)">&nbsp;</span>' +
      '<span style="display:inline-block;font-size:26px">🪁</span>' +
      '<p style="border:3px solid transparent;padding:16px 20px">渐变边框</p>';

    const { html } = sanitizeNoteHtml(source);

    expect(html).toContain('class="ln-text-gradient"');
    expect(html).toContain('color:#615ced');
    expect(html).toContain('class="ln-rich-card"');
    expect(html).toContain('background-color:#615ced');
    expect(html).toContain('class="ln-rich-effect-breathe"');
    expect(html).toContain('class="ln-rich-effect-spin"');
    expect(html).toContain('class="ln-rich-effect-float"');
    expect(html).toContain('class="ln-rich-gradient-border"');
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
