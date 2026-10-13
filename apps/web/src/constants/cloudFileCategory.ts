import { resolveFilePreviewType as getCloudPreviewType } from '@lightnote/shared/file-category';
import { resolveFilePlaybackMimeType as getCloudMediaMimeType } from '@lightnote/shared/file-category';
import type { FileCategory as CloudFileCategory } from '@lightnote/shared/file-category';
export {
  FILE_CATEGORY_ORDER as CLOUD_FILE_CATEGORY_ORDER,
  normalizeFileCategory as normalizeCloudFileCategory,
  resolveFileCategory as getCloudFileCategory,
  resolveFilePreviewType as getCloudPreviewType,
  resolveFilePlaybackMimeType as getCloudMediaMimeType,
} from '@lightnote/shared/file-category';
export type {
  FileCategory as CloudFileCategory,
  FilePreviewType as CloudPreviewType,
} from '@lightnote/shared/file-category';

export const CLOUD_FILE_CATEGORY_LABEL_KEY: Record<CloudFileCategory, string> = {
  image: 'cloudSpace.image',
  video: 'cloudSpace.video',
  audio: 'cloudSpace.audio',
  pdf: 'cloudSpace.pdf',
  word: 'cloudSpace.word',
  excel: 'cloudSpace.excel',
  ppt: 'cloudSpace.ppt',
  text: 'cloudSpace.text',
  compress: 'cloudSpace.compress',
  other: 'cloudSpace.other',
};

export function isLegacyOfficeFile(file?: { fileName?: string; fileType?: string; ext?: string }): boolean {
  return getCloudPreviewType(file) === 'converted-pdf';
}
export function isHtmlFile(file?: { fileName?: string; fileType?: string; ext?: string }): boolean {
  return getCloudPreviewType(file) === 'html';
}
export type CloudMediaPlaybackSupport = 'supported' | 'unsupported' | 'unknown';

export function getCloudMediaPlaybackSupport(
  file?: {
    category?: string;
    fileName?: string;
    fileType?: string;
    ext?: string;
  },
  canPlayType?: (mimeType: string) => CanPlayTypeResult,
): CloudMediaPlaybackSupport {
  const previewType = getCloudPreviewType(file);
  if (previewType !== 'video' && previewType !== 'audio') return 'unknown';

  const mimeType = getCloudMediaMimeType(file);
  if (!mimeType) return 'unknown';

  let check = canPlayType;
  if (!check && typeof document !== 'undefined') {
    const media = document.createElement(previewType);
    check = media.canPlayType.bind(media);
  }
  if (!check) return 'unknown';

  try {
    if (check(mimeType)) return 'supported';
    // QuickTime 的 MIME 探测可能拒绝实际可解码的 MOV，交给媒体元素读取内容后判断。
    if (previewType === 'video' && mimeType.split(';')[0] === 'video/quicktime') return 'unknown';
    return 'unsupported';
  } catch {
    return 'unknown';
  }
}
