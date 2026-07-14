import pool from '../db/index.js';
import { grantItem } from './items.js';

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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='当日 AI 额度加成(使用 AI 加油包/历史购买 写入,aiQuota 只读)'
  `);
  // 背包:用户持有的消耗品(AI 加油包等)。补签卡为特例,仍存 user_growth.streak_protect_cards,不入此表。
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_item (
      user_id VARCHAR(64) NOT NULL,
      item_id VARCHAR(64) NOT NULL,
      qty INT NOT NULL DEFAULT 0,
      update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, item_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户持有的消耗品(背包)'
  `);
  if (await columnMissing('user_growth', 'points')) {
    await pool.query('ALTER TABLE `user_growth` ADD COLUMN `points` INT NOT NULL DEFAULT 0 COMMENT "积分余额"');
  }
  if (await columnMissing('user_growth', 'equipped_title')) {
    await pool.query('ALTER TABLE `user_growth` ADD COLUMN `equipped_title` VARCHAR(64) DEFAULT NULL COMMENT "已佩戴称号 id"');
  }
  if (await columnMissing('user_growth', 'storage_bonus_mb')) {
    await pool.query('ALTER TABLE `user_growth` ADD COLUMN `storage_bonus_mb` INT NOT NULL DEFAULT 0 COMMENT "积分兑换的永久扩容(MB),叠加在段位基础配额之上"');
  }
  if (await columnMissing('user_growth', 'lottery_count')) {
    await pool.query('ALTER TABLE `user_growth` ADD COLUMN `lottery_count` INT NOT NULL DEFAULT 0 COMMENT "累计抽奖次数(用于每10抽保底)"');
  }
  if (await columnMissing('user_growth', 'lottery_free_day')) {
    await pool.query('ALTER TABLE `user_growth` ADD COLUMN `lottery_free_day` CHAR(8) DEFAULT NULL COMMENT "上次使用每日免费抽奖的日期 YYYYMMDD"');
  }
  if (await columnMissing('user_growth', 'lottery_free_used')) {
    await pool.query('ALTER TABLE `user_growth` ADD COLUMN `lottery_free_used` INT NOT NULL DEFAULT 0 COMMENT "当日已用的免费抽奖次数"');
  }
  if (await columnMissing('user_growth', 'equipped_frame')) {
    await pool.query('ALTER TABLE `user_growth` ADD COLUMN `equipped_frame` VARCHAR(64) DEFAULT NULL COMMENT "已佩戴头像框装扮 id"');
  }
}

// ============================================================================
// 商店目录(单一事实源)。type: consumable(可反复买) / title(一次性称号)
// ============================================================================
export const SHOP_ITEMS = [
  // 补签卡不再上架:连签满7天/升级/里程碑/抽奖均可免费获得且封顶2张,付费购买无意义(见记忆 light-note-points)。
  // buyItem 仍保留 effect==='makeup_card' 分支以兼容历史,但目录已无此项,正常不可购得。
  { id: 'ai_pack', type: 'consumable', name: 'AI 加油包', desc: '+30 万 tokens · 存入背包,择时「使用」当天生效(不再当天不用即作废)', cost: 150, effect: 'ai_pack', bonusTokens: 300_000 },
  { id: 'storage_512', type: 'consumable', name: '扩容包 512MB', desc: '云空间永久 +512MB,叠加在等级配额之上', cost: 800, effect: 'storage', storageMb: 512 },
  { id: 'storage_2g', type: 'consumable', name: '扩容包 2GB', desc: '云空间永久 +2GB,大文件党首选', cost: 2500, effect: 'storage', storageMb: 2048 },
  // 专属称号已下架:称号仅本人可见、无公开展示价值,故移除兑换入口(buyItem/equipTitle 仍兼容 type==='title' 历史数据,目录不再上架)。
  // 头像框装扮(type=cosmetic,effect=frame):一次性拥有、可佩戴,前端按 id 渲染样式
  { id: 'frame_gold', type: 'cosmetic', effect: 'frame', name: '鎏金', desc: '头像框 · 金光流转', cost: 500, minLevel: 0 },
  { id: 'frame_sakura', type: 'cosmetic', effect: 'frame', name: '樱绯', desc: '头像框 · 樱色浪漫', cost: 500, minLevel: 0 },
  { id: 'frame_neon', type: 'cosmetic', effect: 'frame', name: '霓虹', desc: '头像框 · 赛博霓虹', cost: 500, minLevel: 0 },
  { id: 'frame_galaxy', type: 'cosmetic', effect: 'frame', name: '星河', desc: '头像框 · 流光星河', cost: 1200, minLevel: 8 },
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
    // 原子幂等:INSERT ... WHERE NOT EXISTS —— 靠 idx_user_reason_ref 的间隙锁串行化并发同 (user,reason,ref) 请求,
    // affectedRows=0 表示已发过(不再走"先 SELECT 再 INSERT"的非原子判断,修复无行锁 claim 入口的并发双领)。
    const [ins] = await conn.query(
      `INSERT INTO points_log (user_id, delta, reason, ref)
       SELECT ?, ?, ?, ? FROM DUAL
       WHERE NOT EXISTS (SELECT 1 FROM points_log WHERE user_id = ? AND reason = ? AND ref = ?)`,
      [userId, amount, reason, ref, userId, reason, ref],
    );
    if (!ins.affectedRows) return false; // 已发过
    await conn.query('UPDATE user_growth SET points = points + ? WHERE user_id = ?', [amount, userId]);
    return true;
  }
  await conn.query('INSERT INTO points_log (user_id, delta, reason, ref) VALUES (?, ?, ?, ?)', [userId, amount, reason, null]);
  await conn.query('UPDATE user_growth SET points = points + ? WHERE user_id = ?', [amount, userId]);
  return true;
}

