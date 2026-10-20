import {
  buildObjectKey,
  createDownloadSignedUrl,
  getObjectMetadataFromObs,
  getObjectRangeFromObs,
} from '../obsClient.js';
import { detectImageFormat, IMAGE_HEADER_BYTES } from './format.js';

/** 调用方必须先完成来源权限校验；不改名、不写库、不创建派生任务。 */
export async function resolveImageSourcePreview(
  file,
  { metadata = getObjectMetadataFromObs, readRange = getObjectRangeFromObs, sign = createDownloadSignedUrl } = {},
) {
  const key = file.obs_key || buildObjectKey(file.create_by, file.file_name);
  const meta = await metadata(key);
  const size = Number(meta?.contentLength);
  if (!Number.isSafeInteger(size) || size < 1) {
    throw Object.assign(new Error('FILE_SIZE_INVALID'), { code: 'FILE_SIZE_INVALID', status: 413 });
  }
  if (size !== Number(file.file_size)) {
    throw Object.assign(new Error('FILE_SIZE_MISMATCH'), { code: 'FILE_SIZE_MISMATCH', status: 409 });
  }
  const body = await readRange(key, 0, Math.min(size, IMAGE_HEADER_BYTES) - 1);
  const format = detectImageFormat(body);
  const converted = format?.type === 'heif';
  const supported = Boolean(format?.previewable || converted);
  const remaining = file.expires_at ? Math.floor((new Date(file.expires_at).getTime() - Date.now()) / 1000) : 600;
  if (!Number.isFinite(remaining) || remaining < 1) {
    throw Object.assign(new Error('COMMUNITY_CHAT_FILE_EXPIRED'), { code: 'COMMUNITY_CHAT_FILE_EXPIRED', status: 410 });
  }
  const expires = Math.min(600, remaining);
  return {
    fileId: String(file.id),
    previewType: supported ? 'image' : 'unsupported',
    formatId: format?.type || '',
    sourceMimeType: format?.mimeType || '',
    status: converted ? 'missing' : supported ? 'ready' : 'failed',
    ...(converted ? { strategy: 'image_display' } : {}),
    errorCode: supported ? '' : 'IMAGE_SOURCE_UNSUPPORTED',
    pollAfterMs: 0,
    ...(supported && !converted
      ? {
          sourceDownloadUrl: sign({ objectKey: key, expires, responseContentType: format.mimeType }).url,
          sourceUrlExpiresIn: expires,
        }
      : {}),
  };
}
