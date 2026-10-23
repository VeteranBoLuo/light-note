import { createHash, randomUUID } from 'node:crypto';
import { readFile, access } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Opt-in local integration: synthetic accounts, real SQL / handlers / upload confirmation.
// Object storage is local by default; real OBS requires a separate explicit opt-in.
// Image workers, mail and Redis stay isolated in both modes.
// Real mode accepts only explicitly supplied environment values, never a project .env.
vi.mock('dotenv/config', () => ({}));
const state = vi.hoisted(() => ({ db: null, origin: '', objects: new Map(), realObjects: new Set(), owner: '' }));
vi.mock('../db/index.js', () => ({
  default: {
    query: (...args) => state.db.query(...args),
    getConnection: (...args) => state.db.getConnection(...args),
  },
}));
vi.mock('./obsClient.js', async (importOriginal) => {
  if (process.env.LIGHTNOTE_TEST_REAL_OBS === 'true') {
    if (
      ['OBS_AK', 'OBS_SK', 'OBS_ENDPOINT', 'OBS_BUCKET_NAME'].some(
        (key) => !process.env[key] || /vitest-|test\.invalid/.test(process.env[key]),
      )
    ) {
      throw new Error('OBS_TEST_EXPLICIT_CONFIG_REQUIRED');
    }
    const actual = await importOriginal();
    return {
      ...actual,
      createUploadSignedUrl: (options) => {
        if (!state.owner || !options.objectKey.startsWith(`files/${state.owner}/`)) {
          throw new Error('OBS_TEST_OWNER_MISMATCH');
        }
        state.realObjects.add(options.objectKey);
        return actual.createUploadSignedUrl(options);
      },
      copyObjectInObs: (sourceKey, targetKey) => {
        if (!state.owner || !targetKey.startsWith(`files/${state.owner}/`)) {
          throw new Error('OBS_TEST_OWNER_MISMATCH');
        }
        state.realObjects.add(targetKey);
        return actual.copyObjectInObs(sourceKey, targetKey);
      },
    };
  }
  return {
    default: {},
    bucketBaseUrl: 'http://127.0.0.1',
    buildObjectKey: (owner, name) => `files/${owner}/${name}`,
    buildObjectUrl: (key) => `${state.origin}/objects/${encodeURIComponent(key)}`,
    createUploadSignedUrl: ({ objectKey }) => ({
      url: `${state.origin}/objects/${encodeURIComponent(objectKey)}`,
      headers: {},
    }),
    createDownloadSignedUrl: ({ objectKey }) => ({ url: `${state.origin}/objects/${encodeURIComponent(objectKey)}` }),
    getObjectMetadataFromObs: async (key) => {
      const object = state.objects.get(key);
      if (!object) throw Object.assign(new Error('missing local object'), { obsStatus: 404 });
      return { contentLength: object.length, contentType: 'image/png', etag: 'local-image' };
    },
    deleteObjectFromObs: async (key) => state.objects.delete(key),
    copyObjectInObs: vi.fn(async (sourceKey, targetKey) => {
      const object = state.objects.get(sourceKey);
      if (!object) throw Object.assign(new Error('missing local object'), { obsStatus: 404 });
      state.objects.set(targetKey, Buffer.from(object));
    }),
    putObjectToObs: vi.fn(),
  };
});
vi.mock('./imagePreview/references.js', () => ({
  registerCloudImage: vi.fn(),
  removeImageReferences: vi.fn(),
  syncCloudImageById: vi.fn(),
}));
vi.mock('./aiDocument/service.js', () => ({ purgeDocumentSourcesForCloudFiles: vi.fn() }));

const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const realObs = process.env.LIGHTNOTE_TEST_REAL_OBS === 'true';
const schema = `weekly_report_${randomUUID().replaceAll('-', '')}`;
let admin, server, origin;
const actor = realObs ? `wr-${randomUUID().replaceAll('-', '').slice(0, 24)}` : 'weekly-acceptance-owner';
const other = 'weekly-acceptance-other';
const ownerHeaders = { 'content-type': 'application/json' };

