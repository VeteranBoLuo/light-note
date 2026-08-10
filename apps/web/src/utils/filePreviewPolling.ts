export type DerivedFilePreviewType = 'archive' | 'converted-pdf';

const ARCHIVE_POLL_TIMEOUT_MS = 60_000;
const OFFICE_POLL_TIMEOUT_MS = 150_000;

export function getFilePreviewPollDelay(pollCount: number, requestedDelayMs = 1500) {
  const requested = Math.min(5000, Math.max(500, requestedDelayMs || 1500));
  if (pollCount < 2) return requested;
  if (pollCount < 5) return Math.max(requested, 3000);
  return Math.max(requested, 5000);
}

export function getFilePreviewPollTimeout(previewType: DerivedFilePreviewType) {
  return previewType === 'archive' ? ARCHIVE_POLL_TIMEOUT_MS : OFFICE_POLL_TIMEOUT_MS;
}

export function hasFilePreviewPollingTimedOut(
  previewType: DerivedFilePreviewType,
  startedAt: number,
  now = Date.now(),
) {
  return now - startedAt >= getFilePreviewPollTimeout(previewType);
}
