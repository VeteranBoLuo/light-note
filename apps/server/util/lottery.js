import pool from '../db/index.js';
import { levelForExp } from './growth.js';
import { grantItem } from './items.js';

// 积分抽奖·盲盒。纯积分消耗池(健康的积分出口):单抽 88 / 十连 800(省 80)。
// 每 10 抽保底一次稀有(补签卡/AI包/存储);奖池期望值 < 单抽成本,长期是净消耗,但用稀有大奖制造惊喜。
// 复用 points 的落库口径:积分走 points_log,存储走 storage_bonus_mb,补签卡走上限 2,AI 包走 ai_daily_bonus。
// 每日免费抽奖次数随等级递增(把「升级」直接变成「解锁更多免费抽」),是等级权益与抽奖的粘合点。

export const DRAW_COST = 88;
export const TEN_DRAW_COST = 800;
const PITY_EVERY = 10; // 每第 N 抽保底稀有

// 每日免费抽奖次数(随等级解锁):Lv1-2 无 → Lv3-5:1 → Lv6-9:2 → Lv10-14:3 → 满级:5。
export function freeDrawsFor(level) {
  const lv = Number(level) || 1;
  if (lv >= 15) return 5;
  if (lv >= 10) return 3;
  if (lv >= 6) return 2;
  if (lv >= 3) return 1;
  return 0;
}

// 据 exp + 角色解析等级(root 视为满级),供免费次数计算
function levelOf(exp, userRole) {
  return userRole === 'root' ? 15 : levelForExp(Number(exp) || 0);
}

function dayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

// 奖池:weight 为权重(相对值);tier=rare 的项参与保底。kind 决定发奖方式。
// 展示名/图标在前端按 id 映射 i18n;此处 name 仅作兜底与日志。
export const LOTTERY_POOL = [
  { id: 'p10', kind: 'points', amount: 10, name: '+10 积分', weight: 380 },
  { id: 'p30', kind: 'points', amount: 30, name: '+30 积分', weight: 300 },
  { id: 'p70', kind: 'points', amount: 70, name: '+70 积分', weight: 130 },
  { id: 'card', kind: 'card', amount: 1, name: '补签卡 ×1', weight: 60, tier: 'rare' },
  { id: 'ai', kind: 'ai_pack', amount: 300_000, name: 'AI 加油包', weight: 80, tier: 'rare' },
  { id: 's128', kind: 'storage', amount: 128, name: '扩容 +128MB', weight: 45, tier: 'rare' },
  { id: 's512', kind: 'storage', amount: 512, name: '扩容 +512MB(大奖)', weight: 5, tier: 'rare' },
];

const TOTAL_WEIGHT = LOTTERY_POOL.reduce((s, x) => s + x.weight, 0);
const RARE_POOL = LOTTERY_POOL.filter((x) => x.tier === 'rare');
const RARE_WEIGHT = RARE_POOL.reduce((s, x) => s + x.weight, 0);

function pickFrom(pool, totalWeight) {
  let r = Math.random() * totalWeight;
  for (const item of pool) {
    r -= item.weight;
    if (r < 0) return item;
  }
  return pool[pool.length - 1];
}

// 单次抽取:drawIndex 为本次抽奖里的全局序号(用于保底判定)
function rollOne(drawIndex) {
  if (drawIndex % PITY_EVERY === 0) return pickFrom(RARE_POOL, RARE_WEIGHT); // 保底:第 N 抽必稀有
  return pickFrom(LOTTERY_POOL, TOTAL_WEIGHT);
}

// 在事务内发放单个奖励(积分/存储/补签卡/AI包)。返回落库明细(前端展示用)。
async function grantReward(conn, userId, prize) {
  if (prize.kind === 'points') {
    await conn.query('INSERT INTO points_log (user_id, delta, reason, ref) VALUES (?, ?, ?, ?)', [userId, prize.amount, 'lottery_win', prize.id]);
    await conn.query('UPDATE user_growth SET points = points + ? WHERE user_id = ?', [prize.amount, userId]);
  } else if (prize.kind === 'storage') {
    await conn.query('INSERT INTO points_log (user_id, delta, reason, ref) VALUES (?, 0, ?, ?)', [userId, 'lottery_storage', prize.id]);
    await conn.query('UPDATE user_growth SET storage_bonus_mb = storage_bonus_mb + ? WHERE user_id = ?', [prize.amount, userId]);
  } else if (prize.kind === 'card') {
    // 补签卡:统一走 grantItem(上限 2;已满则本次不叠加,概率低可接受)
    await grantItem(conn, userId, 'makeup_card', prize.amount);
  } else if (prize.kind === 'ai_pack') {
    // AI 加油包 → 进背包(发 1 件),用户择时「使用」才加当日额度;不再抽中即当天生效、当天不用作废
    await grantItem(conn, userId, 'ai_pack', 1);
  }
  return { id: prize.id, kind: prize.kind, amount: prize.amount, name: prize.name };
}

