import crypto from 'node:crypto';
import { AFDIAN_AI_REWARD_POLICY } from '@lightnote/shared';
import pool from '../db/index.js';
import { recordAdminOperationAudit } from './adminOperationAudit.js';
import { creditAiBonusTokens } from './aiBonusWallet.js';
import { afdianError } from './afdianConfig.js';

export const AFDIAN_REWARD_STATUS = Object.freeze({
  PENDING_LINK: 'pending_link',
  MANUAL_REVIEW: 'manual_review',
  CREDITED: 'credited',
  LEGACY_EXCLUDED: 'legacy_excluded',
  REVERSAL_REVIEW: 'reversal_review',
  INELIGIBLE: 'ineligible',
});

function moneyToCents(value, { allowZero = false } = {}) {
  const normalized = String(value ?? '').trim();
  const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) throw afdianError('AFDIAN_REWARD_AMOUNT_INVALID', '订单实付金额不合法', 409);
  const cents = Number(match[1]) * 100 + Number(String(match[2] || '').padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents < 0 || (!allowZero && cents === 0)) {
    throw afdianError('AFDIAN_REWARD_AMOUNT_INVALID', '订单实付金额不合法', 409);
  }
  return cents;
}

function normalizedTokensPerCny(tokensPerCny) {
  const normalizedRate = Number(tokensPerCny);
  if (!Number.isSafeInteger(normalizedRate) || normalizedRate <= 0 || normalizedRate % 100 !== 0) {
    throw afdianError('AFDIAN_REWARD_POLICY_INVALID', '爱发电赠送策略不合法', 500);
  }
  return normalizedRate;
}

function rewardTokensFromCents(cents, tokensPerCny, { allowZero = false } = {}) {
  const result = cents * (normalizedTokensPerCny(tokensPerCny) / 100);
  if (!Number.isSafeInteger(result) || result < 0 || (!allowZero && result === 0)) {
    throw afdianError('AFDIAN_REWARD_AMOUNT_INVALID', '订单赠送额度超出安全范围', 409);
  }
  return result;
}

export function calculateAfdianRewardTokens(amount, tokensPerCny = AFDIAN_AI_REWARD_POLICY.tokensPerCny) {
  return rewardTokensFromCents(moneyToCents(amount), tokensPerCny);
}

async function loadOrder(connection, supportOrderId) {
  const [rows] = await connection.query(
    `SELECT o.id, o.provider_order_no, o.light_note_user_id, o.ownership_source, o.product_type,
            o.total_amount, o.provider_status, o.verification_state,
            UNIX_TIMESTAMP(o.provider_created_at) AS provider_created_epoch,
            UNIX_TIMESTAMP(i.create_time) AS checkout_created_epoch,
            UNIX_TIMESTAMP(o.create_time) AS first_seen_epoch
       FROM support_orders o
       LEFT JOIN support_checkout_intents i ON i.id = o.checkout_intent_id
      WHERE o.id = ?
      LIMIT 1
      FOR UPDATE`,
    [supportOrderId],
  );
  if (!rows[0]) throw afdianError('AFDIAN_ORDER_NOT_FOUND', '爱发电订单不存在', 404);
  return rows[0];
}

async function loadGrant(connection, supportOrderId) {
  const [rows] = await connection.query(
    `SELECT id, user_id, policy_version, paid_amount, calculated_tokens, granted_tokens,
            grant_status, reason_code, ledger_entry_id
       FROM support_reward_grants
      WHERE support_order_id = ?
      LIMIT 1
      FOR UPDATE`,
    [supportOrderId],
  );
  return rows[0] || null;
}

