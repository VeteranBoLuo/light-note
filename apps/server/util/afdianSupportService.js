import crypto from 'node:crypto';
import {
  AFDIAN_CHECKOUT_OPTIONS,
  AFDIAN_ORDER_PURPOSE,
  AFDIAN_PURE_SUPPORT_POLICY,
  SUPPORT_PACKAGE_CATALOG_VERSION,
} from '@lightnote/shared';
import pool from '../db/index.js';
import { afdianError, getAfdianApiConfig, getAfdianFeatureState } from './afdianConfig.js';
import { normalizeAfdianOrder, queryAfdianOrders, queryAfdianPublicProfile } from './afdianClient.js';
import {
  getAfdianPublicPreference,
  getAfdianUserOrders,
  invalidateAfdianLeaderboardCache,
} from './afdianSupportReadService.js';
import { stableAgentErrorCode } from './agent/logSafety.js';
import { syncAfdianRewardForOrder, syncAfdianRewardsForUser } from './afdianSupportRewardService.js';
import {
  getSupportPackage,
  getSupportPackageFeatureState,
  supportProviderIdentityHash,
} from './afdianSupportPackageCatalog.js';
import { lockCampaignSkuForCheckout } from './afdianSupportCampaignService.js';

const CHECKOUT_TOKEN_TTL_DAYS = 30;
const CAMPAIGN_CHECKOUT_TTL_HOURS = 24;
const PENDING_BATCH_SIZE = 20;
const RECONCILE_INTERVAL_MS = 5 * 60 * 1000;
const FULL_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
const PROFILE_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const PROFILE_REFRESH_RETRY_INTERVAL_MS = 10 * 60 * 1000;
const MAX_SYNC_PAGES = 200;
const CHECKOUT_OPTION_BY_KEY = new Map(AFDIAN_CHECKOUT_OPTIONS.map((option) => [option.key, option]));

function sha256(value) {
  return crypto
    .createHash('sha256')
    .update(String(value || ''))
    .digest('hex');
}

function providerIdentityMatches(left, right) {
  if (left.providerPrivateId && right.providerPrivateId) return left.providerPrivateId === right.providerPrivateId;
  return left.providerUserId === right.providerUserId;
}

const KNOWN_ORDER_PURPOSES = new Set([
  AFDIAN_ORDER_PURPOSE.LEGACY_SUPPORT,
  AFDIAN_ORDER_PURPOSE.DONATION,
  AFDIAN_ORDER_PURPOSE.ENTITLEMENT_PURCHASE,
]);

/**
 * 只使用数据库里已经冻结的旧用途或权威 custom_order_id 意图分类。
 * 无意图的新增爱发电主页订单是纯支持；带未知凭证的订单保持 unknown 进入人工复核，
 * 绝不能因金额相同而降级成支持或误发套餐。
 */
export function resolveAfdianOrderPurpose({
  existingPurpose = '',
  intent = null,
  hasCustomOrderId = false,
  providerCreatedAt = null,
  pureSupportActivatedEpoch = 0,
} = {}) {
  const persisted = String(existingPurpose || '');
  if (KNOWN_ORDER_PURPOSES.has(persisted)) return persisted;
  const intentType = String(intent?.intent_type || '');
  if (['permanent', 'campaign'].includes(intentType)) return AFDIAN_ORDER_PURPOSE.ENTITLEMENT_PURCHASE;
  if (intentType === 'donation') return AFDIAN_ORDER_PURPOSE.DONATION;
  if (intentType === 'legacy') return AFDIAN_ORDER_PURPOSE.LEGACY_SUPPORT;
  if (hasCustomOrderId) return AFDIAN_ORDER_PURPOSE.UNKNOWN;
  const activatedEpoch = Number(pureSupportActivatedEpoch || 0);
  if (activatedEpoch > 0) {
    const providerEpoch = Number(providerCreatedAt || 0);
    if (!providerEpoch) return AFDIAN_ORDER_PURPOSE.UNKNOWN;
    if (providerEpoch <= activatedEpoch) return AFDIAN_ORDER_PURPOSE.LEGACY_SUPPORT;
  }
  return AFDIAN_ORDER_PURPOSE.DONATION;
}

async function loadPureSupportActivatedEpoch(connection) {
  const [rows] = await connection.query(
    `SELECT UNIX_TIMESTAMP(activated_at) AS activated_epoch
       FROM support_reward_policy_state
      WHERE policy_version = ?
      LIMIT 1`,
    [AFDIAN_PURE_SUPPORT_POLICY.version],
  );
  const activatedEpoch = Number(rows[0]?.activated_epoch || 0);
  if (!Number.isSafeInteger(activatedEpoch) || activatedEpoch <= 0) {
    throw afdianError('AFDIAN_PURE_SUPPORT_POLICY_MISSING', '赞助规则切换边界尚未就绪', 503);
  }
  return activatedEpoch;
}

