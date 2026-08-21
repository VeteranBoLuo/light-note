export type UpdateLogImageSize = 'original' | 'small' | 'medium' | 'large' | 'full';

const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/;
const HTML_IMAGE_PATTERN = /<img\b[^>]*>/i;
const IMAGE_SIZE_PATTERN = /\sdata-ln-size=(["'])(original|small|medium|large|full)\1/i;

function escapeHtmlAttribute(value: string) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function stripImageDimensionStyles(tag: string) {
  return tag.replace(/\sstyle=(["'])(.*?)\1/i, (_match, quote: string, style: string) => {
    const nextStyle = style
      .split(';')
      .map((rule) => rule.trim())
      .filter(Boolean)
      .filter((rule) => !/^(?:width|max-width|height)\s*:/i.test(rule))
      .join('; ');
    return nextStyle ? ` style=${quote}${nextStyle}${quote}` : '';
  });
}

function applyImageSize(tag: string, size: UpdateLogImageSize) {
  const withoutSize = stripImageDimensionStyles(tag)
    .replace(IMAGE_SIZE_PATTERN, '')
    .replace(/\s(?:width|height)=(["'])[^"']*\1/gi, '');
  return withoutSize.replace(/\s*\/?>$/, ` data-ln-size="${size}" />`);
}

function currentLine(markdown: string, selectionStart: number) {
  const cursor = Math.max(0, Math.min(Number(selectionStart) || 0, markdown.length));
  const start = markdown.lastIndexOf('\n', Math.max(0, cursor - 1)) + 1;
  const nextBreak = markdown.indexOf('\n', cursor);
  const end = nextBreak === -1 ? markdown.length : nextBreak;
  return { start, end, text: markdown.slice(start, end) };
}

export function createUpdateLogImageHtml(url: string, alt: string, size: UpdateLogImageSize = 'medium') {
  return `<img src="${escapeHtmlAttribute(url)}" alt="${escapeHtmlAttribute(alt)}" data-ln-size="${size}" />`;
}

function clampSelection(value: number, length: number) {
  const normalized = Number.isFinite(value) ? Math.trunc(value) : length;
  return Math.max(0, Math.min(normalized, length));
}

/**
 * 把已上传图片作为独立 Markdown 块插入当前选区，并返回插入后的稳定光标位置。
 * 上传按钮和剪贴板粘贴共用这一条路径，避免一处插入光标、一处悄悄追加到长文末尾。
 */
export function insertUpdateLogImageAtSelection(
  markdown: string,
  selectionStart: number,
  selectionEnd: number,
  imageHtml: string,
) {
  const source = String(markdown || '');
  const start = clampSelection(selectionStart, source.length);
  const end = Math.max(start, clampSelection(selectionEnd, source.length));
  const before = source.slice(0, start);
  const after = source.slice(end);
  const leadingBreak = !before ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const trailingBreak = !after ? '\n' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  const insertedBlock = `${leadingBreak}${imageHtml}${trailingBreak}`;

  return {
    markdown: before + insertedBlock + after,
    selectionStart: before.length + insertedBlock.length,
  };
}

export function detectUpdateLogImageSizeAtCursor(markdown: string, selectionStart: number) {
  const line = currentLine(String(markdown || ''), selectionStart).text;
  const htmlImage = line.match(HTML_IMAGE_PATTERN)?.[0];
  if (htmlImage) {
    return (htmlImage.match(IMAGE_SIZE_PATTERN)?.[2] as UpdateLogImageSize | undefined) || 'original';
  }
  return MARKDOWN_IMAGE_PATTERN.test(line) ? 'original' : null;
}

export function resizeUpdateLogImageAtCursor(markdown: string, selectionStart: number, size: UpdateLogImageSize) {
  const source = String(markdown || '');
  const line = currentLine(source, selectionStart);
  let nextLine = line.text;

  const htmlImage = nextLine.match(HTML_IMAGE_PATTERN);
  if (htmlImage) {
    nextLine = nextLine.replace(htmlImage[0], applyImageSize(htmlImage[0], size));
  } else {
    const markdownImage = nextLine.match(MARKDOWN_IMAGE_PATTERN);
    if (!markdownImage) {
      return { changed: false, markdown: source, selectionStart };
    }
    nextLine = nextLine.replace(markdownImage[0], createUpdateLogImageHtml(markdownImage[2], markdownImage[1], size));
  }

  return {
    changed: nextLine !== line.text,
    markdown: source.slice(0, line.start) + nextLine + source.slice(line.end),
    selectionStart: line.start + nextLine.length,
  };
}
