import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const state = {
    bookmarks: [],
    health: new Map(),
    job: null,
    items: new Map(),
    leaseExpired: false,
    healthWriteFailures: new Map(),
  };

  function itemAggregate() {
    const items = [...state.items.values()];
    return {
      total: items.length,
      processed: items.filter((item) => item.status !== 'pending').length,
      alive: items.filter((item) => item.status === 'completed' && item.result_status === 'alive').length,
      suspect: items.filter((item) => item.status === 'completed' && item.result_status === 'suspect').length,
      unknown_count: items.filter((item) => item.status === 'completed' && item.result_status === 'unknown').length,
      skipped: items.filter((item) => item.status === 'skipped').length,
      failed: items.filter((item) => item.status === 'failed').length,
      pending: items.filter((item) => item.status === 'pending').length,
    };
  }

  const query = vi.fn(async (sql, params = []) => {
    const text = String(sql).replace(/\s+/g, ' ').trim();

    if (text.startsWith('SELECT user_id, run_id, status, total, processed')) {
      if (!state.job || state.job.user_id !== params[0]) return [[]];
      return [[{ ...state.job, lease_expired: state.leaseExpired ? 1 : 0 }]];
    }
    if (text.startsWith('INSERT INTO bookmark_health_scan_jobs')) {
      state.job = {
        user_id: params[0],
        run_id: params[1],
        status: 'pending',
        total: 0,
        processed: 0,
        alive: 0,
        suspect: 0,
        unknown_count: 0,
        skipped: 0,
        failed: 0,
        lease_owner: null,
        started_at: null,
        finished_at: null,
        last_error_code: null,
      };
      return [{ affectedRows: 1 }];
    }
    if (text.startsWith('INSERT INTO bookmark_health_scan_items')) {
      for (const bookmark of state.bookmarks) {
        state.items.set(bookmark.id, {
          bookmark_id: bookmark.id,
          status: 'pending',
          attempts: 0,
          result_status: null,
          result_code: null,
        });
      }
      return [{ affectedRows: state.bookmarks.length }];
    }
    if (text.startsWith('UPDATE bookmark_health_scan_jobs SET total = ?')) {
      state.job.total = Number(params[0]);
      state.job.status = state.job.total === 0 ? 'succeeded' : 'pending';
      state.job.finished_at = state.job.total === 0 ? '2026-09-01 10:00:00' : null;
      return [{ affectedRows: 1 }];
    }
    if (text.startsWith('DELETE FROM bookmark_health_scan_items')) {
      state.items.clear();
      return [{ affectedRows: 1 }];
    }
    if (text.startsWith('UPDATE bookmark_health_scan_jobs SET run_id = ?')) {
      state.job = {
        ...state.job,
        run_id: params[0],
        status: 'pending',
        total: 0,
        processed: 0,
        alive: 0,
        suspect: 0,
        unknown_count: 0,
        skipped: 0,
        failed: 0,
        lease_owner: null,
        started_at: null,
        finished_at: null,
        last_error_code: null,
      };
      return [{ affectedRows: 1 }];
    }
    if (text.includes('SELECT COUNT(*) AS total FROM bookmark')) {
      return [[{ total: state.bookmarks.length }]];
    }
    if (text.includes('SELECT COUNT(*) AS checked')) {
      const values = [...state.health.values()];
      return [
        [
          {
            checked: values.length,
            user_normal: 0,
            alive: values.filter((item) => item.status === 'alive').length,
            suspect: values.filter((item) => item.status === 'suspect').length,
            unknown: values.filter((item) => item.status === 'unknown').length,
            last_checked_at: values.length ? '2026-09-01 10:00:00' : null,
          },
        ],
      ];
    }
    if (text.startsWith('SELECT b.id, b.name')) {
      return [
        state.bookmarks
          .filter((bookmark) => state.health.get(bookmark.id)?.status === 'suspect')
          .map((bookmark) => ({
            ...bookmark,
            observedCode: state.health.get(bookmark.id)?.code,
            checkedAt: '2026-09-01 10:00:00',
            effectiveStatus: 'suspect',
            hasSnapshot: 0,
          })),
      ];
    }
    if (text.startsWith('SELECT user_id, run_id FROM bookmark_health_scan_jobs')) {
      const workerId = params[0];
      const claimable =
        state.job &&
        (state.job.status === 'pending' ||
          (state.job.status === 'running' && (state.job.lease_owner === workerId || state.leaseExpired)));
      return [claimable ? [{ user_id: state.job.user_id, run_id: state.job.run_id }] : []];
    }
    if (text.startsWith("UPDATE bookmark_health_scan_items SET status = 'failed'")) {
      for (const item of state.items.values()) {
        if (item.status === 'pending' && item.attempts >= Number(params[1])) {
          item.status = 'failed';
          item.result_code = 'BOOKMARK_HEALTH_RETRY_EXHAUSTED';
        }
      }
      return [{ affectedRows: 1 }];
    }
    if (text.startsWith('SELECT bookmark_id FROM bookmark_health_scan_items')) {
      const maxAttempts = Number(params[1]);
      const rows = [...state.items.values()]
        .filter((item) => item.status === 'pending' && item.attempts < maxAttempts)
        .sort((left, right) => left.bookmark_id.localeCompare(right.bookmark_id))
        .slice(0, 25)
        .map((item) => ({ bookmark_id: item.bookmark_id }));
      return [rows];
    }
    if (text.startsWith("UPDATE bookmark_health_scan_jobs SET status = 'running'")) {
      state.job.status = 'running';
      state.job.lease_owner = params[0];
      state.job.started_at ||= '2026-09-01 10:00:00';
      state.leaseExpired = false;
      return [{ affectedRows: 1 }];
    }
    if (text.startsWith('UPDATE bookmark_health_scan_items SET attempts = attempts + 1')) {
      for (const bookmarkId of params.slice(1)) {
        const item = state.items.get(bookmarkId);
        if (item?.status === 'pending') item.attempts += 1;
      }
      return [{ affectedRows: params.length - 1 }];
    }
    if (text.startsWith('SELECT id, url FROM bookmark')) {
      const bookmark = state.bookmarks.find((item) => item.id === params[0]);
      return [bookmark ? [{ id: bookmark.id, url: bookmark.url }] : []];
    }
    if (text.startsWith('INSERT INTO bookmark_health')) {
      const bookmarkId = params[5];
      const failures = Number(state.healthWriteFailures.get(bookmarkId) || 0);
      if (failures > 0) {
        state.healthWriteFailures.set(bookmarkId, failures - 1);
        throw Object.assign(new Error('temporary database failure'), { code: 'ER_LOCK_WAIT_TIMEOUT' });
      }
      state.health.set(bookmarkId, { status: params[0], code: params[1] });
      return [{ affectedRows: 1 }];
    }
    if (text.startsWith('SELECT status, lease_owner FROM bookmark_health_scan_jobs')) {
      return [state.job ? [{ status: state.job.status, lease_owner: state.job.lease_owner }] : []];
    }
    if (text.startsWith('UPDATE bookmark_health_scan_items SET status = IF')) {
      const item = state.items.get(params[4]);
      if (item?.status === 'pending') {
        item.status = item.attempts >= Number(params[0]) ? 'failed' : 'pending';
        item.result_status = null;
        item.result_code = params[1];
      }
      return [{ affectedRows: 1 }];
    }
    if (text.startsWith('UPDATE bookmark_health_scan_items SET status = ?')) {
      const item = state.items.get(params[4]);
      if (item?.status === 'pending') {
        item.status = params[0];
        item.result_status = params[1];
        item.result_code = params[2];
      }
      return [{ affectedRows: 1 }];
    }
    if (text.startsWith('SELECT COUNT(*) AS total, SUM(status')) {
      return [[itemAggregate()]];
    }
    if (text.startsWith('UPDATE bookmark_health_scan_jobs SET status = ?')) {
      state.job.status = params[0];
      state.job.total = Number(params[1]);
      state.job.processed = Number(params[2]);
      state.job.alive = Number(params[3]);
      state.job.suspect = Number(params[4]);
      state.job.unknown_count = Number(params[5]);
      state.job.skipped = Number(params[6]);
      state.job.failed = Number(params[7]);
      if (['succeeded', 'completed_with_errors'].includes(state.job.status)) {
        state.job.lease_owner = null;
        state.job.finished_at = '2026-09-01 10:05:00';
      }
      state.job.last_error_code = state.job.failed > 0 ? 'BOOKMARK_HEALTH_ITEM_FAILURES' : null;
      return [{ affectedRows: 1 }];
    }
    throw new Error(`UNEXPECTED_QUERY:${text.slice(0, 120)}`);
  });

  const connection = {
    query,
    beginTransaction: vi.fn(async () => {}),
    commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
    release: vi.fn(),
  };

  return {
    state,
    query,
    getConnection: vi.fn(async () => connection),
    reset(bookmarks) {
      state.bookmarks = bookmarks;
      state.health.clear();
      state.job = null;
      state.items.clear();
      state.leaseExpired = false;
      state.healthWriteFailures.clear();
    },
  };
});

