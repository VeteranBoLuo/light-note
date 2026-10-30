import { load } from 'cheerio';
import { marked } from 'marked';

/**
 * 笔记“渲染后可见文字”的长度，与前端 noteDisplayText() 同口径：
 * Markdown 先渲染为 HTML，再取文本并合并空白；手绘笔记不计字数。
 */
export function noteDisplayLength(content, type) {
  if (type === 'drawing' || !content) return 0;
  let html = String(content);
  if (type === 'markdown') {
    try {
      html = marked.parse(html, { async: false }) || '';
    } catch {
      // 渲染失败时按原文取文本，与前端兜底一致。
    }
  }
  return load(html).root().text().replace(/\s+/g, ' ').trim().length;
}
