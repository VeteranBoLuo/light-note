import crypto from 'node:crypto';
import pool from '../db/index.js';
import { afdianError } from './afdianConfig.js';
import {
  SUPPORT_CAMPAIGN_MIN_MARGIN_BPS,
  SUPPORT_COST_POLICY_VERSION,
  calculateSupportPackageCost,
  normalizeSupportCampaignSkus,
} from './afdianSupportPackageCatalog.js';

const CAMPAIGN_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{2,63}$/;
const CAMPAIGN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;

function normalizedActorUserId(value) {
  const actorUserId = String(value || '').trim();
  if (!actorUserId) throw afdianError('ROOT_REQUIRED', '缺少活动操作人', 403);
  return actorUserId;
}

function normalizedDate(value, field) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw afdianError('SUPPORT_CAMPAIGN_TIME_INVALID', `${field} 不合法`, 400);
  return date;
}

function campaignInput(input) {
  const campaignKey = String(input?.campaignKey || '').trim();
  const title = String(input?.title || '').trim();
  const description = String(input?.description || '').trim();
  if (!CAMPAIGN_KEY_PATTERN.test(campaignKey)) {
    throw afdianError('SUPPORT_CAMPAIGN_KEY_INVALID', '活动标识仅支持小写字母、数字、横线和下划线', 400);
  }
  if (!title || title.length > 120 || description.length > 500) {
    throw afdianError('SUPPORT_CAMPAIGN_CONTENT_INVALID', '活动名称或说明不合法', 400);
  }
  const startsAt = normalizedDate(input?.startsAt, '开始时间');
  const endsAt = normalizedDate(input?.endsAt, '结束时间');
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw afdianError('SUPPORT_CAMPAIGN_TIME_INVALID', '活动结束时间必须晚于开始时间', 400);
  }
  return {
    campaignKey,
    title,
    description,
    startsAt,
    endsAt,
    skus: normalizeSupportCampaignSkus(input?.skus),
  };
}

export function supportCampaignCatalogVersion(campaignId, version) {
  return `campaign:${campaignId}:v${Number(version)}`;
}

export function previewSupportCampaignCosts(skus) {
  const normalized = normalizeSupportCampaignSkus(skus);
  return {
    policyVersion: SUPPORT_COST_POLICY_VERSION,
    minimumMarginBps: SUPPORT_CAMPAIGN_MIN_MARGIN_BPS,
    passes: normalized.every((item) => item.cost.passes),
    items: normalized.map((item) => ({
      skuId: item.skuId,
      title: item.title,
      amount: item.amount,
      aiTokens: item.aiTokens,
      storageMb: item.storageMb,
      ...item.cost,
    })),
  };
}

