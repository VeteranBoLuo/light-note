import { AFDIAN_ORDER_PURPOSE } from '@lightnote/shared';
import pool from '../db/index.js';

const MAX_ADMIN_PAGE_SIZE = 100;

function money(value) {
  return Number(value || 0).toFixed(2);
}

function pagination(page, pageSize, maxPageSize = MAX_ADMIN_PAGE_SIZE) {
  const normalizedPage = Math.max(1, Number.parseInt(page, 10) || 1);
  const normalizedPageSize = Math.min(maxPageSize, Math.max(1, Number.parseInt(pageSize, 10) || 20));
  return { page: normalizedPage, pageSize: normalizedPageSize, offset: (normalizedPage - 1) * normalizedPageSize };
}

/** 当前账号已核验的资源商店订单；历史赞助等其他用途不对用户展示。 */
export async function getAfdianUserOrders({ userId, page = 1, pageSize = 10, db = pool }) {
  const paging = pagination(page, pageSize, 50);
  const [[countRows], [rows]] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS total
         FROM support_orders o
        WHERE o.light_note_user_id = ?
          AND o.verification_state = 'api_verified'
          AND o.provider_status = 2
          AND o.order_purpose = 'entitlement_purchase'`,
      [userId],
    ),
    db.query(
      `SELECT o.id, o.total_amount, o.month, o.product_type, o.ownership_source, o.order_purpose,
              o.verified_at, o.ranking_observed_at, i.option_key, i.intent_type, i.sku_id,
              COALESCE(e.grant_status, g.grant_status) AS grant_status,
              COALESCE(e.reason_code, g.reason_code) AS reason_code,
              COALESCE(e.calculated_ai_tokens, g.calculated_tokens, 0) AS calculated_tokens,
              COALESCE(e.granted_ai_tokens, g.granted_tokens, 0) AS granted_tokens,
              COALESCE(e.calculated_storage_mb, 0) AS calculated_storage_mb,
              COALESCE(e.granted_storage_mb, 0) AS granted_storage_mb,
              COALESCE(e.first_purchase_applied, 0) AS first_purchase_applied
         FROM support_orders o
         LEFT JOIN support_checkout_intents i ON i.id = o.checkout_intent_id
         LEFT JOIN support_reward_grants g ON g.support_order_id = o.id
         LEFT JOIN support_entitlement_grants e ON e.support_order_id = o.id
        WHERE o.light_note_user_id = ?
          AND o.verification_state = 'api_verified'
          AND o.provider_status = 2
          AND o.order_purpose = 'entitlement_purchase'
        ORDER BY COALESCE(o.ranking_observed_at, o.verified_at, o.create_time) DESC, o.id DESC
        LIMIT ? OFFSET ?`,
      [userId, paging.pageSize, paging.offset],
    ),
  ]);
  return {
    items: rows.map((row) => ({
      id: row.id,
      amount: money(row.total_amount),
      month: Number(row.month || 0),
      productType: Number(row.product_type || 0),
      optionKey: row.option_key || null,
      intentType: row.intent_type || 'legacy',
      skuId: row.sku_id || null,
      ownershipSource: row.ownership_source,
      orderPurpose: row.order_purpose || AFDIAN_ORDER_PURPOSE.UNKNOWN,
      confirmedAt: row.ranking_observed_at || row.verified_at || null,
      rewardStatus: row.grant_status || null,
      rewardReasonCode: row.reason_code || null,
      rewardTokens: Number(row.calculated_tokens || 0),
      grantedTokens: Number(row.granted_tokens || 0),
      rewardStorageMb: Number(row.calculated_storage_mb || 0),
      grantedStorageMb: Number(row.granted_storage_mb || 0),
      firstPurchaseApplied: Number(row.first_purchase_applied || 0) === 1,
    })),
    total: Number(countRows[0]?.total || 0),
    page: paging.page,
    pageSize: paging.pageSize,
  };
}

export async function getAfdianAdminOverview({ db = pool } = {}) {
  const [[verified], [exceptions], [rewards], [entitlements]] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS verified_orders,
              COALESCE(SUM(total_amount), 0) AS total_amount,
              SUM(CASE WHEN order_purpose = 'entitlement_purchase' THEN 1 ELSE 0 END) AS purchase_orders,
              COALESCE(SUM(CASE
                WHEN order_purpose = 'entitlement_purchase' THEN total_amount ELSE 0
              END), 0) AS purchase_amount,
              COALESCE(SUM(CASE
                WHEN ranking_observed_at >= DATE_FORMAT(NOW(), '%Y-%m-01') THEN total_amount
                ELSE 0
              END), 0) AS month_amount
         FROM support_orders
        WHERE verification_state = 'api_verified' AND provider_status = 2`,
    ),
    db.query(
      `SELECT
         SUM(CASE WHEN verification_state = 'pending' THEN 1 ELSE 0 END) AS pending_orders,
         SUM(CASE WHEN ownership_source = 'conflict' THEN 1 ELSE 0 END) AS conflict_orders,
         SUM(CASE
           WHEN verification_state = 'api_verified' AND provider_status = 2 AND light_note_user_id IS NULL THEN 1
           ELSE 0
         END)
           AS unlinked_orders
       FROM support_orders`,
    ),
    db.query(
      `SELECT COALESCE(SUM(granted_tokens), 0) AS granted_tokens,
              SUM(CASE WHEN grant_status = 'manual_review' THEN 1 ELSE 0 END) AS manual_review_rewards,
              SUM(CASE WHEN grant_status = 'reversal_review' THEN 1 ELSE 0 END) AS reversal_review_rewards
         FROM support_reward_grants`,
    ),
    db.query(
      `SELECT COALESCE(SUM(granted_ai_tokens), 0) AS granted_tokens,
              COALESCE(SUM(granted_storage_mb), 0) AS granted_storage_mb,
              SUM(CASE WHEN grant_status = 'manual_review' THEN 1 ELSE 0 END) AS manual_review_rewards,
              SUM(CASE WHEN grant_status = 'reversal_review' THEN 1 ELSE 0 END) AS reversal_review_rewards
         FROM support_entitlement_grants`,
    ),
  ]);
  return {
    verifiedOrders: Number(verified[0]?.verified_orders || 0),
    totalAmount: money(verified[0]?.total_amount),
    purchaseOrders: Number(verified[0]?.purchase_orders || 0),
    purchaseAmount: money(verified[0]?.purchase_amount),
    monthAmount: money(verified[0]?.month_amount),
    pendingOrders: Number(exceptions[0]?.pending_orders || 0),
    conflictOrders: Number(exceptions[0]?.conflict_orders || 0),
    unlinkedOrders: Number(exceptions[0]?.unlinked_orders || 0),
    grantedTokens: Number(rewards[0]?.granted_tokens || 0) + Number(entitlements[0]?.granted_tokens || 0),
    grantedStorageMb: Number(entitlements[0]?.granted_storage_mb || 0),
    manualReviewRewards:
      Number(rewards[0]?.manual_review_rewards || 0) + Number(entitlements[0]?.manual_review_rewards || 0),
    reversalReviewRewards:
      Number(rewards[0]?.reversal_review_rewards || 0) + Number(entitlements[0]?.reversal_review_rewards || 0),
  };
}

