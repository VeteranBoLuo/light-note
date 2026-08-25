import crypto from 'node:crypto';
import { AFDIAN_CHECKOUT_OPTIONS } from '@lightnote/shared';
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

const CHECKOUT_TOKEN_TTL_DAYS = 30;
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
      (id, token_hash, user_id, option_key, expires_at)
     VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))`,
    [id, sha256(token), userId, option.key, CHECKOUT_TOKEN_TTL_DAYS],
  );
  return { url: buildCheckoutUrl(option, token), expiresIn: CHECKOUT_TOKEN_TTL_DAYS * 24 * 60 * 60 };
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
      grantedTokens: 0,
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
              COALESCE(SUM(g.granted_tokens), 0) AS granted_tokens,
              MAX(COALESCE(o.ranking_observed_at, o.verified_at, o.create_time)) AS last_support_at
         FROM support_orders o
         LEFT JOIN support_reward_grants g ON g.support_order_id = o.id
        WHERE o.light_note_user_id = ?
          AND o.verification_state = 'api_verified'
          AND o.provider_status = 2`,
      [userId],
    ),
    getAfdianPublicPreference({ userId, db }),
    getAfdianUserOrders({ userId, page: 1, pageSize: 3, db }),
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
    grantedTokens: Number(totals[0]?.granted_tokens || 0),
    lastSupportAt: totals[0]?.last_support_at || null,
    publicPreference,
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
    `SELECT id, user_id, provider_user_id, provider_private_id, expires_at, first_used_at
       FROM support_checkout_intents
      WHERE token_hash = ?
        AND (first_used_at IS NOT NULL OR expires_at >= NOW())
      LIMIT 1
      FOR UPDATE`,
    [sha256(order.customOrderId)],
  );
  const intent = rows[0] || null;
  if (!intent) return null;
  if (
    intent.first_used_at &&
    !providerIdentityMatches(
      { providerUserId: intent.provider_user_id, providerPrivateId: intent.provider_private_id },
      order,
    )
  ) {
    return null;
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
      `SELECT id, light_note_user_id, ownership_source
         FROM support_orders
        WHERE provider_order_no = ?
        LIMIT 1
        FOR UPDATE`,
      [order.providerOrderNo],
    );
    const existing = existingRows[0] || null;
    const intent = await findMatchingIntent(connection, order);
    const linkUserIds = await findLinkedUsers(connection, order);
    const ownership = resolveAfdianOwnership({
      currentUserId: existing?.light_note_user_id ? String(existing.light_note_user_id) : null,
      currentSource: String(existing?.ownership_source || ''),
      linkUserIds,
      intent,
    });
    const id = existing?.id || crypto.randomUUID();
    await connection.query(
      `INSERT INTO support_orders
        (id, provider_order_no, provider_user_id, provider_private_id, checkout_intent_id,
         light_note_user_id, ownership_source, plan_id, product_type, month, total_amount,
         show_amount, provider_status, provider_created_at, verification_state, verified_at, ranking_observed_at,
         retry_count, next_retry_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?), 'api_verified', NOW(), NOW(), 0, NULL)
       ON DUPLICATE KEY UPDATE
         provider_user_id = VALUES(provider_user_id),
         provider_private_id = VALUES(provider_private_id),
         checkout_intent_id = VALUES(checkout_intent_id),
         light_note_user_id = VALUES(light_note_user_id),
         ownership_source = VALUES(ownership_source),
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
        intent?.id || null,
        ownership.userId,
        ownership.source,
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
