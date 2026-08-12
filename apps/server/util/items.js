import pool from '../db/index.js';

// ============================================================================
// 物品系统(背包)。统一"消耗品"的发放/持有/使用口径,是「我的成长」长期扩展的地基。
//
// 设计分野(关键):
//  - 即时生效类(积分/经验/永久扩容):抽中/领取即到账,不进背包 —— 仍走各自幂等函数
//    (earnPoints/earnStorage/grantExp),在「我的资产」展示。此文件不接管它们。
//  - AI 加油包已改为 user_growth.ai_bonus_tokens 永久余额，新获得的包即时到账；
//    user_item 中仅可能保留历史包，用户点一次即可转入永久余额。
//
//  补签卡是特例:逻辑成熟(上限 2、最近 3 个自然日补签、续连签),存储沿用 user_growth.streak_protect_cards,
//  "使用"仍走 growth.useProtectCard(需要"可补漏签日期"这个上下文)。这里只集中它的"发放写入口径"
//  (grantItem)与"背包展示"(getInventory),不迁移其存储与使用流程,避免动到已验证的连签逻辑。
//
//  新增消耗品时:在 CONSUMABLES 加一条 + (如需特殊生效)在 useItem 加一个分支即可,发放/展示全通用。
// ============================================================================

// 消耗品注册表(单一事实源)。backing: 'user_item'=存背包表 / 'card_column'=沿用 streak_protect_cards。
export const CONSUMABLES = {
  ai_pack: {
    id: 'ai_pack',
    name: 'AI 加油包',
    icon: 'ai',
    backing: 'user_item',
    effect: 'ai_tokens',
    tokens: 600_000,
    desc: '历史加油包。转入后成为永久 AI 余额，每日等级额度用完后自动使用。',
    action: 'use', // 前端:直接「使用」
  },
  makeup_card: {
    id: 'makeup_card',
    name: '补签卡',
    icon: 'checkin',
    backing: 'card_column',
    stackMax: 2,
    desc: '可补最近 3 个自然日内的漏签、续上连签(上限 2 张)。补签不发经验、积分或额外奖励。',
    action: 'makeup', // 前端:走「补签」(最近 3 个自然日内有漏签且有卡时可用)
  },
};

export function getConsumable(id) {
  return CONSUMABLES[id] || null;
}

/**
 * 统一发放入口(写入,不校验余额/成本 —— 调用方负责扣费)。可传事务连接 conn 在同一事务内执行。
 * 供抽奖/商店/签到/成就等所有"发消耗品"的地方复用,集中口径。
 * @param conn 事务连接(可选;不传则用连接池)
 * @param userId 目标用户
 * @param itemId 物品 id(见 CONSUMABLES)
 * @param qty 数量(默认 1)
 */
export async function grantItem(conn, userId, itemId, qty = 1) {
  const def = CONSUMABLES[itemId];
  if (!def) throw new Error(`grantItem: 未知物品 ${itemId}`);
  const db = conn || pool;
  const n = Math.trunc(Number(qty) || 0);
  if (n <= 0) return { ok: false, reason: 'bad_qty' };
  if (def.backing === 'card_column') {
    // 返回实际到账量，调用方可对满仓溢出做显式补偿。事务调用时 FOR UPDATE 也会串行化抽奖/兑换。
    const stackMax = def.stackMax || 2;
    const [[row]] = await db.query(
      'SELECT streak_protect_cards AS qty FROM user_growth WHERE user_id = ? FOR UPDATE',
      [userId],
    );
    if (!row) return { ok: false, reason: 'growth_missing', itemId, qty: 0, overflowQty: n };
    const before = Number(row.qty || 0);
    const grantedQty = Math.max(0, Math.min(n, stackMax - before));
    if (grantedQty > 0) {
      await db.query('UPDATE user_growth SET streak_protect_cards = streak_protect_cards + ? WHERE user_id = ?', [
        grantedQty,
        userId,
      ]);
    }
    return {
      ok: true,
      itemId,
      qty: grantedQty,
      requestedQty: n,
      overflowQty: n - grantedQty,
      backing: 'card_column',
    };
  }
  // 其余消耗品:进背包 user_item,可叠加
  await db.query(
    'INSERT INTO user_item (user_id, item_id, qty) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE qty = qty + VALUES(qty)',
    [userId, itemId, n],
  );
  return { ok: true, itemId, qty: n, backing: 'user_item' };
}

/**
 * 使用一件背包消耗品(仅 backing==='user_item' 的物品;补签卡请走 growth.useProtectCard)。
 * 事务内:占用 1 件 → 生效。数量不足则失败。
 */
export async function useItem(userId, itemId) {
  const def = CONSUMABLES[itemId];
  if (!def) return { ok: false, reason: 'not_found', msg: '物品不存在' };
  if (def.backing !== 'user_item') return { ok: false, reason: 'unsupported', msg: '该物品不能在此使用' };
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT qty FROM user_item WHERE user_id = ? AND item_id = ? FOR UPDATE', [userId, itemId]);
    const qty = Number(rows[0]?.qty || 0);
    if (qty < 1) {
      await conn.rollback();
      return { ok: false, reason: 'empty', msg: '数量不足' };
    }
    await conn.query('UPDATE user_item SET qty = qty - 1 WHERE user_id = ? AND item_id = ?', [userId, itemId]);
    // 历史 AI 加油包兼容：从旧背包转入永久余额，不再写按天过期的 ai_daily_bonus。
    if (def.effect === 'ai_tokens') {
      await conn.query('UPDATE user_growth SET ai_bonus_tokens = ai_bonus_tokens + ? WHERE user_id = ?', [
        def.tokens,
        userId,
      ]);
    }
    await conn.commit();
    return { ok: true, itemId, remaining: qty - 1, effect: def.effect, amount: def.tokens || 0 };
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

/**
 * 背包 + 资产总览(供「我的物品 / 我的资产」展示)。
 *  - items:已知消耗品列表(含数量,0 也列出以告知其存在)。
 *  - assets:即时生效类的当前存量(积分余额、永久扩容、永久 AI 加油余额)。
 */
export async function getInventory(userId) {
  const empty = { items: [], assets: { points: 0, storageBonusMb: 0, aiBonusTokens: 0 } };
  if (!userId || userId === 'visitor') return empty;
  const [itemRows] = await pool.query('SELECT item_id, qty FROM user_item WHERE user_id = ? AND qty > 0', [userId]);
  const qtyMap = Object.fromEntries(itemRows.map((r) => [r.item_id, Number(r.qty)]));
  const [[g]] = await pool.query(
    'SELECT points, storage_bonus_mb, streak_protect_cards, ai_bonus_tokens FROM user_growth WHERE user_id = ? LIMIT 1',
    [userId],
  );
  const qtyOf = (id) => (id === 'makeup_card' ? Number(g?.streak_protect_cards || 0) : qtyMap[id] || 0);
  const items = Object.values(CONSUMABLES).map((def) => ({
    id: def.id,
    name: def.name,
    icon: def.icon,
    desc: def.desc,
    qty: qtyOf(def.id),
    action: def.action, // 'use' | 'makeup'
  }));
  return {
    items,
    assets: {
      points: Number(g?.points || 0),
      storageBonusMb: Number(g?.storage_bonus_mb || 0),
      aiBonusTokens: Number(g?.ai_bonus_tokens || 0),
    },
  };
}
