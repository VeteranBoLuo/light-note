import pool from '../db/index.js';

// 本地日期键(YYYYMMDD,本地时区),口径与 growth/aiQuota 的 dayKey 一致。
// 单独实现是为了不 import growth/aiQuota —— 否则 growth→points→aiQuota→growth 会循环依赖。
function dayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

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

export async function ensurePointsSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS points_log (
      id BIGINT NOT NULL AUTO_INCREMENT,
      user_id VARCHAR(64) NOT NULL,
      delta INT NOT NULL COMMENT '正=赚 负=花',
      reason VARCHAR(32) NOT NULL COMMENT 'checkin/quest/buy/admin',
      ref VARCHAR(64) DEFAULT NULL COMMENT '按天幂等用(YYYYMMDD)或商品 id',
      create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_user_reason_ref (user_id, reason, ref)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='积分流水'
  `);
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='购买的当日 AI 额度加成'
  `);
  if (await columnMissing('user_growth', 'points')) {
    await pool.query('ALTER TABLE `user_growth` ADD COLUMN `points` INT NOT NULL DEFAULT 0 COMMENT "积分余额"');
  }
  if (await columnMissing('user_growth', 'equipped_title')) {
    await pool.query('ALTER TABLE `user_growth` ADD COLUMN `equipped_title` VARCHAR(64) DEFAULT NULL COMMENT "已佩戴称号 id"');
  }
}

// ============================================================================
// 商店目录(单一事实源)。type: consumable(可反复买) / title(一次性称号)
// ============================================================================
export const SHOP_ITEMS = [
  { id: 'makeup_card', type: 'consumable', name: '补签卡', desc: '补回一天漏签,守护连续签到', cost: 200, effect: 'makeup_card' },
  { id: 'ai_pack', type: 'consumable', name: 'AI 加油包', desc: '今日 AI 额度 +30 万 tokens(当天有效)', cost: 150, effect: 'ai_pack', bonusTokens: 300_000 },
  { id: 'title_collector', type: 'title', name: '藏书家', desc: '称号 · 收藏成癖', cost: 300, minLevel: 0 },
  { id: 'title_writer', type: 'title', name: '笔耕不辍', desc: '称号 · 笔记不停', cost: 500, minLevel: 3 },
  { id: 'title_cloud', type: 'title', name: '云端行者', desc: '称号 · 云上安家', cost: 600, minLevel: 4 },
  { id: 'title_wellread', type: 'title', name: '博览群书', desc: '称号 · 学富五车', cost: 900, minLevel: 6 },
  { id: 'title_ferryman', type: 'title', name: '知识摆渡人', desc: '称号 · 渡人渡己', cost: 1400, minLevel: 10 },
  { id: 'title_grandmaster', type: 'title', name: '一代宗师', desc: '称号 · 登峰造极', cost: 2500, minLevel: 14 },
];

export function getShopItem(id) {
  return SHOP_ITEMS.find((i) => i.id === id) || null;
}

// ============================================================================
export async function getPoints(userId) {
  const [rows] = await pool.query('SELECT points FROM user_growth WHERE user_id = ? LIMIT 1', [userId]);
  return Number(rows[0]?.points || 0);
}

// 赚取积分。ref 非空时按 (user_id, reason, ref) 幂等(签到/任务按天只发一次)。
// 需在调用方已确保 user_growth 行存在;可传入事务连接 conn。
export async function earnPoints(userId, amount, reason, ref = null, conn = pool) {
  if (!userId || !(amount > 0)) return false;
  if (ref) {
    const [ex] = await conn.query(
      'SELECT 1 FROM points_log WHERE user_id = ? AND reason = ? AND ref = ? LIMIT 1',
      [userId, reason, ref],
    );
    if (ex.length) return false; // 已发过
  }
  await conn.query('INSERT INTO points_log (user_id, delta, reason, ref) VALUES (?, ?, ?, ?)', [userId, amount, reason, ref]);
  await conn.query('UPDATE user_growth SET points = points + ? WHERE user_id = ?', [amount, userId]);
  return true;
}

