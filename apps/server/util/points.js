import { randomUUID } from 'node:crypto';
import pool from '../db/index.js';
import { grantItem } from './items.js';
import { finishAdminAction } from './adminActionExecution.js';
import { ECONOMY_CATALOGS, getActiveEconomyCatalog, getEconomyRuntime } from './pointsEconomyCatalog.js';
import {
  beginPointsEconomyOperation,
  completePointsEconomyOperation,
  PointsEconomyError,
} from './pointsEconomyOperations.js';
import { POINTS_SYSTEM_VERSION } from './pointsEarningPolicy.js';
import { INTERNAL_ROLES } from './internalRoles.js';
import { pointsOperationHash } from './pointsOperationHash.js';
import { creditAiBonusTokens } from './aiBonusWallet.js';

// 积分系统:经验(EXP)管段位、只增;积分(points)管消费、可赚可花。
// 余额存 user_growth.points(权威),points_log 记流水(审计 + 按天幂等)。
// schema 用启动 ensure(MySQL 5.7 不支持 ADD COLUMN IF NOT EXISTS,查 information_schema 后条件 ALTER)。

async function columnMissing(table, col) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, col],
  );
  return !Number(rows[0]?.c);
}

async function indexMissing(table, index) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, index],
  );
  return !Number(rows[0]?.c);
}

