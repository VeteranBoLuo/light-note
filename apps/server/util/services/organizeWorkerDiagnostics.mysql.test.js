import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, expect, it, describe, vi } from 'vitest';
vi.mock('../../db/index.js', () => ({ default: {} }));
vi.mock('../notificationSchedulerPolicy.js', () => ({ notificationSchedulerEnabled: () => true }));
vi.mock('../tagIconService.js', () => ({
  prepareTagIconRoute: () => ({ needsAi: true }),
  recommendTagIcons: vi.fn(),
  estimateTagIconTokens: () => 0,
}));
import { runOrganizeDirect, runOrganizeInspection, reclassifyCachedIcons } from './organizeProcessingPipeline.js';
import { runOrganizeCompletionNotifications } from './organizeCompletionNotification.js';
import { diagnosedTransaction, withNextOrganizeRun } from './organizeSuggestionStorage.js';
import { runSingleSuggestionItem } from './organizeSuggestionService.js';
import { withWorkerDiagnostics } from '../workerDiagnostics.js';
const socket = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const schema = `worker_diagnostic_${randomUUID().replaceAll('-', '')}`;
describe.skipIf(!socket)('Worker diagnostics on isolated MySQL', () => {
  let admin,
    db,
    created = false;
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socket)) throw Error('Temporary socket required');
    admin = await mysql.createConnection({ socketPath: socket, user: 'root' });
    const [[runtime]] = await admin.query('SELECT @@skip_networking AS isolated');
    if (Number(runtime.isolated) !== 1) throw Error('Isolated MySQL required');
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    db = mysql.createPool({
      socketPath: socket,
      user: 'root',
      database: schema,
      connectionLimit: 10,
      multipleStatements: true,
    });
    for (const name of [
      '20260905_organize_suggestion_runs.sql',
      '20260906_organize_run_lifecycle.sql',
      '20260911_organize_processing_jobs.sql',
    ]) {
      await db.query(await readFile(new URL(`../../migrations/${name}`, import.meta.url), 'utf8'));
    }
    await db.query(
      "CREATE TABLE user(id VARCHAR(255) PRIMARY KEY,preferences JSON,del_flag INT DEFAULT 0); INSERT INTO user VALUES ('owner',JSON_OBJECT('notificationsOrganize',false),0)",
    );
    for (const [id, status, phase] of [
      ['direct', 'running', 'completed'],
      ['icons', 'paused', 'completed'],
      ['inspect', 'preparing', 'pending'],
      ['lock-a', 'preview', 'completed'],
      ['lock-b', 'preview', 'completed'],
    ]) {
      await db.query(
        "INSERT INTO organize_suggestion_runs(id,user_id,request_id,options_json,summary_json,status,run_version,rule_phase,started_at) VALUES (?,'owner',?,JSON_OBJECT('checks',JSON_ARRAY()),JSON_OBJECT('completionNotification','pending'),?,3,?,DATE_SUB(NOW(),INTERVAL 1 MINUTE))",
        [id, id, status, phase],
      );
    }
    await db.query(
      'INSERT INTO organize_suggestion_runs(id,user_id,request_id,options_json,summary_json,status,run_version,rule_phase) VALUES ?',
      [
        Array.from({ length: 500 }, (_, index) => [
          `history-${index}`,
          'owner',
          `history-${index}`,
          '{}',
          '{}',
          'completed',
          3,
          'completed',
        ]),
      ],
    );
    await db.query(
      "INSERT INTO organize_processing_jobs(id,run_id,user_id,work_key,kind,lane,status) VALUES ('direct-job','direct','owner','missing:prepare','prepare','direct','queued')",
    );
    await db.query(
      "INSERT INTO organize_suggestion_items(id,run_id,user_id,resource_type,resource_id,snapshot_json,version_hash,ai_kinds_json,ai_status,rule_status) VALUES ('tag-item','icons','owner','tag','tag',JSON_OBJECT('title','synthetic','version','v'),'v',JSON_ARRAY('tag_icon'),'queued','completed')",
    );
    await db.query(
      "INSERT INTO organize_processing_jobs(id,run_id,item_id,user_id,work_key,kind,lane,status) VALUES ('icon-job','icons','tag-item','owner','tag:analysis','analysis','ai','queued')",
    );
  });
  afterAll(async () => {
    await db?.end();
    if (created) await admin.query(`DROP DATABASE ${schema}`);
    await admin?.end();
  });
  beforeEach(async () => {
    await db.query("UPDATE organize_suggestion_runs SET status='paused' WHERE id='icons'");
    await db.query(
      "UPDATE organize_suggestion_items SET ai_status='queued',lease_token=NULL,lease_expires_at=NULL WHERE id='tag-item'",
    );
    await db.query(
      "UPDATE organize_processing_jobs SET status='queued',lane='ai',kind='analysis',next_check_at=NULL,lease_token=NULL,lease_expires_at=NULL WHERE id='icon-job'",
    );
  });
  it('runs real claim, classification and completion services concurrently through pause/resume', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {}),
      notify = vi.fn();
    try {
      for (let round = 0; round < 50; round++) {
        await db.query("UPDATE organize_suggestion_runs SET status=? WHERE id='icons'", [
          round % 2 ? 'running' : 'paused',
        ]);
        const jobs = [
          ['direct-1', () => runOrganizeDirect('w1', db)],
          ['direct-2', () => runOrganizeDirect('w2', db)],
          ['icons-1', () => reclassifyCachedIcons('w1', db)],
          ['icons-2', () => reclassifyCachedIcons('w2', db)],
          ['inspection', () => runOrganizeInspection('w', db)],
          ['notification', () => runOrganizeCompletionNotifications('w', db, notify)],
          ['legacy-ai', () => runSingleSuggestionItem('w', db, { pipeline: 'legacy', skipRules: true })],
        ];
        const outcomes = await Promise.allSettled(jobs.map(([name, work]) => withWorkerDiagnostics(name, work)));
        expect(outcomes.every((result) => result.status === 'fulfilled')).toBe(true);
      }
      await runOrganizeCompletionNotifications('w', db, notify);
      const [[job]] = await db.query("SELECT status,attempts FROM organize_processing_jobs WHERE id='direct-job'");
      expect(job).toEqual({ status: 'skipped', attempts: 0 });
      const [[icon]] = await db.query("SELECT status,next_check_at FROM organize_processing_jobs WHERE id='icon-job'");
      expect(icon.status).toBe('queued');
      expect(icon.next_check_at).not.toBeNull();
      expect(notify).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
  // A held primary key blocks the claim until the competing mutation commits.
  async function contendWithRun(work, mutation) {
    const transition = await db.getConnection();
    let pending, requested;
    const locking = new Promise((resolve) => {
      requested = resolve;
    });
    const observed = {
      query: (...args) => db.query(...args),
      getConnection: async () => {
        const connection = await db.getConnection();
        return {
          beginTransaction: () => connection.beginTransaction(),
          commit: () => connection.commit(),
          rollback: () => connection.rollback(),
          release: () => connection.release(),
          query: (sql, ...args) => {
            const result = connection.query(sql, ...args);
            if (sql.includes('FROM organize_suggestion_runs') && sql.includes('FOR UPDATE')) requested();
            return result;
          },
        };
      },
    };
    try {
      await transition.beginTransaction();
      await transition.query("SELECT id FROM organize_suggestion_runs WHERE id='icons' FOR UPDATE");
      pending = work(observed).then(
        (value) => {
          return { value };
        },
        (error) => {
          return { error };
        },
      );
      const waiting = await Promise.race([locking.then(() => true), pending.then(() => false)]);
      const changed = await mutation(transition).then(
        () => ({}),
        (error) => ({ error }),
      );
      if (changed.error) await transition.rollback();
      else await transition.commit();
      const result = await pending;
      expect(changed.error).toBeUndefined();
      expect(result.error).toBeUndefined();
      return { value: result.value, waiting };
    } finally {
      await transition.rollback();
      transition.release();
      await pending;
    }
  }
  it('empty V3 AI polling does not deadlock a primary-key-locked status transition', async () => {
    await db.query("UPDATE organize_suggestion_runs SET status='paused' WHERE id='icons'");
    const result = await contendWithRun(
      (database) => runSingleSuggestionItem('w', database, { pipeline: 'v3', skipRules: true }),
      (connection) => connection.query("UPDATE organize_suggestion_runs SET status='ended' WHERE id='icons'"),
    );
    expect(result).toEqual({ value: false, waiting: false });
    await db.query("UPDATE organize_suggestion_runs SET status='paused' WHERE id='icons'");
  });
  it('rechecks child eligibility using a fresh snapshot after waiting for the primary key', async () => {
    await db.query("UPDATE organize_suggestion_runs SET status='running' WHERE id='icons'");
    const work = vi.fn(async () => true);
    const result = await contendWithRun(
      (database) =>
        withNextOrganizeRun(
          database,
          'test.claim',
          "r.id='icons' AND r.status='running' AND EXISTS(SELECT 1 FROM organize_suggestion_items i WHERE i.run_id=r.id AND i.ai_status='queued')",
          work,
        ),
      (connection) =>
        connection.query("UPDATE organize_suggestion_items SET ai_status='cancelled' WHERE id='tag-item'"),
    );
    expect(result).toEqual({ value: false, waiting: true });
    expect(work).not.toHaveBeenCalled();
    await db.query("UPDATE organize_suggestion_items SET ai_status='queued' WHERE id='tag-item'");
  });
  it('competing claims give a queued item exactly one lease', async () => {
    await db.query("UPDATE organize_suggestion_runs SET status='running' WHERE id='icons'");
    const claims = await Promise.all(
      Array.from({ length: 16 }, () =>
        withNextOrganizeRun(
          db,
          'test.claim',
          "r.id='icons' AND r.status='running' AND EXISTS(SELECT 1 FROM organize_suggestion_items i WHERE i.run_id=r.id AND i.ai_status='queued')",
          async (connection, run) => {
            const [[item]] = await connection.query(
              "SELECT id FROM organize_suggestion_items WHERE run_id=? AND ai_status='queued' FOR UPDATE",
              [run.id],
            );
            const token = randomUUID();
            await connection.query(
              "UPDATE organize_suggestion_items SET ai_status='running',lease_token=?,lease_expires_at=DATE_ADD(NOW(),INTERVAL 10 MINUTE) WHERE id=?",
              [token, item.id],
            );
            return token;
          },
        ),
      ),
    );
    const tokens = claims.filter(Boolean);
    expect(tokens).toHaveLength(1);
    const [[item]] = await db.query("SELECT lease_token FROM organize_suggestion_items WHERE id='tag-item'");
    expect(item.lease_token).toBe(tokens[0]);
  });
  it('an expired dispatched lease becomes interrupted without replaying AI work', async () => {
    await db.query("UPDATE organize_suggestion_runs SET status='ended' WHERE id='icons'");
    await db.query(
      "UPDATE organize_suggestion_items SET ai_status='running',lease_token=?,lease_expires_at=DATE_SUB(NOW(),INTERVAL 1 MINUTE) WHERE id='tag-item'",
      [randomUUID()],
    );
    expect(await runSingleSuggestionItem('w', db, { pipeline: 'v3', skipRules: true })).toBe(true);
    const [[item]] = await db.query("SELECT ai_status,error_code FROM organize_suggestion_items WHERE id='tag-item'");
    expect(item).toEqual({ ai_status: 'failed', error_code: 'ORGANIZE_WORKER_INTERRUPTED' });
  });
  it('preserves real InnoDB deadlock rollback and reports the losing transaction phase', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    let ready = 0,
      release;
    const barrier = new Promise((r) => {
      release = r;
    });
    try {
      const outcomes = await Promise.allSettled(
        [
          ['lock-a', 'lock-b'],
          ['lock-b', 'lock-a'],
        ].map(([a, b], i) =>
          withWorkerDiagnostics(`synthetic-${i}`, () =>
            diagnosedTransaction(db, 'synthetic.finish', async (c) => {
              await c.query('SELECT id FROM organize_suggestion_runs WHERE id=? FOR UPDATE', [a]);
              if (++ready === 2) release();
              await barrier;
              await c.query('SELECT id FROM organize_suggestion_runs WHERE id=? FOR UPDATE', [b]);
            }),
          ),
        ),
      );
      expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(outcomes.find((r) => r.status === 'rejected').reason.code).toBe('ER_LOCK_DEADLOCK');
      expect(log).toHaveBeenCalledOnce();
      expect(JSON.parse(log.mock.calls[0][1])).toMatchObject({ stage: 'synthetic.finish', code: 'ER_LOCK_DEADLOCK' });
      await db.query("UPDATE organize_suggestion_runs SET status='preview' WHERE id IN ('lock-a','lock-b')");
    } finally {
      log.mockRestore();
    }
  });
});
