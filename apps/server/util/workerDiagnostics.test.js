import { afterEach, expect, it, vi } from 'vitest';
import { withWorkerDiagnostics, withWorkerStage } from './workerDiagnostics.js';
import { diagnosedTransaction } from './services/organizeSuggestionStorage.js';

afterEach(() => vi.restoreAllMocks());
it('isolates concurrent lanes, reports the innermost stage once and excludes error payloads', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const errors = [1, 2].map(() =>
    Object.freeze(
      Object.assign(new Error('password=secret; private SQL'), { code: 'ER_LOCK_DEADLOCK', sql: 'private query' }),
    ),
  );
  await Promise.all(
    errors.map((error, i) =>
      withWorkerDiagnostics(`lane-${i}`, () =>
        withWorkerStage('claim', async () => {
          await Promise.resolve();
          throw error;
        }),
      ).catch((e) => expect(e).toBe(error)),
    ),
  );
  expect(log).toHaveBeenCalledTimes(2);
  const records = log.mock.calls.map(([, value]) => JSON.parse(value));
  expect(records.map((r) => r.channel).sort()).toEqual(['lane-0', 'lane-1']);
  for (const r of records) {
    expect(r).toEqual({
      time: expect.any(String),
      channel: expect.any(String),
      stage: 'claim',
      code: 'ER_LOCK_DEADLOCK',
    });
    expect(Number.isFinite(Date.parse(r.time))).toBe(true);
  }
  expect(JSON.stringify(records)).not.toMatch(/secret|private/);
});
it('does not emit successful polls or ordinary API transaction errors', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  expect(await withWorkerDiagnostics('image', async () => false)).toBe(false);
  await expect(
    withWorkerStage('claim', async () => {
      throw Error('failure');
    }),
  ).rejects.toThrow('failure');
  expect(log).not.toHaveBeenCalled();
});
it('logging failure cannot replace the original exception or transaction rollback', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {
    throw Error('logging failed');
  });
  const db = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn() };
  const error = Object.assign(new Error('original'), { code: 'ER_LOCK_DEADLOCK' });
  await expect(
    withWorkerDiagnostics('organize', () =>
      diagnosedTransaction(db, 'finish', async () => {
        throw error;
      }),
    ),
  ).rejects.toBe(error);
  expect(db.rollback).toHaveBeenCalledOnce();
  expect(db.commit).not.toHaveBeenCalled();
});
