import pool from '../db/index.js';
import { afdianError } from './afdianConfig.js';
import { getSupportPackageFeatureState, calculateSupportPackageCost } from './afdianSupportPackageCatalog.js';

const ID = /^[0-9a-f-]{36}$/i;
export function campaignLifecycle(campaign, now = new Date()) {
  if (new Date(campaign.ends_at).getTime() <= now.getTime()) return 'ended';
  if (campaign.status === 'suspended') return 'paused';
  return new Date(campaign.starts_at).getTime() > now.getTime() ? 'upcoming' : 'active';
}

export async function setCampaignVisibility({ campaignId, enabled, actorUserId, db = pool, env = process.env, now }) {
  if (!ID.test(String(campaignId)) || typeof enabled !== 'boolean')
    throw afdianError('SUPPORT_CAMPAIGN_INPUT_INVALID', '活动参数无效', 400);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    // The same lock is acquired before creating a campaign checkout intent.
    await connection.query('SELECT id FROM support_campaign_visibility_lock WHERE id = 1 FOR UPDATE');
    const [rows] = await connection.query('SELECT id, status, ends_at FROM support_campaigns WHERE id = ? FOR UPDATE', [
      campaignId,
    ]);
    const campaign = rows[0];
    now ||= new Date();
    if (!campaign) throw afdianError('SUPPORT_CAMPAIGN_NOT_FOUND', '活动不存在', 404);
    if (enabled) {
      const feature = getSupportPackageFeatureState(env);
      if (
        !feature.campaignsEnabled ||
        !feature.checkoutEnabled ||
        campaign.status !== 'published' ||
        new Date(campaign.ends_at).getTime() <= now.getTime()
      ) {
        throw afdianError('SUPPORT_CAMPAIGN_OPEN_BLOCKED', '请检查活动发布状态、日期与服务开关', 409);
      }
      const [skus] = await connection.query(
        'SELECT amount, ai_tokens, storage_mb FROM support_campaign_skus WHERE campaign_id = ? FOR UPDATE',
        [campaignId],
      );
      if (
        !skus.length ||
        skus.some(
          (sku) =>
            !calculateSupportPackageCost({ amount: sku.amount, aiTokens: sku.ai_tokens, storageMb: sku.storage_mb })
              .passes,
        )
      ) {
        throw afdianError('SUPPORT_CAMPAIGN_COST_BLOCKED', '当前成本核验未通过', 409);
      }
      await connection.query(
        'UPDATE support_campaigns SET public_enabled = 0, public_updated_by = ?, public_updated_at = NOW() WHERE public_enabled = 1 AND id <> ?',
        [actorUserId, campaignId],
      );
    }
    await connection.query(
      'UPDATE support_campaigns SET public_enabled = ?, public_updated_by = ?, public_updated_at = NOW() WHERE id = ?',
      [enabled ? 1 : 0, actorUserId, campaignId],
    );
    await connection.commit();
    return { publicEnabled: enabled };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getCampaignPresentation({
  campaignKey,
  userId = '',
  db = pool,
  env = process.env,
  now = new Date(),
  entryOnly = false,
}) {
  const feature = getSupportPackageFeatureState(env);
  if (!feature.campaignsEnabled) return null;
  if (campaignKey !== undefined && !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(campaignKey)) return null;
  const [rows] = await db.query(
    `SELECT id, campaign_key, version, title, description, status, starts_at, ends_at
       FROM support_campaigns WHERE public_enabled = 1 AND status IN ('published', 'suspended')
       ${campaignKey ? 'AND campaign_key = ?' : ''} ORDER BY version DESC LIMIT 1`,
    campaignKey ? [campaignKey] : [],
  );
  const c = rows[0];
  if (!c) return null;
  const lifecycle = campaignLifecycle(c, now);
  if (entryOnly && (lifecycle === 'ended' || lifecycle === 'paused' || !feature.checkoutEnabled)) return null;
  const result = {
    campaignKey: c.campaign_key,
    campaignVersion: Number(c.version),
    title: c.title,
    description: c.description,
    serverNow: now.toISOString(),
    startsAt: new Date(c.starts_at).toISOString(),
    endsAt: new Date(c.ends_at).toISOString(),
    lifecycle,
    checkoutEnabled: feature.checkoutEnabled && lifecycle === 'active',
    themeKey: 'autumn-desk-v1',
  };
  if (entryOnly) return result;
  const [skus] = await db.query(
    `SELECT s.*, COALESCE(l.completed_count, 0) AS completed_count, l.active_intent_id, l.active_until
      FROM support_campaign_skus s LEFT JOIN support_campaign_user_limits l ON l.campaign_sku_id = s.id AND l.user_id = ?
      WHERE s.campaign_id = ? ORDER BY s.sort_order, s.id`,
    [userId, c.id],
  );
  result.packages = skus.map((s) => ({
    campaignId: c.id,
    campaignKey: c.campaign_key,
    campaignVersion: Number(c.version),
    catalogVersion: `campaign:${c.id}:v${Number(c.version)}`,
    campaignTitle: c.title,
    description: c.description,
    startsAt: result.startsAt,
    endsAt: result.endsAt,
    campaignSkuId: s.id,
    skuId: s.sku_id,
    title: s.title,
    category: s.category,
    amount: Number(s.amount),
    benefit: { aiTokens: Number(s.ai_tokens), storageMb: Number(s.storage_mb) },
    perUserLimit: Number(s.per_user_limit),
    completedCount: Number(s.completed_count),
    remainingPurchases: Math.max(0, Number(s.per_user_limit) - Number(s.completed_count)),
    limitReached: Number(s.completed_count) >= Number(s.per_user_limit),
    hasActiveCheckout: Boolean(s.active_intent_id && new Date(s.active_until).getTime() > now.getTime()),
  }));
  return result;
}

export async function getCheckoutStatus({ intentId, userId, db = pool, now = new Date() }) {
  if (!ID.test(String(intentId))) throw afdianError('SUPPORT_INTENT_NOT_FOUND', '订单不存在', 404);
  const [rows] = await db.query(
    `SELECT i.id, i.intent_status, i.expires_at, i.quoted_amount, i.quoted_ai_tokens, i.quoted_storage_mb,
      i.consumed_order_id, g.grant_status, g.granted_ai_tokens, g.granted_storage_mb
      FROM support_checkout_intents i LEFT JOIN support_entitlement_grants g ON g.checkout_intent_id = i.id
        AND (i.consumed_order_id IS NULL OR g.support_order_id = i.consumed_order_id)
      WHERE i.id = ? AND i.user_id = ? ORDER BY g.create_time DESC LIMIT 1`,
    [intentId, userId],
  );
  const row = rows[0];
  if (!row) throw afdianError('SUPPORT_INTENT_NOT_FOUND', '订单不存在', 404);
  let status = 'pending';
  if (row.grant_status === 'credited') status = 'credited';
  else if (row.grant_status === 'pending') status = 'processing';
  else if (row.grant_status) status = 'review';
  else if (row.consumed_order_id) status = 'processing';
  else if (['cancelled', 'expired'].includes(row.intent_status) || new Date(row.expires_at).getTime() <= now.getTime())
    status = 'expired';
  return {
    intentId: row.id,
    status,
    expiresAt: row.expires_at,
    amount: Number(row.quoted_amount),
    benefit: {
      aiTokens: Number(status === 'credited' ? row.granted_ai_tokens : row.quoted_ai_tokens),
      storageMb: Number(status === 'credited' ? row.granted_storage_mb : row.quoted_storage_mb),
    },
  };
}
