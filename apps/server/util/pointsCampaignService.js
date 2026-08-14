import { createHash, randomUUID } from 'node:crypto';
import pool from '../db/index.js';
import { getPointsEarningRuntime, POINTS_EARNING_POLICY_VERSION } from './pointsEarningPolicy.js';
import { grantPointsIdempotently, pointsGrantHash, PointsGrantError } from './pointsGrantOperations.js';

const CAMPAIGN_STATUSES = Object.freeze([
  'draft',
  'previewed',
  'recipients_frozen',
  'confirmed',
  'running',
  'completed',
  'partial_failed',
]);
const REASON_CODES = new Set(['customer_support', 'incident_compensation', 'community_event', 'anniversary', 'other']);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const HARD_LIMITS = Object.freeze({
  recipients: 20_000,
  explicitUserIds: 5_000,
  pointsPerUser: 1_000_000,
  totalPoints: 2_000_000_000,
});

export class PointsCampaignError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'PointsCampaignError';
    this.code = code;
    this.status = status;
  }
}

function strictPositiveInteger(value, maximum) {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : null;
}

export function getPointsCampaignRuntime(env = process.env) {
  const enabled = getPointsEarningRuntime(env).campaignEnabled;
  const maxRecipients = strictPositiveInteger(env.POINTS_CAMPAIGN_MAX_RECIPIENTS, HARD_LIMITS.recipients);
  const maxPointsPerUser = strictPositiveInteger(env.POINTS_CAMPAIGN_MAX_POINTS_PER_USER, HARD_LIMITS.pointsPerUser);
  const maxTotalPoints = strictPositiveInteger(env.POINTS_CAMPAIGN_MAX_TOTAL_POINTS, HARD_LIMITS.totalPoints);
  const ready = Boolean(enabled && maxRecipients && maxPointsPerUser && maxTotalPoints);
  return Object.freeze({ enabled, ready, maxRecipients, maxPointsPerUser, maxTotalPoints });
}

function assertCampaignRuntime(runtime) {
  if (!runtime?.enabled) throw new PointsCampaignError('POINTS_CAMPAIGN_DISABLED', '活动积分发放尚未启用', 503);
  if (!runtime.ready) throw new PointsCampaignError('POINTS_CAMPAIGN_LIMITS_REQUIRED', '活动安全上限未正确配置', 503);
}

function normalizeDate(value, field) {
  if (value == null || value === '') return null;
  const date = String(value).trim();
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!DATE_PATTERN.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new PointsCampaignError('INVALID_CAMPAIGN_AUDIENCE', `${field} 日期无效`);
  }
  return date;
}

function boundedNullableInteger(value, field, { min = 0, max = 1_000_000_000 } = {}) {
  if (value == null || value === '') return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new PointsCampaignError('INVALID_CAMPAIGN_AUDIENCE', `${field} 无效`);
  }
  return number;
}

