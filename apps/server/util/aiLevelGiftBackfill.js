import pool from '../db/index.js';
import { createReadOnlyPool } from './readOnlyDatabase.js';
import { grantOutstandingLevelGifts, inspectLevelGifts } from './aiLevelGifts.js';
import { aiQuotaMode, levelGiftsEnabled } from './aiQuotaPolicy.js';

async function* accountsInScope(database, scopeAt) {
  let afterId = '';
  while (true) {
    const [rows] = await database.query(
      `SELECT id FROM user WHERE role = 'user' AND id > ? AND (create_time IS NULL OR create_time < ?)
       ORDER BY id LIMIT 200`,
      [afterId, scopeAt],
    );
    if (!rows.length) return;
    for (const row of rows) yield row.id;
    afterId = rows.at(-1).id;
  }
}
const totals = () => ({ accounts: 0, missingTokens: 0, issuedTokens: 0, held: 0, ineligible: 0, byLevel: {} });
function countPlan(summary, plan) {
  summary.accounts++;
  if (plan.status === 'held') {
    summary.held++;
    return;
  }
  if (plan.status === 'ineligible') {
    summary.ineligible++;
    return;
  }
  summary.missingTokens += plan.missingTokens || 0;
  summary.issuedTokens += plan.issuedTokens || 0;
  const level = (summary.byLevel[plan.level] ||= { accounts: 0, missingTokens: 0 });
  level.accounts++;
  level.missingTokens += plan.missingTokens || 0;
}

// 仅返回聚合，不将账号列表或正文落盘。apply 先做同范围预览，再逐账号锁后复核，最后重新扫漏。
export async function runAiLevelGiftBackfill({
  database = pool,
  apply = false,
  scopeAt = null,
  beforeApply = null,
} = {}) {
  if (apply && !levelGiftsEnabled())
    throw Object.assign(new Error('AI_LEVEL_GIFTS_DISABLED'), { code: 'AI_LEVEL_GIFTS_DISABLED' });
  if (!scopeAt) {
    const [[row]] = await database.query('SELECT CURRENT_TIMESTAMP(3) AS scope_at');
    scopeAt = row.scope_at;
  }
  const timestamp = new Date(Math.floor(new Date(scopeAt).getTime() / 1000) * 1000);
  if (!Number.isFinite(timestamp.getTime()))
    throw Object.assign(new Error('AI_GIFT_SCOPE_INVALID'), { code: 'AI_GIFT_SCOPE_INVALID' });
  const preview = totals();
  const baseline = new Map();
  const reader = await createReadOnlyPool(database, { transactionOnly: true }).getConnection();
  try {
    await reader.beginTransaction();
    for await (const id of accountsInScope(reader, timestamp)) {
      const plan = await inspectLevelGifts(reader, id);
      countPlan(preview, plan);
      if (apply) baseline.set(id, { level: plan.level, missingTokens: plan.missingTokens || 0 });
    }
    await reader.commit();
  } catch (error) {
    await reader.rollback().catch(() => {});
    throw error;
  } finally {
    reader.release();
  }
  const report = {
    mode: apply ? 'apply' : 'dry_run',
    scopeAt: timestamp.toISOString(),
    billingMode: aiQuotaMode(),
    giftsEnabled: levelGiftsEnabled(),
    preview,
  };
  if (!apply) return report;
  if (beforeApply) await beforeApply(); // 隔离数据库演练并发变化，不参与 CLI 协议。
  const applied = {
    accounts: 0,
    grantedTokens: 0,
    alreadyIssued: 0,
    held: 0,
    ineligible: 0,
    levelChanged: 0,
    awardedByAnotherEntryTokens: 0,
    failed: 0,
    failures: {},
  };
  for (const id of baseline.keys()) {
    applied.accounts++;
    try {
      const result = await grantOutstandingLevelGifts(id, { database, trigger: 'backfill' });
      applied.grantedTokens += result.creditedTokens;
      if (result.status === 'held') applied.held++;
      else if (result.status === 'ineligible') applied.ineligible++;
      else {
        if (result.status === 'up_to_date') applied.alreadyIssued++;
        const prior = baseline.get(id);
        if (prior && prior.level !== result.level) applied.levelChanged++;
        if (prior && prior.level === result.level)
          applied.awardedByAnotherEntryTokens += Math.max(0, prior.missingTokens - result.creditedTokens);
      }
    } catch (error) {
      applied.failed++;
      const code = /^[A-Z0-9_]{1,80}$/.test(error?.code || '') ? error.code : 'AI_GIFT_BACKFILL_FAILED';
      applied.failures[code] = (applied.failures[code] || 0) + 1;
    }
  }
  const verification = totals();
  for (const id of baseline.keys()) countPlan(verification, await inspectLevelGifts(database, id));
  return { ...report, applied, verification, complete: applied.failed === 0 && verification.missingTokens === 0 };
}
