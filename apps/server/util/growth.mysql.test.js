import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ db: null, onQuery: null }));
vi.mock('../db/index.js', () => ({
  default: {
    query: (...args) => state.db.query(...args),
    getConnection: async () => {
      const conn = await state.db.getConnection();
      return new Proxy(conn, {
        get(target, key) {
          if (key === 'query') {
            return (...args) => {
              state.onQuery?.(...args);
              return target.query(...args);
            };
          }
          return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
        },
      });
    },
  },
}));
vi.mock('./growthTaskSchema.js', () => ({ ensureGrowthTaskSchema: vi.fn() }));
vi.mock('./growthAchievementState.js', () => ({
  persistAchievementUnlocksForMetrics: vi.fn(),
  persistAchievementMetricFromDatabase: vi.fn(),
}));
vi.mock('./notification.js', () => ({ createNotification: vi.fn() }));

const { awardCreate, checkin, grantExp, getGrowth, useProtectCard } = await import('./growth.js');
const { claimGrowthTask } = await import('./growthTaskCompletion.js');
const { getGrowthCalendarContext } = await import('./growthPreferences.js');
const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const schema = `growth_${randomUUID().replaceAll('-', '')}`;
const userId = 'growth-user';

describe.skipIf(!socketPath)('成长经验并发与账本（隔离 MySQL）', () => {
  let admin;
  let created = false;
  let calendar;

  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Temporary socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    const [[server]] = await admin.query('SELECT @@global.skip_networking AS isolated');
    if (Number(server.isolated) !== 1) throw new Error('Isolated MySQL required');
    await admin.query(`CREATE DATABASE ${schema}`);
    created = true;
    state.db = mysql.createPool({
      socketPath,
      user: 'root',
      database: schema,
      connectionLimit: 24,
      multipleStatements: true,
    });
    const migration = await readFile(new URL('../migrations/20260708_growth.sql', import.meta.url), 'utf8');
    await state.db.query(migration);
    await state.db.query(`ALTER TABLE user_growth
      ADD last_notified_level INT NOT NULL DEFAULT 1,
      ADD points INT NOT NULL DEFAULT 0,
      ADD equipped_title VARCHAR(64), ADD equipped_frame VARCHAR(64), ADD equipped_background VARCHAR(64),
      ADD storage_bonus_mb INT NOT NULL DEFAULT 0`);
    await state.db.query(`CREATE TABLE user_growth_preferences (
      user_id VARCHAR(64) PRIMARY KEY, weekly_active_target INT, streak_reminder_enabled INT,
      celebration_enabled INT, low_pressure_mode INT, timezone VARCHAR(64), utc_offset_minutes INT,
      points_goal_item_id VARCHAR(64), points_goal_enabled INT) ENGINE=InnoDB`);
    await state.db.query(`CREATE TABLE points_log (
      id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(64), delta INT, reason VARCHAR(32),
      ref VARCHAR(64), policy_version VARCHAR(32), meta JSON,
      create_time DATETIME DEFAULT CURRENT_TIMESTAMP, KEY idx_user_reason_ref(user_id,reason,ref)) ENGINE=InnoDB`);
    await state.db.query(`CREATE TABLE points_earning_period_policy (
      period_type VARCHAR(8), period_key VARCHAR(8), policy_version VARCHAR(32),
      PRIMARY KEY(period_type,period_key)) ENGINE=InnoDB`);
    await state.db.query(`CREATE TABLE user_growth_tasks (
      user_id VARCHAR(64), task_key VARCHAR(64), status VARCHAR(16), completed_at DATETIME,
      claimed_at DATETIME, PRIMARY KEY(user_id,task_key)) ENGINE=InnoDB`);
    await state.db.query('CREATE TABLE user (id VARCHAR(64) PRIMARY KEY, preferences JSON) ENGINE=InnoDB');
  });

  beforeEach(async () => {
    vi.unstubAllEnvs();
    state.onQuery = null;
    for (const table of [
      'growth_events',
      'user_growth',
      'user_growth_preferences',
      'points_log',
      'user_growth_tasks',
    ]) {
      await state.db.query(`DELETE FROM ${table}`);
    }
    await state.db.query('INSERT INTO user_growth (user_id) VALUES (?)', [userId]);
    calendar = await getGrowthCalendarContext(userId);
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await state.db?.end();
    try {
      if (created) await admin.query(`DROP DATABASE ${schema}`);
    } finally {
      await admin?.end();
    }
  });

  async function ledger() {
    const [[row]] = await state.db.query(
      `SELECT g.exp, (SELECT COALESCE(SUM(amount),0) FROM growth_events
        WHERE user_id=g.user_id AND status='granted') AS ledgerExp
       FROM user_growth g WHERE user_id=?`,
      [userId],
    );
    expect(Number(row.ledgerExp)).toBe(row.exp);
    return row.exp;
  }

  // 先占住真实成长行锁，再让所有请求排队；旧实现会在排队前全部读到同一衰减档位。
  async function whileGrowthLocked(start, isWaiting, expectedWaiters, beforeUnlock = async () => {}) {
    const holder = await state.db.getConnection();
    let pending;
    let waiting = 0;
    try {
      await holder.beginTransaction();
      await holder.query('SELECT user_id FROM user_growth WHERE user_id=? FOR UPDATE', [userId]);
      state.onQuery = (sql) => {
        if (isWaiting(sql)) waiting++;
      };
      pending = start();
      await vi.waitFor(() => expect(waiting).toBeGreaterThanOrEqual(expectedWaiters), { timeout: 5000 });
      await beforeUnlock(holder);
      await holder.commit();
    } finally {
      state.onQuery = null;
      await holder.rollback();
      holder.release();
      // 即使断言失败也等待在途事务释放连接，避免后续用例受到污染。
      if (pending) await Promise.allSettled([pending]);
    }
    return pending;
  }

  it.each([
    ['bookmark', [10, 5, 2], 74],
    ['note', [15, 8, 3], 111],
    ['file', [12, 6, 3], 92],
  ])('%s 的 20 条并发创建保留 3/8/15 档位及第 16 条起的 1 经验', async (kind, tiers, total) => {
    const results = await whileGrowthLocked(
      () => Promise.all(Array.from({ length: 20 }, (_, i) => awardCreate(userId, kind, `${kind}-${i}`))),
      (sql) => sql.includes('INSERT INTO user_growth (user_id) VALUES'),
      20,
    );
    expect(results.map((r) => r.granted).sort((a, b) => a - b)).toEqual(
      [...Array(3).fill(tiers[0]), ...Array(5).fill(tiers[1]), ...Array(7).fill(tiers[2]), ...Array(5).fill(1)].sort(
        (a, b) => a - b,
      ),
    );
    expect(await ledger()).toBe(total);
  });

  it.each(['bookmark', 'note', 'file'])('%s 重放同一资源只奖励一次，也不消耗额外衰减次数', async (kind) => {
    const results = await Promise.all(Array.from({ length: 8 }, () => awardCreate(userId, kind, 'same-resource')));
    expect(results.filter((r) => r.duplicated)).toHaveLength(7);
    const initial = kind === 'note' ? 15 : kind === 'file' ? 12 : 10;
    expect(await ledger()).toBe(initial);
    expect((await awardCreate(userId, kind, 'second-resource')).granted).toBe(initial);
    expect((await awardCreate(userId, kind, 'third-resource')).granted).toBe(initial);
    expect((await awardCreate(userId, kind, 'fourth-resource')).granted).toBe(
      kind === 'note' ? 8 : kind === 'file' ? 6 : 5,
    );
  });

  it('书签、笔记、文件分别衰减，但共用 200 日上限；一次性任务经验独立', async () => {
    const results = await Promise.all(
      ['bookmark', 'note', 'file'].flatMap((kind) =>
        Array.from({ length: 20 }, (_, i) => awardCreate(userId, kind, `${kind}-${i}`)),
      ),
    );
    expect(results.reduce((sum, r) => sum + r.granted, 0)).toBe(200);
    expect((await grantExp(userId, 'growth_task', { refId: 'first_note', amount: 50 })).granted).toBe(50);
    expect((await grantExp(userId, 'community_task', { refId: 'topic-1', amount: 50 })).granted).toBe(50);
    const growth = await getGrowth(userId, { calendar });
    expect(growth).toMatchObject({ exp: 300, dailyExp: 200, dailyCapReached: true });
    expect(await ledger()).toBe(300);
  });

  it('只剩 5 经验时正常截断，触顶记录仍幂等且重试不会补发', async () => {
    await grantExp(userId, 'bookmark_import', { refId: 'batch', amount: 195, calendar });
    expect((await awardCreate(userId, 'file', 'last-five')).granted).toBe(5);
    expect((await awardCreate(userId, 'file', 'over-cap')).granted).toBe(0);
    expect((await awardCreate(userId, 'file', 'over-cap')).duplicated).toBe(true);
    expect(await ledger()).toBe(200);
  });

  it('账号本地日期重置衰减，不把昨天的创建算到今天', async () => {
    for (let i = 0; i < 3; i++) {
      await state.db.query(
        `INSERT INTO growth_events(user_id,source,ref_id,amount,create_time)
         VALUES (?,'file',?,12,DATE_SUB(DATE_SUB(STR_TO_DATE(?, '%Y%m%d'), INTERVAL ? MINUTE), INTERVAL 1 SECOND))`,
        [userId, `yesterday-${i}`, calendar.dayKey, calendar.shiftMinutes],
      );
    }
    await state.db.query('UPDATE user_growth SET exp=36 WHERE user_id=?', [userId]);
    expect((await awardCreate(userId, 'file', 'today')).granted).toBe(12);
    expect(await ledger()).toBe(48);
  });

  it('事务回滚后可正常重试，经验余额和幂等记录一起回滚', async () => {
    const conn = await state.db.getConnection();
    try {
      await conn.beginTransaction();
      await grantExp(userId, 'note', { refId: 'rolled-back-note', amount: 15, calendar }, conn);
      await conn.rollback();
    } finally {
      conn.release();
    }
    expect(await ledger()).toBe(0);
    expect((await awardCreate(userId, 'note', 'rolled-back-note')).granted).toBe(15);
    expect(await ledger()).toBe(15);
  });

  it('创建奖励中途写账失败时整笔回滚，重试仍可获得正常首档奖励', async () => {
    await state.db.query(`CREATE TRIGGER reject_growth_reward BEFORE UPDATE ON growth_events
      FOR EACH ROW BEGIN
        IF NEW.ref_id = 'fail-once' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'test reward failure'; END IF;
      END`);
    try {
      await expect(awardCreate(userId, 'file', 'fail-once')).rejects.toThrow('test reward failure');
      expect(await ledger()).toBe(0);
      const [[row]] = await state.db.query("SELECT COUNT(*) AS c FROM growth_events WHERE source='file'");
      expect(row.c).toBe(0);
    } finally {
      await state.db.query('DROP TRIGGER reject_growth_reward');
    }
    expect((await awardCreate(userId, 'file', 'fail-once')).granted).toBe(12);
    expect(await ledger()).toBe(12);
  });

  it('新账号并发创建仍按顺序衰减，升级及里程碑正常且只记录一次', async () => {
    await state.db.query('DELETE FROM user_growth WHERE user_id=?', [userId]);
    const created = await Promise.all(Array.from({ length: 20 }, (_, i) => awardCreate(userId, 'file', `new-${i}`)));
    expect(created.reduce((sum, r) => sum + r.granted, 0)).toBe(92);
    await grantExp(userId, 'growth_task', { refId: 'level-boundary', amount: 400 });
    const results = await Promise.all([
      awardCreate(userId, 'note', 'level-up'),
      awardCreate(userId, 'note', 'level-up'),
    ]);
    expect(results.filter((r) => r.leveledUp)).toHaveLength(1);
    const [[milestone]] = await state.db.query(
      "SELECT COUNT(*) AS c FROM growth_events WHERE user_id=? AND source='milestone' AND ref_id='level_up_L2'",
      [userId],
    );
    expect(milestone.c).toBe(1);
    expect((await getGrowth(userId)).level).toBe(2);
    expect(await ledger()).toBe(507);
  });

  it('并发领取同一成长任务与正常创建共用账号锁，一次性经验只发一份', async () => {
    await state.db.query(
      "INSERT INTO user_growth_tasks(user_id,task_key,status,completed_at) VALUES (?,'profile_avatar','completed',NOW())",
      [userId],
    );
    const results = await Promise.all([
      ...Array.from({ length: 8 }, () => claimGrowthTask(userId, 'profile_avatar')),
      awardCreate(userId, 'note', 'normal-note'),
    ]);
    expect(results.slice(0, 8).filter((r) => !r.already)).toHaveLength(1);
    expect(results.slice(0, 8).reduce((sum, r) => sum + r.expGained, 0)).toBe(50);
    expect(results.at(-1).granted).toBe(15);
    expect(await ledger()).toBe(65);
  });

  it('签到等待并发奖励后使用最新每日额度，避免旧快照把 200 上限冲到 201', async () => {
    const result = await whileGrowthLocked(
      () => checkin(userId, { userRole: 'user' }),
      (sql) =>
        sql.includes('INSERT INTO user_growth (user_id) VALUES') ||
        sql.includes('SELECT exp, level, streak, last_checkin_date'),
      1,
      (holder) => grantExp(userId, 'bookmark_import', { refId: 'concurrent-import', amount: 195, calendar }, holder),
    );
    expect(result).toMatchObject({ ok: true, expGained: 5, growth: { exp: 200, dailyExp: 200 } });
    expect(await ledger()).toBe(200);
  });

  it('新账号并发首次签到只发一次正常经验与积分，不发生插入竞争', async () => {
    await state.db.query('DELETE FROM user_growth WHERE user_id=?', [userId]);
    const results = await Promise.all(Array.from({ length: 6 }, () => checkin(userId, { userRole: 'user' })));
    expect(results.filter((r) => !r.already)).toHaveLength(1);
    expect(results.filter((r) => r.already)).toHaveLength(5);
    expect(await ledger()).toBe(6);
    const [[row]] = await state.db.query("SELECT COUNT(*) AS c FROM points_log WHERE reason='checkin'");
    expect(row.c).toBe(1);
  });

  it('等待另一端补签成功后不重复扣卡，也不重置已修复的连签', async () => {
    await state.db.query('UPDATE user_growth SET streak_protect_cards=2 WHERE user_id=?', [userId]);
    const result = await whileGrowthLocked(
      () => useProtectCard(userId, { date: calendar.previousDayKey }),
      (sql) =>
        sql.includes('INSERT INTO user_growth (user_id) VALUES') ||
        sql.includes('SELECT streak, last_checkin_date, streak_protect_cards'),
      1,
      async (holder) => {
        await holder.query(
          'UPDATE user_growth SET streak_protect_cards=1,streak=1,last_checkin_date=? WHERE user_id=?',
          [calendar.previousDayKey, userId],
        );
        await holder.query("INSERT INTO growth_events(user_id,source,day,amount) VALUES (?,'checkin',?,0)", [
          userId,
          calendar.previousDayKey,
        ]);
      },
    );
    expect(result).toMatchObject({ ok: false, reason: 'already_checked' });
    const [[row]] = await state.db.query('SELECT streak_protect_cards,streak FROM user_growth WHERE user_id=?', [
      userId,
    ]);
    expect(row).toEqual({ streak_protect_cards: 1, streak: 1 });
    expect(await ledger()).toBe(0);
  });

  it('导入未显式传日历时仍使用账号自然日，不能绕过同日已发的 200 经验', async () => {
    // 选一个自然日开始早于服务器今天的账号时区，使两种统计口径的差异可见。
    for (let offset = -12; offset <= 14; offset++) {
      const timezone = `Etc/GMT${offset > 0 ? '-' : '+'}${Math.abs(offset)}`;
      await state.db.query(
        `INSERT INTO user_growth_preferences(user_id,timezone) VALUES (?,?)
         ON DUPLICATE KEY UPDATE timezone=VALUES(timezone)`,
        [userId, timezone],
      );
      calendar = await getGrowthCalendarContext(userId);
      const [[row]] = await state.db.query(
        `SELECT DATE_SUB(STR_TO_DATE(?, '%Y%m%d'), INTERVAL ? MINUTE) < CURDATE() AS earlier`,
        [calendar.dayKey, calendar.shiftMinutes],
      );
      if (Number(row.earlier)) break;
    }
    await state.db.query(
      `INSERT INTO growth_events(user_id,source,ref_id,amount,create_time)
       VALUES (?,'file','account-day-cap',200,DATE_SUB(STR_TO_DATE(?, '%Y%m%d'), INTERVAL ? MINUTE))`,
      [userId, calendar.dayKey, calendar.shiftMinutes],
    );
    await state.db.query('UPDATE user_growth SET exp=200 WHERE user_id=?', [userId]);
    expect((await getGrowth(userId)).dailyExp).toBe(200);
    expect((await grantExp(userId, 'bookmark_import', { refId: 'timezone-import', amount: 20 })).granted).toBe(0);
    expect(await ledger()).toBe(200);
  });

  it('游客不奖励，缺少资源标识时不占经验或衰减次数', async () => {
    expect((await awardCreate(userId, 'file', 'visitor-file', { userRole: 'visitor' })).granted).toBe(0);
    expect((await awardCreate(userId, 'file', null)).skipped).toBe('no-ref');
    expect((await awardCreate(userId, 'unsupported', 'invalid')).skipped).toBe('unknown_kind');
    expect(await ledger()).toBe(0);
    expect((await awardCreate(userId, 'file', 'real-file')).granted).toBe(12);
  });
});
