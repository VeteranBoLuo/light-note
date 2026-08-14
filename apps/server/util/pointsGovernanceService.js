import pool from '../db/index.js';
import { getActiveShopItems } from './points.js';
import { getEconomyRuntime } from './pointsEconomyCatalog.js';
import {
  getEarningPolicySnapshot,
  ONE_TIME_POINTS_REASONS,
  OPERATIONS_POINTS_REASONS,
  POINTS_EARNING_POLICY_VERSION,
  RANDOM_POINTS_REASONS,
  STABLE_POINTS_REASONS,
} from './pointsEarningPolicy.js';

const RANGE_PRESETS = new Set([7, 28, 90]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const VERSION_PATTERN = /^[A-Za-z0-9._-]{1,32}$/;

export class PointsGovernanceError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'PointsGovernanceError';
    this.code = code;
    this.status = status;
  }
}

function utcDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`;
}

function addUtcDays(day, delta) {
  return utcDay(new Date(`${day}T00:00:00.000Z`).getTime() + Number(delta) * 86_400_000);
}

function normalizeVersion(value) {
  const version = String(value || '').trim();
  if (!version) return null;
  if (!VERSION_PATTERN.test(version)) throw new PointsGovernanceError('INVALID_VERSION_FILTER', '版本筛选无效');
  return version;
}

export function resolveGovernanceRange(input = {}, now = new Date()) {
  const preset = Number(input.presetDays || input.days || 28);
  const today = utcDay(now);
  let startDate;
  let endDate;
  if (input.startDate || input.endDate) {
    startDate = String(input.startDate || '').trim();
    endDate = String(input.endDate || '').trim();
    if (!DATE_PATTERN.test(startDate) || !DATE_PATTERN.test(endDate)) {
      throw new PointsGovernanceError('INVALID_DATE_RANGE', '日期范围无效');
    }
    if (!utcDay(`${startDate}T00:00:00.000Z`) || !utcDay(`${endDate}T00:00:00.000Z`)) {
      throw new PointsGovernanceError('INVALID_DATE_RANGE', '日期范围无效');
    }
  } else {
    if (!RANGE_PRESETS.has(preset))
      throw new PointsGovernanceError('INVALID_RANGE_PRESET', '时间范围仅支持 7/28/90 天');
    endDate = today;
    startDate = addUtcDays(today, -(preset - 1));
  }
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new PointsGovernanceError('DATE_RANGE_TOO_LARGE', '自定义时间范围必须在 1～365 天内');
  }
  return { startDate, endDate, endExclusive: addUtcDays(endDate, 1), days };
}

function placeholders(values) {
  return values.map(() => '?').join(',');
}

function categoryCase(column = 'reason') {
  return {
    stable: `${column} IN (${placeholders(STABLE_POINTS_REASONS)})`,
    oneTime: `${column} IN (${placeholders(ONE_TIME_POINTS_REASONS)})`,
    random: `${column} IN (${placeholders(RANDOM_POINTS_REASONS)})`,
    operations: `${column} IN (${placeholders(OPERATIONS_POINTS_REASONS)})`,
  };
}

function rangeWhere(range, { policyVersion = null, alias = '' } = {}) {
  const prefix = alias ? `${alias}.` : '';
  const clauses = [`${prefix}create_time >= ?`, `${prefix}create_time < ?`];
  const params = [range.startDate, range.endExclusive];
  if (policyVersion) {
    clauses.push(`${prefix}policy_version = ?`);
    params.push(policyVersion);
  }
  return { sql: clauses.join(' AND '), params };
}

function numeric(row, key) {
  return Number(row?.[key] || 0);
}

function percent(numerator, denominator) {
  return denominator > 0 ? Number(((Number(numerator) / Number(denominator)) * 100).toFixed(1)) : 0;
}

function percentileFromValues(values, ratio = 0.5) {
  const ordered = values
    .map(Number)
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  if (!ordered.length) return null;
  return ordered[Math.max(0, Math.ceil(ordered.length * ratio) - 1)];
}

function buildProductPerformance(destinations, samples, { truncated = false } = {}) {
  const catalog = new Map(getActiveShopItems().map((item) => [String(item.id), item]));
  const samplesByProduct = new Map();
  for (const row of samples) {
    const key = `${row.economyVersion}:${row.itemId}`;
    if (!samplesByProduct.has(key)) samplesByProduct.set(key, []);
    samplesByProduct.get(key).push(row);
  }
  return destinations
    .filter((row) => row.operationType === 'shop_buy' && row.itemId)
    .map((row) => {
      const key = `${row.economyVersion}:${row.itemId}`;
      const productSamples = samplesByProduct.get(key) || [];
      const item = catalog.get(String(row.itemId));
      const observedRepurchases = productSamples.filter((sample) => sample.repurchasedWithin30d != null);
      const repurchased = observedRepurchases.filter((sample) => Boolean(Number(sample.repurchasedWithin30d))).length;
      return {
        economyVersion: row.economyVersion,
        itemId: row.itemId,
        name: item?.name || null,
        effect: item?.effect || null,
        rarity: item?.rarity || null,
        operations: numeric(row, 'operations'),
        users: numeric(row, 'users'),
        spent: numeric(row, 'spent'),
        firstPurchaseRegistrationDaysP50: percentileFromValues(productSamples.map((sample) => sample.registrationDays)),
        prePurchaseBalanceP50: percentileFromValues(
          productSamples.map((sample) => sample.preBalance).filter((value) => value != null),
        ),
        repurchase30dRatio: observedRepurchases.length ? percent(repurchased, observedRepurchases.length) : null,
        repurchase30dObservedUsers: observedRepurchases.length,
        frameWearRate: item?.effect === 'frame' ? percent(numeric(row, 'equippedUsers'), numeric(row, 'users')) : null,
        sampledUsers: productSamples.length,
        sampleTruncated: Boolean(truncated),
        // 当前没有“某次购买 → AI 钱包消耗/空间实际增长”的不可变归因事实，严禁用当前余额倒推伪指标。
        aiUsage30dRate: null,
        storageGrowth30dMb: null,
        usageAttributionStatus:
          item?.effect === 'ai_pack' || item?.effect === 'storage'
            ? 'awaiting_immutable_usage_attribution'
            : 'not_applicable',
      };
    });
}

function healthWarnings(metrics) {
  const warnings = [];
  if (metrics.consumptionToIssuanceRatio < 55) warnings.push({ code: 'LOW_CONSUMPTION_RATIO', level: 'observe' });
  if (metrics.consumptionToIssuanceRatio > 85) warnings.push({ code: 'HIGH_CONSUMPTION_RATIO', level: 'observe' });
  if (metrics.freeRandomShare > 30) warnings.push({ code: 'FREE_RANDOM_SHARE_HIGH', level: 'warning' });
  if (metrics.operationsShare > 10) warnings.push({ code: 'OPERATIONS_SHARE_HIGH', level: 'warning' });
  return warnings;
}

const USER_LOG_CATEGORIES = new Set(['all', 'stable', 'oneTime', 'random', 'spent', 'operations']);

function userLogFilter(category) {
  const value = String(category || 'all');
  if (!USER_LOG_CATEGORIES.has(value)) {
    throw new PointsGovernanceError('INVALID_LOG_CATEGORY', '流水分类筛选无效');
  }
  if (value === 'all') return { category: value, sql: '', params: [] };
  if (value === 'spent') return { category: value, sql: ' AND delta < 0', params: [] };
  const groups = {
    stable: STABLE_POINTS_REASONS,
    oneTime: ONE_TIME_POINTS_REASONS,
    random: RANDOM_POINTS_REASONS,
    operations: OPERATIONS_POINTS_REASONS,
  };
  const reasons = groups[value];
  return {
    category: value,
    sql: ` AND delta > 0 AND reason IN (${placeholders(reasons)})`,
    params: [...reasons],
  };
}

/**
 * Root 健康总览。所有流水查询都带时间范围并命中 C5 索引；余额分位数使用单次有序派生表，
 * 不把全量余额拉到 Node，也不按用户执行 N+1。
 */
export async function getPointsGovernanceOverview(input = {}, { db = pool } = {}) {
  const range = resolveGovernanceRange(input);
  const policyVersion = normalizeVersion(input.policyVersion);
  const where = rangeWhere(range, { policyVersion });
  const cases = categoryCase();
  const categoryParams = [
    ...STABLE_POINTS_REASONS,
    ...ONE_TIME_POINTS_REASONS,
    ...RANDOM_POINTS_REASONS,
    ...OPERATIONS_POINTS_REASONS,
  ];
  const [[summaryRows], [[circulation]], [[percentiles]], [[thresholds]], [trends]] = await Promise.all([
    db.query(
      `SELECT
         COALESCE(SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), 0) AS issued,
         COALESCE(SUM(CASE WHEN delta < 0 THEN -delta ELSE 0 END), 0) AS spent,
         COALESCE(SUM(CASE WHEN delta > 0 AND ${cases.stable} THEN delta ELSE 0 END), 0) AS stableIssued,
         COALESCE(SUM(CASE WHEN delta > 0 AND ${cases.oneTime} THEN delta ELSE 0 END), 0) AS oneTimeIssued,
         COALESCE(SUM(CASE WHEN delta > 0 AND ${cases.random} THEN delta ELSE 0 END), 0) AS randomIssued,
         COALESCE(SUM(CASE WHEN delta > 0 AND ${cases.operations} THEN delta ELSE 0 END), 0) AS operationsIssued,
         COALESCE(SUM(CASE WHEN delta > 0 AND reason = 'lottery_free_win' THEN delta ELSE 0 END), 0) AS freeRandomIssued,
         COUNT(DISTINCT CASE WHEN delta > 0 THEN user_id END) AS earners,
         COUNT(DISTINCT CASE WHEN delta < 0 THEN user_id END) AS spenders,
         COUNT(DISTINCT CASE WHEN delta > 0 AND ${cases.stable} THEN user_id END) AS stableEarners
       FROM points_log WHERE ${where.sql}`,
      [
        ...STABLE_POINTS_REASONS,
        ...ONE_TIME_POINTS_REASONS,
        ...RANDOM_POINTS_REASONS,
        ...OPERATIONS_POINTS_REASONS,
        ...STABLE_POINTS_REASONS,
        ...where.params,
      ],
    ),
    db.query(
      `SELECT COALESCE(SUM(points), 0) AS outstanding, COUNT(*) AS accounts,
              SUM(CASE WHEN points = 0 THEN 1 ELSE 0 END) AS zeroBalance,
              MAX(points) AS maximum
         FROM user_growth`,
    ),
    db.query(
      `SELECT
         MAX(CASE WHEN ranked.rn = GREATEST(1, CEIL(ranked.total * 0.50)) THEN ranked.points END) AS p50,
         MAX(CASE WHEN ranked.rn = GREATEST(1, CEIL(ranked.total * 0.75)) THEN ranked.points END) AS p75,
         MAX(CASE WHEN ranked.rn = GREATEST(1, CEIL(ranked.total * 0.90)) THEN ranked.points END) AS p90,
         MAX(CASE WHEN ranked.rn = GREATEST(1, CEIL(ranked.total * 0.99)) THEN ranked.points END) AS p99
       FROM (
         SELECT ordered.points, (@points_rank := @points_rank + 1) AS rn, totals.total
           FROM (
             SELECT CAST(points AS SIGNED) AS points FROM user_growth
             ORDER BY points ASC LIMIT 18446744073709551615
           ) ordered
           CROSS JOIN (SELECT @points_rank := 0) vars
           CROSS JOIN (SELECT COUNT(*) AS total FROM user_growth) totals
       ) ranked`,
    ),
    db.query(
      `SELECT COUNT(*) AS activeUsers,
              SUM(CASE WHEN ug.points > 6000 THEN 1 ELSE 0 END) AS over6000,
              SUM(CASE WHEN ug.points > 16000 THEN 1 ELSE 0 END) AS over16000,
              SUM(CASE WHEN ug.points > 24000 THEN 1 ELSE 0 END) AS over24000
         FROM user u
         LEFT JOIN user_growth ug ON ug.user_id = u.id
        WHERE u.del_flag = 0 AND COALESCE(u.role, 'user') = 'user'
          AND u.last_active_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
    ),
    db.query(
      `SELECT DATE(create_time) AS day,
              COALESCE(SUM(CASE WHEN delta > 0 AND ${cases.stable} THEN delta ELSE 0 END), 0) AS stable,
              COALESCE(SUM(CASE WHEN delta > 0 AND ${cases.oneTime} THEN delta ELSE 0 END), 0) AS oneTime,
              COALESCE(SUM(CASE WHEN delta > 0 AND ${cases.random} THEN delta ELSE 0 END), 0) AS random,
              COALESCE(SUM(CASE WHEN delta > 0 AND ${cases.operations} THEN delta ELSE 0 END), 0) AS operations,
              COALESCE(SUM(CASE WHEN delta < 0 THEN -delta ELSE 0 END), 0) AS spent,
              COALESCE(SUM(delta), 0) AS net
         FROM points_log WHERE ${where.sql}
        GROUP BY DATE(create_time) ORDER BY day ASC`,
      [...categoryParams, ...where.params],
    ),
  ]);
  const summary = summaryRows?.[0] || {};
  const issued = numeric(summary, 'issued');
  const spent = numeric(summary, 'spent');
  const stableIssued = numeric(summary, 'stableIssued');
  const recurringIssued = stableIssued + numeric(summary, 'randomIssued');
  const metrics = {
    issued,
    spent,
    netIssued: issued - spent,
    outstanding: numeric(circulation, 'outstanding'),
    earners: numeric(summary, 'earners'),
    spenders: numeric(summary, 'spenders'),
    stableIssued,
    oneTimeIssued: numeric(summary, 'oneTimeIssued'),
    randomIssued: numeric(summary, 'randomIssued'),
    operationsIssued: numeric(summary, 'operationsIssued'),
    stableAverage: numeric(summary, 'stableEarners') ? Math.round(stableIssued / numeric(summary, 'stableEarners')) : 0,
    consumptionToIssuanceRatio: percent(spent, issued),
    freeRandomShare: percent(numeric(summary, 'freeRandomIssued'), recurringIssued),
    operationsShare: percent(numeric(summary, 'operationsIssued'), issued),
  };
  return {
    enabled: true,
    range,
    filters: { policyVersion },
    metrics,
    warnings: healthWarnings(metrics),
    balanceDistribution: {
      accounts: numeric(circulation, 'accounts'),
      zeroBalance: numeric(circulation, 'zeroBalance'),
      p50: numeric(percentiles, 'p50'),
      p75: numeric(percentiles, 'p75'),
      p90: numeric(percentiles, 'p90'),
      p99: numeric(percentiles, 'p99'),
      maximum: numeric(circulation, 'maximum'),
      activeUsers: numeric(thresholds, 'activeUsers'),
      over6000Ratio: percent(numeric(thresholds, 'over6000'), numeric(thresholds, 'activeUsers')),
      over16000Ratio: percent(numeric(thresholds, 'over16000'), numeric(thresholds, 'activeUsers')),
      over24000Ratio: percent(numeric(thresholds, 'over24000'), numeric(thresholds, 'activeUsers')),
    },
    trends: trends.map((row) => ({
      day: utcDay(row.day),
      stable: numeric(row, 'stable'),
      oneTime: numeric(row, 'oneTime'),
      random: numeric(row, 'random'),
      operations: numeric(row, 'operations'),
      spent: numeric(row, 'spent'),
      net: numeric(row, 'net'),
    })),
  };
}