// 永久扩容(MB)。同 earnPoints 语义:ref 非空时按 (user_id, 'storage:'+reason, ref) 幂等,防里程碑重复发放。
// 用 points_log 记一条 delta=0 的审计流水(reason 前缀 storage: 区分,不影响积分余额)。需调用方已确保行存在;可传事务连接。
export async function earnStorage(userId, mb, reason, ref = null, conn = pool) {
  if (!userId || !(mb > 0)) return false;
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
  await conn.query('INSERT INTO points_log (user_id, delta, reason, ref) VALUES (?, 0, ?, ?)', [userId, logReason, null]);
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
export async function getPointsLog(userId, { limit = 30, offset = 0 } = {}) {
  const lim = Math.min(100, Math.max(1, Number(limit) || 30));
  const off = Math.max(0, Number(offset) || 0); // lim/off 已 clamp 为整数,直接内插避免 LIMIT 占位符类型坑
  // 排除 ach_unlock:那是成就"永久解锁"的内部标记(delta=0),非积分流水,不该出现在用户明细里
  const [rows] = await pool.query(
    `SELECT delta, reason, ref, create_time FROM points_log WHERE user_id = ? AND reason <> 'ach_unlock' ORDER BY id DESC LIMIT ${lim} OFFSET ${off}`,
    [userId],
  );
  const [[c]] = await pool.query("SELECT COUNT(*) AS c FROM points_log WHERE user_id = ? AND reason <> 'ach_unlock'", [userId]);
  return { rows, total: Number(c.c || 0), limit: lim, offset: off };
}

// 经济总览(root 运营):发放/消耗/存量、按来源分布、抽奖返还率、持有人 Top。
export async function getPointsOverview() {
  const [[issued]] = await pool.query('SELECT COALESCE(SUM(delta),0) AS s FROM points_log WHERE delta > 0');
  const [[spent]] = await pool.query('SELECT COALESCE(SUM(-delta),0) AS s FROM points_log WHERE delta < 0');
  const [[outstanding]] = await pool.query('SELECT COALESCE(SUM(points),0) AS s FROM user_growth');
  const [byReason] = await pool.query('SELECT reason, COALESCE(SUM(delta),0) AS delta, COUNT(*) AS cnt FROM points_log GROUP BY reason ORDER BY ABS(SUM(delta)) DESC');
  const [[lotCost]] = await pool.query("SELECT COALESCE(SUM(-delta),0) AS s FROM points_log WHERE reason='lottery_cost'");
  const [[lotWin]] = await pool.query("SELECT COALESCE(SUM(delta),0) AS s FROM points_log WHERE reason='lottery_win'");
  const [[lotDraws]] = await pool.query('SELECT COALESCE(SUM(lottery_count),0) AS s FROM user_growth');
  const [[holders]] = await pool.query('SELECT COUNT(*) AS c FROM user_growth WHERE points > 0');
  const [top] = await pool.query(
    'SELECT g.user_id, g.points, u.alias, u.email FROM user_growth g LEFT JOIN user u ON u.id = g.user_id WHERE g.points > 0 ORDER BY g.points DESC LIMIT 10',
  );
  const cost = Number(lotCost.s);
  return {
    issued: Number(issued.s),
    spent: Number(spent.s),
    outstanding: Number(outstanding.s),
    byReason: byReason.map((r) => ({ reason: r.reason, delta: Number(r.delta), cnt: Number(r.cnt) })),
    lottery: { cost, winPoints: Number(lotWin.s), draws: Number(lotDraws.s), payoutRatio: cost > 0 ? +((Number(lotWin.s) / cost) * 100).toFixed(1) : 0 },
    holders: Number(holders.c),
    top: top.map((r) => ({ userId: r.user_id, points: Number(r.points), alias: r.alias || null, email: r.email || null })),
  };
}

// 运营手动发放/扣减(root):points 可正可负(下限 0);storageMb 追加;cards 增减(封顶 2)。
export async function adminGrantPoints(userId, { points = 0, cards = 0, storageMb = 0, note = '' } = {}) {
  const [rows] = await pool.query('SELECT 1 FROM user_growth WHERE user_id = ? LIMIT 1', [userId]);
  if (!rows.length) await pool.query('INSERT INTO user_growth (user_id) VALUES (?)', [userId]);
  const ref = ('admin:' + (note || '')).slice(0, 64);
  const p = Math.trunc(Number(points) || 0);
  const s = Math.trunc(Number(storageMb) || 0);
  const c = Math.trunc(Number(cards) || 0);
  if (p) {
    await pool.query('INSERT INTO points_log (user_id, delta, reason, ref) VALUES (?, ?, ?, ?)', [userId, p, 'admin', ref]);
    await pool.query('UPDATE user_growth SET points = GREATEST(0, points + ?) WHERE user_id = ?', [p, userId]);
  }
  if (s) {
    await pool.query("INSERT INTO points_log (user_id, delta, reason, ref) VALUES (?, 0, 'storage:admin', ?)", [userId, ref]);
    await pool.query('UPDATE user_growth SET storage_bonus_mb = GREATEST(0, storage_bonus_mb + ?) WHERE user_id = ?', [s, userId]);
  }
  if (c) {
    await pool.query('UPDATE user_growth SET streak_protect_cards = LEAST(2, GREATEST(0, streak_protect_cards + ?)) WHERE user_id = ?', [c, userId]);
  }
  const [[g]] = await pool.query('SELECT points, storage_bonus_mb, streak_protect_cards FROM user_growth WHERE user_id = ? LIMIT 1', [userId]);
  return { ok: true, points: Number(g.points), storageBonusMb: Number(g.storage_bonus_mb), cards: Number(g.streak_protect_cards) };
}

// 单账号积分详情(root 查账):余额 + 最近 30 条流水。
export async function getUserPointsDetail(userId) {
  const [[u]] = await pool.query('SELECT alias, email FROM user WHERE id = ? LIMIT 1', [userId]);
  const [[g]] = await pool.query('SELECT points, storage_bonus_mb, streak_protect_cards, lottery_count FROM user_growth WHERE user_id = ? LIMIT 1', [userId]);
  const { rows } = await getPointsLog(userId, { limit: 30 });
  return {
    user: u ? { alias: u.alias || null, email: u.email || null } : null,
    balance: g ? { points: Number(g.points), storageBonusMb: Number(g.storage_bonus_mb), cards: Number(g.streak_protect_cards), lotteryCount: Number(g.lottery_count) } : null,
    log: rows,
  };
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
    if (item.type === 'title' || item.type === 'cosmetic') {
      const [owned] = await conn.query('SELECT 1 FROM user_cosmetics WHERE user_id = ? AND cosmetic_id = ? LIMIT 1', [userId, item.id]);
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
    await conn.query('INSERT INTO points_log (user_id, delta, reason, ref) VALUES (?, ?, ?, ?)', [userId, -item.cost, 'buy', item.id]);
    if (item.effect === 'makeup_card') {
      await grantItem(conn, userId, 'makeup_card', 1);
    } else if (item.effect === 'storage') {
      // 永久扩容:即时生效类,直接叠加(可反复购买;无幂等 ref,每次都加)
      await conn.query('UPDATE user_growth SET storage_bonus_mb = storage_bonus_mb + ? WHERE user_id = ?', [item.storageMb, userId]);
    } else if (item.effect === 'ai_pack') {
      // AI 加油包 → 进背包(消耗品),用户择时「使用」才加当日额度;不再"购买即当天生效、当天不用作废"
      await grantItem(conn, userId, 'ai_pack', 1);
    } else if (item.type === 'title' || item.type === 'cosmetic') {
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

// 佩戴/卸下头像框:frameId 为空=卸下;非空须已拥有
export async function equipFrame(userId, frameId) {
  if (!frameId) {
    await pool.query('UPDATE user_growth SET equipped_frame = NULL WHERE user_id = ?', [userId]);
    return { ok: true, equipped: null };
  }
  const [owned] = await pool.query('SELECT 1 FROM user_cosmetics WHERE user_id = ? AND cosmetic_id = ? LIMIT 1', [userId, frameId]);
  if (!owned.length) return { ok: false, reason: 'not_owned', msg: '未拥有该装扮' };
  await pool.query('UPDATE user_growth SET equipped_frame = ? WHERE user_id = ?', [frameId, userId]);
  return { ok: true, equipped: frameId };
}

export async function getEquippedFrame(userId) {
  const [rows] = await pool.query('SELECT equipped_frame FROM user_growth WHERE user_id = ? LIMIT 1', [userId]);
  return rows[0]?.equipped_frame || null;
}
