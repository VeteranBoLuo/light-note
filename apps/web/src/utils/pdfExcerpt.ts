import { buildFileResourceHref, buildResourceAnchorAttrs } from '@/utils/noteResourceRefs';

/** 从 PDF 文字层选中的一段内容，页码从 1 开始。 */
export interface PdfExcerpt {
  text: string;
  pageStart: number;
  pageEnd: number;
}

export interface PdfExcerptSource {
  fileId: string;
  fileName: string;
  /** 已按界面语言格式化的页码，例如「第 12 页」「第 12–13 页」。 */
  pageLabel: string;
  page: number;
}

/** 摘录的来源文件（云空间里的 PDF，或预览成 PDF 的 Office 文件）。 */
export interface PdfExcerptFile {
  fileId: string;
  fileName: string;
}

/**
 * 预览宿主决定选中文字后能做什么：
 * - insert：旁边有打开的可编辑笔记（参考栏），插到光标处；
 * - pick：选一篇笔记或新建笔记，再跳过去追加（云空间预览）。
 * 不传时只能复制。
 */
export type PdfExcerptHandler =
  | {
      mode: 'insert';
      file: PdfExcerptFile;
      insert: (excerpt: PdfExcerpt, file: PdfExcerptFile) => boolean | Promise<boolean>;
      undo: () => void;
    }
  | { mode: 'pick'; file: PdfExcerptFile };

/** 「摘录到笔记」选中的去向：已有笔记，或用文件名新建一篇。 */
export type PdfExcerptNoteTarget = { type: 'note'; id: string; title: string } | { type: 'new' };

type Translate = (key: string, values?: Record<string, unknown>) => string;

export function pdfExcerptPageLabel(excerpt: Pick<PdfExcerpt, 'pageStart' | 'pageEnd'>, t: Translate) {
  return excerpt.pageEnd > excerpt.pageStart
    ? t('cloudSpace.previewPanel.pdfExcerptPages', { start: excerpt.pageStart, end: excerpt.pageEnd })
    : t('cloudSpace.previewPanel.pdfExcerptPage', { page: excerpt.pageStart });
}

/** 由选区与来源文件生成两种笔记格式的摘录。 */
export function buildPdfExcerptContent(excerpt: PdfExcerpt, file: PdfExcerptFile, t: Translate) {
  const source: PdfExcerptSource = {
    ...file,
    page: excerpt.pageStart,
    pageLabel: pdfExcerptPageLabel(excerpt, t),
  };
  return { html: buildPdfExcerptHtml(excerpt.text, source), markdown: buildPdfExcerptMarkdown(excerpt.text, source) };
}

const CJK_CHAR = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef\u3000-\u303f]/;
// 不少中文 PDF（浏览器、WPS 导出）把「用」「方」「一」等字编码成康熙部首或部首补充字符，
// 复制出来看着一样却搜不到。只对这两个区段做兼容分解，不动全角标点。
const CJK_RADICAL = /[\u2e80-\u2fdf]/g;

/**
 * 整理 PDF 文字层的选区文本：PDF 每行末尾都是硬换行，摘录时合并成连续段落。
 * 中文行之间直接相连，英文补一个空格，行尾连字符断开的单词重新拼合；空行视为段落分隔。
 */
export function normalizePdfSelectionText(raw: string) {
  const text = String(raw || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(CJK_RADICAL, (char) => char.normalize('NFKC'));
  return text
    .split(/\n[ \t]*\n+/)
    .map((paragraph) =>
      paragraph
        .split('\n')
        .map((line) => line.replace(/[ \t]+/g, ' ').trim())
        .filter(Boolean)
        .reduce((merged, line) => {
          if (!merged) return line;
          if (/[A-Za-z]-$/.test(merged) && /^[a-z]/.test(line)) return merged.slice(0, -1) + line;
          const joinDirectly = CJK_CHAR.test(merged.slice(-1)) || CJK_CHAR.test(line[0]);
          return merged + (joinDirectly ? '' : ' ') + line;
        }, ''),
    )
    .filter(Boolean)
    .join('\n\n');
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char,
  );
}

function escapeMarkdownLinkTitle(title: string) {
  return title
    .replace(/[\r\n]+/g, ' ')
    .replace(/([\\[\]])/g, '\\$1')
    .trim();
}

/** 段首的 # - + * > 和「1.」会被 Markdown 当成标题、列表或嵌套引用，转义成普通文字。 */
function escapeMarkdownParagraph(paragraph: string) {
  return paragraph.replace(/^(#{1,6}\s|[-+*>]\s|\d+[.)]\s)/, '\\$1');
}

/** 富文本笔记里的摘录：引用块正文 + 来源行（文件名是指向该页的资源链接）。 */
export function buildPdfExcerptHtml(text: string, source: PdfExcerptSource) {
  const href = buildFileResourceHref(source.fileId, source.page);
  const attrs = buildResourceAnchorAttrs({ type: 'file', id: source.fileId });
  const name = escapeHtml(source.fileName || source.fileId);
  const link = href
    ? `<a href="${escapeHtml(href)}" contenteditable="false" data-ln-resource-type="${attrs['data-ln-resource-type']}" data-ln-resource-id="${escapeHtml(attrs['data-ln-resource-id'])}">${name}</a>`
    : name;
  const paragraphs = text
    .split('\n\n')
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join('');
  return `<blockquote>${paragraphs}<p>— ${link} · ${escapeHtml(source.pageLabel)}</p></blockquote>`;
}

/** Markdown 笔记里的摘录，结构与富文本一致。 */
export function buildPdfExcerptMarkdown(text: string, source: PdfExcerptSource) {
  const href = buildFileResourceHref(source.fileId, source.page);
  const name = escapeMarkdownLinkTitle(source.fileName || source.fileId);
  const link = href ? `[${name}](${href})` : name;
  const lines = text
    .split('\n\n')
    .map((paragraph) => `> ${escapeMarkdownParagraph(paragraph)}`)
    .join('\n>\n');
  return `${lines}\n>\n> — ${link} · ${source.pageLabel}`;
}

/** 新建笔记的默认标题：文件名去掉扩展名再加「摘录」。 */
export function pdfExcerptNoteTitle(fileName: string, suffix: string) {
  const base = String(fileName || '')
    .replace(/\.[^./\\]{1,8}$/, '')
    .trim();
  return `${base || fileName} ${suffix}`.trim().slice(0, 255);
}