async function loadPolicy(connection, policyVersion) {
  const [rows] = await connection.query(
    `SELECT policy_version, tokens_per_cny, auto_credit_max_amount,
            UNIX_TIMESTAMP(activated_at) AS activated_epoch
       FROM support_reward_policy_state
      WHERE policy_version = ?
      LIMIT 1`,
    [policyVersion],
  );
  const policy = rows[0];
  if (!policy) throw afdianError('AFDIAN_REWARD_POLICY_MISSING', '爱发电赠送策略尚未就绪', 503);
  return policy;
}

async function loadApplicablePolicy(connection, order, grant) {
  if (grant?.policy_version) return loadPolicy(connection, grant.policy_version);
  const orderEpoch = Number(
    order.provider_created_epoch || order.checkout_created_epoch || order.first_seen_epoch || 0,
  );
  if (orderEpoch > 0) {
    const [rows] = await connection.query(
      `SELECT policy_version, tokens_per_cny, auto_credit_max_amount,
              UNIX_TIMESTAMP(activated_at) AS activated_epoch
         FROM support_reward_policy_state
        WHERE activated_at <= FROM_UNIXTIME(?)
        ORDER BY activated_at DESC, policy_version DESC
        LIMIT 1`,
      [orderEpoch],
    );
    if (rows[0]) return rows[0];
  }
  // 比最早策略更旧的订单仍需用当前版本登记为“历史不补发”，但绝不进入入账分支。
  return loadPolicy(connection, AFDIAN_AI_REWARD_POLICY.version);
}

async function saveGrant(
  connection,
  { grant, order, policyVersion, tokens, status, reasonCode = null, ledgerEntryId = null, actorUserId = null },
) {
  const grantId = grant?.id || crypto.randomUUID();
  if (grant) {
    await connection.query(
      `UPDATE support_reward_grants
          SET user_id = ?, paid_amount = ?, calculated_tokens = ?, granted_tokens = ?,
              grant_status = ?, reason_code = ?, ledger_entry_id = ?,
              reviewed_by = COALESCE(?, reviewed_by),
              reviewed_at = CASE WHEN ? IS NULL THEN reviewed_at ELSE NOW() END,
              credited_at = CASE WHEN ? = 'credited' THEN COALESCE(credited_at, NOW()) ELSE credited_at END
        WHERE id = ?`,
      [
        order.light_note_user_id || null,
        order.total_amount,
        tokens,
        status === AFDIAN_REWARD_STATUS.CREDITED ? tokens : Number(grant.granted_tokens || 0),
        status,
        reasonCode,
        ledgerEntryId || grant.ledger_entry_id || null,
        actorUserId,
        actorUserId,
        status,
        grantId,
      ],
    );
  } else {
    await connection.query(
      `INSERT INTO support_reward_grants
        (id, support_order_id, user_id, policy_version, paid_amount, calculated_tokens,
         granted_tokens, grant_status, reason_code, ledger_entry_id, reviewed_by,
         reviewed_at, credited_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               CASE WHEN ? IS NULL THEN NULL ELSE NOW() END,
               CASE WHEN ? = 'credited' THEN NOW() ELSE NULL END)`,
      [
        grantId,
        order.id,
        order.light_note_user_id || null,
        policyVersion,
        order.total_amount,
        tokens,
        status === AFDIAN_REWARD_STATUS.CREDITED ? tokens : 0,
        status,
        reasonCode,
        ledgerEntryId,
        actorUserId,
        actorUserId,
        status,
      ],
    );
  }
  return { grantId, status, reasonCode, tokens };
}

function isVerifiedPaidOrder(order) {
  return (
    String(order.verification_state) === 'api_verified' &&
    Number(order.provider_status) === 2 &&
    Number(order.product_type) === 0
  );
}