function buildCheckoutUrl(option, token) {
  const url = new URL('https://ifdian.net/order/create');
  if (option.planId) {
    url.searchParams.set('plan_id', option.planId);
    url.searchParams.set('product_type', '0');
  } else {
    url.searchParams.set('user_id', option.creatorId);
  }
  url.searchParams.set('custom_order_id', token);
  return url.toString();
}

function buildPackageCheckoutUrl({ creatorId, amount }, token) {
  const url = new URL('https://ifdian.net/order/create');
  url.searchParams.set('user_id', creatorId);
  url.searchParams.set('custom_price', Number(amount).toFixed(2));
  url.searchParams.set('custom_order_id', token);
  return url.toString();
}

export function shouldRefreshAfdianProfile(link, now = Date.now()) {
  if (!link) return false;
  const refreshedAt = new Date(link.identity_refreshed_at || 0).getTime();
  if (!Number.isFinite(refreshedAt) || refreshedAt <= 0) return true;
  const profileIncomplete = !link.provider_name || !link.provider_avatar_url;
  const interval = profileIncomplete ? PROFILE_REFRESH_RETRY_INTERVAL_MS : PROFILE_REFRESH_INTERVAL_MS;
  return now - refreshedAt >= interval;
}

export async function refreshAfdianAccountProfile({
  userId,
  providerUserId,
  db = pool,
  loadProfile = queryAfdianPublicProfile,
}) {
  try {
    const profile = await loadProfile(providerUserId);
    await db.query(
      `UPDATE support_account_links
          SET provider_name = ?, provider_avatar_url = ?, identity_refreshed_at = NOW()
        WHERE user_id = ?
          AND provider_user_id = ?`,
      [profile.providerName, profile.providerAvatarUrl, userId, providerUserId],
    );
    return profile;
  } catch (error) {
    await db
      .query(
        `UPDATE support_account_links
            SET identity_refreshed_at = NOW()
          WHERE user_id = ?
            AND provider_user_id = ?`,
        [userId, providerUserId],
      )
      .catch(() => {});
    throw error;
  }
}

export async function createAfdianCheckoutIntent({ userId, optionKey, db = pool }) {
  // 没有查询 API 时无法对 URL 参数进行权威复核，不生成一个看似可追踪但实际不可认领的凭证。
  getAfdianApiConfig();
  const option = CHECKOUT_OPTION_BY_KEY.get(String(optionKey || ''));
  if (!option) throw afdianError('AFDIAN_CHECKOUT_OPTION_INVALID', '请选择有效的赞助档位');
  const token = crypto.randomBytes(32).toString('base64url');
  const id = crypto.randomUUID();
  await db.query(
    `INSERT INTO support_checkout_intents
      (id, token_hash, user_id, option_key, intent_type, catalog_version, quoted_amount, expires_at)
     VALUES (?, ?, ?, ?, 'donation', ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))`,
    [
      id,
      sha256(token),
      userId,
      option.key,
      AFDIAN_PURE_SUPPORT_POLICY.version,
      option.amount == null ? null : Number(option.amount).toFixed(2),
      CHECKOUT_TOKEN_TTL_DAYS,
    ],
  );
  return { url: buildCheckoutUrl(option, token), expiresIn: CHECKOUT_TOKEN_TTL_DAYS * 24 * 60 * 60 };
}

async function regularFirstPurchaseCandidate(connection, { userId, skuId }) {
  const [userClaims] = await connection.query(
    'SELECT 1 FROM support_first_purchase_claims WHERE user_id = ? AND sku_id = ? LIMIT 1',
    [userId, skuId],
  );
  if (userClaims.length) return false;
  const [links] = await connection.query(
    'SELECT provider_user_id FROM support_account_links WHERE user_id = ? LIMIT 1',
    [userId],
  );
  const identityHash = supportProviderIdentityHash(links[0]?.provider_user_id);
  if (!identityHash) return true;
  const [identityClaims] = await connection.query(
    'SELECT 1 FROM support_first_purchase_claims WHERE provider_identity_hash = ? AND sku_id = ? LIMIT 1',
    [identityHash, skuId],
  );
  return !identityClaims.length;
}