async function loadCampaign(connection, campaignId, { forUpdate = false } = {}) {
  if (!CAMPAIGN_ID_PATTERN.test(String(campaignId || ''))) {
    throw afdianError('SUPPORT_CAMPAIGN_ID_INVALID', '活动 ID 不合法', 400);
  }
  const [campaignRows] = await connection.query(
    `SELECT id, campaign_key, version, title, description, status, starts_at, ends_at,
            cost_policy_version, created_by, published_by, published_at, suspended_by, suspended_at,
            create_time, update_time
       FROM support_campaigns
      WHERE id = ?
      LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [campaignId],
  );
  if (!campaignRows[0]) throw afdianError('SUPPORT_CAMPAIGN_NOT_FOUND', '活动不存在', 404);
  const [skuRows] = await connection.query(
    `SELECT id, sku_id, title, category, amount, ai_tokens, storage_mb,
            per_user_limit, margin_bps, sort_order
       FROM support_campaign_skus
      WHERE campaign_id = ?
      ORDER BY sort_order ASC, id ASC${forUpdate ? ' FOR UPDATE' : ''}`,
    [campaignId],
  );
  return { campaign: campaignRows[0], skus: skuRows };
}

function campaignDto(campaign, skus) {
  return {
    id: campaign.id,
    campaignKey: campaign.campaign_key,
    version: Number(campaign.version),
    catalogVersion: supportCampaignCatalogVersion(campaign.id, campaign.version),
    title: campaign.title,
    description: campaign.description || '',
    status: campaign.status,
    startsAt: campaign.starts_at,
    endsAt: campaign.ends_at,
    costPolicyVersion: campaign.cost_policy_version,
    createdBy: campaign.created_by,
    publishedBy: campaign.published_by || null,
    publishedAt: campaign.published_at || null,
    suspendedBy: campaign.suspended_by || null,
    suspendedAt: campaign.suspended_at || null,
    createTime: campaign.create_time,
    updateTime: campaign.update_time,
    skus: skus.map((sku) => ({
      campaignSkuId: sku.id,
      skuId: sku.sku_id,
      title: sku.title,
      category: sku.category,
      amount: Number(sku.amount).toFixed(2),
      aiTokens: Number(sku.ai_tokens),
      storageMb: Number(sku.storage_mb),
      perUserLimit: Number(sku.per_user_limit),
      marginBps: Number(sku.margin_bps),
      sortOrder: Number(sku.sort_order),
    })),
  };
}

export async function createSupportCampaignDraft({ actorUserId, input, db = pool }) {
  const normalizedActor = normalizedActorUserId(actorUserId);
  const draft = campaignInput(input);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [versionRows] = await connection.query(
      'SELECT COALESCE(MAX(version), 0) AS max_version FROM support_campaigns WHERE campaign_key = ? FOR UPDATE',
      [draft.campaignKey],
    );
    const version = Number(versionRows[0]?.max_version || 0) + 1;
    const campaignId = crypto.randomUUID();
    await connection.query(
      `INSERT INTO support_campaigns
        (id, campaign_key, version, title, description, status, starts_at, ends_at,
         cost_policy_version, created_by)
       VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`,
      [
        campaignId,
        draft.campaignKey,
        version,
        draft.title,
        draft.description,
        draft.startsAt,
        draft.endsAt,
        SUPPORT_COST_POLICY_VERSION,
        normalizedActor,
      ],
    );
    for (const sku of draft.skus) {
      await connection.query(
        `INSERT INTO support_campaign_skus
          (id, campaign_id, sku_id, title, category, amount, ai_tokens, storage_mb,
           per_user_limit, margin_bps, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          campaignId,
          sku.skuId,
          sku.title,
          sku.category,
          sku.amount,
          sku.aiTokens,
          sku.storageMb,
          sku.perUserLimit,
          sku.cost.marginBps,
          sku.sortOrder,
        ],
      );
    }
    const loaded = await loadCampaign(connection, campaignId);
    await connection.commit();
    return campaignDto(loaded.campaign, loaded.skus);
  } catch (error) {
    await connection.rollback();
    if (error?.code === 'ER_DUP_ENTRY') {
      throw afdianError(
        'SUPPORT_CAMPAIGN_VERSION_CONFLICT',
        '活动版本已存在，或同一活动内的套餐标识重复',
        409,
      );
    }
    throw error;
  } finally {
    connection.release();
  }
}