async function preserveOrFlagCreditedGrant(connection, { order, grant, tokens, policyVersion }) {
  let reasonCode = null;
  if (!isVerifiedPaidOrder(order)) reasonCode = 'provider_reversal';
  else if (String(order.ownership_source) === 'conflict') reasonCode = 'ownership_conflict';
  else if (order.light_note_user_id && String(order.light_note_user_id) !== String(grant.user_id)) {
    reasonCode = 'credited_owner_changed';
  } else if (Number(grant.granted_tokens) !== tokens) reasonCode = 'credited_amount_changed';

  return saveGrant(connection, {
    grant,
    order: { ...order, light_note_user_id: grant.user_id },
    policyVersion,
    tokens,
    status: reasonCode ? AFDIAN_REWARD_STATUS.REVERSAL_REVIEW : AFDIAN_REWARD_STATUS.CREDITED,
    reasonCode,
    ledgerEntryId: grant.ledger_entry_id,
  });
}

/** 在现有事务中按订单事实刷新赠送状态；重复调用不会重复入账。 */
export async function syncAfdianRewardForOrder(
  connection,
  supportOrderId,
  { manualApproval = false, actorUserId = null, approvalSnapshot = null } = {},
) {
  const order = await loadOrder(connection, supportOrderId);
  const grant = await loadGrant(connection, supportOrderId);
  const policy = await loadApplicablePolicy(connection, order, grant);
  const policyVersion = String(policy.policy_version);
  const amountCents = moneyToCents(order.total_amount, { allowZero: true });
  const tokens = rewardTokensFromCents(amountCents, policy.tokens_per_cny, { allowZero: true });

  if (manualApproval) {
    if (!grant || grant.grant_status !== AFDIAN_REWARD_STATUS.MANUAL_REVIEW || grant.reason_code !== 'large_amount') {
      throw afdianError('AFDIAN_REWARD_NOT_APPROVABLE', '当前订单不需要大额赠送复核', 409);
    }
    const expectedTokens = Number(approvalSnapshot?.expectedTokens);
    const expectedUserId = String(approvalSnapshot?.expectedUserId || '').trim();
    if (
      !Number.isSafeInteger(expectedTokens) ||
      expectedTokens <= 0 ||
      expectedTokens !== tokens ||
      expectedTokens !== Number(grant.calculated_tokens) ||
      !expectedUserId ||
      expectedUserId !== String(order.light_note_user_id || '') ||
      expectedUserId !== String(grant.user_id || '')
    ) {
      throw afdianError('AFDIAN_REWARD_REVIEW_STALE', '订单赠送事实已变化，请刷新后重新复核', 409);
    }
  }

  if (Number(grant?.granted_tokens || 0) > 0) {
    return preserveOrFlagCreditedGrant(connection, { order, grant, tokens, policyVersion });
  }

  if (!isVerifiedPaidOrder(order) || amountCents <= 0) {
    return saveGrant(connection, {
      grant,
      order,
      policyVersion,
      tokens,
      status: AFDIAN_REWARD_STATUS.INELIGIBLE,
      reasonCode: 'order_not_eligible',
    });
  }

  const providerCreatedEpoch = Number(order.provider_created_epoch || 0);
  const checkoutCreatedEpoch = Number(order.checkout_created_epoch || 0);
  const firstSeenEpoch = Number(order.first_seen_epoch || 0);
  const activatedEpoch = Number(policy.activated_epoch || 0);
  if ((providerCreatedEpoch || checkoutCreatedEpoch || firstSeenEpoch) < activatedEpoch) {
    return saveGrant(connection, {
      grant,
      order,
      policyVersion,
      tokens,
      status: AFDIAN_REWARD_STATUS.LEGACY_EXCLUDED,
      reasonCode: 'before_policy_activation',
    });
  }
  if (!providerCreatedEpoch && !checkoutCreatedEpoch) {
    return saveGrant(connection, {
      grant,
      order,
      policyVersion,
      tokens,
      status: AFDIAN_REWARD_STATUS.MANUAL_REVIEW,
      reasonCode: 'provider_time_missing',
    });
  }
  if (String(order.ownership_source) === 'conflict') {
    return saveGrant(connection, {
      grant,
      order,
      policyVersion,
      tokens,
      status: AFDIAN_REWARD_STATUS.MANUAL_REVIEW,
      reasonCode: 'ownership_conflict',
    });
  }
  if (!order.light_note_user_id) {
    return saveGrant(connection, {
      grant,
      order,
      policyVersion,
      tokens,
      status: AFDIAN_REWARD_STATUS.PENDING_LINK,
      reasonCode: 'account_not_linked',
    });
  }

  const autoCreditMaxCents = moneyToCents(policy.auto_credit_max_amount);
  if (amountCents > autoCreditMaxCents && !manualApproval) {
    return saveGrant(connection, {
      grant,
      order,
      policyVersion,
      tokens,
      status: AFDIAN_REWARD_STATUS.MANUAL_REVIEW,
      reasonCode: 'large_amount',
    });
  }

  const credit = await creditAiBonusTokens(connection, {
    userId: String(order.light_note_user_id),
    amountTokens: tokens,
    sourceType: 'support',
    sourceRef: String(order.id),
    idempotencyKey: `support-reward:${order.id}:${policyVersion}`,
    policyVersion,
  });
  return saveGrant(connection, {
    grant,
    order,
    policyVersion,
    tokens,
    status: AFDIAN_REWARD_STATUS.CREDITED,
    ledgerEntryId: credit.ledgerId,
    actorUserId: manualApproval ? actorUserId : null,
  });
}

