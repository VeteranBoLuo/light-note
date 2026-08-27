import { describe, expect, it } from 'vitest';
import { appendPageTextToHtml, appendPageTextToMarkdown, pageTextToSafeHtml } from './pageTextImport';

describe('浏览器插件笔记带入网页文字', () => {
  it('Markdown 只在末尾追加，不覆盖已有草稿', () => {
    expect(appendPageTextToMarkdown('# 已有标题', '网页正文')).toBe('# 已有标题\n\n网页正文');
    expect(appendPageTextToMarkdown('已有一行\n', '网页正文')).toBe('已有一行\n\n网页正文');
    expect(appendPageTextToMarkdown('', '网页正文')).toBe('网页正文');
  });

  it('富文本把网页文字当纯文本处理并保留段落与换行', () => {
    const result = pageTextToSafeHtml('第一行\n第二行\n\n<img src=x onerror=alert(1)>');
    const container = document.createElement('div');
    container.innerHTML = result;

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelectorAll('p')).toHaveLength(2);
    expect(container.querySelectorAll('br')).toHaveLength(1);
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('富文本追加时保留原正文并插入可见分隔', () => {
    const result = appendPageTextToHtml('<p>已有正文</p>', '网页正文', true);
    const container = document.createElement('div');
    container.innerHTML = result;

    expect(container.textContent).toContain('已有正文');
    expect(container.textContent).toContain('网页正文');
    expect(container.querySelectorAll('p')).toHaveLength(3);
  });
});
