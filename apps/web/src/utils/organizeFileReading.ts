export function fileReadingReasonKey(code?: string | null): string {
  if (code === 'UNSUPPORTED_FILE_TYPE') return 'organizeFile.reasons.unsupported';
  if (
    ['FILE_TOO_LARGE', 'DOCUMENT_TOO_LONG', 'OCR_PAGE_LIMIT', 'OCR_IMAGE_TOO_LARGE', 'CONTENT_LIMIT'].includes(
      code || '',
    )
  )
    return 'organizeFile.reasons.limit';
  if (['VISION_UNAVAILABLE', 'OCR_ENGINE_UNAVAILABLE', 'OCR_LANGUAGE_UNAVAILABLE'].includes(code || ''))
    return 'organizeFile.reasons.unavailable';
  if (code?.includes('TIMEOUT')) return 'organizeFile.reasons.timeout';
  if (
    [
      'PDF_ENCRYPTED',
      'DOCUMENT_PARSE_FAILED',
      'FILE_CONTENT_INVALID',
      'FILE_TYPE_MISMATCH',
      'FILE_SIZE_MISMATCH',
    ].includes(code || '')
  )
    return 'organizeFile.reasons.invalid';
  return 'organizeFile.reasons.unreadable';
}
