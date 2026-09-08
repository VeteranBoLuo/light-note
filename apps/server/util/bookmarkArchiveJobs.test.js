import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  connectionQuery: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
  archive: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock('../db/index.js', () => ({
  default: {
    query: mocks.query,
    getConnection: async () => ({
      query: mocks.connectionQuery,
      beginTransaction: vi.fn(),
      commit: mocks.commit,
      rollback: mocks.rollback,
      release: mocks.release,
    }),
  },
}));
vi.mock('./snapshot.js', () => ({ archiveBookmark: mocks.archive, ensureBookmarkSnapshotTable: vi.fn() }));
vi.mock('./personalKnowledgeSearch.js', () => ({ invalidatePersonalKnowledgeCache: mocks.invalidate }));
const {
  archiveRetryDelay,
  claimBookmarkArchive,
  enqueueBookmarkArchive,
  finishBookmarkArchive,
  processBookmarkArchive,
} = await import('./bookmarkArchiveJobs.js');
const job = {
  bookmark_id: 'b',
  user_id: 'u',
  url: 'https://example.com',
  lease_token: 'current',
  attempts: 1,
  status: 'running',
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.invalidate.mockResolvedValue();
  mocks.connectionQuery.mockResolvedValue([{}]);
});
function locked(current = job, url = job.url) {
  mocks.connectionQuery
    .mockResolvedValueOnce([[{ id: 'u' }]])
    .mockResolvedValueOnce([[{ url }]])
    .mockResolvedValueOnce([[current]]);
}
describe('persistent bookmark archives', () => {
  it('retries transient errors with bounded backoff, not access restrictions', () => {
    expect(archiveRetryDelay('TIMEOUT', 1)).toBe(30);
    expect(archiveRetryDelay('DNS_FAILED', 2)).toBe(120);
    expect(archiveRetryDelay('TIMEOUT', 3)).toBeNull();
    for (const reason of ['ACCESS_DENIED', 'AUTH_REQUIRED', 'NOT_FOUND', 'EMPTY_CONTENT'])
      expect(archiveRetryDelay(reason, 1)).toBeNull();
  });
  it('reuses an active job without resetting attempts or enqueueing twice', async () => {
    locked();
    await expect(enqueueBookmarkArchive('u', 'b')).resolves.toEqual({ ok: true, status: 'running' });
    expect(mocks.connectionQuery).toHaveBeenCalledTimes(3);
  });
  it('does not enqueue another owner’s bookmark', async () => {
    mocks.connectionQuery.mockResolvedValueOnce([[{ id: 'u' }]]).mockResolvedValueOnce([[]]);
    expect(await enqueueBookmarkArchive('u', 'b')).toBeNull();
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalled();
  });
  it('rejects stale worker results after a lease replacement', async () => {
    locked({ ...job, lease_token: 'replacement' });
    expect(await finishBookmarkArchive(job, { ok: true, url: job.url, content: 'new' })).toBe(false);
    expect(mocks.connectionQuery).toHaveBeenCalledTimes(3);
    expect(mocks.commit).not.toHaveBeenCalled();
  });
  it('preserves the old snapshot when the bookmark URL changes', async () => {
    locked(job, 'https://example.org');
    expect(await finishBookmarkArchive(job, { ok: true, url: job.url, content: 'new' })).toBe(false);
    expect(mocks.connectionQuery.mock.calls[3][1]).toContain('RESOURCE_CHANGED');
    expect(mocks.connectionQuery.mock.calls.some(([sql]) => sql.includes('INSERT INTO bookmark_snapshot'))).toBe(false);
  });
  it('stores a failure and next retry without touching old content', async () => {
    locked();
    await finishBookmarkArchive(job, { ok: false, reason: 'TIMEOUT' });
    expect(mocks.connectionQuery.mock.calls[3][1]).toEqual(['retry_wait', 'TIMEOUT', null, 0, 30, 'b', 'current']);
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
  it('commits content and successful task together', async () => {
    locked();
    expect(
      await finishBookmarkArchive(job, {
        ok: true,
        url: job.url,
        title: 'Article',
        content: 'body',
        charCount: 4,
        source: 'rendered',
      }),
    ).toBe(true);
    expect(mocks.connectionQuery.mock.calls[3][0]).toContain('INSERT INTO bookmark_snapshot');
    expect(mocks.connectionQuery.mock.calls[4][1]).toEqual(['succeeded', null, 'rendered', 4, 0, 'b', 'current']);
    expect(mocks.commit).toHaveBeenCalledTimes(1);
    expect(mocks.invalidate).toHaveBeenCalledWith('u');
  });
  it('does not fetch when no due work is available', async () => {
    mocks.query.mockResolvedValueOnce([{}]).mockResolvedValueOnce([{ affectedRows: 0 }]);
    expect(await processBookmarkArchive()).toBe(false);
    expect(mocks.archive).not.toHaveBeenCalled();
  });
  it('claims with a unique token and includes expired leases for restart recovery', async () => {
    mocks.query
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[job]]);
    expect(await claimBookmarkArchive()).toEqual(job);
    expect(mocks.query.mock.calls[1][0]).toContain("status = 'running' AND lease_expires_at < NOW()");
    expect(mocks.query.mock.calls[2][1]).toEqual(mocks.query.mock.calls[1][1]);
  });
  it('persists queue saturation as an actionable failure instead of dropping it', async () => {
    mocks.connectionQuery
      .mockResolvedValueOnce([[{ id: 'u' }]])
      .mockResolvedValueOnce([[{ url: job.url }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ count: 100 }]]);
    expect(await enqueueBookmarkArchive('u', 'b')).toMatchObject({ ok: false, reason: 'QUEUE_FULL' });
    expect(mocks.connectionQuery.mock.calls[4][1]).toEqual(['b', 'u', job.url, 'failed', 'QUEUE_FULL']);
    expect(mocks.commit).toHaveBeenCalledTimes(1);
  });
  it('batch retry does not reset a task another request has already queued', async () => {
    locked({ ...job, status: 'pending' });
    expect(await enqueueBookmarkArchive('u', 'b', { failedOnly: true })).toBeNull();
    expect(mocks.connectionQuery).toHaveBeenCalledTimes(3);
  });
});
