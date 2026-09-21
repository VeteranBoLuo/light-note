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
  .note-export h1.note-export-document-title {
    font-size: 2.6em;
    font-weight: 700;
    line-height: 1.25;
    margin: 0 0 32px;
    padding: 0 0 24px;
    border-bottom: 1px solid #d8dce3;
    break-after: avoid;
    page-break-after: avoid;
  }
  .note-export p { margin: 0 0 0.9em; }
  .note-export img { max-width: 100%; height: auto; }
  .note-export img[data-ln-size] { display: block; margin-inline: auto; }
  .note-export img[data-ln-size='original'] { width: auto; }
  .note-export img[data-ln-size='small'] { width: 40%; }
  .note-export img[data-ln-size='medium'] { width: 64%; }
  .note-export img[data-ln-size='large'] { width: 82%; }
  .note-export img[data-ln-size='full'] { width: 100%; }
  .note-export .ln-media-text {
    --ln-media-max-width: 340px;
    --ln-media-max-height: 260px;
    display: block;
    clear: both;
    margin: 14px 0;
  }
  .note-export .ln-media-text[data-ln-media-width='30'] {
    --ln-media-max-width: 280px;
    --ln-media-max-height: 220px;
  }
  .note-export .ln-media-text[data-ln-media-width='42'] {
    --ln-media-max-width: 400px;
    --ln-media-max-height: 300px;
  }
  .note-export .ln-media-text__item {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    box-sizing: border-box;
    margin: 10px 0;
    padding: 10px;
    border: 1px solid #e3e6eb;
    border-radius: 10px;
  }
  .note-export .ln-media-text[data-ln-media-position='right'] .ln-media-text__item { flex-direction: row-reverse; }
  .note-export .ln-media-text__media {
    display: flex;
    flex: 0 1 36%;
    max-width: var(--ln-media-max-width);
    min-width: 0;
    align-items: flex-start;
    justify-content: center;
  }
  .note-export .ln-media-text[data-ln-media-width='30'] .ln-media-text__media { flex-basis: 30%; }
  .note-export .ln-media-text[data-ln-media-width='42'] .ln-media-text__media { flex-basis: 42%; }
  .note-export .ln-media-text__media img {
    display: block !important;
    float: none !important;
    width: auto !important;
    max-width: 100% !important;
    height: auto !important;
    max-height: var(--ln-media-max-height) !important;
    margin: 0 !important;
    border-radius: 8px;
  }
  .note-export .ln-media-text__content { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
  .note-export .ln-media-text__content > :first-child { margin-top: 0; }
  .note-export .ln-media-text__content > :last-child { margin-bottom: 0; }
  .note-export .ln-text-gradient,
  .note-export .ln-rich-card,
  .note-export .ln-rich-gradient-fill,
  .note-export .ln-rich-effect-breathe {
    --ln-gradient-from: #615ced;
    --ln-gradient-to: #00a884;
    --ln-gradient-angle: 90deg;
  }
  .note-export .ln-text-gradient { color: var(--ln-gradient-from, #615ced); }
  @supports ((background-clip: text) or (-webkit-background-clip: text)) {
    .note-export .ln-text-gradient {
      background-image: linear-gradient(
        var(--ln-gradient-angle, 90deg),
        var(--ln-gradient-from, #615ced),
        var(--ln-gradient-to, #00a884)
      );
      background-repeat: no-repeat;
      background-clip: text;
      -webkit-background-clip: text;
      color: transparent;
      -webkit-text-fill-color: transparent;
      box-decoration-break: clone;
      -webkit-box-decoration-break: clone;
    }
  }
  .note-export .ln-rich-text-glow { text-shadow: 0 0 12px rgba(97, 92, 237, 0.82); }
  .note-export .ln-rich-card,
  .note-export .ln-rich-gradient-fill,
  .note-export .ln-rich-effect-breathe {
    background-color: var(--ln-gradient-from, #615ced);
    background-image: linear-gradient(
      var(--ln-gradient-angle, 135deg),
      var(--ln-gradient-from, #615ced),
      var(--ln-gradient-to, #764ba2)
    );
    color: #ffffff;
  }
  .note-export .ln-rich-card { border-radius: 16px; box-shadow: 0 12px 32px -8px rgba(97, 92, 237, 0.45); }
  .note-export .ln-rich-effect-breathe {
    display: inline-block;
    border-radius: 999px;
    animation: ln-rich-breathe 2s ease-in-out infinite;
  }
  .note-export .ln-rich-effect-spin {
    display: inline-block;
    width: 26px;
    height: 26px;
    box-sizing: border-box;
    border: 4px solid rgba(97, 92, 237, 0.25);
    border-top-color: #615ced;
    border-radius: 50%;
    vertical-align: middle;
    animation: ln-rich-spin 1.2s linear infinite;
  }
  .note-export .ln-rich-effect-float { display: inline-block; animation: ln-rich-float 3s ease-in-out infinite; }
  .note-export .ln-rich-gradient-border {
    border: 3px solid transparent;
    border-radius: 14px;
    background: linear-gradient(#ffffff, #ffffff) padding-box, linear-gradient(135deg, #ff8a00, #ec4899) border-box;
  }
  .note-export .ln-rich-quote { border-radius: 0 10px 10px 0; background-color: rgba(97, 92, 237, 0.08); }
  @keyframes ln-rich-breathe {
    0%, 100% { transform: scale(1); box-shadow: 0 0 0 rgba(97, 92, 237, 0); }
    50% { transform: scale(1.035); box-shadow: 0 0 18px rgba(97, 92, 237, 0.45); }
  }
  @keyframes ln-rich-spin { to { transform: rotate(360deg); } }
  @keyframes ln-rich-float {
    0%, 100% { transform: translate3d(0, 0, 0) rotate(-4deg); }
    50% { transform: translate3d(12px, -7px, 0) rotate(5deg); }
  }
  .note-export a { color: #615ced; }
  /* mermaid 图表在导出时已渲染成内联 SVG，这里只补容器外观（站内那套 CSS 变量在离线文件里失效） */
  .note-export .mermaid-figure {
    margin: 14px 0;
    padding: 12px;
    border: 1px solid #e3e6eb;
    border-radius: 10px;
    text-align: center;
    overflow-x: auto;
  }
  .note-export .mermaid-figure svg { max-width: 100%; height: auto; }
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
  @media (max-width: 600px) {
    body { padding-inline: 14px; }
    .note-export .ln-media-text__item { gap: 10px; padding: 7px; }
  }
  @media (prefers-reduced-motion: reduce), print {
    .note-export .ln-rich-effect-breathe,
    .note-export .ln-rich-effect-spin,
    .note-export .ln-rich-effect-float { animation: none; }
  }
`;

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
}

/** md 源码 → 与站内预览同口径的安全 HTML(marked 渲染 + DOMPurify 消毒 + 站内链接增强)。 */
export function buildNoteExportHtml(
  title,
  bodyHtml,
  lang = "zh-CN",
  includeHeading = true,
) {
  const safeTitle = escapeHtml(title);
  // 正文若已以一级标题开头(md 笔记通常第一行就是 `# 标题`),不再补一个,否则页面上会出现两遍标题
  const hasLeadingH1 = /^\s*<h1[\s>]/i.test(bodyHtml);
  const heading =
    !includeHeading || hasLeadingH1 ? "" : `<h1>${safeTitle}</h1>\n`;
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