export function normalizeCampaignAudience(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new PointsCampaignError('INVALID_CAMPAIGN_AUDIENCE', '活动受众无效');
  }
  const explicitUserIds = [
    ...new Set(
      (Array.isArray(input.explicitUserIds) ? input.explicitUserIds : [])
        .map((value) => String(value || '').trim())
        .filter((value) => value && value.length <= 64),
    ),
  ].sort();
  if (explicitUserIds.length > HARD_LIMITS.explicitUserIds) {
    throw new PointsCampaignError(
      'CAMPAIGN_AUDIENCE_TOO_LARGE',
      `明确用户列表一次最多 ${HARD_LIMITS.explicitUserIds} 个；更大范围请使用结构化受众条件`,
    );
  }
  const audience = {
    allRegisteredUsers: input.allRegisteredUsers === true,
    explicitUserIds,
    registeredFrom: normalizeDate(input.registeredFrom, '注册起始'),
    registeredTo: normalizeDate(input.registeredTo, '注册结束'),
    lastActiveFrom: normalizeDate(input.lastActiveFrom, '活跃起始'),
    lastActiveTo: normalizeDate(input.lastActiveTo, '活跃结束'),
    minLevel: boundedNullableInteger(input.minLevel, '最低等级', { min: 1, max: 15 }),
    maxLevel: boundedNullableInteger(input.maxLevel, '最高等级', { min: 1, max: 15 }),
    minPoints: boundedNullableInteger(input.minPoints, '最低积分', { min: 0 }),
    maxPoints: boundedNullableInteger(input.maxPoints, '最高积分', { min: 0 }),
    excludeCampaignPublicId:
      String(input.excludeCampaignPublicId || '')
        .trim()
        .slice(0, 64) || null,
  };
  if (audience.registeredFrom && audience.registeredTo && audience.registeredFrom > audience.registeredTo) {
    throw new PointsCampaignError('INVALID_CAMPAIGN_AUDIENCE', '注册时间范围前后颠倒');
  }
  if (audience.lastActiveFrom && audience.lastActiveTo && audience.lastActiveFrom > audience.lastActiveTo) {
    throw new PointsCampaignError('INVALID_CAMPAIGN_AUDIENCE', '活跃时间范围前后颠倒');
  }
  if (audience.minLevel != null && audience.maxLevel != null && audience.minLevel > audience.maxLevel) {
    throw new PointsCampaignError('INVALID_CAMPAIGN_AUDIENCE', '等级范围前后颠倒');
  }
  if (audience.minPoints != null && audience.maxPoints != null && audience.minPoints > audience.maxPoints) {
    throw new PointsCampaignError('INVALID_CAMPAIGN_AUDIENCE', '积分范围前后颠倒');
  }
  const targeted =
    audience.allRegisteredUsers ||
    audience.explicitUserIds.length > 0 ||
    Object.entries(audience).some(
      ([key, value]) => !['allRegisteredUsers', 'explicitUserIds'].includes(key) && value != null,
    );
  if (!targeted) {
    throw new PointsCampaignError(
      'CAMPAIGN_AUDIENCE_CONFIRMATION_REQUIRED',
      '请设置受众条件；若确需全体用户，请显式选择“全部注册用户”',
    );
  }
  return audience;
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeCampaignRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    publicId: row.publicId,
    name: row.name,
    status: row.status,
    pointsPerUser: Number(row.pointsPerUser || 0),
    audience: parseJson(row.audienceJson),
    recipientCount: Number(row.recipientCount || 0),
    deliveredCount: Number(row.deliveredCount || 0),
    failedCount: Number(row.failedCount || 0),
    totalPoints: Number(row.totalPoints || 0),
    reasonCode: row.reasonCode,
    reason: row.reason,
    createdBy: row.createdBy,
    confirmedBy: row.confirmedBy || null,
    createTime: row.createTime || null,
    updateTime: row.updateTime || null,
    frozenAt: row.frozenAt || null,
    confirmedAt: row.confirmedAt || null,
    completedAt: row.completedAt || null,
  };
}

const CAMPAIGN_SELECT = `SELECT id, public_id AS publicId, name, status, points_per_user AS pointsPerUser,
  audience_json AS audienceJson, recipient_count AS recipientCount, delivered_count AS deliveredCount,
  failed_count AS failedCount, total_points AS totalPoints, reason_code AS reasonCode, reason,
  created_by AS createdBy, confirmed_by AS confirmedBy, create_time AS createTime, update_time AS updateTime,
  frozen_at AS frozenAt, confirmed_at AS confirmedAt, completed_at AS completedAt
  FROM points_campaigns`;

