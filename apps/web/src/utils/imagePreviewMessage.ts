export function imagePreviewMessageKey(code?: string | null): string {
  const keys: Record<string, string> = {
    IMAGE_VIDEO_DECODE_FAILED: 'videoDecode',
    IMAGE_VIDEO_SIZE_LIMIT: 'videoSize',
    IMAGE_VIDEO_RESOURCE_LIMIT: 'videoResource',
    IMAGE_SOURCE_MISSING: 'sourceMissing',
    IMAGE_SOURCE_UNSUPPORTED: 'unsupported',
    IMAGE_DECODE_FAILED: 'decode',
    IMAGE_SOURCE_SIZE_LIMIT: 'size',
    IMAGE_SOURCE_PIXEL_LIMIT: 'resource',
    IMAGE_RESOURCE_LIMIT: 'resource',
    IMAGE_OUTPUT_SIZE_LIMIT: 'resource',
    IMAGE_RUNTIME_UNAVAILABLE: 'service',
    IMAGE_PROCESS_TIMEOUT: 'service',
    IMAGE_STORAGE_UNAVAILABLE: 'service',
    IMAGE_BROWSER_LOAD_FAILED: 'network',
    IMAGE_STATUS_UNAVAILABLE: 'network',
  };
  return `imagePreview.${keys[code || ''] || 'unknown'}`;
}