function adminSearch(raw) {
  const value = String(raw || '')
    .trim()
    .slice(0, 100);
  return value ? `%${value.replace(/[\\%_]/g, '\\$&')}%` : '';
}

export async function queryAfdianAdminOrders({ page, pageSize, state = '', search = '', db = pool }) {
  const paging = pagination(page, pageSize);
  const conditions = [];
  const params = [];
  if (state === 'verified') conditions.push("o.verification_state = 'api_verified' AND o.provider_status = 2");
  if (state === 'pending') conditions.push("o.verification_state = 'pending'");
  if (state === 'conflict') conditions.push("o.ownership_source = 'conflict'");
  if (state === 'unlinked') {
    conditions.push("o.verification_state = 'api_verified' AND o.provider_status = 2 AND o.light_note_user_id IS NULL");
  }
  if (state === 'reward_review') {
    conditions.push("COALESCE(e.grant_status, g.grant_status) IN ('manual_review', 'reversal_review')");
  }
  if (state === 'exceptions') {
    conditions.push(
      "(o.verification_state = 'pending' OR o.ownership_source = 'conflict' OR (o.verification_state = 'api_verified' AND o.provider_status = 2 AND o.light_note_user_id IS NULL) OR COALESCE(e.grant_status, g.grant_status) IN ('manual_review', 'reversal_review'))",
    );
  }
  const like = adminSearch(search);
  if (like) {
    conditions.push('(o.provider_order_no LIKE ? OR u.alias LIKE ? OR l.provider_name LIKE ?)');
    params.push(like, like, like);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const joins = `LEFT JOIN user u ON u.id = o.light_note_user_id
                 LEFT JOIN support_account_links l ON l.user_id = o.light_note_user_id
                 LEFT JOIN support_reward_grants g ON g.support_order_id = o.id
                 LEFT JOIN support_entitlement_grants e ON e.support_order_id = o.id
                 LEFT JOIN support_checkout_intents i ON i.id = o.checkout_intent_id`;
  const [[countRows], [rows]] = await Promise.all([
    db.query(`SELECT COUNT(*) AS total FROM support_orders o ${joins} ${where}`, params),
    db.query(
      `SELECT o.provider_order_no, o.total_amount, o.provider_status, o.verification_state,
              o.ownership_source, o.light_note_user_id, o.retry_count, o.next_retry_at,
              o.order_purpose, o.ranking_observed_at, o.verified_at, o.create_time, u.alias, l.provider_name,
              COALESCE(e.grant_status, g.grant_status) AS grant_status,
              COALESCE(e.reason_code, g.reason_code) AS reason_code,
              COALESCE(e.calculated_ai_tokens, g.calculated_tokens, 0) AS calculated_tokens,
              COALESCE(e.granted_ai_tokens, g.granted_tokens, 0) AS granted_tokens,
              COALESCE(e.calculated_storage_mb, 0) AS calculated_storage_mb,
              COALESCE(e.granted_storage_mb, 0) AS granted_storage_mb,
              i.intent_type, i.sku_id,
              COALESCE(e.reviewed_at, g.reviewed_at) AS reviewed_at,
              COALESCE(e.credited_at, g.credited_at) AS credited_at
         FROM support_orders o
         ${joins}
         ${where}
        ORDER BY o.update_time DESC, o.id DESC
        LIMIT ? OFFSET ?`,
      [...params, paging.pageSize, paging.offset],
    ),
  ]);
  return { items: rows, total: Number(countRows[0]?.total || 0), page: paging.page, pageSize: paging.pageSize };
}

export const afdianSupportReadInternals = {
  money,
  pagination,
};
