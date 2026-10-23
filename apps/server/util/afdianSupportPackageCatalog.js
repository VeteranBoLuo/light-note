import { getConservativeAiUnitCost } from './aiCostPolicy.js';
import crypto from 'node:crypto';
import { SUPPORT_PACKAGE_CATALOG, SUPPORT_PACKAGE_CATALOG_VERSION } from '@lightnote/shared';
import pool from '../db/index.js';
import { afdianError } from './afdianConfig.js';

export const SUPPORT_COST_POLICY_VERSION = 'support-cost-v2';
export const SUPPORT_CAMPAIGN_MIN_MARGIN_BPS = 4_000;

const PACKAGE_BY_SKU = new Map(SUPPORT_PACKAGE_CATALOG.map((item) => [item.skuId, item]));
export const SUPPORT_AI_FIRST_PURCHASE_CLAIM_KEY = 'scope-ai-account-v3';
// 历史首购版本与 SKU 是永久兼容事实，不能跟随当前目录的权益和 scope 漂移。
const LEGACY_AI_FIRST_PURCHASE_KEYS = Object.freeze([
  'ai-6',
  'ai-18',
  'ai-50',
  'ai-100',
  'combo-10',
  'combo-30',
  'combo-88',
  'combo-168',
]);
const LEGACY_STORAGE_FIRST_PURCHASE_KEYS = Object.freeze(['storage-6', 'storage-18', 'storage-50', 'storage-100']);

export function supportFirstPurchaseClaimKey(item, catalogVersion = SUPPORT_PACKAGE_CATALOG_VERSION) {
  const skuId = String(item?.skuId || '');
  if (
    ['support-packages-v2', 'support-packages-v3', 'support-packages-v4'].includes(String(catalogVersion)) &&
    LEGACY_AI_FIRST_PURCHASE_KEYS.includes(skuId)
  ) {
    return SUPPORT_AI_FIRST_PURCHASE_CLAIM_KEY;
  }
  if (
    ['support-packages-v2', 'support-packages-v3'].includes(String(catalogVersion)) &&
    LEGACY_STORAGE_FIRST_PURCHASE_KEYS.includes(skuId)
  ) {
    return skuId;
  }
  if (item?.firstPurchaseScope === 'none') return '';
  return item?.firstPurchaseScope === 'ai_account' ? SUPPORT_AI_FIRST_PURCHASE_CLAIM_KEY : skuId;
}

export function supportFirstPurchaseCompatibleClaimKeys(item, catalogVersion = SUPPORT_PACKAGE_CATALOG_VERSION) {
  const claimKey = supportFirstPurchaseClaimKey(item, catalogVersion);
  if (!claimKey) return [];
  return claimKey === SUPPORT_AI_FIRST_PURCHASE_CLAIM_KEY ? [claimKey, ...LEGACY_AI_FIRST_PURCHASE_KEYS] : [claimKey];
}

function campaignCatalogVersion(campaignId, version) {
  return `campaign:${campaignId}:v${Number(version)}`;
}

function runtimeFlag(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

export function getSupportPackageFeatureState(env = process.env) {
  const catalogEnabled = runtimeFlag(env.SUPPORT_PACKAGES_CATALOG_ENABLED, false);
  const grantEnabled = runtimeFlag(env.SUPPORT_PACKAGES_GRANT_ENABLED, false);
  return {
    catalogVersion: SUPPORT_PACKAGE_CATALOG_VERSION,
    catalogEnabled,
    checkoutEnabled: catalogEnabled && grantEnabled && runtimeFlag(env.SUPPORT_PACKAGES_CHECKOUT_ENABLED, false),
    grantEnabled,
    campaignsEnabled: catalogEnabled && runtimeFlag(env.SUPPORT_CAMPAIGNS_ENABLED, false),
  };
}

export function getSupportPackage(skuId) {
  return PACKAGE_BY_SKU.get(String(skuId || '')) || null;
}

export function supportProviderIdentityHash(providerUserId) {
  const normalized = String(providerUserId || '').trim();
  if (!normalized) return '';
  return crypto.createHash('sha256').update(`afdian:user:v1\0${normalized}`).digest('hex');
}

function normalizedMoney(value, field = 'amount') {
  const normalized = String(value ?? '').trim();
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(normalized)) {
    throw afdianError('SUPPORT_PACKAGE_AMOUNT_INVALID', `${field} 不合法`, 400);
  }
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000) {
    throw afdianError('SUPPORT_PACKAGE_AMOUNT_INVALID', `${field} 不合法`, 400);
  }
  return Number(amount.toFixed(2));
}

