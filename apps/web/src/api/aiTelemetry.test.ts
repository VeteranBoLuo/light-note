import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiBasePost = vi.fn().mockResolvedValue({});
vi.mock('@/http/request.ts', () => ({ apiBasePost }));

const { aiDurationBucket, aiLengthBucket, recordAiProductEvent } = await import('./aiTelemetry');

describe('AI telemetry client', () => {
  beforeEach(() => apiBasePost.mockClear());

  it('uses stable length and duration buckets', () => {
    expect([0, 1, 51, 201, 501].map(aiLengthBucket)).toEqual(['0', '1_50', '51_200', '201_500', '501_plus']);
    expect([0, 1_000, 3_000, 10_000, 30_000, 120_000].map(aiDurationBucket)).toEqual([
      'under_1s',
      '1_3s',
      '3_10s',
      '10_30s',
      '30_120s',
      '120s_plus',
    ]);
  });

  it('posts only the typed event envelope and treats failures as non-blocking', async () => {
    await recordAiProductEvent('ai_entry_opened', { surface: 'edge', device: 'desktop' });
    expect(apiBasePost).toHaveBeenCalledWith(
      '/api/common/recordAiEvent',
      expect.objectContaining({ event: 'ai_entry_opened', dimensions: { surface: 'edge', device: 'desktop' } }),
      { silent: true },
    );
  });
});