function audienceQuery(audience, { limit = null } = {}) {
  const clauses = ['u.del_flag = 0', "COALESCE(u.role, 'user') = 'user'", "u.id <> 'visitor'"];
  const params = [];
  if (audience.explicitUserIds.length) {
    clauses.push(`u.id IN (${audience.explicitUserIds.map(() => '?').join(',')})`);
    params.push(...audience.explicitUserIds);
  }
  if (audience.registeredFrom) {
    clauses.push('u.create_time >= ?');
    params.push(audience.registeredFrom);
  }
  if (audience.registeredTo) {
    clauses.push('u.create_time < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(audience.registeredTo);
  }
  if (audience.lastActiveFrom) {
    clauses.push('u.last_active_time >= ?');
    params.push(audience.lastActiveFrom);
  }
  if (audience.lastActiveTo) {
    clauses.push('u.last_active_time < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(audience.lastActiveTo);
  }
  if (audience.minLevel != null) {
    clauses.push('COALESCE(ug.level, 1) >= ?');
    params.push(audience.minLevel);
  }
  if (audience.maxLevel != null) {
    clauses.push('COALESCE(ug.level, 1) <= ?');
    params.push(audience.maxLevel);
  }
  if (audience.minPoints != null) {
    clauses.push('COALESCE(ug.points, 0) >= ?');
    params.push(audience.minPoints);
  }
  if (audience.maxPoints != null) {
    clauses.push('COALESCE(ug.points, 0) <= ?');
    params.push(audience.maxPoints);
  }
  if (audience.excludeCampaignPublicId) {
    clauses.push(`NOT EXISTS (
      SELECT 1 FROM points_campaign_recipients excluded_recipient
      JOIN points_campaigns excluded_campaign ON excluded_campaign.id = excluded_recipient.campaign_id
      WHERE excluded_campaign.public_id = ? AND excluded_recipient.user_id = u.id
    )`);
    params.push(audience.excludeCampaignPublicId);
  }
  // del_flag 是账号禁用的权威旧口径；再排除安全模块仍标记为 active 的封禁记录。
  clauses.push(`NOT EXISTS (
    SELECT 1 FROM security_account_bans sab WHERE sab.user_id = u.id AND sab.is_active = 1
  )`);
  const sql = `SELECT u.id AS userId, u.alias, u.create_time AS createTime, u.last_active_time AS lastActiveTime,
                      COALESCE(ug.level, 1) AS level, COALESCE(ug.points, 0) AS points
                 FROM user u LEFT JOIN user_growth ug ON ug.user_id = u.id
                WHERE ${clauses.join(' AND ')}
                ORDER BY u.id ASC${limit ? ` LIMIT ${Math.max(1, Math.trunc(limit))}` : ''}`;
  return { sql, params };
}

function percentile(sorted, ratio) {
  if (!sorted.length) return 0;
  return Number(sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)] || 0);
}

function anonymizeCandidate(row) {
  const digest = createHash('sha256').update(String(row.userId)).digest('hex').slice(0, 12);
  const alias = String(row.alias || '').trim();
  return {
    userHash: digest,
    alias: alias ? `${alias.slice(0, 1)}***` : null,
    level: Number(row.level || 1),
    points: Number(row.points || 0),
  };
}

async function selectCandidates(db, audience, runtime) {
  const query = audienceQuery(audience, { limit: runtime.maxRecipients + 1 });
  const [rows] = await db.query(query.sql, query.params);
  return rows;
}

function campaignPreviewFromCandidates(campaign, candidates, runtime, nameConflict = 0) {
  const recipientCount = candidates.length;
  const totalPoints = recipientCount * campaign.pointsPerUser;
  const balances = candidates.map((row) => Number(row.points || 0)).sort((left, right) => left - right);
  const projected = balances.map((balance) => balance + campaign.pointsPerUser);
  return {
    publicId: campaign.publicId,
    recipientCount,
    totalPoints,
    exceedsLimits:
      recipientCount > runtime.maxRecipients ||
      campaign.pointsPerUser > runtime.maxPointsPerUser ||
      totalPoints > runtime.maxTotalPoints,
    limits: {
      maxRecipients: runtime.maxRecipients,
      maxPointsPerUser: runtime.maxPointsPerUser,
      maxTotalPoints: runtime.maxTotalPoints,
    },
    includesRoot: false,
    nameConflict: Number(nameConflict || 0) > 0,
    balanceDistribution: {
      before: { p50: percentile(balances, 0.5), p90: percentile(balances, 0.9), maximum: balances.at(-1) || 0 },
      after: { p50: percentile(projected, 0.5), p90: percentile(projected, 0.9), maximum: projected.at(-1) || 0 },
    },
    sample: candidates.slice(0, 20).map(anonymizeCandidate),
  };
}

