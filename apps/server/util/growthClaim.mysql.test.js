import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ db: null, failReceipt: false, failQuest: false }));
vi.mock('../db/index.js', () => ({
  default: {
    query: (...args) => state.db.query(...args),
    getConnection: async () => {
      const conn = await state.db.getConnection();
      return new Proxy(conn, {
        get(target, key) {
          if (key === 'query')
            return (sql, params) => {
              if (state.failReceipt && sql.startsWith('INSERT INTO knowledge_manor_operations'))
                throw new Error('receipt failure');
              if (state.failQuest && sql.includes('INSERT INTO points_log') && params?.[2] === 'quest')
                throw new Error('stage failure');
              return target.query(sql, params);
            };
          return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
        },
      });
    },
  },
}));
// 聚焦奖励事务；其他奖励目录不参与夹具，日常事实、积分账本和庄园存档使用真实实现。
vi.mock('./growth.js', async (original) => {
  const actual = await original();
  return {
    ...actual,
    getGrowthDashboard: async (userId, options) => {
      const growth = await actual.getGrowth(userId, options);
      const daily = await actual.getDailyQuestState(userId, growth, options);
      const questBonus = await actual.getDailyQuestBonus(userId, growth, { ...options, questState: daily });
      return { quests: daily.quests, questBonus, achievements: [], stats: {} };
    },
  };
});
vi.mock('./growthTaskService.js', () => ({ getGrowthTasks: async () => ({ allTasks: [] }) }));
vi.mock('./weeklyChallenge.js', () => ({ getWeeklyChallenges: async () => ({ challenges: [] }) }));
vi.mock('./communityFeed/taskRewards.js', () => ({
  taskRewardStates: async () => [],
  claimTaskRewards: async () => [],
}));
vi.mock('./growthAchievementState.js', () => ({ persistAchievementUnlocksForMetrics: vi.fn() }));
vi.mock('./notification.js', () => ({ createNotification: vi.fn() }));

const { checkin, getGrowth, lockGrowthAccount, grantExp } = await import('./growth.js');
const { claimGrowthRewards, getGrowthClaimableSnapshot } = await import('./growthClaimService.js');
const { getGrowthCalendarContext } = await import('./growthPreferences.js');
const { knowledgeManorService: manor } = await import('./services/knowledgeManorService.js');
const { migrateKnowledgeManorSchema } = await import('./services/knowledgeManorSchema.js');
const { migrateKnowledgeManorAdminSchema } = await import('./services/knowledgeManorAdminSchema.js');
const { MANOR_VERSION, manorModel: M } = await import('@lightnote/shared/manor');
const { selectC6DailyQuests } = await import('./dailyQuestPolicy.js');
const { meaningfulActivitySource } = await import('./meaningfulActivity.js');
const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const schema = `growth_claim_${randomUUID().replaceAll('-', '')}`;
const owner = 'owner';
const command = (revision, action, args = []) => ({ revision, action, args, requestId: randomUUID(), version: MANOR_VERSION });