/** 生成金额固定、权益快照不可变的一次性套餐结算意图。 */
export async function createAfdianPackageCheckoutIntent({
  userId,
  skuId,
  catalogVersion,
  db = pool,
  env = process.env,
  now = new Date(),
}) {
  const feature = getSupportPackageFeatureState(env);
  if (!feature.checkoutEnabled) {
    throw afdianError('SUPPORT_PACKAGE_CHECKOUT_DISABLED', '套餐结算暂未开放', 503);
  }
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) {
    throw afdianError('SUPPORT_PACKAGE_AUTH_REQUIRED', '请先登录后再选择套餐', 401);
  }
  const apiConfig = getAfdianApiConfig();
  const normalizedSkuId = String(skuId || '').trim();
  const normalizedVersion = String(catalogVersion || '').trim();
  const token = crypto.randomBytes(32).toString('base64url');
  const id = crypto.randomUUID();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    let amount;
    let intentType;
    let publicSkuId;
    let baseAiTokens;
    let baseStorageMb;
    let quotedAiTokens;
    let quotedStorageMb;
    let firstPurchaseCandidate = false;
    let campaignId = null;
    let campaignSkuId = null;
    let campaignVersion = null;
    let campaignUserLimit = null;
    let campaignStartsAt = null;
    let campaignEndsAt = null;
    let expiresIn;

    if (normalizedVersion === SUPPORT_PACKAGE_CATALOG_VERSION) {
      const definition = getSupportPackage(normalizedSkuId);
      if (!definition) throw afdianError('SUPPORT_PACKAGE_SKU_INVALID', '请选择有效的套餐', 400);
      firstPurchaseCandidate = await regularFirstPurchaseCandidate(connection, {
        userId: normalizedUserId,
        skuId: definition.skuId,
      });
      amount = definition.amount;
      intentType = 'permanent';
      publicSkuId = definition.skuId;
      baseAiTokens = definition.base.aiTokens;
      baseStorageMb = definition.base.storageMb;
      quotedAiTokens = firstPurchaseCandidate ? definition.firstPurchase.aiTokens : definition.base.aiTokens;
      quotedStorageMb = firstPurchaseCandidate ? definition.firstPurchase.storageMb : definition.base.storageMb;
      expiresIn = CHECKOUT_TOKEN_TTL_DAYS * 24 * 60 * 60;
    } else {
      if (!feature.campaignsEnabled) {
        throw afdianError('SUPPORT_CAMPAIGN_CHECKOUT_DISABLED', '限时套餐当前不可购买', 503);
      }
      const sku = await lockCampaignSkuForCheckout(connection, {
        campaignSkuId: normalizedSkuId,
        catalogVersion: normalizedVersion,
        userId: normalizedUserId,
        now,
      });
      amount = Number(sku.amount);
      intentType = 'campaign';
      publicSkuId = sku.sku_id;
      baseAiTokens = Number(sku.ai_tokens);
      baseStorageMb = Number(sku.storage_mb);
      quotedAiTokens = baseAiTokens;
      quotedStorageMb = baseStorageMb;
      campaignId = sku.campaign_id;
      campaignSkuId = sku.id;
      campaignVersion = Number(sku.version);
      campaignUserLimit = Number(sku.per_user_limit);
      campaignStartsAt = sku.starts_at;
      campaignEndsAt = sku.ends_at;
      expiresIn = CAMPAIGN_CHECKOUT_TTL_HOURS * 60 * 60;
    }

    await connection.query(
      `INSERT INTO support_checkout_intents
        (id, token_hash, user_id, option_key, intent_type, intent_status, sku_id,
         catalog_version, quoted_amount, base_ai_tokens, base_storage_mb,
         quoted_ai_tokens, quoted_storage_mb, first_purchase_candidate,
         campaign_id, campaign_sku_id, campaign_version, campaign_starts_at,
         campaign_user_limit, campaign_ends_at, expires_at)
       VALUES (?, ?, ?, 'package', ?, 'issued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               DATE_ADD(NOW(), INTERVAL ? SECOND))`,
      [
        id,
        sha256(token),
        normalizedUserId,
        intentType,
        publicSkuId,
        normalizedVersion,
        Number(amount).toFixed(2),
        baseAiTokens,
        baseStorageMb,
        quotedAiTokens,
        quotedStorageMb,
        firstPurchaseCandidate ? 1 : 0,
        campaignId,
        campaignSkuId,
        campaignVersion,
        campaignStartsAt,
        campaignUserLimit,
        campaignEndsAt,
        expiresIn,
      ],
    );
    if (intentType === 'campaign') {
      await connection.query(
        `UPDATE support_campaign_user_limits
            SET active_intent_id = ?, active_until = DATE_ADD(NOW(), INTERVAL ? SECOND)
          WHERE campaign_sku_id = ? AND user_id = ?`,
        [id, expiresIn, campaignSkuId, normalizedUserId],
      );
    }
    await connection.commit();
    return {
      url: buildPackageCheckoutUrl({ creatorId: apiConfig.creatorUserId, amount }, token),
      expiresIn,
      firstPurchaseCandidate,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getAfdianSupportState({ userId = '', authenticated = false, db = pool } = {}) {
  const feature = getAfdianFeatureState();
  if (!authenticated || !userId) {
    return {
      authenticated: false,
      ...feature,
      linked: false,
      orderCount: 0,
      totalAmount: '0.00',
    };
  }
  const [[links], [totals], publicPreference, recentOrders] = await Promise.all([
    db.query(
      `SELECT linked_at, provider_user_id, provider_name, provider_avatar_url, identity_refreshed_at
         FROM support_account_links
        WHERE user_id = ?
        LIMIT 1`,
      [userId],
    ),
    db.query(
      `SELECT COUNT(*) AS order_count, COALESCE(SUM(o.total_amount), 0) AS total_amount,
              MAX(COALESCE(o.ranking_observed_at, o.verified_at, o.create_time)) AS last_support_at
         FROM support_orders o
        WHERE o.light_note_user_id = ?
          AND o.verification_state = 'api_verified'
          AND o.provider_status = 2
          AND o.order_purpose IN ('legacy_support','donation')
          AND o.ownership_source <> 'conflict'`,
      [userId],
    ),
    getAfdianPublicPreference({ userId, db }),
    getAfdianUserOrders({ userId, page: 1, pageSize: 3, scope: 'support', db }),
  ]);
  const link = links[0] || null;
  let providerAccount = link ? { name: link.provider_name || null, avatarUrl: link.provider_avatar_url || null } : null;
  if (shouldRefreshAfdianProfile(link)) {
    try {
      const profile = await refreshAfdianAccountProfile({
        userId,
        providerUserId: link.provider_user_id,
        db,
      });
      providerAccount = { name: profile.providerName, avatarUrl: profile.providerAvatarUrl };
    } catch (error) {
      console.warn('[afdian] 关联账号资料刷新失败 code=%s', stableAgentErrorCode(error));
    }
  }
  return {
    authenticated: true,
    ...feature,
    linked: Boolean(link),
    linkedAt: link?.linked_at || null,
    providerAccount,
    orderCount: Number(totals[0]?.order_count || 0),
    totalAmount: Number(totals[0]?.total_amount || 0).toFixed(2),
    lastSupportAt: totals[0]?.last_support_at || null,
    publicPreference,
    recentOrders: recentOrders.items,
  };
}

/** 用户权益商店订单摘要；与纯支持统计、榜单偏好和爱发电关联信息完全分离。 */
export async function getAfdianEntitlementStoreState({ userId = '', authenticated = false, db = pool } = {}) {
  const feature = getAfdianFeatureState();
  if (!authenticated || !userId) {
    return {
      authenticated: false,
      orderSyncAvailable: feature.orderSyncAvailable,
      orderCount: 0,
      totalAmount: '0.00',
      grantedTokens: 0,
      grantedStorageMb: 0,
      recentOrders: [],
    };
  }
  const [[totals], recentOrders] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS order_count, COALESCE(SUM(o.total_amount), 0) AS total_amount,
              COALESCE(SUM(e.granted_ai_tokens), 0) AS granted_tokens,
              COALESCE(SUM(e.granted_storage_mb), 0) AS granted_storage_mb,
              MAX(COALESCE(o.verified_at, o.create_time)) AS last_purchase_at
         FROM support_orders o
         LEFT JOIN support_entitlement_grants e ON e.support_order_id = o.id
        WHERE o.light_note_user_id = ?
          AND o.verification_state = 'api_verified'
          AND o.provider_status = 2
          AND o.order_purpose = 'entitlement_purchase'`,
      [userId],
    ),
    getAfdianUserOrders({ userId, page: 1, pageSize: 4, scope: 'purchase', db }),
  ]);
  return {
    authenticated: true,
    orderSyncAvailable: feature.orderSyncAvailable,
    orderCount: Number(totals[0]?.order_count || 0),
    totalAmount: Number(totals[0]?.total_amount || 0).toFixed(2),
    grantedTokens: Number(totals[0]?.granted_tokens || 0),
    grantedStorageMb: Number(totals[0]?.granted_storage_mb || 0),
    lastPurchaseAt: totals[0]?.last_purchase_at || null,
    recentOrders: recentOrders.items,
  };
}

export function resolveAfdianOwnership({ currentUserId, currentSource = '', linkUserIds, intent }) {
  const evidence = new Set(linkUserIds);
  if (intent?.user_id) evidence.add(String(intent.user_id));
  if (evidence.size > 1) {
    return { userId: currentUserId || null, source: 'conflict' };
  }
  const [evidenceUserId] = evidence;
  if (currentUserId && evidenceUserId && currentUserId !== evidenceUserId) {
    return { userId: currentUserId, source: 'conflict' };
  }
  const userId = currentUserId || evidenceUserId || null;
  if (!userId) return { userId: null, source: 'unlinked' };
  if (currentUserId && evidence.size === 0) return { userId, source: currentSource || 'unlinked' };
  if (intent && linkUserIds.has(userId)) return { userId, source: 'oauth_checkout' };
  if (linkUserIds.has(userId)) return { userId, source: 'oauth' };
  if (intent) return { userId, source: 'checkout' };
  return { userId, source: 'unlinked' };
}

async function findMatchingIntent(connection, order) {
  if (!order.customOrderId) return null;
  const [rows] = await connection.query(
    `SELECT id, user_id, provider_user_id, provider_private_id, expires_at, first_used_at,
            intent_type, consumed_order_id
       FROM support_checkout_intents
      WHERE token_hash = ?
      LIMIT 1
      FOR UPDATE`,
    [sha256(order.customOrderId)],
  );
  const intent = rows[0] || null;
  if (!intent) return null;
  const intentType = String(intent.intent_type || 'legacy');
  if (intentType === 'legacy' && !intent.first_used_at && new Date(intent.expires_at).getTime() < Date.now()) {
    return null;
  }
  if (
    intent.first_used_at &&
    !providerIdentityMatches(
      { providerUserId: intent.provider_user_id, providerPrivateId: intent.provider_private_id },
      order,
    )
  ) {
    return intentType === 'legacy' ? null : { ...intent, identity_conflict: true };
  }
  return intent;
}

async function findLinkedUsers(connection, order) {
  const params = [order.providerUserId];
  let privateClause = '';
  if (order.providerPrivateId) {
    privateClause = ' OR provider_private_id = ?';
    params.push(order.providerPrivateId);
  }
  const [rows] = await connection.query(
    `SELECT user_id
       FROM support_account_links
      WHERE provider_user_id = ?${privateClause}
      FOR UPDATE`,
    params,
  );
  return new Set(rows.map((row) => String(row.user_id)));
}

export async function applyVerifiedAfdianOrder(input, { db = pool } = {}) {
  const order = input?.providerOrderNo ? input : normalizeAfdianOrder(input);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [existingRows] = await connection.query(
      `SELECT id, checkout_intent_id, light_note_user_id, ownership_source, order_purpose
         FROM support_orders
        WHERE provider_order_no = ?
        LIMIT 1
        FOR UPDATE`,
      [order.providerOrderNo],
    );
    const existing = existingRows[0] || null;
    const intent = await findMatchingIntent(connection, order);
    const hasCustomOrderId = Boolean(order.customOrderId);
    const persistedPurpose = String(existing?.order_purpose || '');
    const pureSupportActivatedEpoch =
      !intent && !hasCustomOrderId && !KNOWN_ORDER_PURPOSES.has(persistedPurpose)
        ? await loadPureSupportActivatedEpoch(connection)
        : 0;
    const purposeEvidence = {
      intent,
      hasCustomOrderId,
      providerCreatedAt: order.providerCreatedAt,
      pureSupportActivatedEpoch,
    };
    const incomingPurpose = resolveAfdianOrderPurpose(purposeEvidence);
    const orderPurpose = resolveAfdianOrderPurpose({
      ...purposeEvidence,
      existingPurpose: persistedPurpose,
    });
    const purposeConflict = Boolean(
      existing &&
      KNOWN_ORDER_PURPOSES.has(String(existing.order_purpose || '')) &&
      hasCustomOrderId &&
      incomingPurpose !== String(existing.order_purpose),
    );
    const identityConflict = Boolean(intent?.identity_conflict);
    const ownershipIntent = purposeConflict ? null : intent;
    const linkUserIds = await findLinkedUsers(connection, order);
    const resolvedOwnership = resolveAfdianOwnership({
      currentUserId: existing?.light_note_user_id ? String(existing.light_note_user_id) : null,
      currentSource: String(existing?.ownership_source || ''),
      linkUserIds,
      intent: ownershipIntent,
    });
    const ownership = purposeConflict || identityConflict
      ? {
          userId:
            existing?.light_note_user_id || intent?.user_id || resolvedOwnership.userId || null,
          source: 'conflict',
        }
      : resolvedOwnership;
    const checkoutIntentId = purposeConflict
      ? existing?.checkout_intent_id || null
      : intent?.id || existing?.checkout_intent_id || null;
    const id = existing?.id || crypto.randomUUID();
    await connection.query(
      `INSERT INTO support_orders
        (id, provider_order_no, provider_user_id, provider_private_id, checkout_intent_id,
         light_note_user_id, ownership_source, order_purpose, plan_id, product_type, month, total_amount,
         show_amount, provider_status, provider_created_at, verification_state, verified_at, ranking_observed_at,
         retry_count, next_retry_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?), 'api_verified', NOW(), NOW(), 0, NULL)
       ON DUPLICATE KEY UPDATE
         provider_user_id = VALUES(provider_user_id),
         provider_private_id = VALUES(provider_private_id),
         checkout_intent_id = VALUES(checkout_intent_id),
         light_note_user_id = VALUES(light_note_user_id),
         ownership_source = VALUES(ownership_source),
         order_purpose = CASE
           WHEN order_purpose = 'unknown' THEN VALUES(order_purpose)
           ELSE order_purpose
         END,
         plan_id = VALUES(plan_id),
         product_type = VALUES(product_type),
         month = VALUES(month),
         total_amount = VALUES(total_amount),
         show_amount = VALUES(show_amount),
         provider_status = VALUES(provider_status),
         provider_created_at = COALESCE(VALUES(provider_created_at), provider_created_at),
         verification_state = 'api_verified',
         verified_at = COALESCE(verified_at, NOW()),
         retry_count = 0,
         next_retry_at = NULL`,
      [
        id,
        order.providerOrderNo,
        order.providerUserId,
        order.providerPrivateId,
        checkoutIntentId,
        ownership.userId,
        ownership.source,
        orderPurpose,
        order.planId,
        order.productType,
        order.month,
        order.totalAmount,
        order.showAmount,
        order.providerStatus,
        order.providerCreatedAt || null,
      ],
    );
    if (intent) {
      await connection.query(
        `UPDATE support_checkout_intents
            SET provider_user_id = COALESCE(provider_user_id, ?),
                provider_private_id = COALESCE(provider_private_id, ?),
                first_used_at = COALESCE(first_used_at, NOW())
          WHERE id = ?`,
        [order.providerUserId, order.providerPrivateId, intent.id],
      );
    }
    const reward = await syncAfdianRewardForOrder(connection, id);
    await connection.commit();
    invalidateAfdianLeaderboardCache();
    return { providerOrderNo: order.providerOrderNo, ...ownership, reward };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function ingestAfdianWebhookOrder(order, { db = pool } = {}) {
  const normalized = normalizeAfdianOrder(order);
  await db.query(
    `INSERT INTO support_orders
      (id, provider_order_no, provider_user_id, plan_id, total_amount, show_amount,
       provider_status, verification_state, webhook_signature_valid, webhook_received_at,
       ranking_observed_at, next_retry_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, 'pending', 1, NOW(), NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       provider_user_id = IF(verification_state = 'pending', VALUES(provider_user_id), provider_user_id),
       plan_id = IF(verification_state = 'pending', VALUES(plan_id), plan_id),
       total_amount = IF(verification_state = 'pending', VALUES(total_amount), total_amount),
       show_amount = IF(verification_state = 'pending', VALUES(show_amount), show_amount),
       webhook_signature_valid = 1,
       webhook_received_at = NOW(),
       ranking_observed_at = IF(
         verification_state = 'pending',
         COALESCE(ranking_observed_at, NOW()),
         ranking_observed_at
       ),
       next_retry_at = IF(verification_state = 'pending', NOW(), next_retry_at)`,
    [
      crypto.randomUUID(),
      normalized.providerOrderNo,
      normalized.providerUserId,
      normalized.planId,
      normalized.totalAmount,
      normalized.totalAmount,
    ],
  );
  return normalized.providerOrderNo;
}

async function markReconcileFailure(providerOrderNo, db = pool) {
  await db.query(
    `UPDATE support_orders
        SET verification_state = 'pending',
            retry_count = retry_count + 1,
            next_retry_at = CASE
              WHEN retry_count < 4 THEN DATE_ADD(NOW(), INTERVAL 5 MINUTE)
              WHEN retry_count < 8 THEN DATE_ADD(NOW(), INTERVAL 30 MINUTE)
              ELSE DATE_ADD(NOW(), INTERVAL 360 MINUTE)
            END
      WHERE provider_order_no = ?
        AND verification_state <> 'api_verified'`,
    [providerOrderNo],
  );
}

export async function reconcileAfdianOrder(providerOrderNo, { db = pool } = {}) {
  try {
    const { list } = await queryAfdianOrders({ out_trade_no: providerOrderNo });
    const order = list.find((item) => item.providerOrderNo === providerOrderNo);
    if (!order) throw afdianError('AFDIAN_ORDER_NOT_FOUND', '爱发电暂未返回该订单', 404);
    return await applyVerifiedAfdianOrder(order, { db });
  } catch (error) {
    await markReconcileFailure(providerOrderNo, db).catch(() => {});
    throw error;
  }
}

export async function linkAfdianAccount({
  userId,
  providerUserId,
  providerPrivateId = null,
  providerName = null,
  providerAvatarUrl = null,
  db = pool,
}) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [userLinks] = await connection.query(
      'SELECT id, provider_user_id, provider_private_id FROM support_account_links WHERE user_id = ? LIMIT 1 FOR UPDATE',
      [userId],
    );
    const params = [providerUserId];
    let privateClause = '';
    if (providerPrivateId) {
      privateClause = ' OR provider_private_id = ?';
      params.push(providerPrivateId);
    }
    const [providerLinks] = await connection.query(
      `SELECT user_id FROM support_account_links WHERE provider_user_id = ?${privateClause} FOR UPDATE`,
      params,
    );
    if (providerLinks.some((row) => String(row.user_id) !== String(userId))) {
      throw afdianError('AFDIAN_ACCOUNT_ALREADY_LINKED', '该爱发电账号已关联其他轻笺账号', 409);
    }
    const current = userLinks[0];
    if (
      current &&
      !providerIdentityMatches(
        { providerUserId: current.provider_user_id, providerPrivateId: current.provider_private_id },
        { providerUserId, providerPrivateId },
      )
    ) {
      throw afdianError('AFDIAN_LINK_REPLACE_REQUIRES_UNLINK', '请先解除原有爱发电关联', 409);
    }
    if (current) {
      await connection.query(
        `UPDATE support_account_links
            SET provider_user_id = ?, provider_private_id = ?,
                provider_name = COALESCE(?, provider_name),
                provider_avatar_url = COALESCE(?, provider_avatar_url),
                identity_refreshed_at = CASE
                  WHEN ? IS NULL AND ? IS NULL THEN identity_refreshed_at
                  ELSE NOW()
                END,
                linked_at = NOW()
          WHERE id = ?`,
        [
          providerUserId,
          providerPrivateId,
          providerName,
          providerAvatarUrl,
          providerName,
          providerAvatarUrl,
          current.id,
        ],
      );
    } else {
      await connection.query(
        `INSERT INTO support_account_links
          (id, user_id, provider_user_id, provider_private_id, provider_name,
           provider_avatar_url, identity_refreshed_at)
         VALUES (?, ?, ?, ?, ?, ?, CASE WHEN ? IS NULL AND ? IS NULL THEN NULL ELSE NOW() END)`,
        [
          crypto.randomUUID(),
          userId,
          providerUserId,
          providerPrivateId,
          providerName,
          providerAvatarUrl,
          providerName,
          providerAvatarUrl,
        ],
      );
    }
    const identityParams = [providerUserId];
    let orderPrivateClause = '';
    if (providerPrivateId) {
      orderPrivateClause = ' OR o.provider_private_id = ?';
      identityParams.push(providerPrivateId);
    }
    await connection.query(
      `UPDATE support_orders o
       LEFT JOIN support_checkout_intents i ON i.id = o.checkout_intent_id
          SET o.ownership_source = CASE
                WHEN o.light_note_user_id IS NOT NULL AND o.light_note_user_id <> ? THEN 'conflict'
                WHEN i.user_id = ? THEN 'oauth_checkout'
                ELSE 'oauth'
              END,
              o.light_note_user_id = CASE
                WHEN o.light_note_user_id IS NOT NULL AND o.light_note_user_id <> ? THEN o.light_note_user_id
                ELSE ?
              END
        WHERE o.verification_state = 'api_verified'
          AND (o.provider_user_id = ?${orderPrivateClause})`,
      [userId, userId, userId, userId, ...identityParams],
    );
    await syncAfdianRewardsForUser(connection, userId);
    await connection.commit();
    invalidateAfdianLeaderboardCache();
  } catch (error) {
    await connection.rollback();
    if (error?.code === 'ER_DUP_ENTRY') {
      throw afdianError('AFDIAN_ACCOUNT_ALREADY_LINKED', '该爱发电账号已关联其他轻笺账号', 409);
    }
    throw error;
  } finally {
    connection.release();
  }
}

export async function unlinkAfdianAccount({ userId, db = pool }) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [links] = await connection.query(
      'SELECT provider_user_id, provider_private_id FROM support_account_links WHERE user_id = ? LIMIT 1 FOR UPDATE',
      [userId],
    );
    const link = links[0];
    if (!link) {
      await connection.commit();
      return { unlinked: false };
    }
    await connection.query('DELETE FROM support_account_links WHERE user_id = ?', [userId]);
    const params = [link.provider_user_id];
    let privateClause = '';
    if (link.provider_private_id) {
      privateClause = ' OR o.provider_private_id = ?';
      params.push(link.provider_private_id);
    }
    await connection.query(
      `UPDATE support_orders o
       LEFT JOIN support_checkout_intents i ON i.id = o.checkout_intent_id
          SET o.ownership_source = CASE WHEN i.user_id IS NOT NULL THEN 'checkout' ELSE 'unlinked' END,
              o.light_note_user_id = i.user_id
        WHERE o.light_note_user_id = ?
          AND (o.provider_user_id = ?${privateClause})`,
      [userId, ...params],
    );
    await connection.commit();
    invalidateAfdianLeaderboardCache();
    return { unlinked: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

let syncPromise = null;
let lastFullSyncAt = 0;

export function syncAfdianOrderHistory({ db = pool, force = false } = {}) {
  if (syncPromise) return syncPromise;
  if (!force && Date.now() - lastFullSyncAt < FULL_SYNC_INTERVAL_MS) {
    return Promise.resolve({ synced: 0, truncated: false, skipped: true });
  }
  syncPromise = (async () => {
    let page = 1;
    let totalPage = 1;
    let reportedTotalPage = 1;
    let synced = 0;
    do {
      const result = await queryAfdianOrders({ page, per_page: 100 });
      reportedTotalPage = result.totalPage;
      totalPage = Math.min(reportedTotalPage, MAX_SYNC_PAGES);
      for (const order of result.list) {
        await applyVerifiedAfdianOrder(order, { db });
        synced += 1;
      }
      page += 1;
    } while (page <= totalPage);
    lastFullSyncAt = Date.now();
    return { synced, truncated: reportedTotalPage > MAX_SYNC_PAGES };
  })().finally(() => {
    syncPromise = null;
  });
  return syncPromise;
}

export async function reconcilePendingAfdianOrders({ db = pool } = {}) {
  const [rows] = await db.query(
    `SELECT provider_order_no
       FROM support_orders
      WHERE verification_state = 'pending'
        AND (next_retry_at IS NULL OR next_retry_at <= NOW())
      ORDER BY next_retry_at ASC, create_time ASC
      LIMIT ?`,
    [PENDING_BATCH_SIZE],
  );
  for (const row of rows) {
    await reconcileAfdianOrder(String(row.provider_order_no), { db }).catch((error) => {
      console.warn('[afdian] 订单复核失败 code=%s', stableAgentErrorCode(error));
    });
  }
}

let schedulerStarted = false;

export function startAfdianReconciliationScheduler({ db = pool } = {}) {
  if (schedulerStarted || !getAfdianApiConfig({ required: false })) return false;
  schedulerStarted = true;
  let running = null;
  const run = () => {
    if (running) return running;
    running = (async () => {
      await reconcilePendingAfdianOrders({ db });
      if (Date.now() - lastFullSyncAt >= FULL_SYNC_INTERVAL_MS) await syncAfdianOrderHistory({ db });
      await db
        .query(
          `DELETE FROM support_checkout_intents
            WHERE first_used_at IS NULL
              AND expires_at < NOW()
              AND intent_type = 'legacy'
            LIMIT 500`,
        )
        .catch(() => {});
    })().finally(() => {
      running = null;
    });
    return running;
  };
  const initial = setTimeout(() => {
    run().catch((error) => console.error('[afdian] 初始订单同步失败 code=%s', stableAgentErrorCode(error)));
  }, 60_000);
  initial.unref?.();
  const interval = setInterval(() => {
    run().catch((error) => console.error('[afdian] 订单同步失败 code=%s', stableAgentErrorCode(error)));
  }, RECONCILE_INTERVAL_MS);
  interval.unref?.();
  return true;
}