export async function createPointsCampaign(
  input,
  { actorUserId, requestId, db = pool, runtime = getPointsCampaignRuntime() } = {},
) {
  assertCampaignRuntime(runtime);
  const name = String(input?.name || '')
    .trim()
    .slice(0, 100);
  const pointsPerUser = Number(input?.pointsPerUser);
  const reasonCode = String(input?.reasonCode || '').trim();
  const reason = String(input?.reason || '')
    .trim()
    .slice(0, 255);
  const normalizedRequestId = String(requestId || '').trim();
  if (
    !actorUserId ||
    !/^[A-Za-z0-9._:-]{8,64}$/.test(normalizedRequestId) ||
    name.length < 2 ||
    !Number.isSafeInteger(pointsPerUser) ||
    pointsPerUser <= 0
  ) {
    throw new PointsCampaignError('INVALID_CAMPAIGN', '活动名称或积分无效');
  }
  if (pointsPerUser > runtime.maxPointsPerUser) {
    throw new PointsCampaignError('CAMPAIGN_LIMIT_EXCEEDED', '单用户积分超过安全上限');
  }
  if (!REASON_CODES.has(reasonCode) || reason.length < 6) {
    throw new PointsCampaignError('INVALID_CAMPAIGN_REASON', '请选择原因代码并填写至少 6 个字的原因');
  }
  const audience = normalizeCampaignAudience(input.audience || {});
  const payloadHash = pointsGrantHash({ name, pointsPerUser, audience, reasonCode, reason });
  const publicId = `pc_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
  await db.query(
    `INSERT INTO points_campaigns
       (public_id, name, status, points_per_user, audience_json, reason_code, reason, created_by,
        create_request_id, create_payload_hash)
     VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE id = id`,
    [
      publicId,
      name,
      pointsPerUser,
      JSON.stringify(audience),
      reasonCode,
      reason,
      String(actorUserId),
      normalizedRequestId,
      payloadHash,
    ],
  );
  const [[created]] = await db.query(
    `SELECT public_id AS publicId, create_payload_hash AS payloadHash
       FROM points_campaigns
      WHERE created_by = ? AND create_request_id = ? LIMIT 1`,
    [String(actorUserId), normalizedRequestId],
  );
  if (!created) throw new PointsCampaignError('CAMPAIGN_CREATE_CONFLICT', '活动草稿创建冲突，请刷新后重试', 409);
  if (created.payloadHash !== payloadHash) {
    throw new PointsCampaignError('IDEMPOTENCY_KEY_REUSED', '本次创建请求已用于不同活动草稿', 409);
  }
  const detail = await getPointsCampaignDetail(created.publicId, { db, runtime });
  return { ...detail, idempotent: created.publicId !== publicId };
}

export async function previewPointsCampaign(publicId, { db = pool, runtime = getPointsCampaignRuntime() } = {}) {
  assertCampaignRuntime(runtime);
  const [[row]] = await db.query(`${CAMPAIGN_SELECT} WHERE public_id = ? LIMIT 1`, [String(publicId)]);
  const campaign = normalizeCampaignRow(row);
  if (!campaign) throw new PointsCampaignError('CAMPAIGN_NOT_FOUND', '活动不存在', 404);
  if (!['draft', 'previewed'].includes(campaign.status)) {
    throw new PointsCampaignError('CAMPAIGN_STATE_INVALID', '当前状态不能重新预览', 409);
  }
  const candidates = await selectCandidates(db, campaign.audience, runtime);
  const [[conflict]] = await db.query(
    `SELECT COUNT(*) AS count FROM points_campaigns
      WHERE name = ? AND public_id <> ? AND status NOT IN ('draft')`,
    [campaign.name, campaign.publicId],
  );
  const preview = campaignPreviewFromCandidates(campaign, candidates, runtime, conflict?.count);
  await db.query("UPDATE points_campaigns SET status = 'previewed' WHERE id = ? AND status IN ('draft', 'previewed')", [
    campaign.id,
  ]);
  return { ...preview, status: 'previewed' };
}

export async function freezePointsCampaign(publicId, { db = pool, runtime = getPointsCampaignRuntime() } = {}) {
  assertCampaignRuntime(runtime);
  const ownConnection = !db?.beginTransaction;
  const conn = ownConnection ? await db.getConnection() : db;
  try {
    if (ownConnection) await conn.beginTransaction();
    const [[row]] = await conn.query(`${CAMPAIGN_SELECT} WHERE public_id = ? LIMIT 1 FOR UPDATE`, [String(publicId)]);
    const campaign = normalizeCampaignRow(row);
    if (!campaign) throw new PointsCampaignError('CAMPAIGN_NOT_FOUND', '活动不存在', 404);
    if (campaign.status === 'recipients_frozen') {
      if (ownConnection) await conn.commit();
      return campaign;
    }
    if (campaign.status !== 'previewed') {
      throw new PointsCampaignError('CAMPAIGN_STATE_INVALID', '请先完成活动预览', 409);
    }
    const candidates = await selectCandidates(conn, campaign.audience, runtime);
    const preview = campaignPreviewFromCandidates(campaign, candidates, runtime);
    if (!candidates.length) throw new PointsCampaignError('CAMPAIGN_AUDIENCE_EMPTY', '受众为空，不能冻结名单');
    if (preview.exceedsLimits) throw new PointsCampaignError('CAMPAIGN_LIMIT_EXCEEDED', '活动超过安全上限');
    for (let offset = 0; offset < candidates.length; offset += 250) {
      const batch = candidates.slice(offset, offset + 250);
      const values = batch.map(() => "(?, ?, ?, 'pending', ?)").join(',');
      const params = batch.flatMap((candidate) => {
        const userHash = createHash('sha256').update(String(candidate.userId)).digest('hex').slice(0, 32);
        return [
          campaign.id,
          String(candidate.userId),
          campaign.pointsPerUser,
          `campaign:${campaign.publicId}:${userHash}`,
        ];
      });
      await conn.query(
        `INSERT IGNORE INTO points_campaign_recipients
           (campaign_id, user_id, points, status, request_id) VALUES ${values}`,
        params,
      );
    }
    const [[countRow]] = await conn.query(
      'SELECT COUNT(*) AS count, COALESCE(SUM(points), 0) AS total FROM points_campaign_recipients WHERE campaign_id = ?',
      [campaign.id],
    );
    const recipientCount = Number(countRow?.count || 0);
    const totalPoints = Number(countRow?.total || 0);
    if (recipientCount !== candidates.length || totalPoints !== preview.totalPoints) {
      throw new PointsCampaignError('CAMPAIGN_FREEZE_MISMATCH', '冻结名单核对失败', 409);
    }
    await conn.query(
      `UPDATE points_campaigns
          SET status = 'recipients_frozen', recipient_count = ?, total_points = ?, frozen_at = NOW()
        WHERE id = ?`,
      [recipientCount, totalPoints, campaign.id],
    );
    if (ownConnection) await conn.commit();
    return { ...campaign, status: 'recipients_frozen', recipientCount, totalPoints };
  } catch (error) {
    if (ownConnection) await conn.rollback().catch(() => {});
    throw error;
  } finally {
    if (ownConnection) conn.release();
  }
}

export async function confirmPointsCampaign(
  publicId,
  { actorUserId, db = pool, runtime = getPointsCampaignRuntime() } = {},
) {
  assertCampaignRuntime(runtime);
  const [result] = await db.query(
    `UPDATE points_campaigns
        SET status = 'confirmed', confirmed_by = ?, confirmed_at = NOW()
      WHERE public_id = ? AND status = 'recipients_frozen'`,
    [String(actorUserId), String(publicId)],
  );
  if (!result.affectedRows) {
    const [[row]] = await db.query('SELECT status FROM points_campaigns WHERE public_id = ? LIMIT 1', [
      String(publicId),
    ]);
    if (!row) throw new PointsCampaignError('CAMPAIGN_NOT_FOUND', '活动不存在', 404);
    if (row.status !== 'confirmed') throw new PointsCampaignError('CAMPAIGN_STATE_INVALID', '活动尚未冻结名单', 409);
  }
  return getPointsCampaignDetail(publicId, { db, runtime });
}

export async function deleteDraftPointsCampaign(publicId, { db = pool, runtime = getPointsCampaignRuntime() } = {}) {
  assertCampaignRuntime(runtime);
  const [result] = await db.query(
    "DELETE FROM points_campaigns WHERE public_id = ? AND status IN ('draft', 'previewed')",
    [String(publicId)],
  );
  if (!result.affectedRows) {
    const [[row]] = await db.query('SELECT status FROM points_campaigns WHERE public_id = ? LIMIT 1', [
      String(publicId),
    ]);
    if (!row) throw new PointsCampaignError('CAMPAIGN_NOT_FOUND', '活动不存在', 404);
    throw new PointsCampaignError('CAMPAIGN_STATE_INVALID', '名单冻结后不能删除活动', 409);
  }
  return { ok: true, publicId: String(publicId) };
}

async function deliverRecipient(campaign, recipient, db = pool) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await grantPointsIdempotently(
      {
        userId: recipient.userId,
        requestId: recipient.requestId,
        operationType: 'campaign',
        points: recipient.points,
        reason: 'campaign',
        ref: campaign.publicId,
        policyVersion: POINTS_EARNING_POLICY_VERSION,
        meta: { campaignPublicId: campaign.publicId, reasonCode: campaign.reasonCode },
      },
      { db: conn },
    );
    await conn.query(
      `UPDATE points_campaign_recipients
          SET status = 'succeeded', delivered_at = COALESCE(delivered_at, NOW()), error_code = NULL,
              lease_owner = NULL, lease_until = NULL
        WHERE campaign_id = ? AND user_id = ?`,
      [campaign.id, recipient.userId],
    );
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback().catch(() => {});
    throw error;
  } finally {
    conn.release();
  }
}

export async function executePointsCampaign(
  publicId,
  { batchSize = 100, leaseOwner = randomUUID(), runtime = getPointsCampaignRuntime(), db = pool } = {},
) {
  assertCampaignRuntime(runtime);
  const safeBatchSize = Math.min(200, Math.max(1, Math.trunc(Number(batchSize) || 100)));
  const owner = String(leaseOwner).slice(0, 64);
  const conn = await db.getConnection();
  let campaign;
  let recipients = [];
  try {
    await conn.beginTransaction();
    const [[row]] = await conn.query(`${CAMPAIGN_SELECT} WHERE public_id = ? LIMIT 1 FOR UPDATE`, [String(publicId)]);
    campaign = normalizeCampaignRow(row);
    if (!campaign) throw new PointsCampaignError('CAMPAIGN_NOT_FOUND', '活动不存在', 404);
    if (campaign.status === 'completed') {
      await conn.commit();
      return { campaign, processed: 0, done: true };
    }
    if (!['confirmed', 'running', 'partial_failed'].includes(campaign.status)) {
      throw new PointsCampaignError('CAMPAIGN_STATE_INVALID', '活动尚未确认或不可执行', 409);
    }
    if (campaign.status !== 'running') {
      await conn.query("UPDATE points_campaigns SET status = 'running' WHERE id = ?", [campaign.id]);
      campaign.status = 'running';
    }
    const [rows] = await conn.query(
      `SELECT user_id AS userId, points, request_id AS requestId
         FROM points_campaign_recipients
        WHERE campaign_id = ? AND attempts < 5
          AND (status IN ('pending', 'failed') OR (status = 'processing' AND lease_until < NOW()))
        ORDER BY user_id ASC LIMIT ${safeBatchSize} FOR UPDATE`,
      [campaign.id],
    );
    recipients = rows;
    if (recipients.length) {
      const ids = recipients.map(() => '?').join(',');
      await conn.query(
        `UPDATE points_campaign_recipients
            SET status = 'processing', lease_owner = ?, lease_until = DATE_ADD(NOW(), INTERVAL 5 MINUTE),
                attempts = attempts + 1, error_code = NULL
          WHERE campaign_id = ? AND user_id IN (${ids})`,
        [owner, campaign.id, ...recipients.map((item) => item.userId)],
      );
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback().catch(() => {});
    throw error;
  } finally {
    conn.release();
  }

  let succeeded = 0;
  let failed = 0;
  const errors = [];
  for (const recipient of recipients) {
    try {
      await deliverRecipient(campaign, recipient, db);
      succeeded += 1;
    } catch (error) {
      failed += 1;
      const errorCode =
        error instanceof PointsGrantError ? error.code : String(error?.code || 'CAMPAIGN_DELIVERY_FAILED');
      errors.push({
        userHash: createHash('sha256').update(String(recipient.userId)).digest('hex').slice(0, 12),
        errorCode,
      });
      await db.query(
        `UPDATE points_campaign_recipients
            SET status = 'failed', error_code = ?, lease_owner = NULL, lease_until = NULL
          WHERE campaign_id = ? AND user_id = ? AND lease_owner = ?`,
        [errorCode.slice(0, 64), campaign.id, recipient.userId, owner],
      );
    }
  }
  const [[progress]] = await db.query(
    `SELECT COUNT(*) AS total,
            SUM(status = 'succeeded') AS delivered,
            SUM(status = 'failed') AS failed,
            SUM(status IN ('pending', 'processing')) AS remaining,
            SUM(status = 'failed' AND attempts < 5) AS retryable
       FROM points_campaign_recipients WHERE campaign_id = ?`,
    [campaign.id],
  );
  const delivered = Number(progress?.delivered || 0);
  const failedCount = Number(progress?.failed || 0);
  const remaining = Number(progress?.remaining || 0);
  const retryable = Number(progress?.retryable || 0);
  const nextStatus =
    delivered === Number(progress?.total || 0) ? 'completed' : remaining || retryable ? 'running' : 'partial_failed';
  await db.query(
    `UPDATE points_campaigns
        SET status = ?, delivered_count = ?, failed_count = ?, completed_at = IF(? = 'completed', NOW(), NULL)
      WHERE id = ?`,
    [nextStatus, delivered, failedCount, nextStatus, campaign.id],
  );
  return {
    campaign: { ...campaign, status: nextStatus, deliveredCount: delivered, failedCount },
    processed: recipients.length,
    succeeded,
    failed,
    remaining,
    retryable,
    done: nextStatus === 'completed',
    errors: errors.slice(0, 20),
  };
}

export async function getPointsCampaignDetail(publicId, { db = pool, runtime = getPointsCampaignRuntime() } = {}) {
  const [[row]] = await db.query(`${CAMPAIGN_SELECT} WHERE public_id = ? LIMIT 1`, [String(publicId)]);
  const campaign = normalizeCampaignRow(row);
  if (!campaign) throw new PointsCampaignError('CAMPAIGN_NOT_FOUND', '活动不存在', 404);
  const [[counts], [sample]] = await Promise.all([
    db.query(
      `SELECT status, COUNT(*) AS count FROM points_campaign_recipients
        WHERE campaign_id = ? GROUP BY status`,
      [campaign.id],
    ),
    db.query(
      `SELECT user_id AS userId, points, status, delivered_at AS deliveredAt, error_code AS errorCode, attempts
         FROM points_campaign_recipients WHERE campaign_id = ?
        ORDER BY user_id ASC LIMIT 20`,
      [campaign.id],
    ),
  ]);
  return {
    campaign,
    runtime: {
      enabled: runtime.enabled,
      ready: runtime.ready,
      limits: runtime.ready
        ? {
            maxRecipients: runtime.maxRecipients,
            maxPointsPerUser: runtime.maxPointsPerUser,
            maxTotalPoints: runtime.maxTotalPoints,
          }
        : null,
    },
    counts: Object.fromEntries(counts.map((item) => [item.status, Number(item.count || 0)])),
    sample: sample.map((item) => ({
      ...anonymizeCandidate(item),
      points: Number(item.points || 0),
      status: item.status,
      deliveredAt: item.deliveredAt || null,
      errorCode: item.errorCode || null,
      attempts: Number(item.attempts || 0),
    })),
  };
}

export async function listPointsCampaigns({ limit = 30 } = {}, { db = pool } = {}) {
  const safeLimit = Math.min(100, Math.max(1, Math.trunc(Number(limit) || 30)));
  const [rows] = await db.query(`${CAMPAIGN_SELECT} ORDER BY id DESC LIMIT ${safeLimit}`);
  return {
    runtime: getPointsCampaignRuntime(),
    statuses: [...CAMPAIGN_STATUSES],
    rows: rows.map(normalizeCampaignRow),
  };
}

export const pointsCampaignInternals = { audienceQuery, campaignPreviewFromCandidates, percentile };
