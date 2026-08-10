import { describe, expect, it } from 'vitest';
import {
  getFilePreviewPollDelay,
  getFilePreviewPollTimeout,
  hasFilePreviewPollingTimedOut,
} from './filePreviewPolling';

describe('file preview polling', () => {
  it('backs off repeated resolve requests while respecting server limits', () => {
    expect(getFilePreviewPollDelay(0, 1500)).toBe(1500);
    expect(getFilePreviewPollDelay(2, 1500)).toBe(3000);
    expect(getFilePreviewPollDelay(5, 1500)).toBe(5000);
    expect(getFilePreviewPollDelay(5, 10_000)).toBe(5000);
  });

  it('uses a shorter timeout for archive manifests than Office conversions', () => {
    expect(getFilePreviewPollTimeout('archive')).toBe(60_000);
    expect(getFilePreviewPollTimeout('converted-pdf')).toBe(150_000);
    expect(hasFilePreviewPollingTimedOut('archive', 1_000, 60_999)).toBe(false);
    expect(hasFilePreviewPollingTimedOut('archive', 1_000, 61_000)).toBe(true);
  });
});
