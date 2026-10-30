import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Opt-in local integration: synthetic accounts on a disposable MySQL socket, real SQL only.
// Never loads application .env, never touches object storage, Redis or push transports.
vi.mock('dotenv/config', () => ({}));
const state = vi.hoisted(() => ({ db: null }));
vi.mock('../../db/index.js', () => ({
  default: {
    query: (...args) => state.db.query(...args),
    getConnection: (...args) => state.db.getConnection(...args),
  },
}));
vi.mock('../notificationSchedulerPolicy.js', () => ({ notificationSchedulerEnabled: () => true }));
vi.mock('../notificationRealtimeEvents.js', () => ({ queueNotificationChange: vi.fn() }));

const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const schema = `annual_report_${randomUUID().replaceAll('-', '')}`;
const NOW = new Date('2026-12-20T10:00:00+08:00');
const actor = 'annual-actor';
const light = 'annual-light';
const empty = 'annual-empty';
const other = 'annual-other';
let admin;

async function insertBookmark(id, user, createTime, url, extra = {}) {
  await state.db.query(
    'INSERT INTO bookmark (id, name, url, user_id, create_time, del_flag) VALUES (?, ?, ?, ?, ?, ?)',
    [id, extra.name || id, url, user, createTime, extra.deleted ? 1 : 0],
  );
}

async function insertNote(id, user, createTime, { title = id, type = 'markdown', content = '', deleted = false } = {}) {
  await state.db.query(
    'INSERT INTO note (id, title, content, type, create_by, create_time, update_time, del_flag) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, title, content, type, user, createTime, createTime, deleted ? '1' : '0'],
  );
}

