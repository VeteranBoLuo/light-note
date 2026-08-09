export type NoteFormat = 'html' | 'markdown';

export type NoteConversionIssue =
  'textColor' | 'backgroundColor' | 'alignment' | 'mergedCells' | 'underline' | 'fontStyling' | 'rawHtml';

export interface NoteFormatConversionReport {
  sourceType: NoteFormat;
  targetType: NoteFormat;
  preserved: number;
  standardized: number;
  potentialLoss: number;
  issues: Array<{ key: NoteConversionIssue; count: number }>;
}

export interface NoteFormatConversionHashInput {
  targetType: NoteFormat;
  convertedContent: string;
  baseRevision: number;
}

export function serializeNoteFormatConversionHashInput(input: NoteFormatConversionHashInput) {
  return JSON.stringify({
    version: 1,
    targetType: input.targetType,
    baseRevision: Math.max(1, Number(input.baseRevision || 1)),
    convertedContent: String(input.convertedContent || ''),
  });
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

function fnv1a32(bytes: Uint8Array) {
  let hash = 0x811c9dc5;
  for (const value of bytes) {
    hash ^= value;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * 预览确认与最终写入共用同一份内容指纹。SHA-256 是主路径；极旧 WebView
 * 没有 SubtleCrypto 时使用稳定的 FNV-1a，服务端会按前缀采用相同算法复核。
 */
export async function buildNoteFormatConversionAnalysisHash(input: NoteFormatConversionHashInput) {
  const bytes = new TextEncoder().encode(serializeNoteFormatConversionHashInput(input));
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return `sha256:${toHex(new Uint8Array(digest))}`;
  }
  return `fnv1a32:${fnv1a32(bytes)}`;
}

function countMatches(value: string, pattern: RegExp) {
  return [...value.matchAll(pattern)].length;
}

function addIssue(issues: NoteFormatConversionReport['issues'], key: NoteConversionIssue, count: number) {
  if (count > 0) issues.push({ key, count });
}

function analyzeHtml(source: string): NoteFormatConversionReport {
  const doc = new DOMParser().parseFromString(`<body>${source || ''}</body>`, 'text/html');
  const all = Array.from(doc.body.querySelectorAll<HTMLElement>('*'));
  const issues: NoteFormatConversionReport['issues'] = [];
  const color = all.filter((element) => Boolean(element.style.color)).length;
  const background = all.filter((element) => Boolean(element.style.backgroundColor || element.style.background)).length;
  const alignment = all.filter((element) => Boolean(element.style.textAlign) || element.hasAttribute('align')).length;
  const merged = all.filter(
    (element) =>
      ['TD', 'TH'].includes(element.tagName) &&
      (Number(element.getAttribute('colspan') || 1) > 1 || Number(element.getAttribute('rowspan') || 1) > 1),
  ).length;
  const underline = doc.body.querySelectorAll('u').length;
  const fontStyling = all.filter(
    (element) =>
      element.tagName === 'FONT' ||
      Boolean(
        element.style.fontFamily || element.style.fontSize || element.style.letterSpacing || element.style.textIndent,
      ),
  ).length;

  addIssue(issues, 'textColor', color);
  addIssue(issues, 'backgroundColor', background);
  addIssue(issues, 'alignment', alignment);
  addIssue(issues, 'mergedCells', merged);
  addIssue(issues, 'underline', underline);
  addIssue(issues, 'fontStyling', fontStyling);

  const preserved = doc.body.querySelectorAll(
    'h1,h2,h3,h4,h5,h6,p,div,strong,b,em,i,s,del,blockquote,ul,ol,li,a,img,input[type="checkbox"],.ln-text-gradient',
  ).length;
  const standardized = doc.body.querySelectorAll('pre,code,table').length;
  return {
    sourceType: 'html',
    targetType: 'markdown',
    preserved,
    standardized,
    potentialLoss: issues.reduce((sum, issue) => sum + issue.count, 0),
    issues,
  };
}

function analyzeMarkdown(source: string): NoteFormatConversionReport {
  const text = String(source || '');
  const issues: NoteFormatConversionReport['issues'] = [];
  // 图文组合以受控 section 原样保存在 Markdown 中，切回富文本时可以完整恢复，
  // 因此先从“未知原生 HTML”分析样本中拿掉，避免把内部 figure/img/p 重复计为风险。
  const mediaTextBlocks = countMatches(
    text,
    /<section\b(?=[^>]*\bclass\s*=\s*(["'])[^"']*\bln-media-text\b[^"']*\1)[^>]*>[\s\S]*?<\/section\s*>/giu,
  );
  const rawHtmlSample = text.replace(
    /<section\b(?=[^>]*\bclass\s*=\s*(["'])[^"']*\bln-media-text\b[^"']*\1)[^>]*>[\s\S]*?<\/section\s*>/giu,
    '',
  );
  const rawHtml = countMatches(
    rawHtmlSample,
    /<([a-z][\w-]*)(?:\s[^>]*)?>[\s\S]*?<\/\1\s*>|<[a-z][\w-]*(?:\s[^>]*)?\s*\/?>/giu,
  );
  // 调整过尺寸的 Markdown 图片会保存为受控 img HTML；这是轻笺明确支持的结构，
  // 不应在格式切换预检中被误报为“可能丢失的原生 HTML”。
  const sizedImages = countMatches(
    rawHtmlSample,
    /<img\b(?=[^>]*\bdata-ln-size\s*=\s*(["'])(?:original|small|medium|large|full)\1)[^>]*\/?\s*>/giu,
  );
  // 渐变文字与图文组合相同，使用受控 raw HTML 在两种格式间往返，不属于未知 HTML 风险。
  const gradientSpans = countMatches(
    rawHtmlSample,
    /<([a-z][\w-]*)\b(?=[^>]*\bclass\s*=\s*(["'])[^"']*\bln-text-gradient\b[^"']*\2)[^>]*>[\s\S]*?<\/\1\s*>/giu,
  );
  const riskyRawHtml = Math.max(0, rawHtml - sizedImages - gradientSpans);
  addIssue(issues, 'rawHtml', riskyRawHtml);
  const preserved =
    countMatches(rawHtmlSample, /^#{1,6}\s+/gmu) +
    countMatches(rawHtmlSample, /(?:^|\n)\s*(?:[-+*]|\d+[.)])\s+/gu) +
    countMatches(rawHtmlSample, /!\[[^\]]*\]\([^)]*\)|\[[^\]]+\]\([^)]*\)/gu) +
    countMatches(rawHtmlSample, /(?:\*\*|__)[^\n]+?(?:\*\*|__)|(?:^|[^*])\*[^\n*]+\*/gu) +
    sizedImages +
    mediaTextBlocks +
    gradientSpans;
  const standardized =
    countMatches(text, /```[\s\S]*?```/gu) +
    countMatches(text, /(?:^|\n)\s*[-+*]\s+\[[ xX]\]\s+/gu) +
    countMatches(text, /(?:^|\n)\s*\|[^\n]+\|\s*(?=\n\s*\|?\s*:?-{3,})/gu);
  return {
    sourceType: 'markdown',
    targetType: 'html',
    preserved,
    standardized,
    potentialLoss: riskyRawHtml,
    issues,
  };
}

export function analyzeNoteFormatConversion(source: string, sourceType: NoteFormat): NoteFormatConversionReport {
  if (sourceType === 'html' && typeof DOMParser !== 'undefined') return analyzeHtml(source);
  if (sourceType === 'html') {
    return {
      sourceType: 'html',
      targetType: 'markdown',
      preserved: 0,
      standardized: 0,
      potentialLoss: 0,
      issues: [],
    };
  }
  return analyzeMarkdown(source);
}