export async function getPointsGovernanceSources(input = {}, { db = pool } = {}) {
  const range = resolveGovernanceRange(input);
  const policyVersion = normalizeVersion(input.policyVersion);
  const economyVersion = normalizeVersion(input.economyVersion);
  const ledgerWhere = rangeWhere(range, { policyVersion });
  const operationClauses = ["peo.status = 'succeeded'", 'peo.create_time >= ?', 'peo.create_time < ?'];
  const operationParams = [range.startDate, range.endExclusive];
  if (economyVersion) {
    operationClauses.push('peo.economy_version = ?');
    operationParams.push(economyVersion);
  }
  const productSampleClauses = [
    "candidate.status = 'succeeded'",
    "candidate.operation_type = 'shop_buy'",
    'candidate.item_id IS NOT NULL',
    'candidate.create_time >= ?',
    'candidate.create_time < ?',
  ];
  const productSampleParams = [range.startDate, range.endExclusive];
  if (economyVersion) {
    productSampleClauses.push('candidate.economy_version = ?');
    productSampleParams.push(economyVersion);
  }
  const PRODUCT_SAMPLE_LIMIT = 5_000;
  const [[sources], [destinations], [legacyDestinations], [rawProductSamples]] = await Promise.all([
    db.query(
      `SELECT reason, COALESCE(policy_version, 'legacy/unversioned') AS policyVersion,
              SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END) AS issued,
              SUM(CASE WHEN delta < 0 THEN -delta ELSE 0 END) AS spent,
              COUNT(*) AS operations, COUNT(DISTINCT user_id) AS users
         FROM points_log WHERE ${ledgerWhere.sql}
        GROUP BY reason, COALESCE(policy_version, 'legacy/unversioned')
        ORDER BY ABS(SUM(delta)) DESC LIMIT 100`,
      ledgerWhere.params,
    ),
    db.query(
      `SELECT peo.economy_version AS economyVersion, peo.operation_type AS operationType, peo.item_id AS itemId,
              COUNT(*) AS operations, COUNT(DISTINCT peo.user_id) AS users,
              COUNT(DISTINCT CASE WHEN ug.equipped_frame = peo.item_id THEN peo.user_id END) AS equippedUsers,
              COALESCE(SUM(peo.cost_points), 0) AS spent,
              COALESCE(SUM(peo.points_rewarded), 0) AS pointsReturned,
              COALESCE(SUM(peo.ai_tokens_granted), 0) AS aiTokens,
              COALESCE(SUM(peo.storage_mb_granted), 0) AS storageMb,
              COALESCE(SUM(peo.makeup_cards_granted), 0) AS makeupCards,
              COALESCE(SUM(peo.draw_count), 0) AS draws
         FROM points_economy_operations peo
         LEFT JOIN user_growth ug ON ug.user_id = peo.user_id
        WHERE ${operationClauses.join(' AND ')}
        GROUP BY peo.economy_version, peo.operation_type, peo.item_id
        ORDER BY spent DESC, operations DESC LIMIT 100`,
      operationParams,
    ),
    db.query(
      `SELECT reason, ref, COUNT(*) AS operations, COUNT(DISTINCT user_id) AS users,
              COALESCE(SUM(-delta), 0) AS spent
         FROM points_log WHERE ${ledgerWhere.sql} AND delta < 0
        GROUP BY reason, ref ORDER BY spent DESC LIMIT 100`,
      ledgerWhere.params,
    ),
    db.query(
      `SELECT first.economy_version AS economyVersion, first.item_id AS itemId,
              GREATEST(0, TIMESTAMPDIFF(DAY, u.create_time, first.create_time)) AS registrationDays,
              CASE WHEN JSON_EXTRACT(first.result_json, '$.points') IS NULL THEN NULL
                   ELSE CAST(JSON_UNQUOTE(JSON_EXTRACT(first.result_json, '$.points')) AS SIGNED)
                        + first.cost_points END AS preBalance,
              CASE WHEN first.create_time > DATE_SUB(NOW(), INTERVAL 30 DAY) THEN NULL
                   ELSE EXISTS(
                     SELECT 1 FROM points_economy_operations later
                      WHERE later.user_id = first.user_id AND later.status = 'succeeded'
                        AND later.cost_points > 0
                        AND (later.create_time > first.create_time
                             OR (later.create_time = first.create_time AND later.id > first.id))
                        AND later.create_time <= DATE_ADD(first.create_time, INTERVAL 30 DAY)
                      LIMIT 1
                   ) END AS repurchasedWithin30d
         FROM (
           SELECT MIN(candidate.id) AS firstId
             FROM points_economy_operations candidate
            WHERE ${productSampleClauses.join(' AND ')}
              AND NOT EXISTS(
                SELECT 1 FROM points_economy_operations prior
                 WHERE prior.user_id = candidate.user_id
                   AND prior.status = 'succeeded'
                   AND prior.operation_type = 'shop_buy'
                   AND prior.item_id = candidate.item_id
                   AND prior.economy_version = candidate.economy_version
                   AND (prior.create_time < candidate.create_time
                        OR (prior.create_time = candidate.create_time AND prior.id < candidate.id))
                 LIMIT 1
              )
            GROUP BY candidate.economy_version, candidate.item_id, candidate.user_id
            ORDER BY firstId DESC
            LIMIT ${PRODUCT_SAMPLE_LIMIT + 1}
         ) sampled
         JOIN points_economy_operations first ON first.id = sampled.firstId
         JOIN user u ON u.id = first.user_id AND u.del_flag = 0`,
      productSampleParams,
    ),
  ]);
  const productSamplesTruncated = rawProductSamples.length > PRODUCT_SAMPLE_LIMIT;
  const productSamples = rawProductSamples.slice(0, PRODUCT_SAMPLE_LIMIT);
  const normalizedDestinations = destinations.map((row) => ({
    economyVersion: row.economyVersion,
    operationType: row.operationType,
    itemId: row.itemId || null,
    operations: numeric(row, 'operations'),
    users: numeric(row, 'users'),
    equippedUsers: numeric(row, 'equippedUsers'),
    spent: numeric(row, 'spent'),
    pointsReturned: numeric(row, 'pointsReturned'),
    aiTokens: numeric(row, 'aiTokens'),
    storageMb: numeric(row, 'storageMb'),
    makeupCards: numeric(row, 'makeupCards'),
    draws: numeric(row, 'draws'),
  }));
  return {
    enabled: true,
    range,
    filters: { policyVersion, economyVersion },
    sources: sources.map((row) => ({
      reason: row.reason,
      policyVersion: row.policyVersion,
      issued: numeric(row, 'issued'),
      spent: numeric(row, 'spent'),
      operations: numeric(row, 'operations'),
      users: numeric(row, 'users'),
    })),
    destinations: normalizedDestinations,
    productPerformance: buildProductPerformance(normalizedDestinations, productSamples, {
      truncated: productSamplesTruncated,
    }),
    productPerformanceMeta: {
      sampleLimit: PRODUCT_SAMPLE_LIMIT,
      sampledUsers: productSamples.length,
      truncated: productSamplesTruncated,
      usageAttribution: 'ai_and_storage_require_future_immutable_usage_facts',
    },
    legacyDestinations: legacyDestinations.map((row) => ({
      reason: row.reason,
      ref: row.ref || null,
      operations: numeric(row, 'operations'),
      users: numeric(row, 'users'),
      spent: numeric(row, 'spent'),
    })),
  };
}

