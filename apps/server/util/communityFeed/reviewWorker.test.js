import { describe, expect, it, vi } from 'vitest';

vi.mock('./reviewQueue.js', async (importOriginal) => ({ ...(await importOriginal()), reviewSchemaReady: async () => true }));
const { consumePostReview } = await import('./reviewWorker.js');

const enabledEnv = {
  COMMUNITY_AI_REVIEW_ENABLED: 'true',
  COMMUNITY_FEED_ENABLED: 'true',
  COMMUNITY_FEED_WRITES_ENABLED: 'true',
  COMMUNITY_FEED_WORKER_ENABLED: 'true',
};

function fakeDb({ queued }) {
  const lock = { query: vi.fn(async () => [[{ acquired: 0 }]]), release: vi.fn(), destroy: vi.fn() };
  const db = { query: vi.fn(async () => [queued ? [{ queued: 1 }] : []]), getConnection: vi.fn(async () => lock) };
  return { db, lock };
}

describe('community review scheduler', () => {
  it('stays off the database lock while review is disabled and nothing is queued', async () => {
    const { db } = fakeDb({ queued: false });
    expect(await consumePostReview({ db, env: {} })).toBe(false);
    expect(db.getConnection).not.toHaveBeenCalled();
  });

  it('still hands leftover jobs to people after review is disabled', async () => {
    const { db, lock } = fakeDb({ queued: true });
    await consumePostReview({ db, env: {} });
    expect(db.getConnection).toHaveBeenCalledTimes(1);
    expect(lock.release).toHaveBeenCalledTimes(1);
  });

  it('claims through the lock while review is enabled', async () => {
    const { db } = fakeDb({ queued: false });
    await consumePostReview({ db, env: enabledEnv });
    expect(db.getConnection).toHaveBeenCalledTimes(1);
    expect(db.query).not.toHaveBeenCalled();
  });
});
