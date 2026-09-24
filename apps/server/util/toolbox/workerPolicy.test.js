import { describe, expect, it, vi } from 'vitest';
import { toolboxWorkerEnabled } from './workerPolicy.js';
import { runSingleToolboxJob, cleanupExpiredToolboxData } from './worker.js';

describe('toolbox queue ownership', () => {
  it('does not let a local remote-write override consume production jobs', () => {
    expect(
      toolboxWorkerEnabled({
        LIGHTNOTE_RUNTIME_ENV: 'local',
        DB_HOST: 'db.example.com',
        ALLOW_REMOTE_DATABASE_WRITES: 'true',
      }),
    ).toBe(false);
    expect(toolboxWorkerEnabled({ LIGHTNOTE_RUNTIME_ENV: 'local', DB_HOST: '127.0.0.1' })).toBe(true);
    expect(toolboxWorkerEnabled({ LIGHTNOTE_RUNTIME_ENV: 'production', DB_HOST: 'db.example.com' })).toBe(true);
  });
  it('does not claim, expire or refund jobs when disabled', async () => {
    vi.stubEnv('LIGHTNOTE_RUNTIME_ENV', 'local');
    vi.stubEnv('DB_HOST', 'db.example.com');
    const db = { query: vi.fn(), getConnection: vi.fn() };
    try {
      await expect(runSingleToolboxJob('local-worker', db)).resolves.toBe(false);
      await cleanupExpiredToolboxData(db);
      expect(db.query).not.toHaveBeenCalled();
      expect(db.getConnection).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