export async function getPointsGovernanceAnomalies(input = {}, { db = pool } = {}) {
  const range = resolveGovernanceRange(input);
  const limit = Math.min(100, Math.max(10, Math.trunc(Number(input.limit) || 50)));
  const where = rangeWhere(range);
  const [[dailyOver], [duplicates], [adminOutliers], [campaignDuplicates]] = await Promise.all([
    db.query(
      `SELECT user_id AS userId, DATE(create_time) AS day, SUM(delta) AS amount
         FROM points_log
        WHERE ${where.sql} AND policy_version = ? AND delta > 0 AND reason IN ('checkin', 'quest')
        GROUP BY user_id, DATE(create_time) HAVING SUM(delta) > 60
        ORDER BY amount DESC LIMIT ${limit}`,
      [...where.params, POINTS_EARNING_POLICY_VERSION],
    ),
    db.query(
      `SELECT user_id AS userId, reason, ref, COUNT(*) AS occurrences, MAX(create_time) AS latestAt
         FROM points_log
        WHERE ${where.sql} AND ref IS NOT NULL AND reason IN ('checkin', 'quest', 'weekly', 'achievement')
        GROUP BY user_id, reason, ref HAVING COUNT(*) > 1
        ORDER BY latestAt DESC LIMIT ${limit}`,
      where.params,
    ),
    db.query(
      `SELECT id, user_id AS userId, delta, ref, create_time AS createTime
         FROM points_log
        WHERE ${where.sql} AND reason IN ('admin', 'campaign', 'correction') AND ABS(delta) > 10000
        ORDER BY ABS(delta) DESC, id DESC LIMIT ${limit}`,
      where.params,
    ),
    db.query(
      `SELECT pcr.campaign_id AS campaignId, pcr.user_id AS userId, COUNT(*) AS occurrences
         FROM points_campaign_recipients pcr
         JOIN points_campaigns pc ON pc.id = pcr.campaign_id
        WHERE pc.create_time >= ? AND pc.create_time < ?
        GROUP BY pcr.campaign_id, pcr.user_id HAVING COUNT(*) > 1 LIMIT ${limit}`,
      [range.startDate, range.endExclusive],
    ),
  ]);
  const rows = [
    ...dailyOver.map((row) => ({
      code: 'DAILY_STABLE_OVER_CAP',
      severity: 'high',
      ...row,
      amount: numeric(row, 'amount'),
    })),
    ...duplicates.map((row) => ({
      code: 'DUPLICATE_CLAIM_CONFLICT',
      severity: 'critical',
      ...row,
      occurrences: numeric(row, 'occurrences'),
    })),
    ...adminOutliers.map((row) => ({
      code: 'ADMIN_GRANT_OUTLIER',
      severity: 'warning',
      ...row,
      delta: numeric(row, 'delta'),
    })),
    ...campaignDuplicates.map((row) => ({
      code: 'CAMPAIGN_DUPLICATE',
      severity: 'critical',
      ...row,
      occurrences: numeric(row, 'occurrences'),
    })),
  ].slice(0, limit);
  return { enabled: true, range, rows, count: rows.length, bounded: true };
}

