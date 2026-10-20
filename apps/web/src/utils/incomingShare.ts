/**
 * 系统分享进来的内容：原生暂存清单的校验，以及转成「快速添加」草稿的纯函数。
 * 平台通道（Android 原生桥）见 utils/androidIncomingShare.ts，这里不依赖任何运行环境。
 */

import type { ManagedCloudUploadFile } from '@/api/cloudFileUploadApi';

/** 与 Android IncomingShareStore 的上限保持一致。 */
export const INCOMING_SHARE_MAX_FILES = 100;
export const INCOMING_SHARE_MAX_BYTES = 500 * 1024 * 1024;
export const INCOMING_SHARE_MAX_TEXT = 60000;
const SHARE_ID_PATTERN = /^[a-f0-9]{32}$/;
const MAX_BOOKMARK_NAME = 200;

export interface IncomingShareFileEntry {
  index: number;
  name: string;
  mimeType: string;
  size: number;
}

export type ShareSkipReason = 'count_limit' | 'size_limit' | 'unreadable' | 'unknown';
export interface ShareSkippedFile {
  name: string;
  reason: ShareSkipReason;
}
export interface ShareSkipReport {
  limits?: { files: number; bytes: number };
  skippedFileCounts?: Partial<Record<ShareSkipReason, number>>;
  /** 最多展示 100 项明细，计数始终覆盖完整分享。 */
  skippedFileDetails?: ShareSkippedFile[];
}

/** 原生暂存的一次分享（只含元数据，文件内容通过同域地址按需读取）。 */
export interface IncomingShareManifest extends ShareSkipReport {
  id: string;
  text: string;
  subject: string;
  textTruncated: boolean;
  skippedFiles: number;
  files: IncomingShareFileEntry[];
}

/** 交给「快速添加」预填的草稿；只在内存里传递，不写入 localStorage。 */
export interface QuickCaptureShareDraft extends ShareSkipReport {
  /** 原生暂存编号；保存成功或用户关闭后据此清理暂存。 */
  id: string;
  text: string;
  files: ManagedCloudUploadFile[];
  /** 分享方给的标题，用作书签名称；用户改动正文后不再使用。 */
  bookmarkName: string;
  /** 原生接收或清单校验时未加入的文件数；上传时读取失败保留在队列重试。 */
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
  const reasons: ShareSkipReason[] = ['count_limit', 'size_limit', 'unreadable', 'unknown'];
  const counts = Object.fromEntries(reasons.map((reason) => [reason, 0])) as Record<ShareSkipReason, number>;
  const reportedCounts = source.skippedFileCounts as Record<string, unknown> | undefined;
  if (reportedCounts && typeof reportedCounts === 'object') {
    for (const reason of reasons) counts[reason] = toCount(reportedCounts[reason]);
  }
  counts.unknown += Math.max(0, toCount(source.skippedFiles) - Object.values(counts).reduce((a, b) => a + b, 0));
  const details: ShareSkippedFile[] = [];
  for (const item of Array.isArray(source.skippedFileDetails) ? source.skippedFileDetails.slice(0, 100) : []) {
    if (!item || typeof item !== 'object') continue;
    const name = toText(item.name, 255).trim();
    if (name) details.push({ name, reason: reasons.includes(item.reason) ? item.reason : 'unknown' });
  }
  let totalBytes = 0;
  const seen = new Set<number>();
  function skip(item: unknown, reason: ShareSkipReason) {
    counts[reason] += 1;
    const name = toText((item as IncomingShareFileEntry)?.name, 255).trim();
    if (name && details.length < 100) details.push({ name, reason });
  }
  for (const item of rawFiles.slice(INCOMING_SHARE_MAX_FILES)) skip(item, 'count_limit');
  for (const item of rawFiles.slice(0, INCOMING_SHARE_MAX_FILES)) {
    if (!item || typeof item !== 'object') {
      skip(item, 'unreadable');
      continue;
    }
    const entry = item as Record<string, unknown>;
    const index = Number(entry.index);
    const name = toText(entry.name, 255).trim();
    if (!Number.isInteger(index) || index < 0 || index >= INCOMING_SHARE_MAX_FILES || !name || seen.has(index)) {
      skip(item, 'unreadable');
      continue;
    }
    seen.add(index);
    const size = toCount(entry.size);
    if (totalBytes + size > INCOMING_SHARE_MAX_BYTES) {
      skip(item, 'size_limit');
      continue;
    }
    totalBytes += size;
    files.push({
      index,
      name,
      mimeType: toText(entry.mimeType, 255) || 'application/octet-stream',
      size,
    });
  }
  return {
    id,
    limits:
      source.limits && typeof source.limits === 'object'
        ? {
            files: Math.min(INCOMING_SHARE_MAX_FILES, toCount((source.limits as Record<string, unknown>).files)) || 20,
            bytes:
              Math.min(INCOMING_SHARE_MAX_BYTES, toCount((source.limits as Record<string, unknown>).bytes)) ||
              200 * 1024 * 1024,
          }
        : { files: 20, bytes: 200 * 1024 * 1024 },
    text: toText(source.text, INCOMING_SHARE_MAX_TEXT),
    subject: toText(source.subject, 500),
    textTruncated: source.textTruncated === true,
    skippedFiles: Object.values(counts).reduce((a, b) => a + b, 0),
    skippedFileCounts: counts,
    skippedFileDetails: details,
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
  files: ManagedCloudUploadFile[],
): QuickCaptureShareDraft {
  return {
    id: manifest.id,
    limits: manifest.limits,
    text: buildIncomingShareText(manifest.subject, manifest.text),
    files,
    bookmarkName: resolveShareBookmarkName(manifest.subject),
    skippedFiles: manifest.skippedFiles,
    skippedFileCounts: manifest.skippedFileCounts,
    skippedFileDetails: manifest.skippedFileDetails || [],
    textTruncated: manifest.textTruncated,
  };
}
