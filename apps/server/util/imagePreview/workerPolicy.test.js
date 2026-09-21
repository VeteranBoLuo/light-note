import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../../db/index.js', () => ({ default: {} }));
import { imagePreviewWorkerEnabled } from './workerPolicy.js';
it.each([
  [{ LIGHTNOTE_RUNTIME_ENV: 'local', DB_HOST: 'db.example', ALLOW_REMOTE_DATABASE_WRITES: 'true' }, false],
  [{ DB_HOST: 'db.example' }, false],
  [{ LIGHTNOTE_RUNTIME_ENV: 'production', DB_HOST: 'db.example' }, true],
  [{ LIGHTNOTE_RUNTIME_ENV: 'local', DB_HOST: '127.0.0.1' }, true],
  [{ NODE_ENV: 'test' }, true],
])('image queue ownership follows runtime and database scope: %j', (env, expected) => {
  expect(imagePreviewWorkerEnabled(env)).toBe(expected);
});
afterEach(() => vi.unstubAllEnvs());
it('local workers neither claim nor clean up remote image jobs', async () => {
  vi.stubEnv('LIGHTNOTE_RUNTIME_ENV', 'local');
  vi.stubEnv('DB_HOST', 'db.example');
  const { runSingleImagePreviewJob, runSingleVideoPreviewJob, cleanupImageAssets } = await import('./worker.js');
  const db = { getConnection: vi.fn(), query: vi.fn() };
  expect(await runSingleImagePreviewJob('local-worker', { db })).toBe(false);
  expect(await runSingleVideoPreviewJob('local-worker', { db })).toBe(false);
  await cleanupImageAssets({ db });
  expect(db.getConnection).not.toHaveBeenCalled();
  expect(db.query).not.toHaveBeenCalled();
});
