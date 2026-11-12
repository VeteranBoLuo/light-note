export const CLOUD_DIRECT_MAX_BYTES: number;
export const CLOUD_UPLOAD_MAX_BYTES: number;
export const CLOUD_UPLOAD_PART_BYTES: number;
export const CLOUD_UPLOAD_PART_CONCURRENCY: number;
export const CLOUD_UPLOAD_SIGN_BATCH: number;
export function cloudUploadMode(
  size: number,
): "invalid" | "multipart" | "direct";
