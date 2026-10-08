import { it, expect, vi } from 'vitest';
vi.mock('../../db/index.js', () => ({ default: {} }));
vi.mock('./worker.js', () => ({ runClaimedToolboxJob: vi.fn() }));
import { streamTranslation } from './translationStream.js';
function setup(claimed = true) {
  const emit = vi.fn();
  const createJob = vi.fn(async () => ({ id: 'j', toolId: 'translation' }));
  const database = { query: vi.fn(async () => [claimed ? [{ id: 'j', user_id: 'u' }] : []]) };
  const runJob = vi.fn(async (_job, _db, hooks) => {
    hooks.onProgress({ original: 'Hello', content: '你' });
  });
  const getJob = vi
    .fn()
    .mockResolvedValueOnce({ status: 'processing' })
    .mockResolvedValue({ status: 'succeeded', artifact: { id: 'a' } });
  const getArtifact = vi.fn(async () => ({ id: 'a', content: '你好' }));
  return { emit, deps: { createJob, database, runJob, getJob, getArtifact, wait: async () => {} } };
}
it('claims before execution, streams partial text and delivers only the persisted result', async () => {
  const { emit, deps } = setup();
  await streamTranslation({ userId: 'u', quoteId: 'q', clientRequestId: 'r', emit }, deps);
  expect(deps.createJob).toHaveBeenCalledWith(
    expect.objectContaining({ userId: 'u', translationLease: expect.stringMatching(/^translation-stream:/) }),
  );
  expect(emit.mock.calls.map((c) => c[0])).toEqual(['start', 'snapshot', 'heartbeat', 'complete']);
  expect(emit.mock.calls.at(-1)[1]).toEqual({ id: 'a', content: '你好' });
});
it('a replay observes the original request and never runs a second model', async () => {
  const { emit, deps } = setup(false);
  await streamTranslation({ userId: 'u', quoteId: 'q', clientRequestId: 'r', emit }, deps);
  expect(deps.runJob).not.toHaveBeenCalled();
  expect(deps.database.query.mock.calls[0][1].slice(0, 2)).toEqual(['j', 'u']);
});
it('explicit cancellation aborts execution and never exposes a partial result as complete', async () => {
  const { emit, deps } = setup();
  deps.getJob.mockReset().mockResolvedValue({ status: 'cancelled' });
  await expect(
    streamTranslation({ userId: 'u', quoteId: 'q', clientRequestId: 'r', emit }, deps),
  ).rejects.toMatchObject({ code: 'TOOLBOX_TRANSLATION_CANCELLED' });
  expect(deps.runJob.mock.calls[0][2].signal.aborted).toBe(true);
  expect(emit.mock.calls.some((c) => c[0] === 'complete')).toBe(false);
});
it('disconnecting does not cancel the owner execution', async () => {
  const { emit, deps } = setup();
  await streamTranslation({ userId: 'u', quoteId: 'q', clientRequestId: 'r', emit, disconnected: () => true }, deps);
  expect(deps.runJob.mock.calls[0][2].signal.aborted).toBe(false);
});
it('a monitor failure cannot be interpreted as a completed failed execution', async () => {
  const { emit, deps } = setup();
  deps.getJob.mockRejectedValue(Object.assign(new Error('database temporary'), { code: 'DB_UNAVAILABLE' }));
  await expect(
    streamTranslation({ userId: 'u', quoteId: 'q', clientRequestId: 'r', emit }, deps),
  ).rejects.not.toHaveProperty('definitive');
  expect(deps.runJob.mock.calls[0][2].signal.aborted).toBe(false);
});

it('v2 deltas preserve repaired text and recover after transport drops a progress update', async () => {
  const { deps } = setup();
  let now = 1000,
    delivered = '',
    dropped = false;
  const events = [];
  const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
  const emit = (event, data) => {
    if (event === 'delta' && !dropped) {
      dropped = true;
      return false;
    }
    events.push([event, data]);
    if (event === 'snapshot') delivered = data.content;
    if (event === 'delta') {
      expect(data.offset).toBe(delivered.length);
      delivered += data.content;
    }
    return true;
  };
  deps.runJob.mockImplementation(async (_job, _db, { onProgress }) => {
    for (const content of ['你', '你好', '你好世界', '修复', '修复译文']) {
      now += 100;
      onProgress({ original: 'source', content });
    }
  });
  try {
    await streamTranslation({ userId: 'u', quoteId: 'q', clientRequestId: 'r', streamVersion: 2, emit }, deps);
    expect(delivered).toBe('修复译文');
    expect(events.filter(([event]) => event === 'snapshot').map(([, data]) => data.content)).toEqual(['你', '修复']);
    expect(events.find(([event]) => event === 'delta')[1]).toEqual({ offset: 1, content: '好世界' });
  } finally {
    clock.mockRestore();
  }
});

it('600 updates to the 60000-character limit transmit under 300000 text characters with periodic checkpoints', async () => {
  const { deps } = setup();
  let now = 1000,
    delivered = '',
    transmitted = 0,
    snapshots = 0;
  const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
  deps.runJob.mockImplementation(async (_job, _db, { onProgress }) => {
    for (let i = 1; i <= 600; i++) {
      now += 100;
      onProgress({ original: 'source', content: '文'.repeat(i * 100) });
    }
  });
  const emit = (event, data) => {
    if (event === 'snapshot') {
      delivered = data.content;
      snapshots++;
      transmitted += data.content.length;
    }
    if (event === 'delta') {
      expect(data.offset).toBe(delivered.length);
      delivered += data.content;
      transmitted += data.content.length;
    }
  };
  try {
    await streamTranslation({ userId: 'u', quoteId: 'q', clientRequestId: 'r', streamVersion: 2, emit }, deps);
    expect(delivered).toBe('文'.repeat(60000));
    expect(snapshots).toBeGreaterThan(1);
    expect(transmitted).toBeLessThan(300000);
  } finally {
    clock.mockRestore();
  }
});
