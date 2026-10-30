import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ pool: null }));
vi.mock('../db/index.js', () => ({
  default: {
    query: (...args) => state.pool.query(...args),
    getConnection: () => state.pool.getConnection(),
  },
}));
vi.mock('./bookmarkIconService.js', () => ({
  cleanupBookmarkIconFiles: vi.fn(),
  cleanupPreviousBookmarkIcon: vi.fn(),
  saveIconToDisk: vi.fn(),
}));
vi.mock('./snapshot.js', () => ({
  archiveBookmark: vi.fn(),
  ensureBookmarkSnapshotTable: vi.fn(),
  saveBookmarkSnapshotInTransaction: vi.fn(),
}));
vi.mock('./personalKnowledgeSearch.js', () => ({ invalidatePersonalKnowledgeCache: vi.fn() }));

const { claimTasks } = await import('./bookmarkIconWorkerService.js');
const { ARCHIVE_JOB_SCHEMA, claimBookmarkArchive } = await import('./bookmarkArchiveJobs.js');
const { claimExtraction } = await import('./extraction/worker.js');
const { EXTRACTION_SCHEMA } = await import('./extraction/schema.js');

const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;

// 空闲轮询曾每秒数次执行零行 UPDATE，MIXED 格式下照样写 binlog 并刷盘；领取前必须先只读确认有活可干。
describe.skipIf(!socketPath)('队列领取空闲时不写库（隔离 MySQL）', () => {
  const schema = `queue_claim_${randomUUID().replaceAll('-', '')}`;
  let admin;
  let created = false;

  // 单连接池：领取函数与计数查询落在同一会话，并行运行的其他测试文件不会干扰计数。
  async function updatesDuring(work) {
    const count = async () => {
      const [rows] = await state.pool.query(
        "SHOW SESSION STATUS WHERE Variable_name IN ('Com_update', 'Com_update_multi')",
      );
      return rows.reduce((sum, row) => sum + Number(row.Value), 0);
    };
    const before = await count();
    const result = await work();
    return { result, updates: (await count()) - before };
  }

  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Temporary local socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    const [[server]] = await admin.query('SELECT @@global.skip_networking AS isolated');
    if (Number(server.isolated) !== 1) throw new Error('Isolated MySQL required');
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    state.pool = mysql.createPool({ socketPath, user: 'root', database: schema, connectionLimit: 1 });
    await state.pool.query(`CREATE TABLE bookmark_icon_jobs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, batch_id VARCHAR(64) NOT NULL, user_id VARCHAR(64) NOT NULL,
      bookmark_id VARCHAR(64) NOT NULL, url_snapshot VARCHAR(2048) NOT NULL, origin_key VARCHAR(512) NOT NULL,
      url_hash CHAR(64) NOT NULL, attempts INT NOT NULL DEFAULT 0, status VARCHAR(20) NOT NULL,
      available_at DATETIME(3) NOT NULL, locked_at DATETIME(3) NULL, locked_by VARCHAR(128) NULL,
      PRIMARY KEY (id), KEY idx_icon_job_queue (status, available_at, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await state.pool.query(ARCHIVE_JOB_SCHEMA);
    for (const statement of EXTRACTION_SCHEMA) await state.pool.query(statement);
  });

  afterAll(async () => {
    await state.pool?.end();
    if (created) await admin.query(`DROP DATABASE ${schema}`);
    await admin?.end();
  });

  it('书签图标：空闲时零 UPDATE；超时的处理中任务仍会被放回队列并领取', async () => {
    const idle = await updatesDuring(() => claimTasks('worker-a', 10, 3));
    expect(idle).toEqual({ result: [], updates: 0 });

    await state.pool.query(
      `INSERT INTO bookmark_icon_jobs (batch_id, user_id, bookmark_id, url_snapshot, origin_key, url_hash, status, available_at, locked_at, locked_by)
       VALUES ('b1', 'u1', 'bm1', 'https://a.example', 'https://a.example', REPEAT('a', 64), 'processing', NOW(3), DATE_SUB(NOW(3), INTERVAL 10 MINUTE), 'dead-worker')`,
    );
    const recovered = await updatesDuring(() => claimTasks('worker-a', 10, 3));
    expect(recovered.result.map((row) => row.bookmark_id)).toEqual(['bm1']);
    expect(recovered.updates).toBe(2);
    const [[row]] = await state.pool.query("SELECT status, locked_by FROM bookmark_icon_jobs WHERE bookmark_id='bm1'");
    expect(row).toEqual({ status: 'processing', locked_by: 'worker-a' });
  });

  it('书签归档：空闲时零 UPDATE；耗尽重试的过期租约标为失败，到期任务照常领取', async () => {
    const idle = await updatesDuring(() => claimBookmarkArchive());
    expect(idle).toEqual({ result: null, updates: 0 });

    await state.pool.query(
      `INSERT INTO bookmark_archive_jobs (bookmark_id, user_id, url, status, attempts, next_attempt_at, lease_token, lease_expires_at)
       VALUES ('stuck', 'u1', 'https://a.example', 'running', 3, NOW(), 'old', DATE_SUB(NOW(), INTERVAL 1 MINUTE)),
              ('due', 'u1', 'https://b.example', 'pending', 0, DATE_SUB(NOW(), INTERVAL 1 MINUTE), NULL, NULL)`,
    );
    const claimed = await updatesDuring(() => claimBookmarkArchive());
    expect(claimed.result).toMatchObject({ bookmark_id: 'due', status: 'running', attempts: 1 });
    expect(claimed.updates).toBe(2);
    const [[stuck]] = await state.pool.query(
      "SELECT status, reason_code FROM bookmark_archive_jobs WHERE bookmark_id='stuck'",
    );
    expect(stuck).toEqual({ status: 'failed', reason_code: 'INTERRUPTED' });
    expect(await updatesDuring(() => claimBookmarkArchive())).toEqual({ result: null, updates: 0 });
  });

  it('资料提取：空闲时零 UPDATE；过期租约仍会被回收', async () => {
    const idle = await updatesDuring(() => claimExtraction(state.pool));
    expect(idle).toEqual({ result: null, updates: 0 });

    await state.pool.query(
      `INSERT INTO toolbox_extractions (id, user_id, request_id, input_digest, title, status, phase, lease_token, lease_until, available_at)
       VALUES (?, 'u1', ?, REPEAT('d', 64), 'x', 'analyzing', 'ai', 'old', DATE_SUB(NOW(), INTERVAL 1 MINUTE), DATE_SUB(NOW(), INTERVAL 1 MINUTE))`,
      [randomUUID(), randomUUID()],
    );
    const reclaimed = await updatesDuring(() => claimExtraction(state.pool));
    expect(reclaimed.result).toMatchObject({ status: 'queued', lease_token: expect.any(String) });
    expect(reclaimed.updates).toBe(2);
  });
});