function boundedInteger(value, fallback, { min = 0, max = 1_000_000_000 } = {}) {
  const number = value == null || value === '' ? fallback : Number(value);
  if (!Number.isFinite(number) || !Number.isInteger(number) || number < min || number > max) {
    throw new PointsGovernanceError('INVALID_SIMULATOR_INPUT', '模拟参数无效');
  }
  return number;
}

function boundedRatio(value, fallback) {
  const ratio = value == null || value === '' ? fallback : Number(value);
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
    throw new PointsGovernanceError('INVALID_SIMULATOR_INPUT', '模拟比例必须在 0～1');
  }
  return ratio;
}

/** 纯函数模拟器：只读代码目录，不读取或修改生产策略。 */
export function simulatePointsPolicy(input = {}) {
  const defaults = getEarningPolicySnapshot();
  const checkinDaily = boundedInteger(input.checkinDaily, defaults.checkin.maximum, { max: 200 });
  const dailyQuestDaily = boundedInteger(
    input.dailyQuestDaily,
    defaults.daily.reduce((sum, item) => sum + item.points, 0),
    { max: 500 },
  );
  const weeklyChallenges = boundedInteger(
    input.weeklyChallenges,
    defaults.weekly.reduce((sum, item) => sum + item.reward, 0),
    { max: 5000 },
  );
  const freeDrawExpected = boundedInteger(input.freeDrawExpected, 15, { max: 1000 });
  const freeDrawsByTier = Array.isArray(input.freeDrawsByTier) ? input.freeDrawsByTier : [0, 1, 2, 3];
  if (freeDrawsByTier.length < 1 || freeDrawsByTier.length > 8) {
    throw new PointsGovernanceError('INVALID_SIMULATOR_INPUT', '免费次数档位无效');
  }
  const draws = freeDrawsByTier.map((value) => boundedInteger(value, 0, { max: 20 }));
  const achievementPool = boundedInteger(input.achievementPool, 7850, { max: 100_000 });
  const milestonePool = boundedInteger(input.milestonePool, 6350, { max: 100_000 });
  const activeRatio = boundedRatio(input.activeRatio, 0.35);
  const consumptionRatio = boundedRatio(input.consumptionRatio, 0.65);
  const activeUsers = boundedInteger(input.activeUsers, 1000, { max: 100_000_000 });
  const stableWeek = checkinDaily * 7 + dailyQuestDaily * 7 + weeklyChallenges;
  const tiers = draws.map((freeDrawsPerDay, index) => {
    const randomWeek = freeDrawsPerDay * 7 * freeDrawExpected;
    const weekly = stableWeek + randomWeek;
    return {
      tier: index + 1,
      freeDrawsPerDay,
      stableWeek,
      randomWeek,
      expectedWeek: weekly,
      expectedMonth: Math.round((weekly * 52) / 12),
      expectedYear: weekly * 52,
    };
  });
  const repeatedAnnual = Math.round(stableWeek * 52 * activeUsers * activeRatio);
  const firstYearOneTime = Math.round((achievementPool + milestonePool) * activeUsers * activeRatio);
  const expectedConsumption = Math.round((repeatedAnnual + firstYearOneTime) * consumptionRatio);
  const catalog = getActiveShopItems();
  return {
    readOnly: true,
    economyVersion: getEconomyRuntime().economyVersion,
    policyVersion: POINTS_EARNING_POLICY_VERSION,
    input: {
      checkinDaily,
      dailyQuestDaily,
      weeklyChallenges,
      freeDrawExpected,
      freeDrawsByTier: draws,
      achievementPool,
      milestonePool,
      activeRatio,
      consumptionRatio,
      activeUsers,
    },
    stableWeek,
    tiers,
    repeatedAnnual,
    firstYearOneTime,
    expectedConsumption,
    expectedNetIssuance: repeatedAnnual + firstYearOneTime - expectedConsumption,
    goalCycles: catalog.map((item) => ({
      itemId: item.id,
      name: item.name,
      cost: Number(item.cost || 0),
      stableWeeks: stableWeek > 0 ? Number((Number(item.cost || 0) / stableWeek).toFixed(1)) : null,
    })),
    disclaimer: 'simulation_only_no_production_write',
  };
}