describe.skipIf(!socketPath)('签到、统一领取与庄园共用原子奖励事实（隔离 MySQL）', () => {
  let admin,
    created = false,
    calendar;
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Disposable socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    const [[server]] = await admin.query('SELECT @@global.skip_networking AS isolated');
    if (Number(server.isolated) !== 1) throw new Error('Isolated MySQL required');
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    state.db = mysql.createPool({
      socketPath,
      user: 'root',
      database: schema,
      connectionLimit: 16,
      multipleStatements: true,
    });
    await state.db.query(await readFile(new URL('../migrations/20260708_growth.sql', import.meta.url), 'utf8'));
    await state.db.query(`ALTER TABLE user_growth
      ADD last_notified_level INT NOT NULL DEFAULT 1, ADD points INT NOT NULL DEFAULT 0,
      ADD equipped_title VARCHAR(64), ADD equipped_frame VARCHAR(64), ADD equipped_background VARCHAR(64),
      ADD storage_bonus_mb INT NOT NULL DEFAULT 0`);
    await state.db.query(`CREATE TABLE user_growth_preferences (
      user_id VARCHAR(64) PRIMARY KEY, weekly_active_target INT, streak_reminder_enabled INT,
      celebration_enabled INT, low_pressure_mode INT, timezone VARCHAR(64), utc_offset_minutes INT,
      points_goal_item_id VARCHAR(64), points_goal_enabled INT) ENGINE=InnoDB`);
    await state.db.query(`CREATE TABLE points_log (
      id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(64), delta INT, reason VARCHAR(32),
      ref VARCHAR(64), policy_version VARCHAR(32), meta JSON, create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      KEY idx_user_reason_ref(user_id,reason,ref)) ENGINE=InnoDB`);
    await state.db.query(`CREATE TABLE points_earning_period_policy (period_type VARCHAR(8), period_key VARCHAR(8),
      policy_version VARCHAR(32), PRIMARY KEY(period_type,period_key)) ENGINE=InnoDB`);
    await state.db.query(
      'CREATE TABLE user (id VARCHAR(64) PRIMARY KEY, role VARCHAR(16), del_flag INT DEFAULT 0, preferences JSON) ENGINE=InnoDB',
    );
    await migrateKnowledgeManorSchema(state.db);
    await migrateKnowledgeManorAdminSchema(state.db);
  });
  beforeEach(async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('POINTS_EARNING_C5_ENABLED', 'true');
    vi.stubEnv('POINTS_EARNING_C5_EFFECTIVE_DAY', '20260803');
    vi.stubEnv('POINTS_EARNING_C5_EFFECTIVE_WEEK', '202632');
    vi.stubEnv('POINTS_EARNING_C6_ENABLED', 'false');
    vi.stubEnv('POINTS_EARNING_C8_ENABLED', 'false');
    vi.stubEnv('KNOWLEDGE_MANOR_ENABLED', 'true');
    vi.stubEnv('KNOWLEDGE_MANOR_AUDIENCE', 'all');
    state.failReceipt = false;
    state.failQuest = false;
    for (const table of [
      'knowledge_manor_operations',
      'knowledge_manors',
      'growth_events',
      'points_log',
      'user_growth',
      'user_growth_preferences',
      'points_earning_period_policy',
      'user',
    ]) {
      await state.db.query(`DELETE FROM ${table}`);
    }
    await state.db.query("UPDATE knowledge_manor_runtime SET mode='open'");
    await state.db.query("INSERT INTO user(id,role) VALUES (?,'user'),('other','user')", [owner]);
    await state.db.query('INSERT INTO user_growth(user_id) VALUES (?)', [owner]);
    calendar = await getGrowthCalendarContext(owner);
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
  async function prepare({ adopted = true, water = 0, actions = 2 } = {}) {
    const sources =
      process.env.POINTS_EARNING_C8_ENABLED === 'true'
        ? selectC6DailyQuests(owner, calendar.dayKey)
            .map((q) => meaningfulActivitySource(q.kind))
            .slice(0, actions)
        : Array.from({ length: actions }, () => 'activity_note');
    for (const [i, source] of sources.entries())
      await state.db.query(
        `INSERT INTO growth_events
      (user_id,source,ref_id,amount,status,meta) VALUES (?,?,?,0,'granted','{"meaningful":true}')`,
        [owner, source, `event-${i}`],
      );
    if (adopted) {
      await manor.execute(owner, command(0, 'adopt'));
      const save = (await manor.get(owner)).state;
      save.water = water;
      save.guide = null;
      delete save.wallet;
      await state.db.query('UPDATE knowledge_manors SET state_json=? WHERE user_id=?', [JSON.stringify(save), owner]);
    }
  }
  async function saved() {
    return (await manor.get(owner)).state;
  }
  async function questLogs() {
    return (await state.db.query("SELECT * FROM points_log WHERE reason='quest'"))[0];
  }

  it.each([
    { c8: false, points: 55 },
    { c8: true, points: 30 },
  ])('签到自动结算已达成阶段，旧/新策略、重试与跨入口不重复 %j', async ({ c8, points }) => {
    if (c8) {
      vi.stubEnv('POINTS_EARNING_C8_ENABLED', 'true');
      vi.stubEnv('POINTS_EARNING_C8_EFFECTIVE_DAY', calendar.dayKey);
      vi.stubEnv('POINTS_EARNING_C8_EFFECTIVE_WEEK', calendar.weekKey);
    }
    await prepare();
    const result = await checkin(owner, { userRole: 'user' });
    expect(result).toMatchObject({
      expGained: 21,
      pointsEarned: points,
      dailyRewards: { claimed: 2, exp: 15, points: points - 15 },
    });
    expect(await questLogs()).toHaveLength(2);
    const claims = await Promise.all(Array.from({ length: 6 }, () => claimGrowthRewards(owner)));
    expect(claims.reduce((sum, r) => sum + r.points, 0)).toBe(0);
    expect(claims.reduce((sum, r) => sum + r.water, 0)).toBe(M.RULES.dailyWaterTiers[2]);
    expect((await getGrowthClaimableSnapshot(owner)).count).toBe(0);
    expect(await checkin(owner)).toMatchObject({ already: true });
    expect(await questLogs()).toHaveLength(2);
    expect(await getGrowth(owner)).toMatchObject({ exp: 21, points });
  });
  it('签到和一键领取并发时，阶段奖励共用账号锁和流水', async () => {
    await prepare({ adopted: false });
    const results = await Promise.all([checkin(owner), ...Array.from({ length: 5 }, () => claimGrowthRewards(owner))]);
    expect(results[0].ok).toBe(true);
    expect(await questLogs()).toHaveLength(2);
    expect(await getGrowth(owner)).toMatchObject({ exp: 21, points: 55 });
  });
  it('庄园内外同时领水不超发，旧修订不得覆盖站外已领取的水滴', async () => {
    await prepare({ actions: 1 });
    const results = await Promise.allSettled([
      claimGrowthRewards(owner, { scopes: ['manor'] }),
      manor.execute(owner, command(1, 'claimAllDailyWater')),
    ]);
    expect((await saved()).water).toBe(M.RULES.dailyWaterTiers[0]);
    for (const result of results)
      if (result.status === 'rejected') expect(result.reason.code).toBe('MANOR_REVISION_CONFLICT');
    expect((await getGrowthClaimableSnapshot(owner)).manor.count).toBe(0);
    expect(await claimGrowthRewards(owner, { scopes: ['manor'] })).toMatchObject({ water: 0 });
  });
  it('抛竿期间从主站领水后，免费钓获仍按首销计入排行榜', async () => {
    await prepare({ actions: 1 });
    const cast = await manor.execute(owner, command(1, 'beginCast', ['bait']));
    expect(cast.result).toBe('free');
    const claimed = await claimGrowthRewards(owner, { scopes: ['manor'] });
    expect(claimed.water).toBe(M.RULES.dailyWaterTiers[0]);
    const { state: current, revision } = await manor.get(owner);
    expect(current.castId).toBe(cast.state.castId);
    const caught = await manor.execute(owner, command(revision, 'resolveCast', [current.castId]));
    const fish = caught.result.fish;
    const placed = await manor.execute(owner, command(caught.revision, 'place', [fish.id, 0]));
    const removed = await manor.execute(owner, command(placed.revision, 'unplace', [fish.id]));
    const sale = await manor.execute(owner, command(removed.revision, 'sell', [fish.id]));
    expect(sale.result).toBeGreaterThan(0);
    const [[row]] = await state.db.query("SELECT meta FROM points_log WHERE user_id = ? AND reason = 'manor_sale'", [owner]);
    expect(typeof row.meta === 'string' ? JSON.parse(row.meta) : row.meta).toMatchObject({
      manorFreeCastFirstSale: true,
    });
  });
  it('满桶不消费待领额度，部分领取后当天可续领', async () => {
    await prepare({ water: M.RULES.waterCap - 3 });
    expect(await claimGrowthRewards(owner, { scopes: ['manor'] })).toMatchObject({ water: 3 });
    expect((await getGrowthClaimableSnapshot(owner)).manor).toMatchObject({
      water: 0,
      count: 0,
      pending: M.RULES.dailyWaterTiers[1] - 3,
      bucketFull: true,
    });
    expect(await claimGrowthRewards(owner, { scopes: ['manor'] })).toMatchObject({ water: 0, claimed: 0 });
    const save = await saved();
    save.water -= 10;
    delete save.wallet;
    await state.db.query('UPDATE knowledge_manors SET state_json=? WHERE user_id=?', [JSON.stringify(save), owner]);
    expect(await claimGrowthRewards(owner, { scopes: ['manor'] })).toMatchObject({ water: 10 });
    expect(M.dailyWaterClaimed(await saved())).toBe(13);
  });
  it('庄园收据失败时积分、经验、存档和阶段领取事实整体回滚，重试可正常到账', async () => {
    await prepare();
    state.failReceipt = true;
    await expect(claimGrowthRewards(owner)).rejects.toThrow('receipt failure');
    expect(await getGrowth(owner)).toMatchObject({ exp: 0, points: 0 });
    expect(await questLogs()).toHaveLength(0);
    expect((await saved()).water).toBe(0);
    state.failReceipt = false;
    expect(await claimGrowthRewards(owner)).toMatchObject({ points: 15, exp: 5, water: M.RULES.dailyWaterTiers[1] });
  });
  it('签到前已手动领取的阶段保留原流水，只自动发放本次新增阶段', async () => {
    await prepare({ adopted: false });
    expect(await claimGrowthRewards(owner, { scopes: ['daily'] })).toMatchObject({ exp: 5, points: 15 });
    expect(await checkin(owner)).toMatchObject({ expGained: 16, pointsEarned: 40, dailyRewards: { claimed: 1 } });
    expect(await questLogs()).toHaveLength(2);
    expect(await getGrowth(owner)).toMatchObject({ exp: 21, points: 55 });
  });
  it('阶段自动到账仍遵守每日经验上限，回执只返回实际发放数额', async () => {
    await prepare({ adopted: false });
    await grantExp(owner, 'bookmark_import', { refId: 'cap-fixture', amount: 198, calendar });
    expect(await checkin(owner)).toMatchObject({
      expGained: 2,
      pointsEarned: 55,
      dailyRewards: { exp: 0, points: 40 },
    });
    expect(await getGrowth(owner)).toMatchObject({ exp: 200, points: 55 });
    expect(await questLogs()).toHaveLength(2);
  });
  it('阶段写入失败时签到本身也回滚，重新签到后只发一份奖励', async () => {
    await prepare({ adopted: false });
    state.failQuest = true;
    await expect(checkin(owner)).rejects.toThrow('stage failure');
    expect(await getGrowth(owner)).toMatchObject({ checkedInToday: false, exp: 0, points: 0 });
    expect(await questLogs()).toHaveLength(0);
    state.failQuest = false;
    expect(await checkin(owner)).toMatchObject({ already: false, expGained: 21, pointsEarned: 55 });
  });
  it('跨日不累计旧水滴，时区回到已领日期时不能重新领取', async () => {
    await prepare({ actions: 1 });
    const today = calendar.dayKey;
    const nextDate = new Date(
      Date.UTC(Number(today.slice(0, 4)), Number(today.slice(4, 6)) - 1, Number(today.slice(6, 8)) + 1),
    );
    const tomorrow = nextDate.toISOString().slice(0, 10).replaceAll('-', '');
    const atDay = async (dayKey, done) => {
      const conn = await state.db.getConnection();
      try {
        await conn.beginTransaction();
        await lockGrowthAccount(conn, owner);
        const value = await manor.dailyWater(owner, {
          connection: conn,
          calendar: { ...calendar, dayKey },
          quests: done.map((done) => ({ done })),
          claim: true,
        });
        await conn.commit();
        return value;
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
    };
    expect(await atDay(today, [true, false, false])).toMatchObject({ water: M.RULES.dailyWaterTiers[0] });
    expect(await atDay(tomorrow, [false, false, false])).toMatchObject({ water: 0, pending: 0 });
    expect(await atDay(tomorrow, [true, false, false])).toMatchObject({ water: M.RULES.dailyWaterTiers[0] });
    expect(await atDay(today, [true, false, false])).toMatchObject({ water: 0, pending: 0 });
  });
  it('未开通、部署关闭、维护和账号权限变化都不会被统一领取绕过', async () => {
    await prepare({ adopted: false });
    await claimGrowthRewards(owner);
    expect((await state.db.query('SELECT * FROM knowledge_manors'))[0]).toHaveLength(0);
    await manor.execute(owner, command(0, 'adopt'));
    vi.stubEnv('KNOWLEDGE_MANOR_ENABLED', 'false');
    expect((await getGrowthClaimableSnapshot(owner)).manor.count).toBe(0);
    vi.stubEnv('KNOWLEDGE_MANOR_ENABLED', 'true');
    await state.db.query("UPDATE knowledge_manor_runtime SET mode='maintenance'");
    expect(await claimGrowthRewards(owner)).toMatchObject({ water: 0 });
    await state.db.query("UPDATE knowledge_manor_runtime SET mode='open'");
    await state.db.query("UPDATE user SET role='visitor' WHERE id=?", [owner]);
    expect(await claimGrowthRewards(owner)).toMatchObject({ water: 0 });
    expect((await state.db.query('SELECT revision FROM knowledge_manors'))[0][0].revision).toBe(1);
  });
});
