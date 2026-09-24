import { it, expect, vi } from 'vitest';
vi.mock('../../db/index.js', () => ({ default: {} }));
vi.mock('./worker.js', () => ({ runClaimedToolboxJob: vi.fn() }));
import { streamTranslation } from './translationStream.js';
function setup(claimed = true) {
  const emit = vi.fn(); const createJob = vi.fn(async () => ({ id: 'j', toolId: 'translation' }));
  const database = { query: vi.fn(async () => [claimed ? [{ id: 'j', user_id: 'u' }] : []]) };
  const runJob = vi.fn(async (_job, _db, hooks) => { hooks.onProgress({ original: 'Hello', content: '你' }); });
  const getJob = vi.fn().mockResolvedValueOnce({ status: 'processing' }).mockResolvedValue({ status: 'succeeded', artifact: { id: 'a' } });
  const getArtifact = vi.fn(async () => ({ id: 'a', content: '你好' }));
  return { emit, deps: { createJob, database, runJob, getJob, getArtifact, wait: async () => {} } };
}
it('claims before execution, streams partial text and delivers only the persisted result', async () => {
  const { emit, deps } = setup();
  await streamTranslation({ userId: 'u', quoteId: 'q', clientRequestId: 'r', emit }, deps);
  expect(deps.createJob).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u', translationLease: expect.stringMatching(/^translation-stream:/) }));
  expect(emit.mock.calls.map(c => c[0])).toEqual(['start', 'snapshot', 'heartbeat', 'complete']);
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
  await expect(streamTranslation({ userId: 'u', quoteId: 'q', clientRequestId: 'r', emit }, deps)).rejects.toMatchObject({ code: 'TOOLBOX_TRANSLATION_CANCELLED' });
  expect(deps.runJob.mock.calls[0][2].signal.aborted).toBe(true);
  expect(emit.mock.calls.some(c => c[0] === 'complete')).toBe(false);
});
it('disconnecting does not cancel the owner execution', async () => {
  const { emit, deps } = setup();
  await streamTranslation({ userId: 'u', quoteId: 'q', clientRequestId: 'r', emit, disconnected: () => true }, deps);
  expect(deps.runJob.mock.calls[0][2].signal.aborted).toBe(false);
});
it('a monitor failure cannot be interpreted as a completed failed execution', async () => {
  const { emit, deps } = setup();
  deps.getJob.mockRejectedValue(Object.assign(new Error('database temporary'), { code: 'DB_UNAVAILABLE' }));
  await expect(streamTranslation({ userId: 'u', quoteId: 'q', clientRequestId: 'r', emit }, deps)).rejects.not.toHaveProperty('definitive');
  expect(deps.runJob.mock.calls[0][2].signal.aborted).toBe(false);
});
