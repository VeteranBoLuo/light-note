import pool from '../../db/index.js';
import { stableAgentErrorCode } from './logSafety.js';
import { getDeepSeekBalance } from './providerBalance.js';

// AI 监控的“今日账户余额变化”统一按产品业务日计算，而不是依赖服务器所在时区。
// 当前 DeepSeek 余额接口只提供余额快照，没有逐笔账单 API；因此这里保存每日开盘余额，
// 明确展示“账户余额变化”，不把它伪装成按请求精确结算的费用。
export const AI_BALANCE_TIME_ZONE = 'Asia/Shanghai';
const SNAPSHOT_KIND_MIDNIGHT = 'midnight';
const SNAPSHOT_KIND_BOOTSTRAP = 'bootstrap';
let snapshotSchedulerTimer = null;
let snapshotSchedulerStarted = false;

function zonedParts(date = new Date(), timeZone = AI_BALANCE_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

export function aiBalanceDayKey(date = new Date(), timeZone = AI_BALANCE_TIME_ZONE) {
  const { year, month, day } = zonedParts(date, timeZone);
  return `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
}

function normalizedMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount.toFixed(6) : '0.000000';
}

function roundedMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 1_000_000) / 1_000_000 : 0;
}

function balanceEntries(balance) {
  const provider = String(balance?.provider || 'deepseek').trim().toLowerCase() || 'deepseek';
  const infos = Array.isArray(balance?.balanceInfos) ? balance.balanceInfos : [];
  return infos
    .map((info) => ({
      provider,
      currency: String(info?.currency || '').trim().toUpperCase(),
      totalBalance: normalizedMoney(info?.totalBalance),
      grantedBalance: normalizedMoney(info?.grantedBalance),
      toppedUpBalance: normalizedMoney(info?.toppedUpBalance),
    }))
    .filter((info) => /^[A-Z]{3}$/.test(info.currency));
}

function currentBalanceEntry(balance) {
  const entries = balanceEntries(balance);
  const preferredCurrency = String(balance?.currency || '').trim().toUpperCase();
  return entries.find((entry) => entry.currency === preferredCurrency) || entries[0] || null;
}

function normalizeSnapshotRow(row) {
  if (!row) return null;
  return {
    provider: String(row.provider || '').toLowerCase(),
    currency: String(row.currency || '').toUpperCase(),
    snapshotDay: String(row.snapshot_day || ''),
    snapshotKind: row.snapshot_kind === SNAPSHOT_KIND_MIDNIGHT ? SNAPSHOT_KIND_MIDNIGHT : SNAPSHOT_KIND_BOOTSTRAP,
    snapshotAt: row.snapshot_at || null,
    totalBalance: normalizedMoney(row.total_balance),
    grantedBalance: normalizedMoney(row.granted_balance),
    toppedUpBalance: normalizedMoney(row.topped_up_balance),
  };
}

async function findDailySnapshot(provider, currency, snapshotDay, database = pool) {
  const [rows] = await database.query(
    `SELECT provider, currency, snapshot_day, snapshot_kind, snapshot_at,
            total_balance, granted_balance, topped_up_balance
       FROM ai_provider_balance_snapshots
      WHERE provider = ? AND currency = ? AND snapshot_day = ?
      LIMIT 1`,
    [provider, currency, snapshotDay],
  );
  return normalizeSnapshotRow(rows?.[0]);
}

/**
 * 为一个业务日首次观察到的余额建立基线。唯一键保证多进程或多次刷新不会覆盖 0 点快照。
 */
export async function ensureDailyDeepSeekBalanceSnapshot(
  balance,
  { kind = SNAPSHOT_KIND_BOOTSTRAP, database = pool, now = new Date() } = {},
) {
  const snapshotDay = aiBalanceDayKey(now);
  // 供应商明确表示账户不可用时不能把 0 写成当天基线；否则恢复后会被误算成整日余额变化。
  if (balance?.isAvailable === false) return { snapshotDay, entries: [] };
  const entries = balanceEntries(balance);
  for (const entry of entries) {
    await database.query(
      `INSERT IGNORE INTO ai_provider_balance_snapshots
        (provider, currency, snapshot_day, snapshot_kind, snapshot_at, total_balance, granted_balance, topped_up_balance)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?)`,
      [
        entry.provider,
        entry.currency,
        snapshotDay,
        kind === SNAPSHOT_KIND_MIDNIGHT ? SNAPSHOT_KIND_MIDNIGHT : SNAPSHOT_KIND_BOOTSTRAP,
        entry.totalBalance,
        entry.grantedBalance,
        entry.toppedUpBalance,
      ],
    );
  }
  return { snapshotDay, entries };
}

/**
 * 返回当前账号余额相对当天基线的变化。正数代表余额增加，负数代表余额减少；
 * 它不是供应商逐笔账单，充值、赠金或同账号其他系统的调用同样会反映在变化中。
 */
export async function getDeepSeekDailyBalanceChange(balance, { database = pool, now = new Date() } = {}) {
  if (balance?.isAvailable === false) {
    return { isAvailable: false, reason: 'balance_unavailable' };
  }
  const current = currentBalanceEntry(balance);
  if (!current) {
    return { isAvailable: false, reason: 'balance_unavailable' };
  }

  const snapshotDay = aiBalanceDayKey(now);
  let snapshot = await findDailySnapshot(current.provider, current.currency, snapshotDay, database);
  if (!snapshot && !balance?.stale) {
    await ensureDailyDeepSeekBalanceSnapshot(balance, { kind: SNAPSHOT_KIND_BOOTSTRAP, database, now });
    snapshot = await findDailySnapshot(current.provider, current.currency, snapshotDay, database);
  }
  if (!snapshot) {
    return { isAvailable: false, reason: balance?.stale ? 'baseline_pending' : 'baseline_unavailable' };
  }

  const openingBalance = roundedMoney(snapshot.totalBalance);
  const currentBalance = roundedMoney(current.totalBalance);
  const change = roundedMoney(currentBalance - openingBalance);
  return {
    isAvailable: true,
    provider: current.provider,
    currency: current.currency,
    snapshotDay,
    snapshotKind: snapshot.snapshotKind,
    snapshotAt: snapshot.snapshotAt,
    openingBalance: openingBalance.toFixed(6),
    currentBalance: currentBalance.toFixed(6),
    change: change.toFixed(6),
    direction: change > 0 ? 'increase' : change < 0 ? 'decrease' : 'unchanged',
    partialDay: snapshot.snapshotKind !== SNAPSHOT_KIND_MIDNIGHT,
    stale: Boolean(balance?.stale),
  };
}

export async function captureDailyDeepSeekBalanceSnapshot({
  // 除定时器显式传入 midnight 外，任何手工/补偿调用都必须保守地建立 bootstrap 基线。
  kind = SNAPSHOT_KIND_BOOTSTRAP,
  forceRefresh = true,
  database = pool,
  now = new Date(),
} = {}) {
  const balance = await getDeepSeekBalance({ forceRefresh });
  if (balance?.stale) return { saved: false, reason: 'balance_stale' };
  const result = await ensureDailyDeepSeekBalanceSnapshot(balance, { kind, database, now });
  return { saved: result.entries.length > 0, ...result };
}

function timeZoneOffsetMs(date, timeZone = AI_BALANCE_TIME_ZONE) {
  const local = zonedParts(date, timeZone);
  const localAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
  return localAsUtc - date.getTime();
}

export function nextAiBalanceMidnightAt(now = new Date(), timeZone = AI_BALANCE_TIME_ZONE) {
  const current = zonedParts(now, timeZone);
  const nextLocalDay = new Date(Date.UTC(current.year, current.month - 1, current.day + 1, 0, 0, 5));
  const naiveUtc = Date.UTC(
    nextLocalDay.getUTCFullYear(),
    nextLocalDay.getUTCMonth(),
    nextLocalDay.getUTCDate(),
    0,
    0,
    5,
  );
  return new Date(naiveUtc - timeZoneOffsetMs(new Date(naiveUtc), timeZone));
}

function scheduleNextDailyBalanceSnapshot() {
  const next = nextAiBalanceMidnightAt();
  const delay = Math.max(1_000, next.getTime() - Date.now());
  snapshotSchedulerTimer = setTimeout(async () => {
    try {
      await captureDailyDeepSeekBalanceSnapshot({ kind: SNAPSHOT_KIND_MIDNIGHT, forceRefresh: true });
    } catch (error) {
      console.warn('[ai-balance] 日余额快照失败 code=%s', stableAgentErrorCode(error));
    } finally {
      scheduleNextDailyBalanceSnapshot();
    }
  }, delay);
  console.log(`[ai-balance] 日余额快照已注册，首次执行: ${next.toLocaleString('zh-CN', { timeZone: AI_BALANCE_TIME_ZONE })}`);
}

/** 应用启动时补齐当天基线，并在每天业务日 0 点写入新的余额快照。 */
export function startAiBalanceSnapshotScheduler() {
  if (snapshotSchedulerStarted) return;
  snapshotSchedulerStarted = true;
  captureDailyDeepSeekBalanceSnapshot({ kind: SNAPSHOT_KIND_BOOTSTRAP, forceRefresh: true }).catch((error) => {
    console.warn('[ai-balance] 启动余额基线失败 code=%s', stableAgentErrorCode(error));
  });
  scheduleNextDailyBalanceSnapshot();
}

export function stopAiBalanceSnapshotSchedulerForTest() {
  if (snapshotSchedulerTimer) clearTimeout(snapshotSchedulerTimer);
  snapshotSchedulerTimer = null;
  snapshotSchedulerStarted = false;
}