export async function getOwnedCosmetics(userId) {
  const [rows] = await pool.query('SELECT cosmetic_id FROM user_cosmetics WHERE user_id = ?', [userId]);
  return rows.map((r) => r.cosmetic_id);
}

export async function getEquippedTitle(userId) {
  const [rows] = await pool.query('SELECT equipped_title FROM user_growth WHERE user_id = ? LIMIT 1', [userId]);
  return rows[0]?.equipped_title || null;
}

// 购买:事务内校验余额/等级/上限/是否已拥有 → 扣分 → 生效 → 记流水
// userRole 用于 root 豁免等级门:root 不走 grantExp,其 level 列停在默认值(视为满级)
export async function buyItem(userId, itemId, { userRole = null } = {}) {
  const item = getShopItem(itemId);
  if (!item) return { ok: false, reason: 'not_found', msg: '商品不存在' };
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      'SELECT points, level, streak_protect_cards FROM user_growth WHERE user_id = ? FOR UPDATE',
      [userId],
    );
    const g = rows[0];
    if (!g) {
      await conn.rollback();
      return { ok: false, reason: 'no_growth', msg: '成长数据未初始化,先签到试试' };
    }
    if (item.minLevel && userRole !== 'root' && Number(g.level) < item.minLevel) {
      await conn.rollback();
      return { ok: false, reason: 'level', msg: `需达到 Lv.${item.minLevel} 才能兑换` };
    }
    if (item.type === 'title') {
      const [owned] = await conn.query('SELECT 1 FROM user_cosmetics WHERE user_id = ? AND cosmetic_id = ? LIMIT 1', [userId, item.id]);
      if (owned.length) {
        await conn.rollback();
        return { ok: false, reason: 'owned', msg: '已拥有该称号' };
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
    await conn.query('INSERT INTO points_log (user_id, delta, reason, ref) VALUES (?, ?, ?, ?)', [userId, -item.cost, 'buy', item.id]);
    if (item.effect === 'makeup_card') {
      await conn.query('UPDATE user_growth SET streak_protect_cards = LEAST(2, streak_protect_cards + 1) WHERE user_id = ?', [userId]);
    } else if (item.effect === 'ai_pack') {
      // 直接写当日额度加成表(aiQuota 只读它);不 import aiQuota,避免循环依赖
      await conn.query(
        'INSERT INTO ai_daily_bonus (user_id, day, bonus_tokens) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE bonus_tokens = bonus_tokens + ?',
        [userId, dayKey(), item.bonusTokens, item.bonusTokens],
      );
    } else if (item.type === 'title') {
      await conn.query('INSERT IGNORE INTO user_cosmetics (user_id, cosmetic_id) VALUES (?, ?)', [userId, item.id]);
    }
    await conn.commit();
    const [nb] = await pool.query('SELECT points FROM user_growth WHERE user_id = ? LIMIT 1', [userId]);
    return { ok: true, points: Number(nb[0]?.points || 0), item: item.id, type: item.type };
  } catch (e) {
    try {
      await conn.rollback();
    } catch {
      /* ignore */
    }
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
  const [owned] = await pool.query('SELECT 1 FROM user_cosmetics WHERE user_id = ? AND cosmetic_id = ? LIMIT 1', [userId, titleId]);
  if (!owned.length) return { ok: false, reason: 'not_owned', msg: '未拥有该称号' };
  await pool.query('UPDATE user_growth SET equipped_title = ? WHERE user_id = ?', [titleId, userId]);
  return { ok: true, equipped: titleId };
}

// 称号 id → 显示名(前端展示佩戴的称号名)
export function titleName(id) {
  const it = getShopItem(id);
  return it && it.type === 'title' ? it.name : null;
}