/** 单用户 360 的有界读模型；资产与窗口聚合并行读取，不在列表中逐行查询。 */
export async function getPointsUser360(userId, input = {}, { db = pool } = {}) {
  const id = String(userId || '')
    .trim()
    .slice(0, 64);
  if (!id) throw new PointsGovernanceError('USER_REQUIRED', '缺少目标用户');
  const days = Number(input.days || 28);
  if (!RANGE_PRESETS.has(days)) throw new PointsGovernanceError('INVALID_RANGE_PRESET', '用户窗口仅支持 7/28/90 天');
  const logFilter = userLogFilter(input.logCategory);
  const cases = categoryCase();
  const sources = [
    ...STABLE_POINTS_REASONS,
    ...ONE_TIME_POINTS_REASONS,
    ...RANDOM_POINTS_REASONS,
    ...OPERATIONS_POINTS_REASONS,
  ];
  const [
    [[account]],
    [[window]],
    [[active]],
    [frames],
    [achievementFrames],
    [[preference]],
    [[version]],
    [logRows],
    [[operation]],
  ] = await Promise.all([
    db.query(
      `SELECT u.id AS userId, u.alias, u.email, u.role, u.create_time AS createTime, u.last_active_time AS lastActiveTime,
                COALESCE(ug.points,0) AS points, COALESCE(ug.level,1) AS level,
                COALESCE(ug.ai_bonus_tokens,0) AS aiTokens, COALESCE(ug.storage_bonus_mb,0) AS storageBonusMb,
                COALESCE(ug.streak_protect_cards,0) AS cards,
                COALESCE(ug.lottery_paid_count,0) AS paidDraws,
                COALESCE(ug.lottery_paid_pity_progress,0) AS pityProgress
           FROM user u LEFT JOIN user_growth ug ON ug.user_id=u.id
          WHERE u.id=? AND u.del_flag=0 LIMIT 1`,
      [id],
    ),
    db.query(
      `SELECT
           COALESCE(SUM(CASE WHEN delta>0 AND ${cases.stable} THEN delta ELSE 0 END),0) AS stable,
           COALESCE(SUM(CASE WHEN delta>0 AND ${cases.oneTime} THEN delta ELSE 0 END),0) AS oneTime,
           COALESCE(SUM(CASE WHEN delta>0 AND ${cases.random} THEN delta ELSE 0 END),0) AS random,
           COALESCE(SUM(CASE WHEN delta>0 AND ${cases.operations} THEN delta ELSE 0 END),0) AS operations,
           COALESCE(SUM(CASE WHEN delta<0 THEN -delta ELSE 0 END),0) AS spent,
           COALESCE(SUM(delta),0) AS net,
           COUNT(DISTINCT CASE WHEN reason='quest' AND ref LIKE '%:3' THEN DATE(create_time) END) AS completedDailyDays,
           SUM(CASE WHEN reason='weekly' AND delta>0 THEN 1 ELSE 0 END) AS weeklyClaims
         FROM points_log WHERE user_id=? AND create_time>=DATE_SUB(NOW(), INTERVAL ${days} DAY)`,
      [...sources, id],
    ),
    db.query(
      `SELECT COUNT(DISTINCT DATE(create_time)) AS activeDays
           FROM growth_events
          WHERE user_id=? AND status='granted' AND source IN
            ('activity_bookmark','activity_note','activity_file','todo_complete','organize_complete')
            AND create_time>=DATE_SUB(NOW(), INTERVAL ${days} DAY)`,
      [id],
    ),
    db.query(
      'SELECT cosmetic_id AS cosmeticId FROM user_cosmetics WHERE user_id=? ORDER BY create_time DESC LIMIT 100',
      [id],
    ),
    db.query(
      `SELECT reward_frame_id_snapshot AS cosmeticId
           FROM user_achievements
          WHERE user_id=? AND claimed_at IS NOT NULL AND reward_frame_id_snapshot IS NOT NULL
          ORDER BY claimed_at DESC LIMIT 100`,
      [id],
    ),
    db.query(
      `SELECT points_goal_item_id AS pointsGoalItemId, points_goal_enabled AS pointsGoalEnabled
           FROM user_growth_preferences WHERE user_id=? LIMIT 1`,
      [id],
    ),
    db.query(
      `SELECT policy_version AS policyVersion, MAX(create_time) AS latestAt
           FROM points_log WHERE user_id=? AND policy_version IS NOT NULL
          GROUP BY policy_version ORDER BY latestAt DESC LIMIT 1`,
      [id],
    ),
    db.query(
      `SELECT id, delta, reason, ref, policy_version AS policyVersion, create_time AS createTime
           FROM points_log WHERE user_id=?${logFilter.sql} ORDER BY id DESC LIMIT 50`,
      [id, ...logFilter.params],
    ),
    db.query(
      `SELECT economy_version AS economyVersion, operation_type AS operationType,
                LEFT(request_id,12) AS requestIdShort, replay_count AS replayCount,
                status, create_time AS createTime
           FROM points_economy_operations WHERE user_id=? ORDER BY id DESC LIMIT 1`,
      [id],
    ),
  ]);
  if (!account) throw new PointsGovernanceError('USER_NOT_FOUND', '目标用户不存在', 404);
  return {
    user: {
      userId: account.userId,
      alias: account.alias || null,
      email: account.email || null,
      role: account.role || 'user',
      createTime: account.createTime || null,
      lastActiveTime: account.lastActiveTime || null,
    },
    // 保持旧版 Root 查账接口结构，管理端可在功能开关滚动发布时无闪断切换。
    balance: {
      points: numeric(account, 'points'),
      storageBonusMb: numeric(account, 'storageBonusMb'),
      cards: numeric(account, 'cards'),
      aiTokens: numeric(account, 'aiTokens'),
      level: numeric(account, 'level'),
      paidDraws: numeric(account, 'paidDraws'),
      pityProgress: numeric(account, 'pityProgress'),
    },
    windowDays: days,
    window: {
      stable: numeric(window, 'stable'),
      oneTime: numeric(window, 'oneTime'),
      random: numeric(window, 'random'),
      operations: numeric(window, 'operations'),
      spent: numeric(window, 'spent'),
      net: numeric(window, 'net'),
      activeDays: numeric(active, 'activeDays'),
      dailyTaskCompletionRate: percent(numeric(window, 'completedDailyDays'), days),
      weeklyChallengeCompletionRate: percent(numeric(window, 'weeklyClaims'), Math.max(5, Math.ceil(days / 7) * 5)),
    },
    ownedFrames: [...new Set([...frames, ...achievementFrames].map((row) => row.cosmeticId).filter(Boolean))],
    goal: {
      enabled: Boolean(preference?.pointsGoalEnabled),
      itemId: preference?.pointsGoalItemId || null,
    },
    latestPolicyVersion: version?.policyVersion || null,
    latestEconomyOperation: operation || null,
    logCategory: logFilter.category,
    log: logRows.map((row) => ({ ...row, delta: Number(row.delta || 0) })),
  };
}

export const pointsGovernanceInternals = {
  buildProductPerformance,
  healthWarnings,
  normalizeVersion,
  percentileFromValues,
  rangeWhere,
  userLogFilter,
};