export async function syncAfdianRewardsForUser(connection, userId) {
  const [rows] = await connection.query(
    `SELECT id
       FROM support_orders
      WHERE light_note_user_id = ?
      ORDER BY create_time ASC, id ASC`,
    [userId],
  );
  const results = [];
  for (const row of rows) results.push(await syncAfdianRewardForOrder(connection, row.id));
  return results;
}

export async function approveAfdianSupportReward(
  providerOrderNo,
  { actorUserId, expectedTokens, expectedUserId, requestId = '', ip = '', db = pool } = {},
) {
  const normalizedOrderNo = String(providerOrderNo || '').trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(normalizedOrderNo)) {
    throw afdianError('AFDIAN_ORDER_INVALID', '订单号不合法', 400);
  }
  if (!String(actorUserId || '').trim()) {
    throw afdianError('AFDIAN_REWARD_REVIEWER_REQUIRED', '缺少复核操作人', 400);
  }
  const normalizedExpectedTokens = Number(expectedTokens);
  const normalizedExpectedUserId = String(expectedUserId || '').trim();
  if (!Number.isSafeInteger(normalizedExpectedTokens) || normalizedExpectedTokens <= 0 || !normalizedExpectedUserId) {
    throw afdianError('AFDIAN_REWARD_REVIEW_SNAPSHOT_REQUIRED', '缺少赠送复核快照', 400);
  }
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT id
         FROM support_orders
        WHERE provider_order_no = ?
        LIMIT 1
        FOR UPDATE`,
      [normalizedOrderNo],
    );
    if (!rows[0]) throw afdianError('AFDIAN_ORDER_NOT_FOUND', '爱发电订单不存在', 404);
    const result = await syncAfdianRewardForOrder(connection, rows[0].id, {
      manualApproval: true,
      actorUserId,
      approvalSnapshot: {
        expectedTokens: normalizedExpectedTokens,
        expectedUserId: normalizedExpectedUserId,
      },
    });
    if (result.status !== AFDIAN_REWARD_STATUS.CREDITED) {
      throw afdianError('AFDIAN_REWARD_NOT_APPROVABLE', '订单状态已变化，请重新复核后再操作', 409);
    }
    await recordAdminOperationAudit(
      {
        actorUserId,
        action: 'support_reward_approve',
        targetType: 'afdian_support',
        targetId: normalizedOrderNo,
        outcome: 'succeeded',
        requestId,
        ip,
        metadata: { grantedAiUnits: result.tokens },
      },
      { db: connection, required: true },
    );
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
