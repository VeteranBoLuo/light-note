import { randomInt } from 'node:crypto';
import pool from '../db/index.js';
import { levelForExp } from './growth.js';
import { grantItem } from './items.js';
import { dayKeyAtOffset, getGrowthCalendarContext } from './growthPreferences.js';
import {
  freeDrawsFor as freeDrawsForCatalog,
  getEconomyRuntime,
  LEGACY_POINTS_ECONOMY_VERSION,
} from './pointsEconomyCatalog.js';
import {
  beginPointsEconomyOperation,
  completePointsEconomyOperation,
  PointsEconomyError,
} from './pointsEconomyOperations.js';

export const DRAW_COST = 170;
export const TEN_DRAW_COST = 1600;
export const MAKEUP_CARD_OVERFLOW_POINTS = 120;

export function freeDrawsFor(level, version) {
  return freeDrawsForCatalog(level, version);
}

function levelOf(exp, userRole) {
  return userRole === 'root' ? 15 : levelForExp(Number(exp) || 0);
}

function poolWeight(pool) {
  return pool.reduce((sum, item) => sum + Number(item.weight || 0), 0);
}

export function pickWeighted(pool, randomIntFn = randomInt) {
  const totalWeight = poolWeight(pool);
  if (!pool.length || !Number.isSafeInteger(totalWeight) || totalWeight <= 0) {
    throw new Error('LOTTERY_POOL_INVALID');
  }
  let cursor = randomIntFn(totalWeight);
  if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor >= totalWeight) {
    throw new Error('LOTTERY_RANDOM_OUT_OF_RANGE');
  }
  for (const item of pool) {
    cursor -= item.weight;
    if (cursor < 0) return item;
  }
  return pool[pool.length - 1];
}

function prizeRates(pool, pityPool = []) {
  const totalWeight = poolWeight(pool);
  const pityWeight = poolWeight(pityPool);
  return pool.map((item) => ({
    id: item.id,
    kind: item.kind,
    amount: item.amount,
    name: item.name,
    rate: +((item.weight / totalWeight) * 100).toFixed(2),
    normalRate: +((item.weight / totalWeight) * 100).toFixed(2),
    pityRate: item.tier === 'rare' && pityWeight ? +((item.weight / pityWeight) * 100).toFixed(2) : 0,
    rare: item.tier === 'rare',
  }));
}

async function grantReward(conn, userId, prize, { mode, version, overflowPoints }) {
  const c4 = version !== LEGACY_POINTS_ECONOMY_VERSION;
  const reasonPrefix = mode === 'free' ? 'lottery_free' : 'lottery_paid';
  if (prize.kind === 'points') {
    const reason = c4 ? `${reasonPrefix}_win` : 'lottery_win';
    await conn.query('INSERT INTO points_log (user_id, delta, reason, ref) VALUES (?, ?, ?, ?)', [
      userId,
      prize.amount,
      reason,
      prize.id,
    ]);
    await conn.query('UPDATE user_growth SET points = points + ? WHERE user_id = ?', [prize.amount, userId]);
  } else if (prize.kind === 'storage') {
    if (mode === 'free' && c4) throw new Error('FREE_LOTTERY_ASSET_POLICY_VIOLATION');
    await conn.query('UPDATE user_growth SET storage_bonus_mb = storage_bonus_mb + ? WHERE user_id = ?', [
      prize.amount,
      userId,
    ]);
    await conn.query('INSERT INTO points_log (user_id, delta, reason, ref) VALUES (?, 0, ?, ?)', [
      userId,
      c4 ? 'lottery_paid_asset' : 'lottery_storage',
      prize.id,
    ]);
  } else if (prize.kind === 'card') {
    if (mode === 'free' && c4) throw new Error('FREE_LOTTERY_ASSET_POLICY_VIOLATION');
    const grant = (await grantItem(conn, userId, 'makeup_card', prize.amount)) || {};
    if (Number(grant.overflowQty || 0) > 0) {
      const reason = c4 ? 'lottery_paid_compensation' : 'lottery_compensation';
      await conn.query('INSERT INTO points_log (user_id, delta, reason, ref) VALUES (?, ?, ?, ?)', [
        userId,
        overflowPoints,
        reason,
        'makeup_card_full',
      ]);
      await conn.query('UPDATE user_growth SET points = points + ? WHERE user_id = ?', [overflowPoints, userId]);
      return {
        id: prize.id,
        kind: 'points',
        amount: overflowPoints,
        name: `+${overflowPoints} 积分`,
        rare: true,
        compensated: true,
        compensationReason: 'makeup_card_full',
        originalReward: { kind: prize.kind, amount: prize.amount },
      };
    }
  } else if (prize.kind === 'ai_pack') {
    await conn.query('UPDATE user_growth SET ai_bonus_tokens = ai_bonus_tokens + ? WHERE user_id = ?', [
      prize.amount,
      userId,
    ]);
    if (c4) {
      await conn.query('INSERT INTO points_log (user_id, delta, reason, ref) VALUES (?, 0, ?, ?)', [
        userId,
        mode === 'free' ? 'lottery_free_asset' : 'lottery_paid_asset',
        prize.id,
      ]);
    }
  }
  return {
    id: prize.id,
    kind: prize.kind,
    amount: prize.amount,
    name: prize.name,
    rare: prize.tier === 'rare',
  };
}

