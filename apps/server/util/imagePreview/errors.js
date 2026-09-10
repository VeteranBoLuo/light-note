const permanent = new Set([
  'IMAGE_AUDIO_TAG_INVALID',
  'IMAGE_SOURCE_SIZE_LIMIT',
  'IMAGE_SOURCE_UNSUPPORTED',
  'IMAGE_SOURCE_MISSING',
  'IMAGE_DECODE_FAILED',
  'IMAGE_SOURCE_INVALID',
  'IMAGE_OUTPUT_SIZE_LIMIT',
]);
const resource = new Set([
  'IMAGE_SOURCE_SIZE_LIMIT',
  'IMAGE_SOURCE_PIXEL_LIMIT',
  'IMAGE_RESOURCE_LIMIT',
  'IMAGE_OUTPUT_SIZE_LIMIT',
]);
export function imageFailure(code) {
  return {
    errorCode: code || null,
    failureKind: !code ? null : resource.has(code) ? 'resource_limit' : permanent.has(code) ? 'source' : 'service',
    retryable: Boolean(code) && !permanent.has(code) && !resource.has(code),
  };
}
export function classifyImageError(error, stage = 'processing') {
  const code = String(error?.code || '');
  if (/^IMAGE_[A-Z_]+$/.test(code)) return code;
  if (error?.killed || code === 'ETIMEDOUT') return 'IMAGE_PROCESS_TIMEOUT';
  if (code === 'ENOENT')
    return stage === 'source'
      ? 'IMAGE_SOURCE_MISSING'
      : stage === 'decode' || stage === 'encode'
        ? 'IMAGE_RUNTIME_UNAVAILABLE'
        : 'IMAGE_PROCESSING_FAILED';
  if (['ENOSPC', 'ENOMEM'].includes(code)) return 'IMAGE_RESOURCE_LIMIT';
  const detail = String(error?.stderr || '').toLowerCase();
  if (
    /cache resources exhausted|memory allocation failed|disk allocation failed|exceeds.*limit|width or height exceeds/.test(
      detail,
    )
  )
    return 'IMAGE_RESOURCE_LIMIT';
  if (
    stage === 'decode' &&
    /no decode delegate|improper image header|corrupt|insufficient image data|unexpected end/.test(detail)
  )
    return 'IMAGE_DECODE_FAILED';
  if (stage === 'source' || stage === 'upload') return 'IMAGE_STORAGE_UNAVAILABLE';
  return 'IMAGE_PROCESSING_FAILED';
}
