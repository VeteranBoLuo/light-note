import pool from '../db/index.js';

// 积分抽奖·盲盒。纯积分消耗池(健康的积分出口):单抽 88 / 十连 800(省 80)。
// 每 10 抽保底一次稀有(补签卡/AI包/存储);奖池期望值 < 单抽成本,长期是净消耗,但用稀有大奖制造惊喜。
// 复用 points 的落库口径:积分走 points_log,存储走 storage_bonus_mb,补签卡走上限 2,AI 包走 ai_daily_bonus。

export const DRAW_COST = 88;
export const TEN_DRAW_COST = 800;
const PITY_EVERY = 10; // 每第 N 抽保底稀有

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
    // 补签卡上限 2:已满则本次落空(不折算),概率低可接受
    await conn.query('UPDATE user_growth SET streak_protect_cards = LEAST(2, streak_protect_cards + ?) WHERE user_id = ?', [prize.amount, userId]);
  } else if (prize.kind === 'ai_pack') {
    await conn.query(
      'INSERT INTO ai_daily_bonus (user_id, day, bonus_tokens) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE bonus_tokens = bonus_tokens + ?',
      [userId, dayKey(), prize.amount, prize.amount],
    );
  }
  return { id: prize.id, kind: prize.kind, amount: prize.amount, name: prize.name };
}

/**
 * 抽奖。times=1 单抽 / 10 十连。事务内:校验余额 → 扣分 → 逐抽(含保底)→ 发奖 → 累计次数。
 * @returns {{ok:boolean, reason?:string, msg?:string, cost?:number, points?:number, results?:Array}}
 */
export async function drawLottery(userId, { times = 1 } = {}) {
  const n = times >= 10 ? 10 : 1;
  const cost = n === 10 ? TEN_DRAW_COST : DRAW_COST;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT points, lottery_count FROM user_growth WHERE user_id = ? FOR UPDATE', [userId]);
    const g = rows[0];
    if (!g) {
      await conn.rollback();
      return { ok: false, reason: 'no_growth', msg: '成长数据未初始化,先签到试试' };
    }
    if (Number(g.points) < cost) {
      await conn.rollback();
      return { ok: false, reason: 'insufficient', msg: '积分不足' };
    }
    // 扣费
    await conn.query('UPDATE user_growth SET points = points - ? WHERE user_id = ?', [cost, userId]);
    await conn.query('INSERT INTO points_log (user_id, delta, reason, ref) VALUES (?, ?, ?, ?)', [userId, -cost, 'lottery_cost', n === 10 ? 'x10' : 'x1']);
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
    return { ok: true, cost, points: Number(nb[0]?.points || 0), results };
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

// 抽奖页初始数据:余额、成本、已抽次数、距下次保底、奖池(供前端公示概率)
export async function getLotteryStatus(userId) {
  let points = 0;
  let count = 0;
  if (userId && userId !== 'visitor') {
    const [rows] = await pool.query('SELECT points, lottery_count FROM user_growth WHERE user_id = ? LIMIT 1', [userId]);
    if (rows[0]) {
      points = Number(rows[0].points || 0);
      count = Number(rows[0].lottery_count || 0);
    }
  }
  const toPity = (PITY_EVERY - (count % PITY_EVERY)) % PITY_EVERY || PITY_EVERY; // 距离下次保底还差几抽
  const prizes = LOTTERY_POOL.map((x) => ({
    id: x.id,
    kind: x.kind,
    amount: x.amount,
    name: x.name,
    rate: +((x.weight / TOTAL_WEIGHT) * 100).toFixed(2), // 百分比,公示用
    rare: x.tier === 'rare',
  }));
  return { points, count, toPity, singleCost: DRAW_COST, tenCost: TEN_DRAW_COST, pityEvery: PITY_EVERY, pool: prizes };
}
