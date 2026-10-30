import { describe, expect, it, vi } from 'vitest';
import { runExportWorker } from './workerLoop.js';

function harness({ processTask, runtime = 'production', maxIterations = 6 }) {
  let iterations = 0;
  const sleeps = [];
  const log = { warn: vi.fn(), error: vi.fn() };
  const deps = {
    assertSchema: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn().mockResolvedValue(undefined),
    processTask,
    runtime,
    log,
    now: () => 0,
    isStopping: () => iterations++ >= maxIterations,
    sleep: async (ms) => sleeps.push(ms),
  };
  return { deps, sleeps, log };
}

describe('runExportWorker', () => {
  it('keeps polling after a transient failure and processes the queued task afterwards', async () => {
    const processTask = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('lost'), { code: 'PROTOCOL_CONNECTION_LOST' }))
      .mockResolvedValueOnce(true)
      .mockResolvedValue(false);
    const { deps, sleeps, log } = harness({ processTask, maxIterations: 4 });
    await runExportWorker(deps);
    expect(processTask).toHaveBeenCalledTimes(4);
    expect(log.error).toHaveBeenCalledWith(
      '[data-export-worker] DATA_EXPORT_WORKER_RETRY code=%s attempt=%d',
      'PROTOCOL_CONNECTION_LOST',
      1,
    );
    expect(sleeps[0]).toBe(3000);
  });

  it('backs off up to 30 seconds while failures repeat and logs only a stable code', async () => {
    const processTask = vi.fn().mockRejectedValue(new Error('secret detail'));
    const { deps, sleeps, log } = harness({ processTask, maxIterations: 7 });
    await runExportWorker(deps);
    expect(sleeps).toEqual([3000, 6000, 12000, 24000, 30000, 30000, 30000]);
    expect(log.error.mock.calls.every((call) => !call.join(' ').includes('secret detail'))).toBe(true);
  });

  it('waits quietly for the local schema instead of treating it as a failure', async () => {
    const processTask = vi.fn();
    const { deps, sleeps, log } = harness({ processTask, runtime: 'local', maxIterations: 2 });
    deps.assertSchema.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ER_NO_SUCH_TABLE' }));
    await runExportWorker(deps);
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.error).not.toHaveBeenCalled();
    expect(sleeps).toEqual([30000, 30000]);
  });
});