export async function drawLottery(
  userId,
  {
    times = 1,
    free = false,
    mode = null,
    userRole = null,
    calendar = null,
    clientRequestId = null,
    economyVersion = null,
    expectedCost = null,
    randomIntFn = randomInt,
  } = {},
) {
  const runtime = getEconomyRuntime();
  const hasWriteProtocol = Boolean(clientRequestId && economyVersion && expectedCost !== null && expectedCost !== undefined);
  if (runtime.requireWriteVersion && hasWriteProtocol) {
    if ((mode !== 'free' && mode !== 'paid') || (free === true && mode !== 'free')) {
      throw new PointsEconomyError('INVALID_DRAW_MODE', '抽奖方式无效，请刷新页面后重试');
    }
    const requestedTimes = Number(times);
    if ((mode === 'free' && requestedTimes !== 1) || (mode === 'paid' && ![1, 10].includes(requestedTimes))) {
      throw new PointsEconomyError('INVALID_DRAW_TIMES', '抽奖次数无效，请刷新页面后重试');
    }
  }
  const drawMode = mode === 'free' || free === true ? 'free' : 'paid';
  const n = drawMode === 'free' ? 1 : Number(times) === 10 ? 10 : 1;
  const policy = drawMode === 'free' ? runtime.catalog.freePolicy : runtime.catalog.paidPolicy;
  const cost = drawMode === 'free' ? 0 : n === 10 ? policy.tenCost : policy.singleCost;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const operation = await beginPointsEconomyOperation(conn, {
      userId,
      operationType: `lottery_${drawMode}`,
      payload: { mode: drawMode, times: n },
      clientRequestId,
      economyVersion,
      expectedCost,
      actualCost: cost,
      runtime,
    });
    if (operation.replay) {
      await conn.commit();
      return operation.replay;
    }
    if (drawMode === 'free' && !runtime.freeLotteryEnabled) {
      await conn.rollback();
      return { ok: false, reason: 'maintenance', code: 'POINTS_LOTTERY_FREE_DISABLED', msg: '每日惊喜维护中' };
    }
    if (drawMode === 'paid' && !runtime.paidLotteryEnabled) {
      await conn.rollback();
      return { ok: false, reason: 'maintenance', code: 'POINTS_LOTTERY_PAID_DISABLED', msg: '积分抽奖维护中' };
    }

    const paidStateColumns = drawMode === 'paid' ? ', lottery_paid_count, lottery_paid_pity_progress' : '';
    const [rows] = await conn.query(
      `SELECT points, exp, lottery_count, lottery_free_day, lottery_free_used${paidStateColumns}
         FROM user_growth WHERE user_id = ? FOR UPDATE`,
      [userId],
    );
    const growth = rows[0];
    if (!growth) {
      await conn.rollback();
      return { ok: false, reason: 'no_growth', msg: '成长数据未初始化，先签到试试' };
    }

    const c4 = runtime.economyVersion !== LEGACY_POINTS_ECONOMY_VERSION;
    const accountCalendar =
      drawMode === 'free' ? calendar || (await getGrowthCalendarContext(userId, { db: conn })) : calendar;
    const today = accountCalendar?.dayKey || dayKeyAtOffset();
    if (drawMode === 'free') {
      const allowance = freeDrawsFor(levelOf(growth.exp, userRole), runtime.economyVersion);
      const usedToday = growth.lottery_free_day === today ? Number(growth.lottery_free_used) || 0 : 0;
      if (usedToday >= allowance) {
        await conn.rollback();
        return { ok: false, reason: 'no_free', msg: '今日免费次数已用完' };
      }
      await conn.query('UPDATE user_growth SET lottery_free_day = ?, lottery_free_used = ? WHERE user_id = ?', [
        today,
        usedToday + 1,
        userId,
      ]);
      await conn.query("INSERT INTO points_log (user_id, delta, reason, ref) VALUES (?, 0, 'lottery_free', ?)", [
        userId,
        today,
      ]);
    } else {
      if (Number(growth.points) < cost) {
        await conn.rollback();
        return { ok: false, reason: 'insufficient', msg: '积分不足' };
      }
      await conn.query('UPDATE user_growth SET points = points - ? WHERE user_id = ?', [cost, userId]);
      await conn.query('INSERT INTO points_log (user_id, delta, reason, ref) VALUES (?, ?, ?, ?)', [
        userId,
        -cost,
        c4 ? 'lottery_paid_cost' : 'lottery_cost',
        n === 10 ? 'x10' : 'x1',
      ]);
    }

    const pityEvery = runtime.catalog.paidPolicy.pityEvery;
    const rarePool = policy.pool.filter((item) => item.tier === 'rare');
    const legacyBase = Number(growth.lottery_count) || 0;
    const paidBase = c4
      ? drawMode === 'paid'
        ? Number(growth.lottery_paid_pity_progress) || 0
        : null
      : legacyBase % pityEvery;
    let pityProgress = paidBase ?? 0;
    const results = [];
    const pityHitIndexes = [];
    for (let index = 1; index <= n; index++) {
      let guaranteed = false;
      if (drawMode === 'paid' || (!c4 && policy.countsPaidPity)) {
        pityProgress += 1;
        guaranteed = pityProgress >= pityEvery;
        if (guaranteed) pityProgress = 0;
      }
      const prize = pickWeighted(guaranteed ? rarePool : policy.pool, randomIntFn);
      const reward = await grantReward(conn, userId, prize, {
        mode: drawMode,
        version: runtime.economyVersion,
        overflowPoints: runtime.catalog.paidPolicy.cardOverflowPoints,
      });
      results.push({ index, ...reward, guaranteed });
      if (guaranteed) pityHitIndexes.push(index);
    }

    if (c4 && drawMode === 'paid') {
      await conn.query(
        `UPDATE user_growth
            SET lottery_count = lottery_count + ?,
                lottery_paid_count = lottery_paid_count + ?,
                lottery_paid_pity_progress = ?
          WHERE user_id = ?`,
        [n, n, pityProgress, userId],
      );
    } else if (c4) {
      await conn.query('UPDATE user_growth SET lottery_count = lottery_count + ? WHERE user_id = ?', [n, userId]);
    } else {
      await conn.query('UPDATE user_growth SET lottery_count = lottery_count + ? WHERE user_id = ?', [n, userId]);
    }

    const [balances] = await conn.query(
      'SELECT points, storage_bonus_mb, ai_bonus_tokens, streak_protect_cards FROM user_growth WHERE user_id = ? LIMIT 1',
      [userId],
    );
    const balance = balances[0] || {};
    const result = {
      ok: true,
      idempotent: false,
      economyVersion: runtime.economyVersion,
      mode: drawMode,
      cost,
      free: drawMode === 'free',
      points: Number(balance.points || 0),
      results,
      pityTriggered: pityHitIndexes.length > 0,
      pityHitIndexes,
      ...(paidBase === null
        ? {}
        : {
            pityProgressBefore: paidBase,
            pityProgressAfter: pityProgress,
            nextPityIn: pityEvery - pityProgress || pityEvery,
          }),
      poolVersion: policy.poolVersion,
      assets: {
        storageBonusMb: Number(balance.storage_bonus_mb || 0),
        aiBonusTokens: Number(balance.ai_bonus_tokens || 0),
        protectCards: Number(balance.streak_protect_cards || 0),
      },
    };
    await completePointsEconomyOperation(conn, operation, {
      ...result,
      request: { mode: drawMode, times: n },
    });
    await conn.commit();
    return result;
  } catch (error) {
    try {
      await conn.rollback();
    } catch {
      // 保留原始错误。
    }
    if (error instanceof PointsEconomyError) throw error;
    throw error;
  } finally {
    conn.release();
  }
}

