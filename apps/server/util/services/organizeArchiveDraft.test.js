import { describe, expect, it, vi } from 'vitest';
import { prepareOrganizeArchive } from './organizeArchiveDraft.js';

const source = { type: 'bookmark', id: 'bookmark', source: { url: 'https://example.com/article' } };
describe('organize archive read failures', () => {
  it.each([
    ['TIMEOUT', true],
    ['FETCH_FAILED', true],
    ['DNS_FAILED', true],
    ['RATE_LIMITED', true],
    ['AUTH_REQUIRED', false],
    ['ACCESS_DENIED', false],
    ['BLOCKED_HOST', false],
  ])('preserves the stable %s reason and retry eligibility', async (reason, retryable) => {
    const read = vi.fn().mockResolvedValue({ ok: false, reason });
    expect(await prepareOrganizeArchive('owner', source, read)).toMatchObject({
      status: 'failed',
      reasonCode: reason,
      retryable,
    });
    expect(read).toHaveBeenCalledWith('owner', 'bookmark', { persist: false, retry: false });
  });
  it('does not swallow cancellation or accept a different bookmark URL', async () => {
    const read = vi.fn().mockRejectedValue({ name: 'AbortError' });
    await expect(prepareOrganizeArchive('owner', source, read)).rejects.toMatchObject({ name: 'AbortError' });
    read.mockResolvedValue({ ok: true, url: 'https://example.com/other', content: 'Article' });
    expect(await prepareOrganizeArchive('owner', source, read)).toMatchObject({
      status: 'failed',
      reasonCode: 'RESOURCE_CHANGED',
      retryable: false,
    });
  });
});
