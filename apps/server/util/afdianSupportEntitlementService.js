import crypto from 'node:crypto';
import { creditAiBonusTokens } from './aiBonusWallet.js';
import { earnStorage } from './points.js';
import {
  getSupportPackage,
  getSupportPackageFeatureState,
  supportFirstPurchaseCompatibleClaimKeys,
  supportFirstPurchaseClaimKey,
  supportProviderIdentityHash,
} from './afdianSupportPackageCatalog.js';

export const SUPPORT_ENTITLEMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  MANUAL_REVIEW: 'manual_review',
  CREDITED: 'credited',
  REVERSAL_REVIEW: 'reversal_review',
  INELIGIBLE: 'ineligible',
});

function amountCents(value) {
  const normalized = String(value ?? '').trim();
  const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number(String(match[2] || '').padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

function intentIdentityMatches(order) {
  if (order.intent_provider_private_id && order.provider_private_id) {
    return String(order.intent_provider_private_id) === String(order.provider_private_id);
  }
  return String(order.intent_provider_user_id || '') === String(order.provider_user_id || '');
}

function isDeletedAccountTombstone(value) {
  return /^deleted:[0-9a-f]{64}$/.test(String(value || ''));
}

async function loadGrant(connection, supportOrderId) {
  const [rows] = await connection.query(
    `SELECT id, support_order_id, checkout_intent_id, user_id, entitlement_type,
            sku_id, catalog_version, campaign_id, campaign_sku_id, campaign_version,
            paid_amount, calculated_ai_tokens, calculated_storage_mb,
            granted_ai_tokens, granted_storage_mb, first_purchase_applied,
            grant_status, reason_code, ai_ledger_entry_id, storage_log_ref
       FROM support_entitlement_grants
      WHERE support_order_id = ?
      LIMIT 1
      FOR UPDATE`,
    [supportOrderId],
  );
  return rows[0] || null;
}

async function saveGrant(
  connection,
  {
    grant,
    order,
    aiTokens,
    storageMb,
    status,
    reasonCode = null,
    firstPurchaseApplied = false,
    aiLedgerEntryId = null,
    storageLogRef = null,
  },
) {
  const id = grant?.id || crypto.randomUUID();
  const credited = status === SUPPORT_ENTITLEMENT_STATUS.CREDITED;
  const values = {
    userId: order.light_note_user_id || null,
    entitlementType: order.intent_type,
    skuId: order.sku_id,
    catalogVersion: order.catalog_version,
    campaignId: order.campaign_id || null,
    campaignSkuId: order.campaign_sku_id || null,
    campaignVersion: order.campaign_version || null,
    paidAmount: order.total_amount,
    aiTokens,
    storageMb,
    grantedAiTokens: credited ? aiTokens : Number(grant?.granted_ai_tokens || 0),
    grantedStorageMb: credited ? storageMb : Number(grant?.granted_storage_mb || 0),
  };
  if (grant) {
    await connection.query(
      `UPDATE support_entitlement_grants
          SET user_id = ?, paid_amount = ?, calculated_ai_tokens = ?, calculated_storage_mb = ?,
              granted_ai_tokens = ?, granted_storage_mb = ?, first_purchase_applied = ?,
              grant_status = ?, reason_code = ?,
              ai_ledger_entry_id = COALESCE(?, ai_ledger_entry_id),
              storage_log_ref = COALESCE(?, storage_log_ref),
              credited_at = CASE WHEN ? = 'credited' THEN COALESCE(credited_at, NOW()) ELSE credited_at END
        WHERE id = ?`,
      [
        values.userId,
        values.paidAmount,
        values.aiTokens,
        values.storageMb,
        values.grantedAiTokens,
        values.grantedStorageMb,
        firstPurchaseApplied ? 1 : Number(grant.first_purchase_applied || 0),
        status,
        reasonCode,
        aiLedgerEntryId,
        storageLogRef,
        status,
        id,
      ],
    );
  } else {
    await connection.query(
      `INSERT INTO support_entitlement_grants
        (id, support_order_id, checkout_intent_id, user_id, entitlement_type, sku_id,
         catalog_version, campaign_id, campaign_sku_id, campaign_version, paid_amount,
         calculated_ai_tokens, calculated_storage_mb, granted_ai_tokens, granted_storage_mb,
         first_purchase_applied, grant_status, reason_code, ai_ledger_entry_id,
         storage_log_ref, credited_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               CASE WHEN ? = 'credited' THEN NOW() ELSE NULL END)`,
      [
        id,
        order.id,
        order.checkout_intent_id,
        values.userId,
        values.entitlementType,
        values.skuId,
        values.catalogVersion,
        values.campaignId,
        values.campaignSkuId,
        values.campaignVersion,
        values.paidAmount,
        values.aiTokens,
        values.storageMb,
        values.grantedAiTokens,
        values.grantedStorageMb,
        firstPurchaseApplied ? 1 : 0,
        status,
        reasonCode,
        aiLedgerEntryId,
        storageLogRef,
        status,
      ],
    );
  }
  return {
    handled: true,
    grantId: id,
    status,
    reasonCode,
    aiTokens,
    storageMb,
    firstPurchaseApplied,
  };
}

function isProviderPaid(order) {
  return (
    String(order.verification_state) === 'api_verified' &&
    Number(order.provider_status) === 2 &&
    Number(order.product_type) === 0
  );
}

async function preserveCreditedGrant(connection, order, grant) {
  let reasonCode = null;
  if (!isProviderPaid(order)) reasonCode = 'provider_reversal';
  else if (String(order.ownership_source) === 'conflict') reasonCode = 'ownership_conflict';
  else if (String(order.light_note_user_id || '') !== String(grant.user_id || '')) reasonCode = 'credited_owner_changed';
  else if (amountCents(order.total_amount) !== amountCents(grant.paid_amount)) reasonCode = 'credited_amount_changed';
  return saveGrant(connection, {
    grant,
    // 订单反转或供应商字段漂移只改变复核状态；已入账权益账本的实付快照必须保持不可变。
    order: { ...order, light_note_user_id: grant.user_id, total_amount: grant.paid_amount },
    aiTokens: Number(grant.calculated_ai_tokens),
    storageMb: Number(grant.calculated_storage_mb),
    status: reasonCode ? SUPPORT_ENTITLEMENT_STATUS.REVERSAL_REVIEW : SUPPORT_ENTITLEMENT_STATUS.CREDITED,
    reasonCode,
    firstPurchaseApplied: Number(grant.first_purchase_applied) === 1,
    aiLedgerEntryId: grant.ai_ledger_entry_id,
    storageLogRef: grant.storage_log_ref,
  });
}

async function claimFirstPurchase(connection, order) {
  if (Number(order.first_purchase_candidate || 0) !== 1) return false;
  const identityHash = supportProviderIdentityHash(order.provider_user_id);
  if (!identityHash) return false;
  const definition = getSupportPackage(order.sku_id);
  // 发放时按当前产品范围重新核验。尚未结算的 v2 意图仍使用其冻结权益快照，
  // 但 AI/组合套餐统一占用账号级 sentinel，避免与 v3 并发重复加赠。
  const claimKey = definition ? supportFirstPurchaseClaimKey(definition) : String(order.sku_id || '');
  if (!claimKey) return false;
  const compatibleKeys = definition ? supportFirstPurchaseCompatibleClaimKeys(definition) : [claimKey];
  const placeholders = compatibleKeys.map(() => '?').join(', ');
  const [userClaims] = await connection.query(
    `SELECT id
       FROM support_first_purchase_claims
      WHERE sku_id IN (${placeholders})
        AND user_id = ?
      ORDER BY id
      LIMIT 1
      FOR UPDATE`,
    [...compatibleKeys, order.light_note_user_id],
  );
  if (userClaims.length) return false;
  const [identityClaims] = await connection.query(
    `SELECT id
       FROM support_first_purchase_claims
      WHERE sku_id IN (${placeholders})
        AND provider_identity_hash = ?
      ORDER BY id
      LIMIT 1
      FOR UPDATE`,
    [...compatibleKeys, identityHash],
  );
  if (identityClaims.length) return false;
  try {
    await connection.query(
      `INSERT INTO support_first_purchase_claims
        (id, user_id, provider_identity_hash, sku_id, support_order_id)
       VALUES (?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), order.light_note_user_id, identityHash, claimKey, order.id],
    );
    return true;
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') return false;
    throw error;
  }
}

async function lockCampaignLimit(connection, order) {
  const [rows] = await connection.query(
    `SELECT completed_count, active_intent_id
       FROM support_campaign_user_limits
      WHERE campaign_sku_id = ? AND user_id = ?
      LIMIT 1
      FOR UPDATE`,
    [order.campaign_sku_id, order.light_note_user_id],
  );
  const state = rows[0];
  if (!state) return { allowed: false, reasonCode: 'campaign_limit_state_missing' };
  if (Number(state.completed_count || 0) >= Number(order.campaign_user_limit || 0)) {
    return { allowed: false, reasonCode: 'campaign_limit_reached' };
  }
  return { allowed: true };
}

async function settleCampaignLimit(connection, order) {
  const [updated] = await connection.query(
    `UPDATE support_campaign_user_limits
        SET completed_count = completed_count + 1,
            active_intent_id = NULL,
            active_until = NULL
      WHERE campaign_sku_id = ?
        AND user_id = ?
        AND completed_count < ?`,
    [order.campaign_sku_id, order.light_note_user_id, Number(order.campaign_user_limit || 0)],
  );
  if (Number(updated?.affectedRows || 0) !== 1) {
    const error = new Error('活动套餐限购计数更新失败');
    error.code = 'SUPPORT_CAMPAIGN_LIMIT_RACE';
    throw error;
  }
}

async function clearCampaignActiveIntent(connection, order) {
  if (order.intent_type !== 'campaign' || !order.campaign_sku_id || !order.light_note_user_id) return;
  await connection.query(
    `UPDATE support_campaign_user_limits
        SET active_intent_id = NULL, active_until = NULL
      WHERE campaign_sku_id = ? AND user_id = ? AND active_intent_id = ?`,
    [order.campaign_sku_id, order.light_note_user_id, order.checkout_intent_id],
  );
}

/**
 * 在订单同步的既有事务内处理 v2 套餐。只要订单关联的是 v2 意图就始终 handled，
 * 任意异常都进入套餐账本，绝不回退到 support-ai-v1。
 */
export async function syncAfdianPackageEntitlementForOrder(connection, order, { env = process.env } = {}) {
  const grant = await loadGrant(connection, order.id);
  if (Number(grant?.granted_ai_tokens || 0) > 0 || Number(grant?.granted_storage_mb || 0) > 0) {
    return preserveCreditedGrant(connection, order, grant);
  }

  const predictedAi = Number(order.quoted_ai_tokens || 0);
  const predictedStorage = Number(order.quoted_storage_mb || 0);
  const pending = (status, reasonCode) =>
    saveGrant(connection, {
      grant,
      order,
      aiTokens: predictedAi,
      storageMb: predictedStorage,
      status,
      reasonCode,
    });

  const feature = getSupportPackageFeatureState(env);
  if (!feature.grantEnabled) return pending(SUPPORT_ENTITLEMENT_STATUS.PENDING, 'package_grant_disabled');
  if (!isProviderPaid(order)) return pending(SUPPORT_ENTITLEMENT_STATUS.INELIGIBLE, 'order_not_paid');

  if (!order.checkout_intent_id || !['permanent', 'campaign'].includes(String(order.intent_type))) {
    return pending(SUPPORT_ENTITLEMENT_STATUS.MANUAL_REVIEW, 'intent_snapshot_missing');
  }
  if (order.consumed_order_id && String(order.consumed_order_id) !== String(order.id)) {
    return pending(SUPPORT_ENTITLEMENT_STATUS.MANUAL_REVIEW, 'intent_reused');
  }
  if (!order.consumed_order_id) {
    const [consumed] = await connection.query(
      `UPDATE support_checkout_intents
          SET consumed_order_id = ?, intent_status = 'consumed'
        WHERE id = ? AND consumed_order_id IS NULL`,
      [order.id, order.checkout_intent_id],
    );
    if (Number(consumed?.affectedRows || 0) !== 1) {
      const [intentRows] = await connection.query(
        `SELECT consumed_order_id
           FROM support_checkout_intents
          WHERE id = ?
          LIMIT 1
          FOR UPDATE`,
        [order.checkout_intent_id],
      );
      if (String(intentRows[0]?.consumed_order_id || '') !== String(order.id)) {
        return pending(SUPPORT_ENTITLEMENT_STATUS.MANUAL_REVIEW, 'intent_reused');
      }
    }
    order.consumed_order_id = order.id;
  }
  if (
    isDeletedAccountTombstone(order.intent_user_id) ||
    isDeletedAccountTombstone(order.light_note_user_id)
  ) {
    await clearCampaignActiveIntent(connection, order);
    return pending(SUPPORT_ENTITLEMENT_STATUS.MANUAL_REVIEW, 'account_deleted');
  }
  if (!intentIdentityMatches(order)) {
    await clearCampaignActiveIntent(connection, order);
    return pending(SUPPORT_ENTITLEMENT_STATUS.MANUAL_REVIEW, 'provider_identity_conflict');
  }
  if (
    String(order.ownership_source) === 'conflict' ||
    !order.light_note_user_id ||
    String(order.light_note_user_id) !== String(order.intent_user_id || '')
  ) {
    await clearCampaignActiveIntent(connection, order);
    return pending(SUPPORT_ENTITLEMENT_STATUS.MANUAL_REVIEW, 'ownership_conflict');
  }
  if (
    amountCents(order.total_amount) == null ||
    amountCents(order.total_amount) !== amountCents(order.quoted_amount)
  ) {
    await clearCampaignActiveIntent(connection, order);
    return pending(SUPPORT_ENTITLEMENT_STATUS.MANUAL_REVIEW, 'amount_mismatch');
  }
  const providerCreatedEpoch = Number(order.provider_created_epoch || 0);
  if (!providerCreatedEpoch) {
    await clearCampaignActiveIntent(connection, order);
    return pending(SUPPORT_ENTITLEMENT_STATUS.MANUAL_REVIEW, 'provider_time_missing');
  }
  if (!Number(order.intent_expires_epoch) || providerCreatedEpoch > Number(order.intent_expires_epoch)) {
    await clearCampaignActiveIntent(connection, order);
    return pending(SUPPORT_ENTITLEMENT_STATUS.MANUAL_REVIEW, 'checkout_expired');
  }

  if (order.intent_type === 'campaign') {
    const limit = await lockCampaignLimit(connection, order);
    if (!limit.allowed) {
      await clearCampaignActiveIntent(connection, order);
      return pending(SUPPORT_ENTITLEMENT_STATUS.MANUAL_REVIEW, limit.reasonCode);
    }
  }

  const firstPurchaseApplied = order.intent_type === 'permanent' ? await claimFirstPurchase(connection, order) : false;
  const aiTokens =
    order.intent_type === 'permanent' && !firstPurchaseApplied
      ? Number(order.base_ai_tokens || 0)
      : predictedAi;
  const storageMb =
    order.intent_type === 'permanent' && !firstPurchaseApplied
      ? Number(order.base_storage_mb || 0)
      : predictedStorage;

  let aiLedgerEntryId = null;
  let storageLogRef = null;
  if (aiTokens > 0) {
    const credit = await creditAiBonusTokens(connection, {
      userId: String(order.light_note_user_id),
      amountTokens: aiTokens,
      sourceType: order.intent_type === 'campaign' ? 'support_campaign' : 'support_package',
      sourceRef: String(order.id),
      idempotencyKey: `support-package:${order.id}`,
      policyVersion: String(order.catalog_version),
    });
    aiLedgerEntryId = credit.ledgerId;
  }
  if (storageMb > 0) {
    await connection.query('INSERT IGNORE INTO user_growth (user_id) VALUES (?)', [order.light_note_user_id]);
    storageLogRef = `support-v2:${order.id}`;
    const credited = await earnStorage(
      String(order.light_note_user_id),
      storageMb,
      order.intent_type === 'campaign' ? 'support_campaign' : 'support_package',
      storageLogRef,
      connection,
    );
    if (!credited) {
      const error = new Error('套餐空间权益幂等标识冲突');
      error.code = 'SUPPORT_STORAGE_IDEMPOTENCY_CONFLICT';
      throw error;
    }
  }
  if (order.intent_type === 'campaign') await settleCampaignLimit(connection, order);

  return saveGrant(connection, {
    grant,
    order,
    aiTokens,
    storageMb,
    status: SUPPORT_ENTITLEMENT_STATUS.CREDITED,
    firstPurchaseApplied,
    aiLedgerEntryId,
    storageLogRef,
  });
}
