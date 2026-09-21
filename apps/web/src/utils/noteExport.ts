import { normalizeMarkdownTaskListHtml, promoteEmptyMarkdownTaskToken } from '@/utils/noteHtmlToMarkdown';
import { decorateInternalResourceLinks } from '@/utils/noteResourceRefs';
import { configureMarkdownRenderer } from '@/utils/markdownRenderer';

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

export { buildNoteExportHtml } from '@lightnote/shared/note-export-document';

export async function renderMarkdownForExport(markdown: string): Promise<string> {
  const [markedMod, dompurifyMod] = await Promise.all([import('marked'), import('dompurify')]);
  const marked = configureMarkdownRenderer(markedMod.marked);
  const raw = String(marked.parse(markdown || '', { walkTokens: promoteEmptyMarkdownTaskToken }));
  const safe = dompurifyMod.default ? dompurifyMod.default.sanitize(raw) : raw;
  // 导出为静态文件,任务清单不可交互(editable=false)
  const html = decorateInternalResourceLinks(normalizeMarkdownTaskListHtml(safe, false));
  return inlineMermaidForExport(html);
}

/**
 * 导出的 HTML 是离线静态文件、跑不了 JS,mermaid 代码块得在导出时就渲染成内联 SVG,
 * 否则用户打开导出文件只能看到一段图表源码。渲染失败时保持代码块原样。
 * 富文本笔记的正文直接就是 HTML(源码块是 `<pre class="language-mermaid">`),同样走这里。
 */
export async function inlineMermaidForExport(html: string): Promise<string> {
  if (typeof document === 'undefined') return html;
  const { hasMermaidBlock, renderMermaidBlocks } = await import('@/utils/mermaidRender.ts');
  if (!hasMermaidBlock(html)) return html;
  const holder = document.createElement('div');
  holder.innerHTML = html;
  // 必须真的挂进文档:图表渲染要用 getBBox 校正思维导图根节点文字位置,
  // 离屏节点的 getBBox 全返回 0,导出的图会带着"标题顶出边框"的毛病
  holder.style.cssText = 'position:fixed;left:-99999px;top:0;width:820px;visibility:hidden';
  document.body.appendChild(holder);
  try {
    await renderMermaidBlocks(holder, { interactive: false });
    return holder.innerHTML;
  } finally {
    holder.remove();
  }
}

/**
 * 组装可离线打开的完整 HTML 文档。
 * 样式必须内联且用固定色值 —— 编辑器那份 content_style 依赖 `var(--text-color)`
 * 这类 CSS 变量，脱离站内主题后会全部失效。
 */
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
