import pool from '../db/index.js';
import { creditAiBonusTokens } from './aiBonusWallet.js';
import { levelForExp, levelGiftSchedule, lockGrowthAccount } from './growth.js';
import { levelGiftsEnabled } from './aiQuotaPolicy.js';

const empty = (status, reason = null) => ({ status, reason, gifts: [], creditedTokens: 0 });

// 预览与实际入账共用资格和逐档收据读取；预览只 SELECT，不创建成长行。
export async function inspectLevelGifts(connection, userId, { lock = false } = {}) {
  if (!userId || userId === 'visitor') return empty('ineligible');
  const current = lock ? ' FOR UPDATE' : '';
  const shared = lock ? ' LOCK IN SHARE MODE' : '';
  const [[account]] = await connection.query(
    `SELECT id, role, del_flag, create_time FROM user WHERE id = ? LIMIT 1${current}`,
    [userId],
  );
  if (!account || account.role !== 'user' || Number(account.del_flag || 0) !== 0) return empty('ineligible');
  const [[control]] = await connection.query(`SELECT paused_from FROM ai_level_gift_controls WHERE id = 1${shared}`);
  if (!control)
    throw Object.assign(new Error('AI_LEVEL_GIFT_CONTROL_UNAVAILABLE'), {
      code: 'AI_LEVEL_GIFT_CONTROL_UNAVAILABLE',
      status: 503,
    });
  if (
    control.paused_from &&
    new Date(account.create_time).getTime() >= Math.floor(new Date(control.paused_from).getTime() / 1000) * 1000
  ) {
    return empty('held', 'new_accounts_paused');
  }
  const [restrictions] = await connection.query(
    `SELECT restriction_type FROM security_account_restrictions
      WHERE user_id = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())${shared}`,
    [account.id],
  );
  if (restrictions.length)
    return empty(
      'held',
      restrictions.some((item) => item.restriction_type === 'gift_hold') ? 'gift_hold' : 'account_restricted',
    );
  const [[registration]] = await connection.query(
    `SELECT checked_at FROM ai_level_gift_registrations WHERE user_id=?${shared}`,
    [account.id],
  );
  if (registration && !registration.checked_at) return empty('held', 'risk_check_pending');
  const [[growth]] = await connection.query(`SELECT exp FROM user_growth WHERE user_id = ?${current}`, [account.id]);
  const level = levelForExp(Number(growth?.exp || 0));
  const schedule = levelGiftSchedule(account.create_time);
  const keys = Array.from({ length: level }, (_, index) => `ai-level-gift:L${index + 1}`);
  const [receipts] = await connection.query(
    `SELECT idempotency_key, entry_type, source_type, amount_tokens, policy_version FROM ai_bonus_ledger
      WHERE user_id = ? AND idempotency_key IN (${keys.map(() => '?').join(',')})${current}`,
    [account.id, ...keys],
  );
  const expected = new Map(keys.map((key, index) => [key, schedule.tokens[index]]));
  if (
    receipts.some(
      (row) =>
        row.entry_type !== 'credit' ||
        row.source_type !== 'level_gift' ||
        Number(row.amount_tokens) !== expected.get(row.idempotency_key) ||
        row.policy_version !== schedule.version,
    )
  ) {
    throw Object.assign(new Error('AI_LEVEL_GIFT_RECEIPT_INVALID'), {
      code: 'AI_LEVEL_GIFT_RECEIPT_INVALID',
      status: 503,
    });
  }
  const issued = new Set(receipts.map((row) => row.idempotency_key));
  const gifts = keys.flatMap((key, index) =>
    issued.has(key) ? [] : [{ level: index + 1, amountTokens: schedule.tokens[index] }],
  );
  return {
    status: gifts.length ? 'missing' : 'up_to_date',
    version: schedule.version,
    level,
    gifts,
    creditedTokens: 0,
    missingTokens: gifts.reduce((sum, gift) => sum + gift.amountTokens, 0),
    issuedTokens: receipts.reduce((sum, receipt) => sum + Number(receipt.amount_tokens || 0), 0),
  };
}

// 调用方须先锁成长行；AI 入口须先锁日用量，再锁成长行。
export async function ensureLevelGifts(connection, userId, { trigger = 'fallback' } = {}) {
  if (!levelGiftsEnabled()) return empty('disabled');
  const plan = await inspectLevelGifts(connection, userId, { lock: true });
  if (['ineligible', 'held'].includes(plan.status)) return plan;
  const gifts = [];
  for (const gift of plan.gifts) {
    const credit = await creditAiBonusTokens(connection, {
      userId,
      amountTokens: gift.amountTokens,
      sourceType: 'level_gift',
      sourceRef: `L${gift.level}`,
      idempotencyKey: `ai-level-gift:L${gift.level}`,
      policyVersion: plan.version,
    });
    gifts.push({ ...gift, ledgerId: credit.ledgerId });
  }
  return {
    ...plan,
    status: gifts.length ? 'granted' : 'up_to_date',
    trigger,
    gifts,
    creditedTokens: gifts.reduce((sum, gift) => sum + gift.amountTokens, 0),
    missingTokens: 0,
  };
}

// 注册后独立事务：失败由调用方记录稳定码，不能把成功注册变成失败。
export async function grantOutstandingLevelGifts(userId, { trigger = 'registration', database = pool } = {}) {
  if (!levelGiftsEnabled()) return empty('disabled');
  for (let attempt = 0; attempt < 3; attempt++) {
    const connection = await database.getConnection();
    try {
      await connection.beginTransaction();
      await lockGrowthAccount(connection, userId);
      const result = await ensureLevelGifts(connection, userId, { trigger });
      if (['ineligible', 'held'].includes(result.status)) await connection.rollback();
      else await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback().catch(() => {});
      if (!['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error?.code) || attempt === 2) throw error;
    } finally {
      connection.release();
    }
  }
}
