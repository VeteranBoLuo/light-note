import { describe, expect, it, vi } from 'vitest';
import {
  assertBookmarkIconWorkerRuntime,
  checkBookmarkIconSchema,
} from './bookmarkIconRuntimeCheck.js';

describe('bookmark icon runtime checks', () => {
  it('缺表、缺 finished_at 或缺索引时失败关闭', async () => {
    const query = vi.fn().mockResolvedValue([[
      {
        tableExists: 1,
        finishedAtExists: 0,
        updateIndexExists: 0,
      },
    ]]);

    const result = await checkBookmarkIconSchema(query);

    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(['finished_at', 'idx_icon_job_updates']);
  });

  it('完整 Schema 才允许 Worker 启动', async () => {
    const query = vi.fn().mockResolvedValue([[
      {
        tableExists: 1,
        finishedAtExists: 1,
        updateIndexExists: 1,
      },
    ]]);

    await expect(checkBookmarkIconSchema(query)).resolves.toEqual({
      ok: true,
      missing: [],
    });
  });

  it('favicon-api 健康检查失败时 Worker 明确拒绝启动', async () => {
    await expect(
      assertBookmarkIconWorkerRuntime({
        schemaCheck: vi.fn().mockResolvedValue({ ok: true, missing: [] }),
        healthCheck: vi.fn().mockResolvedValue({
          ok: false,
          errorCode: 'UPSTREAM_ERROR',
        }),
      }),
    ).rejects.toMatchObject({ code: 'BOOKMARK_ICON_API_UNAVAILABLE' });
  });
});