function normalizedBenefit(value, field, max) {
  const amount = Number(value || 0);
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > max) {
    throw afdianError('SUPPORT_CAMPAIGN_BENEFIT_INVALID', `${field} 不合法`, 400);
  }
  return amount;
}

/**
 * 保守直接成本口径：渠道费 6%；AI 按已配置模型最高单价并预留 20%；
 * 空间按 ¥0.099/GB/月满额使用 8 年并预留 30%。
 */
export function calculateSupportPackageCost({ amount, aiTokens = 0, storageMb = 0 }) {
  const price = normalizedMoney(amount);
  const normalizedAi = normalizedBenefit(aiTokens, 'aiTokens', 1_000_000_000);
  const normalizedStorage = normalizedBenefit(storageMb, 'storageMb', 1_048_576);
  const channelNet = price * 0.94;
  const aiUnitCost = getConservativeAiUnitCost();
  if (normalizedAi > 0 && aiUnitCost === null)
    throw afdianError('SUPPORT_COST_PRICE_UNKNOWN', '当前模型价格未配置，无法核价', 422);
  const aiCost = (normalizedAi / 1_000_000) * (aiUnitCost || 0);
  const storageCost = (normalizedStorage / 1024) * 0.099 * 96 * 1.3;
  const directCost = aiCost + storageCost;
  const margin = channelNet - directCost;
  const marginBps = Math.floor((margin / price) * 10_000);
  return {
    policyVersion: SUPPORT_COST_POLICY_VERSION,
    amount: price.toFixed(2),
    channelNet: Number(channelNet.toFixed(4)),
    aiCost: Number(aiCost.toFixed(4)),
    storageCost: Number(storageCost.toFixed(4)),
    directCost: Number(directCost.toFixed(4)),
    margin: Number(margin.toFixed(4)),
    marginBps,
    passes: marginBps >= SUPPORT_CAMPAIGN_MIN_MARGIN_BPS,
  };
}

function normalizedCampaignCategory(value, aiTokens, storageMb) {
  const inferred = aiTokens > 0 && storageMb > 0 ? 'combo' : aiTokens > 0 ? 'ai' : storageMb > 0 ? 'storage' : '';
  const requested = String(value || inferred);
  if (!inferred || requested !== inferred) {
    throw afdianError('SUPPORT_CAMPAIGN_CATEGORY_INVALID', '活动套餐类别与权益不一致', 400);
  }
  return inferred;
}

export function normalizeSupportCampaignSkus(skus, { requireMargin = false } = {}) {
  if (!Array.isArray(skus) || !skus.length || skus.length > 12) {
    throw afdianError('SUPPORT_CAMPAIGN_SKUS_INVALID', '活动套餐数量应为 1 至 12 个', 400);
  }
  const seen = new Set();
  return skus.map((input, index) => {
    const skuId = String(input?.skuId || '').trim();
    const title = String(input?.title || '').trim();
    if (!/^[a-z0-9][a-z0-9_-]{2,63}$/.test(skuId) || seen.has(skuId)) {
      throw afdianError('SUPPORT_CAMPAIGN_SKU_ID_INVALID', '活动套餐 ID 不合法或重复', 400);
    }
    if (!title || title.length > 80) {
      throw afdianError('SUPPORT_CAMPAIGN_SKU_TITLE_INVALID', '活动套餐名称不合法', 400);
    }
    seen.add(skuId);
    const aiTokens = normalizedBenefit(input?.aiTokens, 'aiTokens', 1_000_000_000);
    const storageMb = normalizedBenefit(input?.storageMb, 'storageMb', 1_048_576);
    const amount = normalizedMoney(input?.amount);
    const perUserLimit = Number(input?.perUserLimit ?? 1);
    if (!Number.isSafeInteger(perUserLimit) || perUserLimit < 1 || perUserLimit > 20) {
      throw afdianError('SUPPORT_CAMPAIGN_LIMIT_INVALID', '每用户限购次数应为 1 至 20', 400);
    }
    const category = normalizedCampaignCategory(input?.category, aiTokens, storageMb);
    const cost = calculateSupportPackageCost({ amount, aiTokens, storageMb });
    if (requireMargin && !cost.passes) {
      throw afdianError('SUPPORT_CAMPAIGN_COST_GATE_FAILED', `套餐 ${skuId} 的保守直接成本余量低于 40%`, 409);
    }
    return {
      skuId,
      title,
      category,
      amount: amount.toFixed(2),
      aiTokens,
      storageMb,
      perUserLimit,
      sortOrder: Number.isSafeInteger(Number(input?.sortOrder)) ? Number(input.sortOrder) : index,
      cost,
    };
  });
}