export async function publishSupportCampaign({ campaignId, actorUserId, db = pool, now = new Date() }) {
  const normalizedActor = normalizedActorUserId(actorUserId);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const loaded = await loadCampaign(connection, campaignId, { forUpdate: true });
    if (loaded.campaign.status !== 'draft') {
      throw afdianError('SUPPORT_CAMPAIGN_NOT_DRAFT', '只有草稿活动可以发布', 409);
    }
    if (new Date(loaded.campaign.ends_at).getTime() <= now.getTime()) {
      throw afdianError('SUPPORT_CAMPAIGN_ALREADY_ENDED', '活动结束时间已过，不能发布', 409);
    }
    for (const sku of loaded.skus) {
      const cost = calculateSupportPackageCost({
        amount: sku.amount,
        aiTokens: Number(sku.ai_tokens),
        storageMb: Number(sku.storage_mb),
      });
      if (!cost.passes || cost.marginBps !== Number(sku.margin_bps)) {
        throw afdianError('SUPPORT_CAMPAIGN_COST_GATE_FAILED', `套餐 ${sku.sku_id} 未通过 40% 成本门禁`, 409);
      }
    }
    await connection.query(
      `UPDATE support_campaigns
          SET status = 'published', published_by = ?, published_at = NOW()
        WHERE id = ? AND status = 'draft'`,
      [normalizedActor, campaignId],
    );
    const refreshed = await loadCampaign(connection, campaignId);
    await connection.commit();
    return campaignDto(refreshed.campaign, refreshed.skus);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function suspendSupportCampaign({ campaignId, actorUserId, db = pool }) {
  const normalizedActor = normalizedActorUserId(actorUserId);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const loaded = await loadCampaign(connection, campaignId, { forUpdate: true });
    if (loaded.campaign.status !== 'published') {
      throw afdianError('SUPPORT_CAMPAIGN_NOT_PUBLISHED', '只有已发布活动可以暂停', 409);
    }
    await connection.query(
      `UPDATE support_campaigns
          SET status = 'suspended', suspended_by = ?, suspended_at = NOW()
        WHERE id = ? AND status = 'published'`,
      [normalizedActor, campaignId],
    );
    const refreshed = await loadCampaign(connection, campaignId);
    await connection.commit();
    return campaignDto(refreshed.campaign, refreshed.skus);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function listSupportCampaigns({ db = pool } = {}) {
  const [rows] = await db.query('SELECT id FROM support_campaigns ORDER BY create_time DESC, id DESC');
  const result = [];
  for (const row of rows) {
    const loaded = await loadCampaign(db, row.id);
    result.push(campaignDto(loaded.campaign, loaded.skus));
  }
  return result;
}

export async function listSupportCampaignGrants({ campaignId, db = pool }) {
  if (!CAMPAIGN_ID_PATTERN.test(String(campaignId || ''))) {
    throw afdianError('SUPPORT_CAMPAIGN_ID_INVALID', '活动 ID 不合法', 400);
  }
  const [rows] = await db.query(
    `SELECT g.id, g.support_order_id, g.user_id, g.sku_id, g.paid_amount,
            g.calculated_ai_tokens, g.calculated_storage_mb, g.granted_ai_tokens,
            g.granted_storage_mb, g.grant_status, g.reason_code, g.credited_at,
            g.create_time, o.provider_order_no
       FROM support_entitlement_grants g
       JOIN support_orders o ON o.id = g.support_order_id
      WHERE g.campaign_id = ?
      ORDER BY g.create_time DESC, g.id DESC`,
    [campaignId],
  );
  return rows.map((row) => ({
    id: row.id,
    providerOrderNo: row.provider_order_no,
    userId: row.user_id || null,
    skuId: row.sku_id,
    paidAmount: Number(row.paid_amount).toFixed(2),
    calculatedAiTokens: Number(row.calculated_ai_tokens),
    calculatedStorageMb: Number(row.calculated_storage_mb),
    grantedAiTokens: Number(row.granted_ai_tokens),
    grantedStorageMb: Number(row.granted_storage_mb),
    status: row.grant_status,
    reasonCode: row.reason_code || null,
    creditedAt: row.credited_at || null,
    createTime: row.create_time,
  }));
}

/** 在结算事务内锁定活动和用户限购状态；调用方插入意图后必须回填 active_intent_id。 */
export async function lockCampaignSkuForCheckout(
  connection,
  { campaignSkuId, catalogVersion, userId, now = new Date() },
) {
  if (!CAMPAIGN_ID_PATTERN.test(String(campaignSkuId || ''))) {
    throw afdianError('SUPPORT_CAMPAIGN_SKU_INVALID', '活动套餐不存在', 404);
  }
  const [rows] = await connection.query(
    `SELECT s.id, s.sku_id, s.title, s.category, s.amount, s.ai_tokens, s.storage_mb,
            s.per_user_limit, s.margin_bps, c.id AS campaign_id, c.campaign_key,
            c.version, c.title AS campaign_title, c.starts_at, c.ends_at, c.status
       FROM support_campaign_skus s
       JOIN support_campaigns c ON c.id = s.campaign_id
      WHERE s.id = ?
      LIMIT 1
      FOR UPDATE`,
    [campaignSkuId],
  );
  const sku = rows[0];
  if (!sku) throw afdianError('SUPPORT_CAMPAIGN_SKU_INVALID', '活动套餐不存在', 404);
  if (supportCampaignCatalogVersion(sku.campaign_id, sku.version) !== String(catalogVersion || '')) {
    throw afdianError('SUPPORT_CATALOG_VERSION_STALE', '活动套餐版本已变化，请刷新页面', 409);
  }
  if (
    sku.status !== 'published' ||
    new Date(sku.starts_at).getTime() > now.getTime() ||
    new Date(sku.ends_at).getTime() <= now.getTime()
  ) {
    throw afdianError('SUPPORT_CAMPAIGN_NOT_ACTIVE', '活动当前不可购买', 409);
  }
  await connection.query(
    `INSERT IGNORE INTO support_campaign_user_limits (campaign_sku_id, user_id)
     VALUES (?, ?)`,
    [sku.id, userId],
  );
  const [limitRows] = await connection.query(
    `SELECT completed_count, active_intent_id, active_until
       FROM support_campaign_user_limits
      WHERE campaign_sku_id = ? AND user_id = ?
      FOR UPDATE`,
    [sku.id, userId],
  );
  const limit = limitRows[0];
  if (Number(limit?.completed_count || 0) >= Number(sku.per_user_limit)) {
    throw afdianError('SUPPORT_CAMPAIGN_LIMIT_REACHED', '该活动套餐已达到购买上限', 409);
  }
  if (limit?.active_intent_id && new Date(limit.active_until).getTime() > now.getTime()) {
    throw afdianError('SUPPORT_CAMPAIGN_CHECKOUT_ACTIVE', '已有待支付的活动套餐订单，24 小时内不能重复创建', 409);
  }
  if (limit?.active_intent_id) {
    await connection.query(
      `UPDATE support_checkout_intents SET intent_status = 'expired'
        WHERE id = ? AND consumed_order_id IS NULL`,
      [limit.active_intent_id],
    );
  }
  return sku;
}
