// Explicitly isolated integration/performance verification. Never run against a project database.
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import express from 'express';
if (
  process.env.DB_HOST !== '127.0.0.1' ||
  !/^ln_activity_verify_[a-z0-9_]+$/.test(process.env.DB_NAME || '') ||
  process.env.LIGHTNOTE_RUNTIME_ENV !== 'local' ||
  !/^redis:\/\/127\.0\.0\.1:/.test(process.env.REDIS_URL || '')
) {
  throw new Error('ACTIVITY_VERIFICATION_REQUIRES_EXPLICIT_ISOLATED_LOCAL_DATABASE');
}
const { default: db } = await import('../db/index.js');
const { default: redis } = await import('../util/redisClient.js');
const { recordActivity, queryActivitySummary, queryActiveUsers, queryActivityBaseline, activityTime } =
  await import('../util/services/userActivityService.js');
const prefix = `activity-verify-${randomUUID()}-`;
const actors = Array.from({ length: 1000 }, (_, i) => prefix + i);
const report = {};
let server;
const statement = (sql) => db.query(sql);
let writes = 0;
const measuredDb = {
  query: (...args) => {
    if (String(args[0]?.sql || args[0]).startsWith('INSERT INTO user_activity_daily')) writes++;
    return db.query(...args);
  },
};
try {
  await statement(
    "CREATE TABLE user (id VARCHAR(255) CHARACTER SET utf8 COLLATE utf8_general_ci PRIMARY KEY, alias VARCHAR(255), role VARCHAR(255), del_flag VARCHAR(255) NOT NULL DEFAULT '0') ENGINE=InnoDB",
  );
  await statement(
    'CREATE TABLE admin_user_remarks (admin_user_id VARCHAR(255) CHARACTER SET utf8, target_user_id VARCHAR(255) CHARACTER SET utf8, remark_name VARCHAR(255), PRIMARY KEY(admin_user_id,target_user_id)) ENGINE=InnoDB',
  );
  const migration = (await readFile(new URL('../migrations/20260908_user_activity.sql', import.meta.url), 'utf8'))
    .split('\n')
    .filter((line) => !line.startsWith('--'))
    .join('\n');
  for (const sql of migration
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean))
    await statement(sql);
  // Fixed historical metadata allows testing comparable full days; all data in this DB is synthetic.
  await statement("UPDATE user_activity_metadata SET started_at = '2026-01-01 00:00:00.000'");
  await db.query('INSERT INTO user (id, alias, role) VALUES ?', [actors.map((id) => [id, 'Synthetic user', 'user'])]);
  if (!redis.isReady)
    await new Promise((resolve, reject) => {
      redis.once('ready', resolve);
      setTimeout(() => reject(new Error('LOCAL_REDIS_NOT_READY')), 3000).unref();
    });
  const at = new Date();
  const app = express();
  app.get('/business/:i', async (req, res) => {
    const [rows] = await db.query('SELECT alias FROM user WHERE id = ?', [
      actors[Number(req.params.i) % actors.length],
    ]);
    res.json({ ok: rows.length === 1 });
  });
  app.post('/activity/:i', async (req, res) => {
    try {
      res.json(await recordActivity(actors[Number(req.params.i) % actors.length], { db: measuredDb, redis }));
    } catch {
      res.status(503).json({ ok: false });
    }
  });
  server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const samples = [];
  const call = async (path, method = 'GET', timings = samples) => {
    const start = performance.now();
    const response = await fetch(base + path, { method });
    await response.json();
    timings.push(performance.now() - start);
    assert.equal(response.status, 200);
  };
  const quantile = (values, q) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * q)];
  async function scheduled(count, spacingMs, fn) {
    await Promise.all(
      Array.from({ length: count }, (_, i) =>
        new Promise((resolve) => setTimeout(resolve, i * spacingMs)).then(() => fn(i)),
      ),
    );
  }
  await scheduled(100, 2, (i) => call(`/business/${i}`));
  const baseline = [],
    mixed = [],
    activityLatency = [];
  await scheduled(1000, 10, (i) => call(`/business/${i}`, 'GET', baseline));
  // 1,000 active accounts spread across a minute (about 17 reports/s), while business requests continue.
  await Promise.all([
    scheduled(1000, 60, (i) => call(`/activity/${i}`, 'POST', activityLatency)),
    scheduled(6000, 10, (i) => call(`/business/${i}`, 'GET', mixed)),
  ]);
  assert.equal(writes, 1000);
  const summary = await queryActivitySummary({ hideInternal: true, db });
  assert.equal(summary.today, 1000);
  assert.equal(summary.period, 1000);
  let cursor = null,
    snapshotAt = null;
  const seen = new Set();
  do {
    const page = await queryActiveUsers({ actorId: 'fixture-root', db, cursor, snapshotAt });
    snapshotAt = page.snapshotAt;
    assert.equal(page.total, 1000);
    page.items.forEach((item) => {
      assert(!seen.has(item.id));
      seen.add(item.id);
    });
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(seen.size, 1000);
  // A new day gives every synthetic account a fresh reservation, independent of the ongoing minute test.
  const burstAt = new Date(at.getTime() + 86_400_000);
  const beforeBurst = writes;
  const burstStart = performance.now();
  await Promise.all(actors.map((id) => recordActivity(id, { now: burstAt, db: measuredDb, redis })));
  const burstMs = performance.now() - burstStart;
  await Promise.all(
    actors.flatMap((id) =>
      Array.from({ length: 3 }, () => recordActivity(id, { now: burstAt, db: measuredDb, redis })),
    ),
  );
  assert.equal(writes - beforeBurst, 1000);
  const today = activityTime(at).slice(0, 10);
  const [explainSummary] = await db.query(
    "EXPLAIN SELECT COUNT(DISTINCT a.user_id) FROM user_activity_daily a STRAIGHT_JOIN user u ON u.id = a.user_id WHERE a.activity_date >= ? AND a.activity_date <= ? AND u.del_flag = 0 AND u.role NOT IN ('visitor','deleted')",
    [today, today],
  );
  const [explainPage] = await db.query(
    'EXPLAIN SELECT a.user_id FROM user_activity_daily a STRAIGHT_JOIN user u ON u.id = a.user_id WHERE a.activity_date = ? AND a.first_active_at <= ? ORDER BY a.first_active_at DESC, a.user_id DESC LIMIT 21',
    [today, activityTime(new Date())],
  );
  report.results = {
    users: seen.size,
    writes,
    duplicateBurstWrites: writes - beforeBurst - 1000,
    burstMs,
    baselineP95Ms: quantile(baseline, 0.95),
    mixedP95Ms: quantile(mixed, 0.95),
    activityP95Ms: quantile(activityLatency, 0.95),
    explainSummary,
    explainPage,
  };
  report.results.businessP95ChangePercent = (report.results.mixedP95Ms / report.results.baselineP95Ms - 1) * 100;
  report.environment =
    'Isolated MySQL 8.4, local Redis, synthetic Express endpoints (not full production auth), 1,000 accounts; 100 business requests/s';
  await writeFile('/tmp/light-note-activity-integration.json', JSON.stringify(report, null, 2));
  const assertions = (await readFile(new URL('../migrations/schema-assertions.sql', import.meta.url), 'utf8')).split(
    '-- Real interaction activity tables and query indexes. Expected 0 rows.',
  )[1];
  for (const sql of assertions
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const [rows] = await db.query(sql);
    assert.equal(rows.length, 0);
  }
  await writeFile('/tmp/light-note-activity-integration.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (redis.isReady) {
    const dates = [activityTime().slice(0, 10), activityTime(new Date(Date.now() + 86_400_000)).slice(0, 10)];
    await redis.del(dates.flatMap((day) => actors.map((id) => `user-activity:v1:${day}:${id}`)));
  }
  await db.end();
  await redis.quit();
}