/**
 * 抽奖。times=1 单抽 / 10 十连。事务内:校验余额 → 扣分 → 逐抽(含保底)→ 发奖 → 累计次数。
 * @returns {{ok:boolean, reason?:string, msg?:string, cost?:number, points?:number, results?:Array}}
 */
export async function drawLottery(userId, { times = 1, free = false, userRole = null } = {}) {
  const n = free ? 1 : times >= 10 ? 10 : 1; // 免费仅单抽
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      'SELECT points, exp, lottery_count, lottery_free_day, lottery_free_used FROM user_growth WHERE user_id = ? FOR UPDATE',
      [userId],
    );
    const g = rows[0];
    if (!g) {
      await conn.rollback();
      return { ok: false, reason: 'no_growth', msg: '成长数据未初始化,先签到试试' };
    }
    const today = dayKey();
    let cost = free ? 0 : n === 10 ? TEN_DRAW_COST : DRAW_COST;
    if (free) {
      // 免费抽:校验今日剩余免费次数(随等级)
      const allowance = freeDrawsFor(levelOf(g.exp, userRole));
      const usedToday = g.lottery_free_day === today ? Number(g.lottery_free_used) || 0 : 0;
      if (usedToday >= allowance) {
        await conn.rollback();
        return { ok: false, reason: 'no_free', msg: '今日免费次数已用完' };
      }
      await conn.query('UPDATE user_growth SET lottery_free_day = ?, lottery_free_used = ? WHERE user_id = ?', [today, usedToday + 1, userId]);
      await conn.query("INSERT INTO points_log (user_id, delta, reason, ref) VALUES (?, 0, 'lottery_free', ?)", [userId, today]);
    } else {
      if (Number(g.points) < cost) {
        await conn.rollback();
        return { ok: false, reason: 'insufficient', msg: '积分不足' };
      }
      await conn.query('UPDATE user_growth SET points = points - ? WHERE user_id = ?', [cost, userId]);
      await conn.query('INSERT INTO points_log (user_id, delta, reason, ref) VALUES (?, ?, ?, ?)', [userId, -cost, 'lottery_cost', n === 10 ? 'x10' : 'x1']);
    }
    // 逐抽(全局序号 = 历史累计 + 本次序,用于保底命中)
    const baseCount = Number(g.lottery_count) || 0;
    const results = [];
    for (let i = 1; i <= n; i++) {
      const prize = rollOne(baseCount + i);
      results.push(await grantReward(conn, userId, prize));
    }
    await conn.query('UPDATE user_growth SET lottery_count = lottery_count + ? WHERE user_id = ?', [n, userId]);
    await conn.commit();
    const [nb] = await pool.query('SELECT points FROM user_growth WHERE user_id = ? LIMIT 1', [userId]);
    return { ok: true, cost, free, points: Number(nb[0]?.points || 0), results };
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

// 抽奖页初始数据:余额、成本、已抽次数、距下次保底、每日免费次数(随等级)、奖池(供前端公示概率)
export async function getLotteryStatus(userId, { userRole = null } = {}) {
  let points = 0;
  let count = 0;
  let exp = 0;
  let freeDay = null;
  let freeUsed = 0;
  if (userId && userId !== 'visitor') {
    const [rows] = await pool.query(
      'SELECT points, exp, lottery_count, lottery_free_day, lottery_free_used FROM user_growth WHERE user_id = ? LIMIT 1',
      [userId],
    );
    if (rows[0]) {
      points = Number(rows[0].points || 0);
      count = Number(rows[0].lottery_count || 0);
      exp = Number(rows[0].exp || 0);
      freeDay = rows[0].lottery_free_day || null;
      freeUsed = Number(rows[0].lottery_free_used || 0);
    }
  }
  const level = levelOf(exp, userRole);
  const freeDaily = freeDrawsFor(level); // 当前等级每日免费次数
  const usedToday = freeDay === dayKey() ? freeUsed : 0;
  const freeRemaining = Math.max(0, freeDaily - usedToday); // 今日剩余免费次数
  const toPity = (PITY_EVERY - (count % PITY_EVERY)) % PITY_EVERY || PITY_EVERY; // 距离下次保底还差几抽
  const prizes = LOTTERY_POOL.map((x) => ({
    id: x.id,
    kind: x.kind,
    amount: x.amount,
    name: x.name,
    rate: +((x.weight / TOTAL_WEIGHT) * 100).toFixed(2), // 百分比,公示用
    rare: x.tier === 'rare',
  }));
  return { points, count, toPity, singleCost: DRAW_COST, tenCost: TEN_DRAW_COST, pityEvery: PITY_EVERY, level, freeDaily, freeRemaining, pool: prizes };
}
