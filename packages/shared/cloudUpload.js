/** 5 GiB 以内保留普通直传协议，超过后才允许分片；显示口径沿用 GB。 */
export const CLOUD_DIRECT_MAX_BYTES = 5 * 1024 ** 3;
export const CLOUD_UPLOAD_MAX_BYTES = 10 * 1024 ** 3;
export const CLOUD_UPLOAD_PART_BYTES = 16 * 1024 ** 2;
export const CLOUD_UPLOAD_PART_CONCURRENCY = 3;
export const CLOUD_UPLOAD_SIGN_BATCH = 6;
export function cloudUploadMode(size) {
  if (!Number.isSafeInteger(size) || size < 0 || size > CLOUD_UPLOAD_MAX_BYTES)
    return "invalid";
  return size > CLOUD_DIRECT_MAX_BYTES ? "multipart" : "direct";
}
