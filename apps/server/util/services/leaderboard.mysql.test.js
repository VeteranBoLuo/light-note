import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { localSqlStatements } from '../localSqlStatements.js';

const state = vi.hoisted(() => ({ db: null }));
vi.mock('../../db/index.js', () => ({
  default: { query: (...args) => state.db.query(...args), getConnection: () => state.db.getConnection() },
}));
vi.mock('../notificationRealtimeEvents.js', () => ({ queueNotificationChange: vi.fn() }));

import { readLeaderboard, readLeaderboardAvatar } from './leaderboardRead.js';
import { assertLeaderboardReady, runLeaderboardSettlement } from './leaderboardSettlement.js';
import { earnPoints } from '../points.js';

const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const schema = 'leaderboard_' + randomUUID().replaceAll('-', '');
const config = { openWeek: '2026-11-02', firstRewardWeek: '2026-11-09', rewardsEnabled: false };
const current = new Date('2026-11-15T12:00:00+08:00');
const monday = new Date('2026-11-16T00:00:00+08:00');

describe.skipIf(!socketPath)('积分排行榜 · 隔离 MySQL', () => {
  let admin;
  let created = false;
  let serverOffset;
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Temporary socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    const [[server]] = await admin.query('SELECT @@skip_networking AS isolated, TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW()) AS offsetMinutes');
    if (Number(server.isolated) !== 1) throw new Error('Isolated MySQL required');
    serverOffset = Number(server.offsetMinutes);
    await admin.query('CREATE DATABASE ' + schema);
    created = true;
    state.db = mysql.createPool({ socketPath, user: 'root', database: schema, connectionLimit: 6 });
    const ddl = [
      "CREATE TABLE user (id VARCHAR(255) PRIMARY KEY, role VARCHAR(32), del_flag VARCHAR(1) NOT NULL DEFAULT '0', alias VARCHAR(255), head_picture LONGTEXT, preferences JSON) ENGINE=InnoDB DEFAULT CHARSET=utf8",
      'CREATE TABLE security_account_bans (user_id VARCHAR(64) PRIMARY KEY, is_active TINYINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
      'CREATE TABLE community_chat_user_identities (user_id VARCHAR(255) CHARACTER SET utf8 PRIMARY KEY, community_id VARCHAR(11) CHARACTER SET ascii UNIQUE) ENGINE=InnoDB',
      'CREATE TABLE user_growth (user_id VARCHAR(64) PRIMARY KEY, points INT NOT NULL DEFAULT 0) ENGINE=InnoDB',
      'CREATE TABLE points_log (id BIGINT PRIMARY KEY AUTO_INCREMENT, user_id VARCHAR(64), delta INT, reason VARCHAR(32), ref VARCHAR(64), policy_version VARCHAR(32), meta JSON, create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY idx_owner_reason (user_id, reason, ref)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci',
      'CREATE TABLE knowledge_manor_operations (id BIGINT PRIMARY KEY AUTO_INCREMENT, user_id VARCHAR(64), action VARCHAR(32), effectful TINYINT, created_at DATETIME) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
      "CREATE TABLE points_grant_operations (id BIGINT PRIMARY KEY AUTO_INCREMENT, user_id VARCHAR(64), request_id VARCHAR(96), operation_type VARCHAR(32), operation_hash CHAR(64), points INT, reason VARCHAR(32), ref VARCHAR(64), policy_version VARCHAR(32), status VARCHAR(16) DEFAULT 'pending', result_json JSON, UNIQUE KEY owner_request (user_id, request_id)) ENGINE=InnoDB",
      'CREATE TABLE notification (id CHAR(36) PRIMARY KEY, user_id CHAR(36), type VARCHAR(32), title VARCHAR(255), content TEXT, link VARCHAR(255), meta JSON, batch_id CHAR(36), source_type VARCHAR(32), source_id VARCHAR(64), is_read TINYINT, browser_push_pending TINYINT, browser_push_created_at DATETIME(6), UNIQUE KEY notify_source (user_id, source_type, source_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
    ];
    for (const statement of ddl) await state.db.query(statement);
    for (const filename of ['20261116_points_leaderboard.sql', '20261116_points_leaderboard_freeze_lock.sql']) {
      const migration = await readFile(new URL('../../migrations/' + filename, import.meta.url), 'utf8');
      for (const statement of localSqlStatements(migration)) await state.db.query(statement);
    }
  });
  afterAll(async () => {
    await state.db?.end();
    if (created) await admin.query('DROP DATABASE ' + schema);
    await admin?.end();
  });
  beforeEach(async () => {
    for (const table of ['leaderboard_results', 'leaderboard_periods', 'points_grant_operations', 'user_growth', 'points_log', 'knowledge_manor_operations', 'notification', 'community_chat_user_identities', 'security_account_bans', 'user']) {
      await state.db.query('DELETE FROM ' + table);
    }
  });

  function dbTime(beijingDateTime) {
    const ms = new Date(beijingDateTime.replace(' ', 'T') + '+08:00').getTime() + serverOffset * 60_000;
    return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
  }
  async function user(id, nickname, communityId = null, role = 'user', avatar = null) {
    await state.db.query('INSERT INTO user(id, alias, role, head_picture) VALUES (?, ?, ?, ?)', [id, nickname, role, avatar]);
    if (communityId) await state.db.query('INSERT INTO community_chat_user_identities VALUES (?, ?)', [id, communityId]);
  }
  async function point(id, reason, delta, at = '2026-11-09 00:00:00', action = null, meta = {}) {
    await state.db.query('INSERT INTO points_log(user_id, reason, delta, create_time, meta) VALUES (?, ?, ?, ?, ?)',
      [id, reason, delta, dbTime(at), action ? JSON.stringify({ manorAction: action, ...meta }) : null]);
  }
  async function harvest(id, at, effective) {
    await state.db.query("INSERT INTO knowledge_manor_operations(user_id, action, effectful, created_at) VALUES (?, 'harvest', ?, ?)",
      [id, effective, dbTime(at)]);
  }
  async function read(viewer, board = 'week', previous = false, now = current) {
    return readLeaderboard(viewer, board, previous, { db: state.db, config, now });
  }
  async function seedWeek({ skipRank = 3 } = {}) {
    for (let index = 1; index <= 7; index++) {
      const id = 'player-' + index;
      await user(id, '玩家' + index);
      await point(id, 'checkin', 210 - 10 * index);
      if (index === skipRank) continue;
      await harvest(id, '2026-11-10 09:00:00', 1);
      await harvest(id, '2026-11-11 09:00:00', 1);
    }
  }

  it('自动上榜，按到账累计合规收入，去重有效日并使用最新公开资料', async () => {
    const source = 'data:image/png;base64,YWJj';
    await user('internal-1', '同名', 'ln_7K2M8A', 'user', source);
    await user('internal-2', '同名', 'ln_9N4R6P');
    await user('phone-like', '+86 138-1234-5724', 'ln_6V4T2B');
    await user('internal-root', '内测', null, 'root');
    await user('banned', '封禁');
    await user('harvest-only', '收获');
    await state.db.query("INSERT INTO security_account_bans VALUES ('banned', 1)");

    await point('internal-1', 'checkin', 20);
    await point('internal-1', 'quest', 15);
    await point('internal-1', 'manor_sale', 74, '2026-11-10 08:00:00', 'sellCrop');
    await point('internal-1', 'manor_sale', 10, '2026-11-15 23:59:59', 'sellAllCrops');
    await point('internal-1', 'checkin', 270, '2026-11-08 23:59:59');
    await point('internal-1', 'checkin', 280, '2026-11-16 00:00:00');
    await point('internal-1', 'achievement', 300, '2026-11-09 00:00:00');
    await point('internal-1', 'streak_milestone', 100, '2026-11-09 00:00:00');
    await point('internal-1', 'manor_sale', 999, '2026-11-09 00:00:00', 'sell');
    await point('internal-1', 'manor_sale', 5, '2026-11-12 08:00:00', 'sell', { manorFreeCastFirstSale: true });
    await point('internal-1', 'manor_sale', 999, '2026-11-12 08:00:00', 'sell', { manorFreeCastFirstSale: 'true' });
    await point('internal-1', 'manor_sale', 23, '2026-11-13 08:00:00', 'sellAllWaitingFish', { manorFreeCastFirstSalePoints: 6 });
    await point('internal-1', 'manor_sale', 999, '2026-11-13 08:00:00', 'sellAllWaitingFish');
    await point('internal-1', 'manor_sale', 999, '2026-11-13 08:00:00', 'sellAllWaitingFish', { manorFreeCastFirstSalePoints: '999' });
    await point('internal-1', 'manor_sale', 2, '2026-11-13 08:00:00', 'sellAllWaitingFish', { manorFreeCastFirstSalePoints: 999 });
    await point('internal-1', 'manor_sale', 350);
    for (const reason of ['lottery_free_win', 'lottery_paid_win', 'lottery_paid_compensation', 'leaderboard_reward', 'campaign', 'admin', 'correction', 'toolbox_release']) {
      await point('internal-1', reason, 999);
    }
    await point('internal-1', 'buy', -600);
    await harvest('internal-1', '2026-11-09 01:00:00', 1);
    await harvest('internal-1', '2026-11-10 01:00:00', 1);
    await harvest('internal-1', '2026-11-12 01:00:00', 0);
    await harvest('internal-1', '2026-11-16 00:00:00', 1);
    await harvest('harvest-only', '2026-11-10 08:00:00', 1);
    await point('internal-2', 'weekly', 100);
    await point('phone-like', 'quest', 21);
    await point('internal-root', 'checkin', 9999);
    await point('banned', 'checkin', 8888);

    const weekly = await read('internal-1');
    expect(weekly.rows.map((row) => [row.nickname, row.communityId, row.score])).toEqual([
      ['同名', 'ln_7K2M8A', 130], ['同名', 'ln_9N4R6P', 100], ['138****5724', 'ln_6V4T2B', 21],
    ]);
    expect(weekly.mine).toMatchObject({
      rank: 1, activeDays: 2, qualified: false,
      sources: { checkin: 20, quest: 15, manor_sale: 84, manor_aquarium_sale: 11 },
    });
    expect(weekly.canParticipate).toBe(true);
    expect(await read(null)).toMatchObject({
      canParticipate: false, mine: null, ownDays: 0,
      rows: weekly.rows.map((row) => ({ ...row, isMe: false })),
    });
    expect((await read('harvest-only')).ownDays).toBe(1);
    expect(JSON.stringify(weekly)).not.toContain('internal-1');
    expect(await readLeaderboardAvatar('ln_7K2M8A', state.db)).toBe(source);
    expect((await read('internal-1', 'total')).mine.score).toBe(1080);
    expect((await read('internal-1', 'month')).mine.score).toBe(680);
    await state.db.query("UPDATE user SET alias = '换名' WHERE id = 'internal-1'");
    expect((await read('internal-1')).mine.nickname).toBe('换名');
  });

  it('首周明确计奖时仍等到周榜结算，且开榜无通知', async () => {
    await seedWeek({ skipRank: null });
    const launch = { openWeek: '2026-11-09', firstRewardWeek: '2026-11-09', rewardsEnabled: true };
    await runLeaderboardSettlement({ db: state.db, config: launch, now: current });
    const board = await readLeaderboard('player-1', 'week', false, { db: state.db, config: launch, now: current });
    expect(board.weekly).toMatchObject({ mode: 'reward', slots: 3, paidSlots: 0 });
    const [[before]] = await state.db.query('SELECT COUNT(*) AS n FROM notification');
    expect(before.n).toBe(0);

    await runLeaderboardSettlement({ db: state.db, config: launch, now: monday });
    const [notices] = await state.db.query('SELECT source_type FROM notification');
    expect(notices).toEqual(Array.from({ length: 3 }, () => ({ source_type: 'leaderboard_reward' })));
    const [[period]] = await state.db.query("SELECT mode, state, slots FROM leaderboard_periods WHERE period_key = '2026-11-09'");
    expect(period).toMatchObject({ mode: 'reward', state: 'complete', slots: 3 });
  });

  it('观察周无奖励和开榜通知，正式周按冻结结果幂等发奖并跳过封禁玩家', async () => {
    await seedWeek();
    await point('player-1', 'checkin', 999, '2026-11-03 08:00:00');
    const openingDay = new Date('2026-11-03T12:00:00+08:00');
    await runLeaderboardSettlement({ db: state.db, config, now: openingDay });
    const [[openingNotices]] = await state.db.query("SELECT COUNT(*) AS n FROM notification WHERE source_type = 'leaderboard_open'");
    expect(openingNotices.n).toBe(0);
    await runLeaderboardSettlement({ db: state.db, config, now: current });
    const live = await read('player-2');
    expect(live.mine).toMatchObject({ rank: 2, qualified: true, rewardSlot: 2, rewardPoints: 77 });
    expect(live.rows[2]).toMatchObject({ rank: 3, qualified: false, rewardSlot: null });
    expect(live.rows[3]).toMatchObject({ rank: 4, qualified: true, rewardSlot: null });
    await Promise.all([1, 2].map(() => runLeaderboardSettlement({ db: state.db, config, now: monday })));
    const [frozen] = await state.db.query('SELECT position, reward_points, reward_state FROM leaderboard_results WHERE period_key = ? ORDER BY position', ['2026-11-09']);
    expect(frozen.map((row) => row.reward_points)).toEqual([88, 77, 0, 0, 0, 0, 0]);
    const [[observation]] = await state.db.query("SELECT state, slots FROM leaderboard_periods WHERE period_key = '2026-11-02'");
    expect(observation).toMatchObject({ state: 'complete', slots: 0 });
    await expect(assertLeaderboardReady(state.db, { ...config, openWeek: '2026-11-09' })).rejects.toMatchObject({ code: 'LEADERBOARD_OPEN_WEEK_CHANGED' });

    await point('player-7', 'quest', 555, '2026-11-16 00:00:00');
    await state.db.query("INSERT INTO security_account_bans VALUES ('player-2', 1)");
    const enabled = { ...config, rewardsEnabled: true, firstRewardWeek: '2026-11-02' };
    const run = () => runLeaderboardSettlement({ db: state.db, config: enabled, now: monday });
    await state.db.query(`CREATE TRIGGER fail_test_payout BEFORE UPDATE ON leaderboard_results FOR EACH ROW
      BEGIN IF NEW.user_id = 'player-1' AND NEW.reward_state = 'paid' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'test payout rollback';
      END IF; END`);
    try {
      await run();
      const [[pending]] = await state.db.query(
        "SELECT reward_state FROM leaderboard_results WHERE board = 'week' AND period_key = ? AND user_id = ?",
        ['2026-11-09', 'player-1'],
      );
      const [[uncredited]] = await state.db.query("SELECT COUNT(*) AS n FROM points_log WHERE user_id = 'player-1' AND reason = 'leaderboard_reward'");
      const [[noReceipt]] = await state.db.query("SELECT COUNT(*) AS n FROM points_grant_operations WHERE user_id = 'player-1'");
      const [[balance]] = await state.db.query("SELECT points FROM user_growth WHERE user_id = 'player-1'");
      expect(pending.reward_state).toBe('pending');
      expect(uncredited.n).toBe(0);
      expect(noReceipt.n).toBe(0);
      expect(balance?.points ?? 0).toBe(0);
    } finally {
      await state.db.query('DROP TRIGGER fail_test_payout');
    }
    await Promise.all([run(), run()]);
    const [credits] = await state.db.query("SELECT user_id, delta FROM points_log WHERE reason = 'leaderboard_reward' ORDER BY user_id");
    expect(credits).toEqual([{ user_id: 'player-1', delta: 88 }]);
    const [notices] = await state.db.query("SELECT user_id, browser_push_pending, browser_push_created_at FROM notification WHERE source_type = 'leaderboard_reward' ORDER BY user_id");
    expect(notices).toEqual([
      { user_id: 'player-1', browser_push_pending: 0, browser_push_created_at: null },
    ]);
    await state.db.query("UPDATE leaderboard_results SET notified_at = NULL WHERE reward_state = 'paid'");
    await run();
    const [[count]] = await state.db.query("SELECT COUNT(*) AS n FROM notification WHERE source_type = 'leaderboard_reward'");
    expect(count.n).toBe(1);
    const history = await read('player-1', 'week', true, monday);
    expect(history.rows[1]).toEqual({ rank: 2, unavailable: true });
    expect(history.mine).toMatchObject({ rank: 1, rewardSlot: 1, rewardState: 'paid' });
    expect(history.rows[3]).toMatchObject({ rank: 4, qualified: true, rewardSlot: null, rewardState: 'none' });
    expect(history.weekly).toMatchObject({ qualifiedCount: 6, slots: 2, paidSlots: 1 });
    expect(await read(null, 'week', true, monday)).toMatchObject({
      canParticipate: false, mine: null, ownDays: 0, weekly: history.weekly,
      rows: history.rows.map((row) => 'unavailable' in row ? row : { ...row, isMe: false }),
    });
    expect((await read('player-1', 'total', false, monday)).mine.score).toBe(1199);
  });

  it('三张榜及历史周榜公开前 20 名，榜内和榜外都返回本人实际名次', async () => {
    for (let index = 1; index <= 22; index++) {
      const id = 'extra-' + index;
      await user(id, id);
      await point(id, 'checkin', 25 - index);
    }
    await runLeaderboardSettlement({ db: state.db, config, now: monday });
    const views = [
      ['week', false, current], ['month', false, current], ['total', false, current], ['week', true, monday],
    ];
    for (const [board, previous, now] of views) {
      const outside = await read('extra-21', board, previous, now);
      expect(outside.rules.limit).toBe(20);
      expect(outside.rows.map(row => row.rank)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
      expect(outside.rows.some(row => row.isMe)).toBe(false);
      expect(outside.mine).toMatchObject({ rank: 21, isMe: true });
      expect(outside.total).toBe(22);

      const inside = await read('extra-20', board, previous, now);
      expect(inside.rows.at(-1)).toMatchObject({ rank: 20, isMe: true });
      expect(inside.mine).toMatchObject({ rank: 20, isMe: true });
    }
    const [[empty]] = await state.db.query("SELECT COUNT(*) AS n FROM leaderboard_periods WHERE period_key = '2026-11-02' AND state = 'complete'");
    expect(empty.n).toBe(1);
  });

  it('当周发奖配置可以在冻结前生效，冻结后恢复发放沿用原模式和奖额', async () => {
    await seedWeek({ skipRank: null });
    const observation = { ...config, firstRewardWeek: null };
    await runLeaderboardSettlement({ db: state.db, config: observation, now: current });
    expect(await readLeaderboard('player-1', 'week', false, { db: state.db, config: observation, now: current }))
      .toMatchObject({ weekly: { mode: 'observation', slots: 0 } });
    expect(await read('player-1')).toMatchObject({ weekly: { mode: 'reward', qualifiedCount: 7, slots: 3 } });

    await runLeaderboardSettlement({ db: state.db, config, now: monday });
    expect(await read('player-1', 'week', true, monday)).toMatchObject({
      mine: { rewardState: 'pending', rewardPoints: 88 },
      weekly: { mode: 'reward', qualifiedCount: 7, slots: 3, paidSlots: 0 },
    });

    const resume = () => runLeaderboardSettlement({
      db: state.db, config: { ...observation, rewardsEnabled: true }, now: monday,
    });
    await Promise.all([resume(), resume()]);
    const [credits] = await state.db.query(
      "SELECT delta FROM points_log WHERE reason = 'leaderboard_reward' ORDER BY delta DESC",
    );
    expect(credits.map(({ delta }) => delta)).toEqual([88, 77, 66]);
    expect(await read('player-1', 'week', true, monday)).toMatchObject({
      mine: { rewardState: 'paid' }, weekly: { mode: 'reward', paidSlots: 3 },
    });
  });

  it.each([
    { outcome: 'commit', score: 110, validDays: 3, slots: 2, month: 117, awards: [88, 77] },
    { outcome: 'rollback', score: 90, validDays: 2, slots: 1, month: 97, awards: [88] },
  ])('到期冻结等待截止前的入账事务 $outcome，只按已提交的流水和有效日定奖', async (example) => {
    await user('player-a', '玩家 A');
    await user('player-b', '玩家 B');
    await point('player-a', 'checkin', 90);
    await point('player-b', 'checkin', 105);
    await harvest('player-a', '2026-11-10 08:00:00', 1);
    await harvest('player-b', '2026-11-10 08:00:00', 1);
    await harvest('player-b', '2026-11-11 08:00:00', 1);
    await point('player-a', 'quest', 7, '2026-11-16 00:00:00');
    await runLeaderboardSettlement({ db: state.db, config, now: current });

    const writer = await state.db.getConnection();
    const { promise: settlementThread, resolve: readThreadId } = Promise.withResolvers();
    const observedPool = {
      query: state.db.query.bind(state.db),
      async getConnection() {
        const conn = await state.db.getConnection();
        readThreadId(conn.threadId);
        return conn;
      },
    };
    let settling;
    vi.stubEnv('POINTS_LEADERBOARD_OPEN_WEEK', config.openWeek);
    try {
      await writer.query('SET timestamp = ?', [monday.getTime() / 1000 - 1]);
      await writer.beginTransaction();
      await writer.query("INSERT INTO user_growth (user_id) VALUES ('player-a')");
      expect(await earnPoints('player-a', 20, 'checkin', '20261115', writer)).toBe(true);

      const active = { ...config, rewardsEnabled: true };
      settling = runLeaderboardSettlement({ db: observedPool, config: active, now: monday });
      const threadId = await settlementThread;
      await expect.poll(async () => {
        const [[trx]] = await admin.query(
          'SELECT trx_state AS state FROM information_schema.INNODB_TRX WHERE trx_mysql_thread_id = ?',
          [threadId],
        );
        return trx?.state;
      }, { timeout: 2_000, interval: 150 }).toBe('LOCK WAIT');
      expect(await read('player-a', 'week', true, monday)).toMatchObject({ phase: 'closing' });

      if (example.outcome === 'commit') await writer.commit();
      else await writer.rollback();
      await settling;
      await runLeaderboardSettlement({ db: state.db, config: active, now: monday });
    } finally {
      await writer.rollback();
      await writer.query('SET timestamp = DEFAULT');
      writer.release();
      vi.unstubAllEnvs();
      await settling;
    }

    expect(await read('player-a', 'week', true, monday)).toMatchObject({
      mine: { score: example.score, activeDays: example.validDays }, weekly: { slots: example.slots },
    });
    expect((await read('player-a', 'week', false, monday)).mine.score).toBe(7);
    expect((await read('player-a', 'month', false, monday)).mine.score).toBe(example.month);
    expect((await read('player-a', 'total', false, monday)).mine.score).toBe(example.month);
    const [credits] = await state.db.query("SELECT delta FROM points_log WHERE reason = 'leaderboard_reward' ORDER BY delta DESC");
    expect(credits.map(({ delta }) => delta)).toEqual(example.awards);
  });

  it('回看上周时保留未上榜账号的真实有效日，按北京日期去重并区分本周', async () => {
    await user('only-harvest', '种植玩家');
    await user('ranked', '上榜玩家');
    await point('ranked', 'quest', 20);
    await harvest('only-harvest', '2026-11-10 08:00:00', 1);
    await harvest('only-harvest', '2026-11-10 09:00:00', 1);
    await harvest('only-harvest', '2026-11-12 03:00:00', 0);
    await harvest('only-harvest', '2026-11-15 23:59:59', 1);
    await harvest('only-harvest', '2026-11-16 00:00:00', 1);

    expect(await read('only-harvest')).toMatchObject({ mine: null, ownDays: 2, total: 1 });
    await runLeaderboardSettlement({ db: state.db, config, now: monday });
    expect(await read('only-harvest', 'week', true, monday)).toMatchObject({
      phase: 'settled', mine: null, ownDays: 2, total: 1, rows: [{ nickname: '上榜玩家', rank: 1 }],
    });
    expect(await read('only-harvest', 'week', false, monday)).toMatchObject({ mine: null, ownDays: 1 });
    expect(await read(null, 'week', true, monday)).toMatchObject({ canParticipate: false, ownDays: 0 });
    await state.db.query("INSERT INTO security_account_bans VALUES ('only-harvest', 1)");
    expect(await read('only-harvest', 'week', true, monday)).toMatchObject({ mine: null, ownDays: 0 });
  });
});