async function loadActiveCampaignPackages({ userId, db, now }) {
  const params = [now, now];
  const userJoin = userId
    ? `LEFT JOIN support_campaign_user_limits l
         ON l.campaign_sku_id = s.id AND l.user_id = ?`
    : '';
  if (userId) params.unshift(userId);
  const [rows] = await db.query(
    `SELECT c.id AS campaign_id, c.campaign_key, c.version, c.title AS campaign_title,
            c.description, c.starts_at, c.ends_at,
            s.id AS campaign_sku_id, s.sku_id, s.title, s.category, s.amount,
            s.ai_tokens, s.storage_mb, s.per_user_limit,
            ${userId ? 'COALESCE(l.completed_count, 0)' : '0'} AS completed_count,
            ${userId ? 'l.active_intent_id' : 'NULL'} AS active_intent_id,
            ${userId ? 'l.active_until' : 'NULL'} AS active_until
       FROM support_campaigns c
       JOIN support_campaign_skus s ON s.campaign_id = c.id
       ${userJoin}
      WHERE c.status = 'published' AND c.public_enabled = 1
        AND c.starts_at <= ?
        AND c.ends_at > ?
      ORDER BY c.starts_at DESC, c.version DESC, s.sort_order ASC, s.id ASC`,
    params,
  );
  return rows.map((row) => {
    const completed = Number(row.completed_count || 0);
    const limit = Number(row.per_user_limit || 1);
    const activeUntil = row.active_until ? new Date(row.active_until).getTime() : 0;
    const hasActiveCheckout = Boolean(row.active_intent_id && activeUntil > now.getTime());
    return {
      campaignId: row.campaign_id,
      campaignKey: row.campaign_key,
      campaignVersion: Number(row.version),
      catalogVersion: campaignCatalogVersion(row.campaign_id, row.version),
      campaignTitle: row.campaign_title,
      description: row.description || '',
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      campaignSkuId: row.campaign_sku_id,
      skuId: row.sku_id,
      title: row.title,
      category: row.category,
      amount: Number(row.amount),
      benefit: { aiTokens: Number(row.ai_tokens), storageMb: Number(row.storage_mb) },
      perUserLimit: limit,
      completedCount: completed,
      remainingPurchases: userId ? Math.max(0, limit - completed) : null,
      limitReached: Boolean(userId && completed >= limit),
      hasActiveCheckout,
    };
  });
}

export async function getSupportCatalog({
  userId = '',
  authenticated = false,
  db = pool,
  env = process.env,
  now = new Date(),
} = {}) {
  const feature = getSupportPackageFeatureState(env);
  const effectiveUserId = authenticated && userId ? String(userId) : '';
  if (!feature.catalogEnabled) {
    return { ...feature, packages: [], campaigns: [] };
  }
  const campaigns = feature.campaignsEnabled
    ? await loadActiveCampaignPackages({ userId: effectiveUserId, db, now })
    : [];
  return {
    ...feature,
    packages: SUPPORT_PACKAGE_CATALOG.map((item) => ({ ...item, firstPurchaseStatus: 'not_applicable' })),
    campaigns,
  };
}