export async function getLotteryStatus(userId, { userRole = null, calendar = null } = {}) {
  const runtime = getEconomyRuntime();
  let growth = {};
  if (userId && userId !== 'visitor') {
    const [rows] = await pool.query(
      `SELECT points, exp, lottery_count, lottery_paid_count, lottery_paid_pity_progress,
              lottery_free_day, lottery_free_used
         FROM user_growth WHERE user_id = ? LIMIT 1`,
      [userId],
    );
    growth = rows[0] || {};
  }
  const accountCalendar =
    userId && userId !== 'visitor' ? calendar || (await getGrowthCalendarContext(userId)) : calendar;
  const today = accountCalendar?.dayKey || dayKeyAtOffset();
  const level = levelOf(growth.exp, userRole);
  const freeDaily = freeDrawsFor(level, runtime.economyVersion);
  const usedToday = growth.lottery_free_day === today ? Number(growth.lottery_free_used) || 0 : 0;
  const freeRemaining = Math.max(0, freeDaily - usedToday);
  const c4 = runtime.economyVersion !== LEGACY_POINTS_ECONOMY_VERSION;
  const pityEvery = runtime.catalog.paidPolicy.pityEvery;
  const pityProgress = c4
    ? Number(growth.lottery_paid_pity_progress) || 0
    : (Number(growth.lottery_count) || 0) % pityEvery;
  const rarePool = runtime.catalog.paidPolicy.pool.filter((item) => item.tier === 'rare');
  // C3 的免费抽仍与付费抽共享奖池并推进同一保底，灰度兼容期必须展示真实保底概率；
  // C4 的每日惊喜不计付费保底，因此只展示普通概率，不能把保底列误带到免费池。
  const freePool = prizeRates(
    runtime.catalog.freePolicy.pool,
    runtime.catalog.freePolicy.countsPaidPity ? rarePool : [],
  );
  const paidPool = prizeRates(runtime.catalog.paidPolicy.pool, rarePool);
  const paid = {
    enabled: runtime.paidLotteryEnabled,
    singleCost: runtime.catalog.paidPolicy.singleCost,
    tenCost: runtime.catalog.paidPolicy.tenCost,
    pityEvery,
    pityProgress,
    toPity: pityEvery - pityProgress || pityEvery,
    poolVersion: runtime.catalog.paidPolicy.poolVersion,
    pool: paidPool,
    overflowPolicy: {
      itemId: 'makeup_card',
      maxInventory: 2,
      compensationPoints: runtime.catalog.paidPolicy.cardOverflowPoints,
    },
  };
  const free = {
    enabled: runtime.freeLotteryEnabled,
    daily: freeDaily,
    remaining: freeRemaining,
    countsPaidPity: runtime.catalog.freePolicy.countsPaidPity,
    poolVersion: runtime.catalog.freePolicy.poolVersion,
    pool: freePool,
  };
  return {
    economyVersion: runtime.economyVersion,
    points: Number(growth.points || 0),
    level,
    timezone: accountCalendar?.timezone || 'Asia/Shanghai',
    free,
    paid,
    // 兼容旧前端的只读字段；新版前端只使用 free / paid 分组。
    count: c4 ? Number(growth.lottery_paid_count || 0) : Number(growth.lottery_count || 0),
    toPity: paid.toPity,
    singleCost: paid.singleCost,
    tenCost: paid.tenCost,
    pityEvery,
    pityCountsFreeDraws: free.countsPaidPity,
    overflowPolicy: paid.overflowPolicy,
    freeDaily,
    freeRemaining,
    pool: paidPool,
  };
}