vi.mock('../db/index.js', () => ({
  default: { query: fake.query, getConnection: fake.getConnection },
}));

vi.mock('./fetchWebMeta.js', () => ({
  checkUrlLiveness: vi.fn(async () => ({ status: 'alive', code: 200 })),
}));

const { getHealthSummary, isChecking, processBookmarkHealthScanBatch, startFullCheck } =
  await import('./linkHealth.js');

function bookmarks(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `bookmark-${String(index + 1).padStart(3, '0')}`,
    name: `书签 ${index + 1}`,
    url: `https://example.com/${index + 1}`,
  }));
}

describe('linkHealth 持久化全量检测', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fake.reset(bookmarks(2));
  });

  it('一次提交快照全部书签，重复请求复用同一个在途任务', async () => {
    const started = await startFullCheck('user-link-health-test');
    const duplicate = await startFullCheck('user-link-health-test');

    expect(started).toMatchObject({
      total: 2,
      checked: 0,
      running: true,
      runStatus: 'queued',
      scan: { total: 2, processed: 0, status: 'queued' },
    });
    expect(duplicate).toMatchObject({ running: true, already: true, runId: started.runId });
    expect(fake.state.items.size).toBe(2);
    await expect(isChecking('user-link-health-test')).resolves.toBe(true);
  });

  it('Worker 按快照检测并持久化正常、疑似失效与最终进度', async () => {
    fake.state.bookmarks[1].url = 'https://example.com/gone';
    await startFullCheck('user-link-health-test');

    await expect(
      processBookmarkHealthScanBatch('worker-a', {
        checkLiveness: vi.fn(async (url) =>
          url.endsWith('/gone') ? { status: 'suspect', code: 404 } : { status: 'alive', code: 200 },
        ),
      }),
    ).resolves.toBe(true);

    await expect(getHealthSummary('user-link-health-test')).resolves.toMatchObject({
      total: 2,
      checked: 2,
      alive: 1,
      suspectCount: 1,
      running: false,
      runStatus: 'succeeded',
      scan: { total: 2, processed: 2, alive: 1, suspect: 1, failed: 0 },
      suspect: [expect.objectContaining({ id: 'bookmark-002', name: '书签 2' })],
    });
    await expect(processBookmarkHealthScanBatch('worker-a')).resolves.toBe(false);
  });

  it('单次最多领取 25 项，外链请求并发不超过 4', async () => {
    fake.reset(bookmarks(60));
    await startFullCheck('user-link-health-test');
    let active = 0;
    let maxActive = 0;
    const checkLiveness = vi.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return { status: 'alive', code: 200 };
    });

    await processBookmarkHealthScanBatch('worker-a', { checkLiveness });

    expect(checkLiveness).toHaveBeenCalledTimes(25);
    expect(maxActive).toBe(4);
    await expect(getHealthSummary('user-link-health-test', { includeSuspect: false })).resolves.toMatchObject({
      running: true,
      scan: { total: 60, processed: 25, status: 'running' },
    });
  });

  it('租约过期后由新 Worker 续跑，并对基础设施失败最多重试三次', async () => {
    fake.reset(bookmarks(1));
    await startFullCheck('user-link-health-test');
    fake.state.healthWriteFailures.set('bookmark-001', 2);
    const checkLiveness = vi.fn(async () => ({ status: 'alive', code: 200 }));

    await processBookmarkHealthScanBatch('worker-a', { checkLiveness });
    expect(fake.state.items.get('bookmark-001')).toMatchObject({ status: 'pending', attempts: 1 });

    fake.state.leaseExpired = true;
    await processBookmarkHealthScanBatch('worker-b', { checkLiveness });
    expect(fake.state.items.get('bookmark-001')).toMatchObject({ status: 'pending', attempts: 2 });

    fake.state.leaseExpired = true;
    await processBookmarkHealthScanBatch('worker-c', { checkLiveness });

    expect(checkLiveness).toHaveBeenCalledTimes(3);
    expect(fake.state.items.get('bookmark-001')).toMatchObject({ status: 'completed', attempts: 3 });
    await expect(getHealthSummary('user-link-health-test')).resolves.toMatchObject({
      running: false,
      runStatus: 'succeeded',
      scan: { processed: 1, alive: 1, failed: 0 },
    });
  });
});