describe.skipIf(!socketPath)('年度报告真实 MySQL 聚合', () => {
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Temporary local socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root', multipleStatements: true });
    const [[runtime]] = await admin.query('SELECT @@global.skip_networking AS isolated');
    if (Number(runtime.isolated) !== 1) throw new Error('Isolated MySQL required');
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    state.db = mysql.createPool({ socketPath, user: 'root', database: schema, connectionLimit: 6 });
    await state.db.query('SET FOREIGN_KEY_CHECKS=0');
    // DDL only: never import application data, credentials or a production snapshot.
    for (const path of [
      '../../tag_db.sql',
      '../../migrations/20260708_growth.sql',
      '../../migrations/20260715_todo_action_center.sql',
      '../../migrations/20260715_resource_inbox.sql',
    ]) {
      const sql = await readFile(new URL(path, import.meta.url), 'utf8');
      for (const ddl of sql.match(/^CREATE TABLE[\s\S]*?;(?=\s*(?:\n|$))/gm) || []) await state.db.query(ddl);
    }
    await state.db.query('ALTER TABLE user_growth ADD last_notified_level INT NOT NULL DEFAULT 1');
    const { ensurePointsSchema } = await import('../points.js');
    const { ensureGrowthCenterSchema } = await import('../growthCenterSchema.js');
    const { ensureGrowthTaskSchema } = await import('../growthTaskSchema.js');
    await ensurePointsSchema();
    await ensureGrowthCenterSchema();
    await ensureGrowthTaskSchema();
    await (await import('../notification.js')).ensureNotificationTable();

    await state.db.query(
      `INSERT INTO user (id, alias, role, create_time) VALUES
         (?, '年度验收', 'user', '2025-03-01 09:00:00'),
         (?, '新来的', 'user', '2026-11-02 08:00:00'),
         (?, '空账号', 'user', '2026-01-01 08:00:00'),
         (?, '另一账号', 'user', '2025-01-01 08:00:00')`,
      [actor, light, empty, other],
    );
    for (const id of [actor, light, empty, other]) {
      await state.db.query('INSERT INTO user_growth (user_id, exp, points) VALUES (?, 3000, 100)', [id]);
      await state.db.query(
        "INSERT INTO user_growth_preferences (user_id, timezone, utc_offset_minutes) VALUES (?, 'Asia/Shanghai', 480)",
        [id],
      );
    }

    // 日常书签：github ×3、juejin ×2、sspai ×1，晚上记录；另有一次 35 条的浏览器导入和一条注册示例、一条已删除。
    const daily = [
      ['bm-1', '2026-01-03 22:10:00', 'https://www.github.com/a'],
      ['bm-2', '2026-01-04 22:20:00', 'https://github.com/b'],
      ['bm-3', '2026-01-05 23:05:00', 'https://github.com/c'],
      ['bm-4', '2026-03-18 21:30:00', 'https://juejin.cn/post/1'],
      ['bm-5', '2026-03-18 21:40:00', 'https://juejin.cn/post/2'],
      ['bm-6', '2026-04-12 22:00:00', 'https://sspai.com/x'],
    ];
    for (const [id, time, url] of daily) await insertBookmark(id, actor, time, url);
    for (let index = 0; index < 35; index++) {
      await insertBookmark(
        `import-${index}`,
        actor,
        `2026-02-01 09:00:${String(index).padStart(2, '0')}`,
        'https://example.com/i',
      );
    }
    await insertBookmark('bm-seed', actor, '2026-01-02 10:00:00', 'https://seed.example/');
    await state.db.query(
      "INSERT INTO onboarding_seed_resources (user_id, resource_type, resource_id) VALUES (?, 'bookmark', 'bm-seed')",
      [actor],
    );
    await insertBookmark('bm-deleted', actor, '2026-01-06 22:00:00', 'https://deleted.example/', { deleted: true });

    // 笔记：一篇改了 3 版，一篇最长，一篇手绘不计字数。
    await insertNote('note-1', actor, '2026-04-02 22:00:00', { title: '读书清单', content: '# 书单\n\n- 置身事内' });
    await insertNote('note-2', actor, '2026-04-03 22:30:00', {
      title: '长文',
      type: 'html',
      content: `<p>${'字'.repeat(1200)}</p>`,
    });
    await insertNote('note-3', actor, '2026-04-04 23:00:00', { title: '草图', type: 'drawing', content: '{"x":1}' });
    for (let index = 0; index < 3; index++) {
      await state.db.query(
        "INSERT INTO note_versions (note_id, title, content, create_by, create_time, type) VALUES ('note-1', '读书清单', '', ?, ?, 'markdown')",
        [actor, `2026-05-0${index + 1} 21:00:00`],
      );
    }
    const [fileInsert] = await state.db.query(
      `INSERT INTO files (create_by, file_name, file_type, file_size, directory, create_time, del_flag)
       VALUES (?, '年度计划.pdf', 'application/pdf', 10, 'files', '2026-04-05 22:00:00', 0)`,
      [actor],
    );
    await state.db.query(
      `INSERT INTO todo_items (id, user_id, title, status, completed_at, del_flag) VALUES
         (?, ?, '交周报', 'completed', '2026-04-06 21:10:00', 0),
         (?, ?, '已删除', 'completed', '2026-04-07 21:10:00', 1)`,
      [randomUUID(), actor, randomUUID(), actor],
    );
    await state.db.query(
      `INSERT INTO resource_inbox (id, user_id, resource_type, resource_id, status, complete_time)
       VALUES (?, ?, 'note', 'note-1', 'completed', '2026-04-08 21:00:00')`,
      [randomUUID(), actor],
    );
    // 标签：前端 ×3、读书 ×2、旅行 ×2 计入；孤立 ×1 不足两次；导入书签上的标签不计。
    await state.db.query(
      `INSERT INTO tag (id, name, user_id, create_time) VALUES
         ('t-fe', '前端', ?, '2025-06-01 10:00:00'), ('t-read', '读书', ?, '2026-03-01 10:00:00'),
         ('t-trip', '旅行', ?, '2026-09-01 10:00:00'), ('t-solo', '孤立', ?, '2026-01-01 10:00:00')`,
      [actor, actor, actor, actor],
    );
    const relations = [
      ['t-fe', 'bookmark', 'bm-1'],
      ['t-fe', 'bookmark', 'bm-2'],
      ['t-fe', 'note', 'note-1'],
      ['t-read', 'note', 'note-1'],
      ['t-read', 'note', 'note-2'],
      ['t-trip', 'bookmark', 'bm-6'],
      ['t-trip', 'file', String(fileInsert.insertId)],
      ['t-solo', 'bookmark', 'bm-3'],
      ...Array.from({ length: 5 }, (_, index) => ['t-solo', 'bookmark', `import-${index}`]),
    ];
    for (const [tagId, type, resourceId] of relations) {
      await state.db.query(
        'INSERT INTO resource_tag_relations (tag_id, resource_type, resource_id, user_id) VALUES (?, ?, ?, ?)',
        [tagId, type, resourceId, actor],
      );
    }
    for (const day of ['20260707', '20260708', '20260709', '20260720']) {
      await state.db.query(
        "INSERT INTO growth_events (user_id, source, ref_id, day, amount, status, create_time) VALUES (?, 'checkin', ?, ?, 10, 'granted', ?)",
        [actor, day, day, `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)} 09:00:00`],
      );
    }
    await state.db.query(
      "INSERT INTO points_log (user_id, delta, reason, ref, create_time) VALUES (?, 20, 'checkin', 'p1', '2026-07-08 09:00:00')",
      [actor],
    );

    // 少数据账号：今年 11 月加入，两篇笔记。另一账号的书签不能串进报告。
    await insertNote('light-1', light, '2026-11-02 10:00:00', { title: '读书计划', content: '计划' });
    await insertNote('light-2', light, '2026-12-09 21:00:00', { title: '年底要读的书', content: '书' });
    await insertBookmark('other-1', other, '2026-01-03 22:00:00', 'https://github.com/other');
  });

  afterAll(async () => {
    await state.db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS ${schema}`);
      await admin.end();
    }
  });

  it('builds the full report from counted records only', async () => {
    const { buildAnnualReport } = await import('./build.js');
    const report = await buildAnnualReport(actor, { year: 2026, now: NOW });
    expect(report).toMatchObject({ year: 2026, phase: 'preview', dataEnd: '2026-12-19', tier: 'full' });
    expect(report.overview.byType).toEqual({ bookmark: 6, note: 3, file: 1, todo: 1, organize: 1 });
    expect(report.overview.batchExcluded).toBe(35);
    expect(report.overview.first).toMatchObject({ type: 'bookmark', id: 'bm-1', date: '2026-01-03' });
    expect(report.overview.last).toMatchObject({ type: 'bookmark', id: 'bm-6', date: '2026-04-12' });
    expect(report.rhythm.activeDays).toBe(11);
    // 4 月 2–6 日：三篇笔记、一个文件、一项待办连续 5 天。
    expect(report.rhythm.longestStreak).toEqual({ days: 5, start: '2026-04-02', end: '2026-04-06' });
    expect(report.bookmarks.domains).toEqual([
      { domain: 'github.com', count: 3 },
      { domain: 'juejin.cn', count: 2 },
      { domain: 'sspai.com', count: 1 },
    ]);
    expect(report.bookmarks.busiestDay).toEqual({ date: '2026-03-18', count: 2 });
    expect(report.notes).toMatchObject({
      count: 3,
      chars: '书单 置身事内'.length + 1200,
      mostRevised: { id: 'note-1', title: '读书清单', versions: 3 },
      longest: { id: 'note-2', chars: 1200 },
    });
    expect(report.notes.highlights.map((item) => item.id)).toEqual(['note-1', 'note-2']);
    expect(report.keywords.top).toEqual([
      { id: 't-fe', name: '前端', count: 3 },
      { id: 't-trip', name: '旅行', count: 2 },
      { id: 't-read', name: '读书', count: 2 },
    ]);
    expect(report.keywords.newTags.map((tag) => tag.name).sort()).toEqual(['旅行', '读书']);
    expect(report.action).toMatchObject({
      todos: 1,
      organized: 1,
      checkinDays: 4,
      longestCheckinStreak: 3,
      points: 20,
      exp: 40,
      startLevel: 1,
      since: '2026-07-08',
    });
    expect(report.title).toMatchObject({ key: 'combined', noun: 'bookmark', modifier: 'night' });
    expect(report.chapters).toEqual([
      'cover',
      'overview',
      'rhythm',
      'notes',
      'bookmarks',
      'keywords',
      'action',
      'poster',
    ]);
    expect(JSON.stringify(report)).not.toContain('other');
    expect(JSON.stringify(report)).not.toContain('seed.example');
    expect(JSON.stringify(report)).not.toContain('deleted.example');
  });

  it('gives new accounts the light report and empty accounts nothing', async () => {
    const { buildAnnualReport, hasAnnualRecords } = await import('./build.js');
    const report = await buildAnnualReport(light, { year: 2026, now: NOW });
    expect(report).toMatchObject({ tier: 'light', chapters: ['cover', 'overview', 'poster'], notes: null });
    expect(report.profile.joinedDay).toBe('2026-11-02');
    expect(report.light.items.map((item) => item.title)).toEqual(['读书计划', '年底要读的书']);
    expect(report.light.from).toBe('join');
    expect(report.light.weeks).toEqual([1, 0, 0, 0, 0, 1, 0]);
    expect(await buildAnnualReport(empty, { year: 2026, now: NOW })).toMatchObject({ tier: 'empty', chapters: [] });
    expect(await hasAnnualRecords(light, { year: 2026, now: NOW })).toBe(true);
    expect(await hasAnnualRecords(empty, { year: 2026, now: NOW })).toBe(false);
  });

  it('records the commemorative achievement once without points and keeps it hidden for others', async () => {
    const { getAnnualReportDefinition } = await import('@lightnote/shared/annual-report');
    const { unlockAnnualReviewAchievement } = await import('./access.js');
    const { getGrowthDashboard, claimAchievement } = await import('../growth.js');
    const definition = getAnnualReportDefinition(2026);
    const [[before]] = await state.db.query('SELECT points FROM user_growth WHERE user_id = ?', [actor]);
    expect(await unlockAnnualReviewAchievement(actor, definition)).toEqual({
      key: 'annual_review_2026',
      newlyUnlocked: true,
    });
    expect((await unlockAnnualReviewAchievement(actor, definition)).newlyUnlocked).toBe(false);
    const dashboard = await getGrowthDashboard(actor);
    expect(dashboard.achievements.find((item) => item.key === 'annual_review_2026')).toMatchObject({
      unlocked: true,
      claimed: true,
      claimable: false,
      commemorative: true,
      reward: 0,
    });
    expect((await claimAchievement(actor, 'annual_review_2026')).ok).toBe(false);
    const [[after]] = await state.db.query('SELECT points FROM user_growth WHERE user_id = ?', [actor]);
    expect(after.points).toBe(before.points);
    const [[ledger]] = await state.db.query(
      "SELECT COUNT(*) AS count FROM points_log WHERE user_id = ? AND ref = 'annual_review_2026'",
      [actor],
    );
    expect(Number(ledger.count)).toBe(0);
    const otherDashboard = await getGrowthDashboard(other);
    expect(otherDashboard.achievements.some((item) => item.key === 'annual_review_2026')).toBe(false);
  });

  it('notifies accounts with a report once and skips empty accounts', async () => {
    const { sendAnnualReportNotices, annualReportNoticeId } = await import('./notice.js');
    const noticeNow = new Date('2026-12-15T10:00:00+08:00');
    // 验收账号、少数据账号和另一账号（今年有 1 条书签）各一条；空账号没有报告，不通知。
    expect(await sendAnnualReportNotices({ year: 2026, now: noticeNow })).toBe(3);
    expect(await sendAnnualReportNotices({ year: 2026, now: noticeNow })).toBe(0);
    expect(await sendAnnualReportNotices({ year: 2026, now: new Date('2026-12-22T10:00:00+08:00') })).toBe(0);
    const [rows] = await state.db.query(
      'SELECT id, user_id AS userId, link, meta FROM notification WHERE user_id IN (?) ORDER BY user_id',
      [[actor, light, empty, other]],
    );
    expect(rows.map((row) => row.userId).sort()).toEqual([actor, light, other].sort());
    for (const row of rows) {
      expect(row.id).toBe(annualReportNoticeId(2026, row.userId));
      expect(row.link).toBe('/growth/annual/2026');
      const meta = typeof row.meta === 'string' ? JSON.parse(row.meta) : row.meta;
      expect(meta).toEqual({ annualReport: 2026 });
    }
    expect(rows.some((row) => row.userId === empty)).toBe(false);
  });

  it('falls back to the earliest own record when the registration time is missing', async () => {
    const { buildAnnualReport } = await import('./build.js');
    const legacy = 'annual-legacy';
    await state.db.query("INSERT INTO user (id, alias, role, create_time) VALUES (?, '老账号', 'user', NULL)", [
      legacy,
    ]);
    await state.db.query(
      "INSERT INTO user_growth_preferences (user_id, timezone, utc_offset_minutes) VALUES (?, 'Asia/Shanghai', 480)",
      [legacy],
    );
    // 示例书签更早，但不算用户自己的记录；最早的真实记录是一篇北京时间 2024-11-08 的笔记。
    await insertBookmark('legacy-seed', legacy, '2023-05-01 10:00:00', 'https://seed.example/');
    await state.db.query(
      "INSERT INTO onboarding_seed_resources (user_id, resource_type, resource_id) VALUES (?, 'bookmark', 'legacy-seed')",
      [legacy],
    );
    await insertNote('legacy-note', legacy, '2024-11-08 11:22:00');
    await insertBookmark('legacy-bm', legacy, '2026-03-01 10:00:00', 'https://legacy.example/');

    const report = await buildAnnualReport(legacy, { year: 2026, now: NOW });
    expect(report.profile.joinedDay).toBe('2024-11-08');
    expect(report.profile.joinDays).toBe(773);
  });
});