export async function ensurePointsSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS points_log (
      id BIGINT NOT NULL AUTO_INCREMENT,
      user_id VARCHAR(64) NOT NULL,
      delta INT NOT NULL COMMENT '正=赚 负=花',
      reason VARCHAR(32) NOT NULL COMMENT 'checkin/quest/buy/admin',
      ref VARCHAR(64) DEFAULT NULL COMMENT '按天幂等用(YYYYMMDD)或商品 id',
      policy_version VARCHAR(32) DEFAULT NULL COMMENT '积分获取策略版本；消费仍使用独立 economy_version',
      meta JSON DEFAULT NULL COMMENT '低敏感审计上下文，不保存标题/正文/路径',
      create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_user_reason_ref (user_id, reason, ref)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='积分流水'
  `);
  if (await columnMissing('points_log', 'policy_version')) {
    await pool.query('ALTER TABLE `points_log` ADD COLUMN `policy_version` VARCHAR(32) DEFAULT NULL AFTER `ref`');
  }
  if (await columnMissing('points_log', 'meta')) {
    await pool.query('ALTER TABLE `points_log` ADD COLUMN `meta` JSON DEFAULT NULL AFTER `policy_version`');
  }
  if (await indexMissing('points_log', 'idx_points_log_time_reason')) {
    await pool.query('ALTER TABLE `points_log` ADD INDEX `idx_points_log_time_reason` (`create_time`, `reason`)');
  }
  if (await indexMissing('points_log', 'idx_points_log_user_time')) {
    await pool.query('ALTER TABLE `points_log` ADD INDEX `idx_points_log_user_time` (`user_id`, `create_time`, `id`)');
  }
  if (await indexMissing('points_log', 'idx_points_log_policy_time')) {
    await pool.query(
      'ALTER TABLE `points_log` ADD INDEX `idx_points_log_policy_time` (`policy_version`, `create_time`)',
    );
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_cosmetics (
      user_id VARCHAR(64) NOT NULL,
      cosmetic_id VARCHAR(64) NOT NULL,
      create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, cosmetic_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='已拥有的装扮(称号等)'
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_daily_bonus (
      user_id VARCHAR(64) NOT NULL,
      day CHAR(8) NOT NULL,
      bonus_tokens INT NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, day)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='历史当日 AI 额度加成兼容表(新版不再写入)'
  `);
  // 背包:历史消耗品兼容表。新版 AI 加油包即时进入永久余额；补签卡仍存 user_growth.streak_protect_cards。
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_item (
      user_id VARCHAR(64) NOT NULL,
      item_id VARCHAR(64) NOT NULL,
      qty INT NOT NULL DEFAULT 0,
      update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, item_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户持有的消耗品(背包)'
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS points_economy_operations (
      id BIGINT NOT NULL AUTO_INCREMENT,
      user_id VARCHAR(64) NOT NULL,
      request_id VARCHAR(64) NOT NULL,
      operation_type VARCHAR(32) NOT NULL,
      economy_version VARCHAR(32) NOT NULL,
      operation_hash CHAR(64) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      result_json JSON DEFAULT NULL,
      item_id VARCHAR(64) DEFAULT NULL,
      cost_points INT UNSIGNED NOT NULL DEFAULT 0,
      points_rewarded INT UNSIGNED NOT NULL DEFAULT 0,
      ai_tokens_granted BIGINT UNSIGNED NOT NULL DEFAULT 0,
      storage_mb_granted INT UNSIGNED NOT NULL DEFAULT 0,
      makeup_cards_granted INT UNSIGNED NOT NULL DEFAULT 0,
      draw_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
      pity_hits SMALLINT UNSIGNED NOT NULL DEFAULT 0,
      replay_count INT UNSIGNED NOT NULL DEFAULT 0,
      last_replayed_at DATETIME DEFAULT NULL,
      create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_points_economy_user_request (user_id, request_id),
      KEY idx_points_economy_version_time (economy_version, create_time),
      KEY idx_points_economy_status_time (status, create_time),
      KEY idx_points_economy_metrics (status, economy_version, operation_type, item_id),
      KEY idx_points_economy_user_status_time (user_id, status, create_time, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='积分消费幂等与结果审计收据'
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS points_economy_migration_state (
      migration_key VARCHAR(64) NOT NULL,
      completed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      meta JSON DEFAULT NULL,
      PRIMARY KEY (migration_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='积分经济一次性迁移状态'
  `);
  if (await columnMissing('user_growth', 'points')) {
    await pool.query('ALTER TABLE `user_growth` ADD COLUMN `points` INT NOT NULL DEFAULT 0 COMMENT "积分余额"');
  }
  if (await indexMissing('user_growth', 'idx_user_growth_points')) {
    await pool.query('ALTER TABLE `user_growth` ADD INDEX `idx_user_growth_points` (`points`, `user_id`)');
  }
  const operationMetricColumns = [
    ['item_id', 'VARCHAR(64) DEFAULT NULL'],
    ['cost_points', 'INT UNSIGNED NOT NULL DEFAULT 0'],
    ['points_rewarded', 'INT UNSIGNED NOT NULL DEFAULT 0'],
    ['ai_tokens_granted', 'BIGINT UNSIGNED NOT NULL DEFAULT 0'],
    ['storage_mb_granted', 'INT UNSIGNED NOT NULL DEFAULT 0'],
    ['makeup_cards_granted', 'INT UNSIGNED NOT NULL DEFAULT 0'],
    ['draw_count', 'SMALLINT UNSIGNED NOT NULL DEFAULT 0'],
    ['pity_hits', 'SMALLINT UNSIGNED NOT NULL DEFAULT 0'],
    ['replay_count', 'INT UNSIGNED NOT NULL DEFAULT 0'],
    ['last_replayed_at', 'DATETIME DEFAULT NULL'],
  ];
  for (const [column, definition] of operationMetricColumns) {
    if (await columnMissing('points_economy_operations', column)) {
      await pool.query(`ALTER TABLE \`points_economy_operations\` ADD COLUMN \`${column}\` ${definition}`);
    }
  }
  if (await indexMissing('points_economy_operations', 'idx_points_economy_metrics')) {
    await pool.query(
      'ALTER TABLE `points_economy_operations` ADD INDEX `idx_points_economy_metrics` (`status`, `economy_version`, `operation_type`, `item_id`)',
    );
  }
  if (await indexMissing('points_economy_operations', 'idx_points_economy_user_status_time')) {
    await pool.query(
      'ALTER TABLE `points_economy_operations` ADD INDEX `idx_points_economy_user_status_time` (`user_id`, `status`, `create_time`, `id`)',
    );
  }
  if (await columnMissing('user_growth', 'equipped_title')) {
    await pool.query(
      'ALTER TABLE `user_growth` ADD COLUMN `equipped_title` VARCHAR(64) DEFAULT NULL COMMENT "已佩戴称号 id"',
    );
  }
  if (await columnMissing('user_growth', 'storage_bonus_mb')) {
    await pool.query(
      'ALTER TABLE `user_growth` ADD COLUMN `storage_bonus_mb` INT NOT NULL DEFAULT 0 COMMENT "积分兑换的永久扩容(MB),叠加在段位基础配额之上"',
    );
  }
  if (await columnMissing('user_growth', 'ai_bonus_tokens')) {
    await pool.query(
      'ALTER TABLE `user_growth` ADD COLUMN `ai_bonus_tokens` BIGINT NOT NULL DEFAULT 0 COMMENT "永久 AI 加油余额(tokens),每日等级额度耗尽后自动扣减"',
    );
  }
  if (await columnMissing('user_growth', 'lottery_count')) {
    await pool.query(
      'ALTER TABLE `user_growth` ADD COLUMN `lottery_count` INT NOT NULL DEFAULT 0 COMMENT "累计抽奖次数(用于每10抽保底)"',
    );
  }
  if (await columnMissing('user_growth', 'lottery_free_day')) {
    await pool.query(
      'ALTER TABLE `user_growth` ADD COLUMN `lottery_free_day` CHAR(8) DEFAULT NULL COMMENT "上次使用每日免费抽奖的日期 YYYYMMDD"',
    );
  }
  if (await columnMissing('user_growth', 'lottery_free_used')) {
    await pool.query(
      'ALTER TABLE `user_growth` ADD COLUMN `lottery_free_used` INT NOT NULL DEFAULT 0 COMMENT "当日已用的免费抽奖次数"',
    );
  }
  if (await columnMissing('user_growth', 'equipped_frame')) {
    await pool.query(
      'ALTER TABLE `user_growth` ADD COLUMN `equipped_frame` VARCHAR(64) DEFAULT NULL COMMENT "已佩戴头像框装扮 id"',
    );
  }
  if (await columnMissing('user_growth', 'lottery_paid_count')) {
    await pool.query(
      'ALTER TABLE `user_growth` ADD COLUMN `lottery_paid_count` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT "C4 付费抽累计次数"',
    );
  }
  if (await columnMissing('user_growth', 'lottery_paid_pity_progress')) {
    await pool.query(
      'ALTER TABLE `user_growth` ADD COLUMN `lottery_paid_pity_progress` TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT "C4 付费保底进度 0-9"',
    );
  }
}

// ============================================================================
// 商店目录与头像框目录分源：SHOP_ITEMS 只包含可用积分兑换的商品；FRAME_CATALOG
// 包含所有可佩戴头像框，并通过 acquisition 区分积分兑换与成就领取。
// ============================================================================
// 可积分兑换商品从当前经济目录读取；C3/C4 在滚动发布期可由同一后端安全切换。
const activeEconomyCatalog = () => getActiveEconomyCatalog();
const { utilityItems: SHOP_UTILITY_ITEMS, frameItems: SHOP_FRAME_ITEMS } = activeEconomyCatalog();

const ACHIEVEMENT_FRAME_ITEMS = [
  {
    id: 'frame_first_light',
    type: 'cosmetic',
    effect: 'frame',
    rarity: 'basic',
    name: '初光',
    desc: '头像框 · 首次签到纪念',
    achievementKey: 'streak_1',
  },
  {
    id: 'frame_streak_seed',
    type: 'cosmetic',
    effect: 'frame',
    rarity: 'rare',
    name: '七日晨光',
    desc: '头像框 · 七日签到印记',
    achievementKey: 'streak_7',
  },
  {
    id: 'frame_streak_month',
    type: 'cosmetic',
    effect: 'frame',
    rarity: 'epic',
    name: '月华渐盈',
    desc: '头像框 · 卅日月相流转',
    achievementKey: 'streak_30',
  },
  {
    id: 'frame_bookmark_intro',
    type: 'cosmetic',
    effect: 'frame',
    rarity: 'basic',
    name: '书签初识',
    desc: '头像框 · 第一枚书签印记',
    achievementKey: 'bookmark_10',
  },
  {
    id: 'frame_file_intro',
    type: 'cosmetic',
    effect: 'frame',
    rarity: 'basic',
    name: '云匣初识',
    desc: '头像框 · 初次存入云端',
    achievementKey: 'file_5',
  },
  {
    id: 'frame_bookmark_seed',
    type: 'cosmetic',
    effect: 'frame',
    rarity: 'rare',
    name: '书页初藏',
    desc: '头像框 · 第一座小书架',
    achievementKey: 'bookmark_50',
  },
  {
    id: 'frame_note_seed',
    type: 'cosmetic',
    effect: 'frame',
    rarity: 'basic',
    name: '青笔初成',
    desc: '头像框 · 笔尖新绿',
    achievementKey: 'note_10',
  },
  {
    id: 'frame_note_flow',
    type: 'cosmetic',
    effect: 'frame',
    rarity: 'rare',
    name: '青墨流韵',
    desc: '头像框 · 三十篇墨意成流',
    achievementKey: 'note_30',
  },
  {
    id: 'frame_file_seed',
    type: 'cosmetic',
    effect: 'frame',
    rarity: 'rare',
    name: '云匣初启',
    desc: '头像框 · 云端初藏',
    achievementKey: 'file_30',
  },
  {
    id: 'frame_bookmark_corridor',
    type: 'cosmetic',
    effect: 'frame',
    rarity: 'epic',
    name: '书签长廊',
    desc: '头像框 · 两百书签汇成长廊',
    achievementKey: 'bookmark_200',
  },
  {
    id: 'frame_bookmark_archive',
    type: 'cosmetic',
    effect: 'frame',
    rarity: 'legendary',
    name: '万卷星库',
    desc: '头像框 · 万卷流转成星河',
    achievementKey: 'bookmark_500',
  },
  {
    id: 'frame_note_masterpiece',
    type: 'cosmetic',
    effect: 'frame',
    rarity: 'epic',
    name: '文心长河',
    desc: '头像框 · 翡翠墨光奔流',
    achievementKey: 'note_200',
  },
  {
    id: 'frame_file_vault',
    type: 'cosmetic',
    effect: 'frame',
    rarity: 'epic',
    name: '云阙宝库',
    desc: '头像框 · 晶辉守护云藏',
    achievementKey: 'file_200',
  },
  {
    id: 'frame_note_constellation',
    type: 'cosmetic',
    effect: 'frame',
    rarity: 'legendary',
    name: '翰墨星海',
    desc: '头像框 · 五百篇文光汇成星海',
    achievementKey: 'note_500',
  },
  {
    id: 'frame_file_constellation',
    type: 'cosmetic',
    effect: 'frame',
    rarity: 'legendary',
    name: '寰宇云藏',
    desc: '头像框 · 五百云藏辉映星门',
    achievementKey: 'file_500',
  },
  {
    id: 'frame_streak_eternal',
    type: 'cosmetic',
    effect: 'frame',
    rarity: 'legendary',
    name: '岁序长明',
    desc: '头像框 · 日月轮转一周年',
    achievementKey: 'streak_365',
  },
];

const FRAME_RARITY_ORDER = { basic: 0, rare: 1, epic: 2, legendary: 3 };

// 成就门槛升级只约束尚未领取的用户。历史版本中已经领取旧门槛奖励的用户永久保留原头像框，
// 即使装扮表尚未补写，也可根据不可变的领取事实只读恢复权益。
const LEGACY_ACHIEVEMENT_FRAME_ENTITLEMENTS = Object.freeze({
  bookmark_20: 'frame_bookmark_seed',
  file_10: 'frame_file_seed',
});

function achievementEntitlementKeysForFrame(item) {
  return [
    item.achievementKey,
    ...Object.entries(LEGACY_ACHIEVEMENT_FRAME_ENTITLEMENTS)
      .filter(([, frameId]) => frameId === item.id)
      .map(([achievementKey]) => achievementKey),
  ].filter(Boolean);
}

export const FRAME_CATALOG = [
  ...SHOP_FRAME_ITEMS.map((item) => ({ ...item, acquisition: 'shop' })),
  ...ACHIEVEMENT_FRAME_ITEMS.map((item) => ({ ...item, acquisition: 'achievement' })),
].sort(
  (left, right) =>
    (FRAME_RARITY_ORDER[left.rarity] ?? Number.MAX_SAFE_INTEGER) -
    (FRAME_RARITY_ORDER[right.rarity] ?? Number.MAX_SAFE_INTEGER),
);

export const SHOP_ITEMS = [...SHOP_UTILITY_ITEMS, ...SHOP_FRAME_ITEMS];

export function getActiveShopItems() {
  const catalog = activeEconomyCatalog();
  return [...catalog.utilityItems, ...catalog.frameItems];
}

export function getActiveFrameCatalog() {
  return [
    ...activeEconomyCatalog().frameItems.map((item) => ({ ...item, acquisition: 'shop' })),
    ...ACHIEVEMENT_FRAME_ITEMS.map((item) => ({ ...item, acquisition: 'achievement' })),
  ].sort(
    (left, right) =>
      (FRAME_RARITY_ORDER[left.rarity] ?? Number.MAX_SAFE_INTEGER) -
      (FRAME_RARITY_ORDER[right.rarity] ?? Number.MAX_SAFE_INTEGER),
  );
}

export function getShopItem(id) {
  return getActiveShopItems().find((i) => i.id === id) || null;
}

export function getFrameItem(id) {
  return getActiveFrameCatalog().find((item) => item.id === id) || null;
}

export function getAchievementFrameByKey(key) {
  return FRAME_CATALOG.find((item) => item.acquisition === 'achievement' && item.achievementKey === key) || null;
}

// ============================================================================
export async function getPoints(userId) {
  const [rows] = await pool.query('SELECT points FROM user_growth WHERE user_id = ? LIMIT 1', [userId]);
  return Number(rows[0]?.points || 0);
}

// 赚取积分。ref 非空时按 (user_id, reason, ref) 幂等(签到/任务按天只发一次)。
// 需在调用方已确保 user_growth 行存在;可传入事务连接 conn。
export async function earnPoints(
  userId,
  amount,
  reason,
  ref = null,
  conn = pool,
  { policyVersion = null, meta = null } = {},
) {
  if (!userId || !(amount > 0)) return false;
  // 无外部事务时自开事务:流水 INSERT 与余额 UPDATE 必须同生共死——
  // 否则中途失败会"记了账没到账",且幂等键会阻止补发,积分永久丢失
  if (conn === pool) {
    const tx = await pool.getConnection();
    try {
      await tx.beginTransaction();
      const ok = await earnPoints(userId, amount, reason, ref, tx, { policyVersion, meta });
      await tx.commit();
      return ok;
    } catch (e) {
      await tx.rollback();
      throw e;
    } finally {
      tx.release();
    }
  }
  if (ref) {
    // 原子幂等:INSERT ... WHERE NOT EXISTS —— 靠 idx_user_reason_ref 的间隙锁串行化并发同 (user,reason,ref) 请求,
    // affectedRows=0 表示已发过(不再走"先 SELECT 再 INSERT"的非原子判断,修复无行锁 claim 入口的并发双领)。
    const [ins] = await conn.query(
      `INSERT INTO points_log (user_id, delta, reason, ref, policy_version, meta)
       SELECT ?, ?, ?, ?, ?, ? FROM DUAL
       WHERE NOT EXISTS (SELECT 1 FROM points_log WHERE user_id = ? AND reason = ? AND ref = ?)`,
      [userId, amount, reason, ref, policyVersion, meta ? JSON.stringify(meta) : null, userId, reason, ref],
    );
    if (!ins.affectedRows) return false; // 已发过
    await conn.query('UPDATE user_growth SET points = points + ? WHERE user_id = ?', [amount, userId]);
    return true;
  }
  await conn.query(
    'INSERT INTO points_log (user_id, delta, reason, ref, policy_version, meta) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, amount, reason, null, policyVersion, meta ? JSON.stringify(meta) : null],
  );
  await conn.query('UPDATE user_growth SET points = points + ? WHERE user_id = ?', [amount, userId]);
  return true;
}

// 永久扩容(MB)。同 earnPoints 语义:ref 非空时按 (user_id, 'storage:'+reason, ref) 幂等,防里程碑重复发放。
// 用 points_log 记一条 delta=0 的审计流水(reason 前缀 storage: 区分,不影响积分余额)。需调用方已确保行存在;可传事务连接。
export async function earnStorage(userId, mb, reason, ref = null, conn = pool) {
  if (!userId || !(mb > 0)) return false;
  // 同 earnPoints:无外部事务时自开事务,防"流水在、扩容没加"的部分成功
  if (conn === pool) {
    const tx = await pool.getConnection();
    try {
      await tx.beginTransaction();
      const ok = await earnStorage(userId, mb, reason, ref, tx);
      await tx.commit();
      return ok;
    } catch (e) {
      await tx.rollback();
      throw e;
    } finally {
      tx.release();
    }
  }
  const logReason = ('storage:' + reason).slice(0, 32);
  if (ref) {
    // 原子幂等,同 earnPoints:防里程碑存储奖励并发重复发放
    const [ins] = await conn.query(
      `INSERT INTO points_log (user_id, delta, reason, ref)
       SELECT ?, 0, ?, ? FROM DUAL
       WHERE NOT EXISTS (SELECT 1 FROM points_log WHERE user_id = ? AND reason = ? AND ref = ?)`,
      [userId, logReason, ref, userId, logReason, ref],
    );
    if (!ins.affectedRows) return false;
    await conn.query('UPDATE user_growth SET storage_bonus_mb = storage_bonus_mb + ? WHERE user_id = ?', [mb, userId]);
    return true;
  }
  await conn.query('INSERT INTO points_log (user_id, delta, reason, ref) VALUES (?, 0, ?, ?)', [
    userId,
    logReason,
    null,
  ]);
  await conn.query('UPDATE user_growth SET storage_bonus_mb = storage_bonus_mb + ? WHERE user_id = ?', [mb, userId]);
  return true;
}

export async function getStorageBonus(userId) {
  const [rows] = await pool.query('SELECT storage_bonus_mb FROM user_growth WHERE user_id = ? LIMIT 1', [userId]);
  return Number(rows[0]?.storage_bonus_mb || 0);
}

// ============================================================================
// 积分明细 / 运营(D 批)
// ============================================================================

// 用户积分流水(分页,新→旧)。reason 原样返回,前端按类型映射文案。
function encodePointsCursor(id) {
  return Buffer.from(JSON.stringify({ id: Number(id) }), 'utf8').toString('base64url');
}

function decodePointsCursor(cursor) {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    const id = Number(parsed?.id);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

function pointsLogFilterSql(filter) {
  const operationsReasons = "reason IN ('admin', 'storage:admin', 'campaign', 'correction')";
  if (filter === 'earned') return `delta > 0 AND reason NOT LIKE 'lottery_%' AND NOT (${operationsReasons})`;
  if (filter === 'spent') return `delta < 0 AND reason NOT LIKE 'lottery_%' AND NOT (${operationsReasons})`;
  if (filter === 'lottery') return "reason LIKE 'lottery_%'";
  if (filter === 'system') return operationsReasons;
  return '1 = 1';
}

export async function getPointsLog(userId, { limit = 30, offset = 0, cursor = null, filter = 'all' } = {}) {
  const lim = Math.min(100, Math.max(1, Math.trunc(Number(limit) || 30)));
  const off = Math.max(0, Math.trunc(Number(offset) || 0)); // lim/off 已 clamp 为整数,直接内插避免 LIMIT 占位符类型坑
  const cursorId = decodePointsCursor(cursor);
  const normalizedFilter = ['all', 'earned', 'spent', 'lottery', 'system'].includes(filter) ? filter : 'all';
  const filterSql = pointsLogFilterSql(normalizedFilter);
  const cursorSql = cursorId ? 'AND id < ?' : '';
  const pagingSql = cursorId ? '' : `OFFSET ${off}`;
  // 排除 ach_unlock:那是成就"永久解锁"的内部标记(delta=0),非积分流水,不该出现在用户明细里
  const [rawRows] = await pool.query(
    `SELECT id, delta, reason, ref, policy_version AS policyVersion, meta, create_time
       FROM points_log
      WHERE user_id = ? AND reason <> 'ach_unlock' AND ${filterSql} ${cursorSql}
      ORDER BY id DESC LIMIT ${lim + 1} ${pagingSql}`,
    cursorId ? [userId, cursorId] : [userId],
  );
  const [[c]] = await pool.query(
    `SELECT COUNT(*) AS c FROM points_log
      WHERE user_id = ? AND reason <> 'ach_unlock' AND ${filterSql}`,
    [userId],
  );
  const hasMore = rawRows.length > lim;
  const rows = rawRows.slice(0, lim);
  return {
    rows: rows.map(enrichPointsLogRow),
    total: Number(c.c || 0),
    limit: lim,
    offset: off,
    filter: normalizedFilter,
    hasMore,
    nextCursor: hasMore && rows.length ? encodePointsCursor(rows[rows.length - 1].id) : null,
  };
}

function enrichPointsLogRow(row) {
  const reason = String(row.reason || '');
  const ref = String(row.ref || '');
  const baseReason = reason.startsWith('storage:') ? 'storage' : reason;
  const privateOperation = ['admin', 'storage:admin', 'campaign', 'correction'].includes(reason);
  let sourceKey = ref;
  let sourceMeta = null;
  if (privateOperation) sourceKey = null;
  if (reason === 'weekly') {
    const splitAt = ref.lastIndexOf(':');
    if (splitAt >= 0) {
      sourceMeta = ref.slice(0, splitAt) || null;
      sourceKey = ref.slice(splitAt + 1) || null;
    }
  }
  let parsedMeta = null;
  try {
    parsedMeta = typeof row.meta === 'string' ? JSON.parse(row.meta) : row.meta;
  } catch {
    parsedMeta = null;
  }
  // 流水 meta 同时服务后台审计与用户解释；用户接口只返回无敏感内容的来源字段，
  // 不泄露 Root 备注、工单号、请求 ID 或内部活动圈选信息。
  const publicMeta =
    parsedMeta && typeof parsedMeta === 'object'
      ? {
          day: parsedMeta.day || null,
          streak: Number.isFinite(Number(parsedMeta.streak)) ? Number(parsedMeta.streak) : null,
          stage: parsedMeta.stage || null,
          required: Number.isFinite(Number(parsedMeta.required)) ? Number(parsedMeta.required) : null,
          challengeKey: parsedMeta.challengeKey || null,
          achievementKey: parsedMeta.achievementKey || null,
          frameId: parsedMeta.frameId || null,
          assetType: ['ai_tokens', 'storage_mb'].includes(parsedMeta.assetType) ? parsedMeta.assetType : null,
          assetAmount:
            Number.isSafeInteger(Number(parsedMeta.assetAmount)) && Number(parsedMeta.assetAmount) > 0
              ? Number(parsedMeta.assetAmount)
              : null,
        }
      : null;
  const assetChange = resolveLotteryAssetChange(reason, ref, publicMeta);
  return {
    ...row,
    ref: privateOperation ? null : row.ref,
    meta: publicMeta && Object.values(publicMeta).some((value) => value !== null) ? publicMeta : null,
    sourceType: baseReason,
    sourceKey: sourceKey || null,
    sourceMeta,
    sourceRef: privateOperation ? null : ref || null,
    assetChange,
  };
}

function resolveLotteryAssetChange(reason, ref, meta) {
  const assetReasons = ['lottery_free_asset', 'lottery_paid_asset', 'lottery_storage'];
  if (!assetReasons.includes(reason)) return null;
  if (meta?.assetType && meta?.assetAmount) {
    return {
      type: meta.assetType === 'ai_tokens' ? 'ai' : 'storage',
      amount: meta.assetAmount,
    };
  }

  const poolKey = reason === 'lottery_free_asset' ? 'freePolicy' : 'paidPolicy';
  for (const catalog of Object.values(ECONOMY_CATALOGS)) {
    const prize = catalog[poolKey].pool.find((item) => item.id === ref);
    if (!prize) continue;
    if (prize.kind === 'ai_pack' && reason !== 'lottery_storage') {
      return { type: 'ai', amount: Number(prize.amount) };
    }
    if (prize.kind === 'storage' && reason !== 'lottery_free_asset') {
      return { type: 'storage', amount: Number(prize.amount) };
    }
  }
  return null;
}

// 经济总览(root 运营):发放/消耗/存量、按来源分布、抽奖返还率、持有人 Top。
export async function getPointsOverview({ hideInternal = true } = {}) {
  const roleMarks = INTERNAL_ROLES.map(() => '?').join(',');
  const ledgerInternalSql =
    hideInternal !== false
      ? ` AND NOT EXISTS (
          SELECT 1 FROM user internal_user
           WHERE internal_user.id = points_log.user_id
             AND internal_user.role IN (${roleMarks})
        )`
      : '';
  const balanceInternalSql =
    hideInternal !== false
      ? ` AND NOT EXISTS (
          SELECT 1 FROM user internal_user
           WHERE internal_user.id = user_growth.user_id
             AND internal_user.role IN (${roleMarks})
        )`
      : '';
  const operationInternalSql =
    hideInternal !== false
      ? ` AND NOT EXISTS (
          SELECT 1 FROM user internal_user
           WHERE internal_user.id = points_economy_operations.user_id
             AND internal_user.role IN (${roleMarks})
        )`
      : '';
  const topInternalSql =
    hideInternal !== false
      ? ` AND NOT EXISTS (
          SELECT 1 FROM user internal_user
           WHERE internal_user.id = g.user_id
             AND internal_user.role IN (${roleMarks})
        )`
      : '';
  const internalParams = hideInternal !== false ? [...INTERNAL_ROLES] : [];
  const [
    [[issued]],
    [[spent]],
    [[outstanding]],
    [byReason],
    [[lotCost]],
    [[lotWin]],
    [[freeWin]],
    [byVersion],
    [operationMetrics],
    [[lotDraws]],
    [[holders]],
    [top],
  ] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(delta),0) AS s FROM points_log WHERE delta > 0${ledgerInternalSql}`,
      internalParams,
    ),
    pool.query(
      `SELECT COALESCE(SUM(-delta),0) AS s FROM points_log WHERE delta < 0${ledgerInternalSql}`,
      internalParams,
    ),
    pool.query(`SELECT COALESCE(SUM(points),0) AS s FROM user_growth WHERE 1 = 1${balanceInternalSql}`, internalParams),
    pool.query(
      `SELECT reason, COALESCE(SUM(delta),0) AS delta, COUNT(*) AS cnt
         FROM points_log WHERE 1 = 1${ledgerInternalSql}
        GROUP BY reason ORDER BY ABS(SUM(delta)) DESC`,
      internalParams,
    ),
    pool.query(
      `SELECT COALESCE(SUM(-delta),0) AS s FROM points_log
        WHERE reason IN ('lottery_cost','lottery_paid_cost')${ledgerInternalSql}`,
      internalParams,
    ),
    pool.query(
      `SELECT COALESCE(SUM(delta),0) AS s FROM points_log
        WHERE reason IN ('lottery_win','lottery_compensation','lottery_paid_win','lottery_paid_compensation')${ledgerInternalSql}`,
      internalParams,
    ),
    pool.query(
      `SELECT COALESCE(SUM(delta),0) AS s FROM points_log
        WHERE reason='lottery_free_win'${ledgerInternalSql}`,
      internalParams,
    ),
    pool.query(
      `SELECT economy_version AS economyVersion, operation_type AS operationType, COUNT(*) AS operations,
              COALESCE(SUM(replay_count), 0) AS replays
         FROM points_economy_operations
        WHERE status = 'succeeded'${operationInternalSql}
        GROUP BY economy_version, operation_type
        ORDER BY economy_version, operation_type`,
      internalParams,
    ),
    pool.query(
      `SELECT economy_version AS economyVersion, operation_type AS operationType, item_id AS itemId,
              COUNT(*) AS operations, COALESCE(SUM(cost_points),0) AS costPoints,
              COALESCE(SUM(points_rewarded),0) AS pointsRewarded,
              COALESCE(SUM(ai_tokens_granted),0) AS aiTokensGranted,
              COALESCE(SUM(storage_mb_granted),0) AS storageMbGranted,
              COALESCE(SUM(makeup_cards_granted),0) AS makeupCardsGranted,
              COALESCE(SUM(draw_count),0) AS drawCount, COALESCE(SUM(pity_hits),0) AS pityHits
         FROM points_economy_operations
        WHERE status = 'succeeded'${operationInternalSql}
        GROUP BY economy_version, operation_type, item_id
        ORDER BY economy_version, operation_type, item_id`,
      internalParams,
    ),
    pool.query(
      `SELECT COALESCE(SUM(lottery_count),0) AS s FROM user_growth WHERE 1 = 1${balanceInternalSql}`,
      internalParams,
    ),
    pool.query(`SELECT COUNT(*) AS c FROM user_growth WHERE points > 0${balanceInternalSql}`, internalParams),
    pool.query(
      `SELECT g.user_id, g.points, u.alias, u.email
         FROM user_growth g LEFT JOIN user u ON u.id = g.user_id
        WHERE g.points > 0${topInternalSql}
        ORDER BY g.points DESC LIMIT 10`,
      internalParams,
    ),
  ]);
  const cost = Number(lotCost.s);
  return {
    issued: Number(issued.s),
    spent: Number(spent.s),
    outstanding: Number(outstanding.s),
    byReason: byReason.map((r) => ({ reason: r.reason, delta: Number(r.delta), cnt: Number(r.cnt) })),
    lottery: {
      cost,
      winPoints: Number(lotWin.s),
      freeWinPoints: Number(freeWin.s),
      draws: Number(lotDraws.s),
      payoutRatio: cost > 0 ? +((Number(lotWin.s) / cost) * 100).toFixed(1) : 0,
    },
    byEconomyVersion: byVersion.map((row) => ({
      economyVersion: row.economyVersion,
      operationType: row.operationType,
      operations: Number(row.operations || 0),
      replays: Number(row.replays || 0),
    })),
    operationMetrics: operationMetrics.map((row) => ({
      economyVersion: row.economyVersion,
      operationType: row.operationType,
      itemId: row.itemId || null,
      operations: Number(row.operations || 0),
      costPoints: Number(row.costPoints || 0),
      pointsRewarded: Number(row.pointsRewarded || 0),
      aiTokensGranted: Number(row.aiTokensGranted || 0),
      storageMbGranted: Number(row.storageMbGranted || 0),
      makeupCardsGranted: Number(row.makeupCardsGranted || 0),
      drawCount: Number(row.drawCount || 0),
      pityHits: Number(row.pityHits || 0),
    })),
    holders: Number(holders.c),
    filters: { hideInternal: hideInternal !== false },
    top: top.map((r) => ({
      userId: r.user_id,
      points: Number(r.points),
      alias: r.alias || null,
      email: r.email || null,
    })),
  };
}

export async function searchAdminUsers(keyword, { limit = 20 } = {}) {
  const term = String(keyword || '')
    .trim()
    .slice(0, 100);
  if (!term) return [];
  const safeLimit = Math.min(20, Math.max(1, Math.trunc(Number(limit) || 20)));
  const like = `%${term}%`;
  const prefix = `${term}%`;
  const [rows] = await pool.query(
    `SELECT u.id AS userId, u.alias, u.email, u.role, u.last_active_time AS lastActiveTime,
            COALESCE(g.points, 0) AS points
       FROM user u
       LEFT JOIN user_growth g ON g.user_id = u.id
      WHERE u.del_flag = 0 AND (u.id = ? OR u.email = ? OR u.alias LIKE ? OR u.email LIKE ? OR u.id LIKE ?)
      ORDER BY
        CASE WHEN u.id = ? THEN 0 WHEN u.email = ? THEN 1 WHEN u.alias LIKE ? THEN 2 WHEN u.email LIKE ? THEN 3 ELSE 4 END,
        u.last_active_time DESC,
        u.id ASC
      LIMIT ${safeLimit}`,
    [term, term, like, like, like, term, term, prefix, prefix],
  );
  return rows.map((row) => ({
    userId: row.userId,
    alias: row.alias || null,
    email: row.email || null,
    role: row.role || 'user',
    points: Number(row.points || 0),
    lastActiveTime: row.lastActiveTime || null,
  }));
}

export class AdminPointsError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'AdminPointsError';
    this.code = code;
    this.status = status;
  }
}

const ADMIN_GRANT_REASON_CODES = new Set([
  'customer_support',
  'incident_compensation',
  'data_correction',
  'test_acceptance',
  'other',
]);

// 运营手动发放/扣减(root):目标校验、余额边界、资产更新与审计流水必须在同一事务。
export async function adminGrantPoints(
  userId,
  { points = 0, cards = 0, storageMb = 0, reasonCode = '', reason = '', note = '', ticketRef = '' } = {},
  { actionContext = null } = {},
) {
  const p = Math.trunc(Number(points) || 0);
  const s = Math.trunc(Number(storageMb) || 0);
  const c = Math.trunc(Number(cards) || 0);
  if (!userId || !String(userId).trim()) throw new AdminPointsError('TARGET_REQUIRED', '缺少目标用户');
  if (![p, s, c].every(Number.isSafeInteger)) throw new AdminPointsError('INVALID_AMOUNT', '调整数量无效');
  if ([p, s, c].some((value) => Math.abs(value) > 1_000_000)) {
    throw new AdminPointsError('AMOUNT_TOO_LARGE', '单次调整数量过大');
  }
  if (!p && !s && !c) throw new AdminPointsError('EMPTY_ADJUSTMENT', '请至少填写一项调整数量');
  const normalizedReasonCode = String(reasonCode || '').trim();
  const normalizedReason = String(reason || '')
    .trim()
    .slice(0, 255);
  const normalizedNote = String(note || '')
    .trim()
    .slice(0, 255);
  const normalizedTicketRef = String(ticketRef || '')
    .trim()
    .slice(0, 64);
  const normalizedUserId = String(userId).trim();
  const requestId = String(actionContext?.requestId || '').trim();
  if (!ADMIN_GRANT_REASON_CODES.has(normalizedReasonCode)) {
    throw new AdminPointsError('REASON_CODE_REQUIRED', '请选择资产调整原因类型');
  }
  if (normalizedReason.length < 6) throw new AdminPointsError('REASON_REQUIRED', '请填写至少 6 个字的操作原因');
  const ref = `admin:${normalizedReasonCode}:${normalizedTicketRef || requestId}`.slice(0, 64);
  const operationPayload = {
    operationType: 'admin_adjust',
    userId: normalizedUserId,
    points: p,
    storageMb: s,
    cards: c,
    reasonCode: normalizedReasonCode,
    reason: normalizedReason,
    note: normalizedNote || null,
    ticketRef: normalizedTicketRef || null,
  };
  const operationHash = pointsOperationHash(operationPayload);
  const ledgerMeta = JSON.stringify({
    reasonCode: normalizedReasonCode,
    reason: normalizedReason,
    note: normalizedNote || null,
    ticketRef: normalizedTicketRef || null,
    requestId: requestId || null,
  });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let operation = null;
    if (requestId) {
      if (!/^[A-Za-z0-9._:-]{8,64}$/.test(requestId)) {
        throw new AdminPointsError('INVALID_REQUEST_ID', '请求标识格式无效');
      }
      const [inserted] = await conn.query(
        `INSERT IGNORE INTO points_grant_operations
           (user_id, request_id, operation_type, operation_hash, points, reason, ref, policy_version)
         VALUES (?, ?, 'admin_adjust', ?, ?, 'admin', ?, ?)`,
        [normalizedUserId, requestId, operationHash, p, ref, POINTS_SYSTEM_VERSION],
      );
      const [[storedOperation]] = await conn.query(
        `SELECT id, operation_hash AS operationHash, status, result_json AS resultJson
           FROM points_grant_operations
          WHERE user_id = ? AND request_id = ? LIMIT 1 FOR UPDATE`,
        [normalizedUserId, requestId],
      );
      if (!storedOperation || storedOperation.operationHash !== operationHash) {
        throw new AdminPointsError('IDEMPOTENCY_KEY_REUSED', '请求标识已用于其他资产调整', 409);
      }
      operation = storedOperation;
      if (!inserted.affectedRows) {
        let replay = null;
        try {
          replay =
            typeof storedOperation.resultJson === 'object'
              ? storedOperation.resultJson
              : JSON.parse(storedOperation.resultJson || 'null');
        } catch {
          replay = null;
        }
        if (storedOperation.status !== 'succeeded' || !replay) {
          throw new AdminPointsError('IDEMPOTENCY_RESULT_PENDING', '原资产调整仍在处理中', 409);
        }
        const receipt = actionContext
          ? await finishAdminAction(actionContext, {
              outcome: 'succeeded',
              metadata: { idempotentReplay: true, originalOperationId: storedOperation.id },
              db: conn,
            })
          : {};
        await conn.commit();
        return { ...replay, idempotent: true, ...receipt };
      }
    }
    const [users] = await conn.query(
      'SELECT id, alias, email, role FROM user WHERE id = ? AND del_flag = 0 FOR UPDATE',
      [normalizedUserId],
    );
    if (!users.length) throw new AdminPointsError('USER_NOT_FOUND', '目标用户不存在或已注销', 404);
    await conn.query('INSERT IGNORE INTO user_growth (user_id) VALUES (?)', [normalizedUserId]);
    const [growthRows] = await conn.query(
      'SELECT points, storage_bonus_mb, streak_protect_cards FROM user_growth WHERE user_id = ? FOR UPDATE',
      [normalizedUserId],
    );
    const growth = growthRows[0];
    const nextPoints = Number(growth.points || 0) + p;
    const nextStorage = Number(growth.storage_bonus_mb || 0) + s;
    const nextCards = Number(growth.streak_protect_cards || 0) + c;
    if (nextPoints < 0) throw new AdminPointsError('INSUFFICIENT_POINTS', `积分最多可扣减 ${growth.points || 0}`);
    if (nextStorage < 0) {
      throw new AdminPointsError('INSUFFICIENT_STORAGE', `永久扩容最多可扣减 ${growth.storage_bonus_mb || 0}MB`);
    }
    if (nextCards < 0 || nextCards > 2) {
      throw new AdminPointsError('CARD_LIMIT', `补签卡调整后必须在 0～2 张之间`);
    }
    if (p) {
      await conn.query(
        'INSERT INTO points_log (user_id, delta, reason, ref, policy_version, meta) VALUES (?, ?, ?, ?, ?, ?)',
        [normalizedUserId, p, 'admin', ref, POINTS_SYSTEM_VERSION, ledgerMeta],
      );
    }
    if (s) {
      await conn.query(
        "INSERT INTO points_log (user_id, delta, reason, ref, policy_version, meta) VALUES (?, 0, 'storage:admin', ?, ?, ?)",
        [normalizedUserId, ref, POINTS_SYSTEM_VERSION, ledgerMeta],
      );
    }
    await conn.query(
      `UPDATE user_growth
          SET points = ?, storage_bonus_mb = ?, streak_protect_cards = ?
        WHERE user_id = ?`,
      [nextPoints, nextStorage, nextCards, normalizedUserId],
    );
    const businessResult = {
      ok: true,
      points: nextPoints,
      storageBonusMb: nextStorage,
      cards: nextCards,
      user: {
        userId: users[0].id,
        alias: users[0].alias || null,
        email: users[0].email || null,
        role: users[0].role || 'user',
      },
    };
    if (operation) {
      await conn.query("UPDATE points_grant_operations SET status = 'succeeded', result_json = ? WHERE id = ?", [
        JSON.stringify(businessResult),
        operation.id,
      ]);
    }
    const receipt = actionContext
      ? await finishAdminAction(actionContext, {
          outcome: 'succeeded',
          metadata: {
            pointsDelta: p,
            storageMbDelta: s,
            cardsDelta: c,
            resultingPoints: nextPoints,
            resultingStorageMb: nextStorage,
            resultingCards: nextCards,
            reasonCode: normalizedReasonCode,
            ticketRef: normalizedTicketRef || null,
          },
          db: conn,
        })
      : {};
    await conn.commit();
    return { ...businessResult, idempotent: false, ...receipt };
  } catch (error) {
    try {
      await conn.rollback();
    } catch {
      // 回滚失败仅记日志，保留原始业务错误。
    }
    throw error;
  } finally {
    conn.release();
  }
}

// 单账号积分详情(root 查账):余额 + 最近 30 条流水。
export async function getUserPointsDetail(userId) {
  const [[u]] = await pool.query('SELECT id, alias, email FROM user WHERE id = ? AND del_flag = 0 LIMIT 1', [userId]);
  const [[g]] = await pool.query(
    'SELECT points, storage_bonus_mb, streak_protect_cards, lottery_count FROM user_growth WHERE user_id = ? LIMIT 1',
    [userId],
  );
  const { rows } = await getPointsLog(userId, { limit: 30 });
  return {
    user: u ? { userId: u.id, alias: u.alias || null, email: u.email || null } : null,
    balance: g
      ? {
          points: Number(g.points),
          storageBonusMb: Number(g.storage_bonus_mb),
          cards: Number(g.streak_protect_cards),
          lotteryCount: Number(g.lottery_count),
        }
      : null,
    log: rows,
  };
}

async function getClaimedAchievementFrameIds(userId, conn = pool) {
  if (!userId) return [];
  let achievementRows = [];
  try {
    [achievementRows] = await conn.query(
      `SELECT achievement_key AS achievementKey
         FROM user_achievements WHERE user_id = ? AND claimed_at IS NOT NULL`,
      [userId],
    );
  } catch (error) {
    // 滚动更新的短窗期内旧库可能尚未创建独立成就表；GET 仍只读回退到旧账本。
    if (error?.code !== 'ER_NO_SUCH_TABLE') throw error;
  }
  // 两张历史表的 collation 可能不同，分别读取后在 JS 合并，避免 SQL UNION 直接 500。
  const [legacyRows] = await conn.query(
    `SELECT ref AS achievementKey
       FROM points_log WHERE user_id = ? AND reason = 'achievement' AND ref IS NOT NULL`,
    [userId],
  );
  const claimedKeys = new Set(
    [...achievementRows, ...legacyRows].map((row) => row.achievementKey || row.ref).filter(Boolean),
  );
  const currentFrameIds = FRAME_CATALOG.filter(
    (item) => item.acquisition === 'achievement' && item.achievementKey && claimedKeys.has(item.achievementKey),
  ).map((item) => item.id);
  const legacyFrameIds = [...claimedKeys].map((key) => LEGACY_ACHIEVEMENT_FRAME_ENTITLEMENTS[key]).filter(Boolean);
  return [...new Set([...currentFrameIds, ...legacyFrameIds])];
}

export async function getOwnedCosmetics(userId) {
  const [rows] = await pool.query('SELECT cosmetic_id FROM user_cosmetics WHERE user_id = ?', [userId]);
  // 成就头像框晚于部分成就领取记录上线。旧 points_log 已代表奖励领取事实，读取时把对应
  // 头像框视为已拥有；这里保持只读，避免 GET /growth/shop 在管理员只读预览中产生写入。
  const claimedAchievementFrames = await getClaimedAchievementFrameIds(userId);
  return [...new Set([...rows.map((row) => row.cosmetic_id), ...claimedAchievementFrames])];
}

export async function getEquippedTitle(userId) {
  const [rows] = await pool.query('SELECT equipped_title FROM user_growth WHERE user_id = ? LIMIT 1', [userId]);
  return rows[0]?.equipped_title || null;
}

// 购买:事务内校验余额/真实等级/上限/是否已拥有 → 扣分 → 生效 → 记流水
export async function buyItem(
  userId,
  itemId,
  { clientRequestId = null, economyVersion = null, expectedCost = null } = {},
) {
  const runtime = getEconomyRuntime();
  const item = getShopItem(itemId);
  // 成就专属框属于完整装扮目录但从来不是商店商品，直接拒绝且不创建事务；
  // 真正已下架的历史积分商品仍继续进入幂等查询，以便响应丢失后的旧收据可以原样回放。
  if (!item && getFrameItem(itemId)?.acquisition === 'achievement') {
    return { ok: false, reason: 'not_found', msg: '商品不存在或已下架' };
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const operation = await beginPointsEconomyOperation(conn, {
      userId,
      operationType: 'shop_buy',
      payload: { itemId },
      clientRequestId,
      economyVersion,
      expectedCost,
      // 先按请求号尝试回放，使未来目录移除商品后仍能恢复旧成功响应；新请求再进入商品存在性校验。
      actualCost: item?.cost ?? Number(expectedCost),
      runtime,
    });
    if (operation.replay) {
      await conn.commit();
      return operation.replay;
    }
    if (!item) {
      await conn.rollback();
      return { ok: false, reason: 'not_found', msg: '商品不存在' };
    }
    if (!runtime.purchaseEnabled) {
      await conn.rollback();
      return { ok: false, reason: 'maintenance', code: 'POINTS_PURCHASES_DISABLED', msg: '积分兑换维护中，请稍后再试' };
    }
    const [rows] = await conn.query(
      'SELECT points, level, streak_protect_cards FROM user_growth WHERE user_id = ? FOR UPDATE',
      [userId],
    );
    const g = rows[0];
    if (!g) {
      await conn.rollback();
      return { ok: false, reason: 'no_growth', msg: '成长数据未初始化,先签到试试' };
    }
    if (item.minLevel && Number(g.level) < item.minLevel) {
      await conn.rollback();
      return { ok: false, reason: 'level', msg: `需达到 Lv.${item.minLevel} 才能兑换` };
    }
    if (item.type === 'title' || item.type === 'cosmetic') {
      const [owned] = await conn.query('SELECT 1 FROM user_cosmetics WHERE user_id = ? AND cosmetic_id = ? LIMIT 1', [
        userId,
        item.id,
      ]);
      if (owned.length) {
        await conn.rollback();
        return { ok: false, reason: 'owned', msg: '已拥有该装扮' };
      }
    }
    if (item.effect === 'makeup_card' && Number(g.streak_protect_cards) >= 2) {
      await conn.rollback();
      return { ok: false, reason: 'card_max', msg: '补签卡已达上限(2 张)' };
    }
    if (Number(g.points) < item.cost) {
      await conn.rollback();
      return { ok: false, reason: 'insufficient', msg: '积分不足' };
    }
    await conn.query('UPDATE user_growth SET points = points - ? WHERE user_id = ?', [item.cost, userId]);
    await conn.query('INSERT INTO points_log (user_id, delta, reason, ref) VALUES (?, ?, ?, ?)', [
      userId,
      -item.cost,
      'buy',
      item.id,
    ]);
    if (item.effect === 'makeup_card') {
      await grantItem(conn, userId, 'makeup_card', 1);
    } else if (item.effect === 'storage') {
      // 永久扩容:即时生效类,直接叠加(可反复购买;无幂等 ref,每次都加)
      await conn.query('UPDATE user_growth SET storage_bonus_mb = storage_bonus_mb + ? WHERE user_id = ?', [
        item.storageMb,
        userId,
      ]);
    } else if (item.effect === 'ai_pack') {
      // AI 加油包是永久余额：兑换即到账；AI 闸门始终先用等级每日额度，耗尽后才自动扣这里。
      const mutationRef = String(operation.operationId || randomUUID());
      await creditAiBonusTokens(conn, {
        userId,
        amountTokens: item.bonusTokens,
        sourceType: 'points_shop',
        sourceRef: item.id,
        idempotencyKey: `points-purchase:${mutationRef}:ai`,
        policyVersion: runtime.economyVersion,
      });
    } else if (item.type === 'title' || item.type === 'cosmetic') {
      await conn.query('INSERT IGNORE INTO user_cosmetics (user_id, cosmetic_id) VALUES (?, ?)', [userId, item.id]);
    }
    const [balances] = await conn.query(
      'SELECT points, storage_bonus_mb, ai_bonus_tokens FROM user_growth WHERE user_id = ? LIMIT 1',
      [userId],
    );
    const balance = balances[0] || {};
    const effect =
      item.effect === 'storage'
        ? { type: 'storage', amountMb: item.storageMb }
        : item.effect === 'ai_pack'
          ? { type: 'ai_pack', amountTokens: item.bonusTokens }
          : item.effect === 'frame'
            ? { type: 'frame', frameId: item.id }
            : { type: item.effect || item.type };
    const result = {
      ok: true,
      idempotent: false,
      economyVersion: runtime.economyVersion,
      points: Number(balance.points || 0),
      item: item.id,
      itemId: item.id,
      type: item.type,
      cost: item.cost,
      effect,
      assets: {
        storageBonusMb: Number(balance.storage_bonus_mb || 0),
        aiBonusTokens: Number(balance.ai_bonus_tokens || 0),
      },
    };
    await completePointsEconomyOperation(conn, operation, result);
    await conn.commit();
    return result;
  } catch (e) {
    try {
      await conn.rollback();
    } catch {
      /* ignore */
    }
    if (e instanceof PointsEconomyError) throw e;
    throw e;
  } finally {
    conn.release();
  }
}

// 佩戴/卸下称号:titleId 为空=卸下;非空须已拥有
export async function equipTitle(userId, titleId) {
  if (!titleId) {
    await pool.query('UPDATE user_growth SET equipped_title = NULL WHERE user_id = ?', [userId]);
    return { ok: true, equipped: null };
  }
  const [owned] = await pool.query('SELECT 1 FROM user_cosmetics WHERE user_id = ? AND cosmetic_id = ? LIMIT 1', [
    userId,
    titleId,
  ]);
  if (!owned.length) return { ok: false, reason: 'not_owned', msg: '未拥有该称号' };
  await pool.query('UPDATE user_growth SET equipped_title = ? WHERE user_id = ?', [titleId, userId]);
  return { ok: true, equipped: titleId };
}

// 称号 id → 显示名(前端展示佩戴的称号名)
export function titleName(id) {
  const it = getShopItem(id);
  return it && it.type === 'title' ? it.name : null;
}

// 佩戴/卸下头像框:frameId 为空=卸下;普通用户非空须已拥有，Root 可直接验收当前完整目录。
export async function equipFrame(userId, frameId, { userRole = null } = {}) {
  if (!frameId) {
    await pool.query('UPDATE user_growth SET equipped_frame = NULL WHERE user_id = ?', [userId]);
    return { ok: true, equipped: null };
  }
  const item = getFrameItem(frameId);
  if (!item || item.type !== 'cosmetic' || item.effect !== 'frame') {
    return { ok: false, reason: 'invalid_frame', msg: '头像框不存在或已下架' };
  }
  if (userRole === 'root') {
    await pool.query('UPDATE user_growth SET equipped_frame = ? WHERE user_id = ?', [frameId, userId]);
    return { ok: true, equipped: frameId };
  }
  const [owned] = await pool.query('SELECT 1 FROM user_cosmetics WHERE user_id = ? AND cosmetic_id = ? LIMIT 1', [
    userId,
    frameId,
  ]);
  if (!owned.length && item.acquisition === 'achievement' && item.achievementKey) {
    // 兼容头像框上线前已领取的成就：首次佩戴时在同一事务补齐装扮所有权并完成佩戴。
    const entitlementKeys = achievementEntitlementKeysForFrame(item);
    const entitlementPlaceholders = entitlementKeys.map(() => '?').join(', ');
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [claimed] = await conn.query(
        `SELECT (
           EXISTS(
             SELECT 1 FROM user_achievements
              WHERE user_id = ? AND achievement_key IN (${entitlementPlaceholders}) AND claimed_at IS NOT NULL
           ) OR EXISTS(
             SELECT 1 FROM points_log
              WHERE user_id = ? AND reason = 'achievement' AND ref IN (${entitlementPlaceholders})
           )
         ) AS claimed`,
        [userId, ...entitlementKeys, userId, ...entitlementKeys],
      );
      if (!Boolean(Number(claimed[0]?.claimed))) {
        await conn.rollback();
        return { ok: false, reason: 'not_owned', msg: '未拥有该装扮' };
      }
      await conn.query('INSERT IGNORE INTO user_cosmetics (user_id, cosmetic_id) VALUES (?, ?)', [userId, frameId]);
      await conn.query('UPDATE user_growth SET equipped_frame = ? WHERE user_id = ?', [frameId, userId]);
      await conn.commit();
      return { ok: true, equipped: frameId };
    } catch (error) {
      try {
        await conn.rollback();
      } catch {
        // 回滚失败仅保留原始错误，由上层统一记录。
      }
      throw error;
    } finally {
      conn.release();
    }
  }
  if (!owned.length) return { ok: false, reason: 'not_owned', msg: '未拥有该装扮' };
  await pool.query('UPDATE user_growth SET equipped_frame = ? WHERE user_id = ?', [frameId, userId]);
  return { ok: true, equipped: frameId };
}

export async function getEquippedFrame(userId) {
  const [rows] = await pool.query('SELECT equipped_frame FROM user_growth WHERE user_id = ? LIMIT 1', [userId]);
  return rows[0]?.equipped_frame || null;
}
