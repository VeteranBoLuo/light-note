/**
 * 系统分享进来的内容：原生暂存清单的校验，以及转成「快速添加」草稿的纯函数。
 * 平台通道（Android 原生桥）见 utils/androidIncomingShare.ts，这里不依赖任何运行环境。
 */

/** 与 Android IncomingShareStore 的上限保持一致：最多 20 个文件、正文 60000 字。 */
export const INCOMING_SHARE_MAX_FILES = 20;
export const INCOMING_SHARE_MAX_TEXT = 60000;
const SHARE_ID_PATTERN = /^[a-f0-9]{32}$/;
const MAX_BOOKMARK_NAME = 200;

export interface IncomingShareFileEntry {
  index: number;
  name: string;
  mimeType: string;
  size: number;
}

/** 原生暂存的一次分享（只含元数据，文件内容通过同域地址按需读取）。 */
export interface IncomingShareManifest {
  id: string;
  text: string;
  subject: string;
  textTruncated: boolean;
  skippedFiles: number;
  files: IncomingShareFileEntry[];
}

/** 交给「快速添加」预填的草稿；只在内存里传递，不写入 localStorage。 */
export interface QuickCaptureShareDraft {
  /** 原生暂存编号；保存成功或用户关闭后据此清理暂存。 */
  id: string;
  text: string;
  files: File[];
  /** 分享方给的标题，用作书签名称；用户改动正文后不再使用。 */
  bookmarkName: string;
  /** 原生跳过（超限、无法读取）加上网页读取失败的文件数。 */
  skippedFiles: number;
  textTruncated: boolean;
}

function toText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.slice(0, maxLength) : '';
}

function toCount(value: unknown): number {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

/** 校验原生回传的清单；格式不对返回 null，网页按「没有待处理分享」处理。 */
export function parseIncomingShareManifest(raw: unknown): IncomingShareManifest | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const id = typeof source.id === 'string' ? source.id : '';
  if (!SHARE_ID_PATTERN.test(id)) return null;
  const files: IncomingShareFileEntry[] = [];
  const rawFiles = Array.isArray(source.files) ? source.files : [];
  for (const item of rawFiles.slice(0, INCOMING_SHARE_MAX_FILES)) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    const index = Number(entry.index);
    const name = toText(entry.name, 255).trim();
    if (!Number.isInteger(index) || index < 0 || index >= INCOMING_SHARE_MAX_FILES || !name) continue;
    files.push({
      index,
      name,
      mimeType: toText(entry.mimeType, 255) || 'application/octet-stream',
      size: toCount(entry.size),
    });
  }
  return {
    id,
    text: toText(source.text, INCOMING_SHARE_MAX_TEXT),
    subject: toText(source.subject, 500),
    textTruncated: source.textTruncated === true,
    skippedFiles: toCount(source.skippedFiles) + Math.max(0, rawFiles.length - INCOMING_SHARE_MAX_FILES),
    files,
  };
}

/**
 * 合并分享方给的标题与正文。
 * 浏览器分享网页通常是「标题 + 网址」两段，正文已包含标题时不重复；只有标题时直接用标题。
 */
export function buildIncomingShareText(subject: string, text: string): string {
  const title = String(subject || '').trim();
  const body = String(text || '').trim();
  if (!body) return title;
  if (!title || body.includes(title)) return body;
  return `${title}\n${body}`;
}

/** 分享标题可作为书签名称；本身是网址或为空时返回空串，沿用快速添加的默认命名。 */
export function resolveShareBookmarkName(subject: string): string {
  const value = String(subject || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!value || /^[a-z][a-z\d+.-]*:\/\//i.test(value)) return '';
  return value.slice(0, MAX_BOOKMARK_NAME);
}

export function buildQuickCaptureShareDraft(
  manifest: IncomingShareManifest,
  files: File[],
  failedFiles: number,
): QuickCaptureShareDraft {
  return {
    id: manifest.id,
    text: buildIncomingShareText(manifest.subject, manifest.text),
    files,
    bookmarkName: resolveShareBookmarkName(manifest.subject),
    skippedFiles: manifest.skippedFiles + Math.max(0, failedFiles),
    textTruncated: manifest.textTruncated,
  };
}
