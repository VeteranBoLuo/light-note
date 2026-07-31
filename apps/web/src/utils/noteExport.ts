import { normalizeMarkdownTaskListHtml } from '@/utils/noteHtmlToMarkdown';
import { decorateInternalResourceLinks } from '@/utils/noteResourceRefs';

/**
 * 笔记导出的公共逻辑。
 *
 * 关键前提:笔记有两种 type,`content` 字段存的东西完全不同 ——
 * - `html`：TinyMCE 富文本 HTML；
 * - `markdown`：**Markdown 源码**（不是 HTML）。
 *
 * 忽略这个区别就会出事:把 md 源码当 HTML 塞进 <body>，浏览器只会显示
 * 带 `#`、`- [ ]` 的纯文本；把 md 源码喂给 turndown（HTML→MD 转换器），
 * 语法会被逐个转义成 `\#`、`\*\*`，换行也会被吃掉、整篇压成一行。
 */

/** 离线 HTML 用的自包含样式。 */
const EXPORT_STYLES = `
  :root { color-scheme: light; }
  body {
    margin: 0;
    padding: 32px 20px 64px;
    background: #ffffff;
    color: #1f2329;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
    font-size: 15px;
    line-height: 1.75;
    word-wrap: break-word;
  }
  .note-export { max-width: 800px; margin: 0 auto; }
  .note-export h1 { font-size: 1.9em; }
  .note-export h2 { font-size: 1.5em; }
  .note-export h3 { font-size: 1.25em; }
  .note-export h1, .note-export h2, .note-export h3,
  .note-export h4, .note-export h5, .note-export h6 { margin: 1em 0 0.5em; line-height: 1.35; }
  .note-export p { margin: 0 0 0.9em; }
  .note-export img { max-width: 100%; height: auto; }
  .note-export a { color: #615ced; }
  .note-export blockquote {
    margin: 0 0 1em;
    padding: 6px 14px;
    border-left: 3px solid #d0d4dc;
    color: #5b6270;
  }
  .note-export hr { height: 1px; margin: 1.5em 0; border: 0; background: #e5e7eb; }
  .note-export table { width: 100%; border-collapse: collapse; margin: 0 0 1em; }
  .note-export table th, .note-export table td { padding: 6px 10px; border: 1px solid #d9d9d9; }
  .note-export table th { background: #f6f8fa; text-align: left; }
  .note-export pre {
    margin: 0 0 1em;
    padding: 12px 14px;
    overflow: auto;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    background: #f6f8fa;
  }
  .note-export pre code {
    display: block;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace;
    font-size: 13px;
    white-space: pre;
  }
  .note-export :not(pre) > code {
    padding: 2px 5px;
    border-radius: 4px;
    background: #f0f1f4;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace;
    font-size: 0.92em;
  }
  .note-export pre.code-block[data-language]::before {
    content: attr(data-language);
    display: block;
    margin-bottom: 8px;
    color: #6b7280;
    font-size: 12px;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }
  /* 任务清单:TinyMCE 用 .note-task-list，marked(GFM) 产出的是带 checkbox 的普通 li */
  .note-export .note-task-list, .note-export ul.contains-task-list { padding-left: 0; list-style: none; }
  .note-export .note-task-list-item, .note-export li.task-list-item { list-style: none; }
  .note-export input[type='checkbox'] { margin-right: 6px; vertical-align: middle; accent-color: #615ced; }
  /* 站内资源引用胶囊 */
  .note-export a.ln-resource-link {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    margin: 0 2px;
    padding: 1px 7px;
    border: 1px solid rgba(97, 92, 237, 0.26);
    border-radius: 999px;
    background: rgba(97, 92, 237, 0.09);
    color: #615ced;
    line-height: 1.55;
    text-decoration: none;
    vertical-align: baseline;
  }
  .note-export a.ln-resource-link[data-ln-resource-state='unavailable'] {
    border-style: dashed;
    background: rgba(138, 145, 159, 0.08);
    color: #8a919f;
  }
`;

function escapeHtml(value: string) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string,
  );
}

/** md 源码 → 与站内预览同口径的安全 HTML(marked 渲染 + DOMPurify 消毒 + 站内链接增强)。 */
export async function renderMarkdownForExport(markdown: string): Promise<string> {
  const [markedMod, dompurifyMod] = await Promise.all([import('marked'), import('dompurify')]);
  const raw = String(markedMod.marked.parse(markdown || ''));
  const safe = dompurifyMod.default ? dompurifyMod.default.sanitize(raw) : raw;
  // 导出为静态文件,任务清单不可交互(editable=false)
  return decorateInternalResourceLinks(normalizeMarkdownTaskListHtml(safe, false));
}

/**
 * 组装可离线打开的完整 HTML 文档。
 * 样式必须内联且用固定色值 —— 编辑器那份 content_style 依赖 `var(--text-color)`
 * 这类 CSS 变量，脱离站内主题后会全部失效。
 */
export function buildNoteExportHtml(title: string, bodyHtml: string, lang = 'zh-CN') {
  const safeTitle = escapeHtml(title);
  // 正文若已以一级标题开头(md 笔记通常第一行就是 `# 标题`),不再补一个,否则页面上会出现两遍标题
  const hasLeadingH1 = /^\s*<h1[\s>]/i.test(bodyHtml);
  const heading = hasLeadingH1 ? '' : `<h1>${safeTitle}</h1>\n`;
  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${safeTitle}</title>
<style>${EXPORT_STYLES}</style>
</head>
<body>
<article class="note-export">
${heading}${bodyHtml}
</article>
</body>
</html>`;
}

/**
 * 笔记正文 → Markdown。
 * md 笔记的 content 已经是 Markdown，原样返回；只有 html 笔记才需要 turndown 转换。
 */
export function buildNoteExportMarkdown(
  title: string,
  content: string,
  noteType: string,
  htmlToMarkdown: (html: string) => string,
): string {
  const body =
    noteType === 'markdown'
      ? String(content || '')
      : (() => {
          try {
            return htmlToMarkdown(String(content || ''));
          } catch (error) {
            console.error('HTML 转 Markdown 失败:', error);
            return String(content || '');
          }
        })();
  // md 笔记正文常常自带 H1 标题,再补一个会重复
  const hasLeadingHeading = /^\s*#\s/.test(body);
  return hasLeadingHeading ? body : `# ${title}\n\n${body}`;
}
