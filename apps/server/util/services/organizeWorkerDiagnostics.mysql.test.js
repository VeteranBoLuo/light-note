import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, expect, it, describe, vi } from 'vitest';
vi.mock('../../db/index.js', () => ({ default: {} }));
vi.mock('../notificationSchedulerPolicy.js', () => ({ notificationSchedulerEnabled: () => true }));
vi.mock('../tagIconService.js', () => ({
  prepareTagIconRoute: () => ({ needsAi: true }),
  recommendTagIcons: vi.fn(),
  estimateTagIconTokens: () => 0,
}));
import { runOrganizeDirect, runOrganizeInspection, reclassifyCachedIcons } from './organizeProcessingPipeline.js';
import { runOrganizeCompletionNotifications } from './organizeCompletionNotification.js';
import { diagnosedTransaction } from './organizeSuggestionStorage.js';
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
  it('runs real claim, classification and completion services concurrently through pause/resume', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {}),
      notify = vi.fn();
    try {
      for (let round = 0; round < 12; round++) {
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
        ];
        const outcomes = await Promise.allSettled(jobs.map(([name, work]) => withWorkerDiagnostics(name, work)));
        for (const result of outcomes)
          if (result.status === 'rejected') expect(result.reason.code).toBe('ER_LOCK_DEADLOCK');
      }
      await runOrganizeCompletionNotifications('w', db, notify);
      const [[job]] = await db.query("SELECT status,attempts FROM organize_processing_jobs WHERE id='direct-job'");
      expect(job).toEqual({ status: 'skipped', attempts: 0 });
      const [[icon]] = await db.query("SELECT status,next_check_at FROM organize_processing_jobs WHERE id='icon-job'");
      expect(icon.status).toBe('queued');
      expect(icon.next_check_at).not.toBeNull();
      expect(notify).not.toHaveBeenCalled();
      for (const [, value] of log.mock.calls) {
        const r = JSON.parse(value);
        expect(r.code).toBe('ER_LOCK_DEADLOCK');
        expect(r.stage).not.toBe('poll');
      }
      console.log('[worker-diagnostic-test] mixed rounds=12 deadlocks=%d', log.mock.calls.length);
    } finally {
      log.mockRestore();
    }
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