describe.skipIf(!socketPath)('成长周报真实 MySQL / HTTP 联调', () => {
  beforeAll(async () => {
    state.owner = actor;
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Temporary local socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root', multipleStatements: true });
    const [[runtime]] = await admin.query('SELECT @@global.skip_networking AS isolated');
    if (Number(runtime.isolated) !== 1) throw new Error('Isolated MySQL required');
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    state.db = mysql.createPool({
      socketPath,
      user: 'root',
      database: schema,
      connectionLimit: 6,
      multipleStatements: true,
    });
    await state.db.query('SET FOREIGN_KEY_CHECKS=0');
    // DDL only: never import application data, credentials or a production snapshot.
    for (const path of [
      '../tag_db.sql',
      '../migrations/20260708_growth.sql',
      '../migrations/20260715_todo_action_center.sql',
      '../migrations/20260715_resource_inbox.sql',
      '../migrations/20260914_community_feed.sql',
      '../migrations/20260916_community_topics.sql',
      '../migrations/20260916_community_task_rewards.sql',
    ]) {
      const sql = await readFile(new URL(path, import.meta.url), 'utf8');
      for (const ddl of sql.match(/^CREATE TABLE[\s\S]*?;(?=\s*(?:\n|$))/gm) || []) await state.db.query(ddl);
    }
    await state.db.query('ALTER TABLE user_growth ADD last_notified_level INT NOT NULL DEFAULT 1');
    const { ensurePointsSchema } = await import('./points.js');
    const { ensureGrowthCenterSchema } = await import('./growthCenterSchema.js');
    const { ensureGrowthTaskSchema } = await import('./growthTaskSchema.js');
    await ensurePointsSchema();
    await ensureGrowthCenterSchema();
    await ensureGrowthTaskSchema();
    await (await import('./notification.js')).ensureNotificationTable();
    await state.db.query(
      "INSERT INTO user (id,alias,role) VALUES (?, '周报验收账号', 'user'), (?, '另一验收账号', 'user')",
      [actor, other],
    );
    await state.db.query(
      'INSERT INTO user_growth (user_id,exp,points,last_notified_level) VALUES (?,1200,100,3),(?,500,0,2)',
      [actor, other],
    );
    await state.db.query(
      "INSERT INTO user_growth_preferences (user_id,timezone,utc_offset_minutes) VALUES (?, 'Asia/Shanghai',480),(?, 'Asia/Shanghai',480)",
      [actor, other],
    );
    const { getWeeklyReportPeriod } = await import('./weeklyReport.js');
    const { getGrowthCalendarContext } = await import('./growthPreferences.js');
    const period = getWeeklyReportPeriod({ calendar: await getGrowthCalendarContext(actor) });
    const created = `${period.start} 04:00:00`;
    // Three notes make a real claimable challenge; a foreign account and a seed note must stay private.
    for (let i = 0; i < 3; i++)
      await state.db.query('INSERT INTO note (id,title,create_by,create_time) VALUES (?,?,?,?)', [
        `weekly-note-${i}`,
        `周报联调笔记 ${i + 1}`,
        actor,
        created,
      ]);
    await state.db.query('INSERT INTO note (id,title,create_by,create_time) VALUES (?,?,?,?)', [
      'weekly-foreign-note',
      '其他账号私密内容',
      other,
      created,
    ]);
    await state.db.query('INSERT INTO note (id,title,create_by,create_time) VALUES (?,?,?,?)', [
      'weekly-seed-note',
      '教学示例',
      actor,
      created,
    ]);
    await state.db.query(
      "INSERT INTO onboarding_seed_resources (user_id,resource_type,resource_id) VALUES (?,'note','weekly-seed-note')",
      [actor],
    );
    await state.db.query(
      "INSERT INTO growth_events (user_id,source,ref_id,amount,create_time) VALUES (?,'note','weekly-note-0',15,?)",
      [actor, created],
    );
    for (let i = 0; i < 3; i++)
      await state.db.query(
        "INSERT INTO growth_events (user_id,source,ref_id,amount,create_time) VALUES (?,'activity_note',?,0,?)",
        [actor, `weekly-note-${i}`, created],
      );
    await state.db.query('INSERT INTO note (id,title,create_by,create_time) VALUES (?,?,?,?)', [
      'weekly-last-note',
      '上周联调笔记',
      actor,
      `${period.compareStart} 04:00:00`,
    ]);
    const reportModule = await import('./weeklyReport.js');
    const snapshot = await reportModule.buildWeeklyReport(actor, 'user', { period: 'last' });
    await state.db.query(
      "INSERT INTO notification (id,user_id,type,title,content,link,meta) VALUES (?,?,'system','上周成长周报','本地验收快照','/growth',?)",
      ['weekly-notification', actor, JSON.stringify({ weeklyReport: snapshot })],
    );
    const app = express();
    app.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:5196');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
      if (req.method === 'OPTIONS') return res.sendStatus(204);
      req.user = {
        id: req.headers['x-fixture-actor'] || actor,
        role: req.headers['x-fixture-actor'] === 'visitor' ? 'visitor' : 'user',
      };
      req.suppressUserRewards = true;
      if (req.headers['x-fixture-admin']) {
        req.adminContext = { mode: 'readonly' };
        req.adminCapability = { policy: 'read' };
      }
      next();
    });
    app.put('/objects/:key', express.raw({ type: '*/*', limit: '15mb' }), (req, res) => {
      state.objects.set(req.params.key, req.body);
      res.sendStatus(200);
    });
    app.use(express.json());
    app.use('/api/growth', (await import('../router/growth.js')).default);
    app.use('/api/file', (await import('../router/file.js')).default);
    app.use('/api/notification', (await import('../router/notification.js')).default);
    app.post('/api/common/recordOperationLogs', (_req, res) => res.json({ status: 200, data: null }));
    const port = Number(process.env.WEEKLY_REPORT_ACCEPTANCE_PORT || 0);
    server = app.listen(port, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    origin = state.origin = `http://127.0.0.1:${server.address().port}`;
    console.log(
      `[weekly-report-local] ${origin}; synthetic accounts; isolated database; ${realObs ? 'real OBS' : 'local object storage'}`,
    );
  }, 60000);
  afterAll(async () => {
    await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
    const cleanupErrors = [];
    if (realObs && state.realObjects.size) {
      const { deleteObjectFromObs, getObjectMetadataFromObs } = await import('./obsClient.js');
      for (const objectKey of state.realObjects) {
        try {
          await deleteObjectFromObs(objectKey);
          await expect(getObjectMetadataFromObs(objectKey)).rejects.toMatchObject({ obsStatus: 404 });
        } catch {
          cleanupErrors.push(objectKey);
        }
      }
      console.log(
        `[weekly-report-real-obs] cleanup: ${state.realObjects.size - cleanupErrors.length}/${state.realObjects.size} objects removed and HEAD returned 404`,
      );
    }
    await state.db?.end();
    vi.unstubAllEnvs();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS ${schema}`);
      await admin.end();
    }
    if (cleanupErrors.length) throw new Error(`OBS_TEST_CLEANUP_FAILED: ${cleanupErrors.length} test objects`);
  });
  async function request(path, body, headers = {}) {
    return (
      await fetch(origin + path, {
        method: body ? 'POST' : 'GET',
        headers: { ...ownerHeaders, ...headers },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
    ).json();
  }
  it('真实接口返回自然周、本人条目和真实等级，排除其他账号与教学示例', async () => {
    const result = await request('/api/growth/weeklyReport?period=current');
    expect(result.status).toBe(200);
    expect(result.data).toMatchObject({ notes: 3, activeDays: 1, level: 3, period: { kind: 'current' } });
    expect(result.data.items.map((item) => item.id).sort()).toEqual([
      'weekly-note-0',
      'weekly-note-1',
      'weekly-note-2',
    ]);
    expect(result.data.days).toHaveLength(7);
    expect((await request('/api/growth/weeklyReport?period=last')).data.period).toMatchObject({
      kind: 'last',
      elapsedDays: 7,
    });
    expect((await request('/api/growth/weeklyReport?period=invalid')).status).toBe(400);
  });
  it('通知快照不含私密条目，管理员上下文实时接口也不返回标题', async () => {
    const adminReport = await request('/api/growth/weeklyReport', null, { 'x-fixture-admin': '1' });
    expect(adminReport.status).toBe(200);
    expect(adminReport.data).not.toHaveProperty('items');
    const [[row]] = await state.db.query("SELECT meta FROM notification WHERE id='weekly-notification'");
    const meta = typeof row.meta === 'string' ? JSON.parse(row.meta) : row.meta;
    expect(meta.weeklyReport).not.toHaveProperty('items');
  });
  it('root 与普通账号均按周报开关发放，默认开启且同周不重复发放', async () => {
    const { generateWeeklyReports, getWeeklyReportPeriod } = await import('./weeklyReport.js');
    const { getGrowthCalendarContext } = await import('./growthPreferences.js');
    const fixtures = ['root', 'user'].flatMap((role) =>
      [true, false, null].map((enabled) => ({
        id: `weekly-push-${role}-${enabled ?? 'default'}`,
        role,
        preferences: enabled === null ? null : JSON.stringify({ weeklyReport: enabled }),
        receives: enabled !== false,
        exp: role === 'root' ? -1 : 15,
      })),
    );
    for (const fixture of fixtures) {
      await state.db.query('INSERT INTO user (id,role,preferences) VALUES (?,?,?)', [
        fixture.id,
        fixture.role,
        fixture.preferences,
      ]);
      const period = getWeeklyReportPeriod({
        calendar: await getGrowthCalendarContext(fixture.id),
        period: 'last',
      });
      // 本周事件确保进入候选查询，上周事件提供非空周报数据，避免依赖测试执行的星期。
      await state.db.query(
        `INSERT INTO growth_events (user_id,source,ref_id,amount,create_time)
         VALUES (?,'activity_note','current',0,NOW()),(?,'note','last',?,?)`,
        [fixture.id, fixture.id, fixture.exp, `${period.end} 12:00:00`],
      );
      if (fixture.role === 'root') {
        // 一条记录与 -1 经验相加为零，但这仍是一份有活动的周报。
        await state.db.query('INSERT INTO note (id,title,create_by,create_time) VALUES (?,?,?,?)', [
          fixture.id,
          '周报经验调整验收',
          fixture.id,
          `${period.end} 12:00:00`,
        ]);
      }
    }
    vi.stubEnv('LIGHTNOTE_RUNTIME_ENV', 'production');
    try {
      for (let run = 0; run < 2; run++) {
        await generateWeeklyReports();
        for (const fixture of fixtures) {
          const [notifications] = await state.db.query('SELECT type,content,meta FROM notification WHERE user_id=?', [
            fixture.id,
          ]);
          expect(notifications, `${fixture.id}, run ${run}`).toHaveLength(fixture.receives ? 1 : 0);
          if (fixture.receives) {
            expect(notifications[0].type).toBe('system');
            expect(notifications[0].content).toContain(`${fixture.exp >= 0 ? '+' : ''}${fixture.exp} 经验`);
            const meta =
              typeof notifications[0].meta === 'string' ? JSON.parse(notifications[0].meta) : notifications[0].meta;
            expect(meta.weeklyReport).toMatchObject({ exp: fixture.exp, period: { kind: 'last' } });
            expect(meta.weeklyReport).not.toHaveProperty('items');
          }
        }
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it('挑战领奖写入真实积分账本，重复领取不重复增加余额', async () => {
    const weekly = await request('/api/growth/weekly');
    expect(weekly.status).toBe(200);
    const challenge = weekly.data.challenges.find((c) => c.metric === 'note');
    expect(challenge.claimable).toBe(true);
    const receipt = await request('/api/growth/weekly/claim', { key: challenge.key });
    expect(receipt.status).toBe(200);
    expect(receipt.data.ok).toBe(true);
    const [[before]] = await state.db.query('SELECT points FROM user_growth WHERE user_id=?', [actor]);
    await request('/api/growth/weekly/claim', { key: challenge.key });
    const [[after]] = await state.db.query('SELECT points FROM user_growth WHERE user_id=?', [actor]);
    expect(after.points).toBe(before.points);
  });
  it('文件夹、PUT 文件和确认上传形成真实持久化闭环', async () => {
    const folder = await request('/api/file/ensureFolder', { name: '周报' });
    expect(folder.status).toBe(200);
    const bytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1kAAAAASUVORK5CYII=',
      'base64',
    );
    const prepare = await request('/api/file/uploadFiles', {
      files: [{ fileName: 'weekly-local.png', fileType: 'image/png', fileSize: bytes.length }],
    });
    expect(prepare.status).toBe(200);
    const file = prepare.data[0];
    expect(
      (await fetch(file.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: bytes })).ok,
    ).toBe(true);
    const confirmed = await request('/api/file/confirmUpload', {
      folderId: folder.data.id,
      files: [{ fileName: file.filename, objectKey: file.objectKey, fileType: 'image/png', fileSize: bytes.length }],
    });
    expect(confirmed.status).toBe(200);
    expect(confirmed.data[0].fileId).toBeTruthy();
    const [[row]] = await state.db.query('SELECT create_by,folder_id,file_size,obs_key FROM files WHERE id=?', [
      confirmed.data[0].fileId,
    ]);
    expect(row).toMatchObject({ create_by: actor, folder_id: Number(folder.data.id), file_size: bytes.length });
    expect(row.obs_key.startsWith(`files/${actor}/published/`)).toBe(true);
    if (realObs) {
      const { createDownloadSignedUrl, getObjectBufferFromObs, getObjectMetadataFromObs } =
        await import('./obsClient.js');
      expect(await getObjectMetadataFromObs(row.obs_key)).toMatchObject({
        contentLength: bytes.length,
        contentType: 'image/png',
      });
      const stored = await getObjectBufferFromObs(row.obs_key);
      const response = await fetch(
        createDownloadSignedUrl({
          objectKey: row.obs_key,
          fileName: '周报验收.png',
          responseContentType: 'image/png',
        }).url,
      );
      expect(response.status).toBe(200);
      const downloaded = Buffer.from(await response.arrayBuffer());
      expect(stored).toEqual(bytes);
      expect(downloaded).toEqual(bytes);
      console.log(
        `[weekly-report-real-obs] signed PUT / HEAD / signed GET / SDK GET passed; sha256=${createHash('sha256').update(downloaded).digest('hex')}`,
      );
    } else {
      expect(state.objects.get(row.obs_key)).toEqual(bytes);
    }
  });
  it('C7 挑战按真实活动事实领奖并刷新领取状态', async () => {
    vi.stubEnv('POINTS_EARNING_C5_ENABLED', 'true');
    vi.stubEnv('POINTS_EARNING_C5_EFFECTIVE_DAY', '20260814');
    vi.stubEnv('POINTS_EARNING_C5_EFFECTIVE_WEEK', '202633');
    vi.stubEnv('POINTS_EARNING_C7_ENABLED', 'true');
    vi.stubEnv('POINTS_EARNING_C7_EFFECTIVE_WEEK', '202639');
    // 使用另一账号，避免前一用例的 legacy 领取记录触发跨版本防重复领取。
    await state.db.query(
      `INSERT INTO note (id,title,create_by,create_time)
       SELECT CONCAT('weekly-c7-',id),title,?,create_time FROM note
       WHERE id IN ('weekly-note-0','weekly-note-1','weekly-note-2')`,
      [other],
    );
    await state.db.query(
      `INSERT INTO growth_events (user_id,source,ref_id,amount,create_time)
       SELECT create_by,'activity_note',id,0,create_time FROM note
       WHERE create_by=? AND id LIKE 'weekly-c7-%'`,
      [other],
    );
    const headers = { 'x-fixture-actor': other };
    const weekly = await request('/api/growth/weekly', null, headers);
    expect(weekly.data.policyVersion).toBe('points-earning-c7');
    expect(weekly.data.challenges.find((c) => c.key === 'wk_note')).toMatchObject({ cur: 3, claimable: true });
    const result = await request('/api/growth/weekly/claim', { key: 'wk_note' }, headers);
    expect(result.data).toMatchObject({ ok: true, reward: 60 });
    const refreshed = await request('/api/growth/weekly', null, headers);
    expect(refreshed.data.challenges.find((c) => c.key === 'wk_note')).toMatchObject({
      claimed: true,
      claimable: false,
    });
  });
  it('周报帮助迁移可重复执行，并保留其他帮助文章', async () => {
    await state.db.query(`CREATE TABLE knowledge_base (
      id CHAR(36) PRIMARY KEY,title VARCHAR(255),content LONGTEXT,category VARCHAR(50),help_section VARCHAR(50),
      status VARCHAR(20),type VARCHAR(20),sort INT,created_by VARCHAR(255),updated_by VARCHAR(255))`);
    await state.db.query(
      "INSERT INTO knowledge_base (id,title,content) VALUES ('unrelated-guide','其他帮助','保留原文')",
    );
    const migration = await readFile(
      new URL('../migrations/20261021_weekly_report_knowledge.sql', import.meta.url),
      'utf8',
    );
    await state.db.query(migration);
    await state.db.query(migration);
    const [rows] = await state.db.query(
      "SELECT content,help_section FROM knowledge_base WHERE title='成长周报：查看、分享与统计口径'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].help_section).toBe('账号与设置');
    expect(rows[0].content).toContain('最近 20 项');
    const [[other]] = await state.db.query("SELECT content FROM knowledge_base WHERE id='unrelated-guide'");
    expect(other.content).toBe('保留原文');
  });
  if (process.env.WEEKLY_REPORT_ACCEPTANCE_PORT)
    it('保持隔离接口供浏览器验收，停止文件出现后清理数据库', async () => {
      const stopFile = process.env.WEEKLY_REPORT_ACCEPTANCE_STOP;
      if (!stopFile || !stopFile.startsWith('/tmp/')) throw new Error('Explicit local stop file required');
      await state.db.query("DELETE FROM points_log WHERE user_id=? AND reason='weekly'", [actor]);
      await state.db.query('UPDATE user_growth SET points=100 WHERE user_id=?', [actor]);
      while (true) {
        try {
          await access(stopFile);
          break;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    }, 7200000);
});
