import crypto from 'node:crypto';
import pool from '../db/index.js';
import { afdianError } from './afdianConfig.js';
import { recordAdminOperationAudit } from './adminOperationAudit.js';

const DEFAULT_PREFERENCE = Object.freeze({
  participateInRanking: true,
  showIdentity: false,
  adminHidden: false,
});
const PUBLIC_LEADERBOARD_LIMIT = 10;
const LEADERBOARD_CACHE_TTL_MS = 60_000;
const MAX_INLINE_AVATAR_BYTES = 524_288;
const MAX_ADMIN_PAGE_SIZE = 100;

let leaderboardCache = null;

function money(value) {
  return Number(value || 0).toFixed(2);
}

function pagination(page, pageSize, maxPageSize = MAX_ADMIN_PAGE_SIZE) {
  const normalizedPage = Math.max(1, Number.parseInt(page, 10) || 1);
  const normalizedPageSize = Math.min(maxPageSize, Math.max(1, Number.parseInt(pageSize, 10) || 20));
  return { page: normalizedPage, pageSize: normalizedPageSize, offset: (normalizedPage - 1) * normalizedPageSize };
}

function preferenceFromRow(row) {
  if (!row) return { ...DEFAULT_PREFERENCE };
  return {
    participateInRanking: Number(row.participate_in_ranking) === 1,
    showIdentity: Number(row.show_identity) === 1,
    adminHidden: Number(row.admin_hidden) === 1,
    identityConsentedAt: row.identity_consented_at || null,
    adminHiddenReason: row.admin_hidden_reason || null,
  };
}

export function invalidateAfdianLeaderboardCache() {
  leaderboardCache = null;
}

export async function getAfdianPublicPreference({ userId, db = pool }) {
  const [rows] = await db.query(
    `SELECT participate_in_ranking, show_identity, identity_consented_at,
            admin_hidden, admin_hidden_reason
       FROM support_public_preferences
      WHERE user_id = ?
      LIMIT 1`,
    [userId],
  );
  return preferenceFromRow(rows[0]);
}

export async function updateAfdianPublicPreference({ userId, participateInRanking, showIdentity, db = pool }) {
  if (typeof participateInRanking !== 'boolean' || typeof showIdentity !== 'boolean') {
    throw afdianError('AFDIAN_PREFERENCE_INVALID', '公开偏好不合法', 400);
  }
  const normalizedShowIdentity = participateInRanking && showIdentity;
  await db.query(
    `INSERT INTO support_public_preferences
      (user_id, public_id, participate_in_ranking, show_identity, identity_consented_at)
     VALUES (?, ?, ?, ?, IF(? = 1, NOW(), NULL))
     ON DUPLICATE KEY UPDATE
       participate_in_ranking = VALUES(participate_in_ranking),
       identity_consented_at = CASE
         WHEN VALUES(show_identity) = 1 AND identity_consented_at IS NULL THEN NOW()
         ELSE identity_consented_at
       END,
       show_identity = VALUES(show_identity)`,
    [
      userId,
      crypto.randomUUID(),
      participateInRanking ? 1 : 0,
      normalizedShowIdentity ? 1 : 0,
      normalizedShowIdentity ? 1 : 0,
    ],
  );
  invalidateAfdianLeaderboardCache();
  return getAfdianPublicPreference({ userId, db });
}

export async function getAfdianUserOrders({ userId, page = 1, pageSize = 10, db = pool }) {
  const paging = pagination(page, pageSize, 50);
  const [[countRows], [rows]] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS total
         FROM support_orders
        WHERE light_note_user_id = ?
          AND verification_state = 'api_verified'
          AND provider_status = 2`,
      [userId],
    ),
    db.query(
      `SELECT o.id, o.total_amount, o.month, o.product_type, o.ownership_source,
              o.verified_at, o.ranking_observed_at, i.option_key
         FROM support_orders o
         LEFT JOIN support_checkout_intents i ON i.id = o.checkout_intent_id
        WHERE o.light_note_user_id = ?
          AND o.verification_state = 'api_verified'
          AND o.provider_status = 2
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
      ownershipSource: row.ownership_source,
      confirmedAt: row.ranking_observed_at || row.verified_at || null,
    })),
    total: Number(countRows[0]?.total || 0),
    page: paging.page,
    pageSize: paging.pageSize,
  };
}

async function loadLeaderboardRows(db) {
  if (leaderboardCache && Date.now() - leaderboardCache.loadedAt < LEADERBOARD_CACHE_TTL_MS) {
    return leaderboardCache.rows;
  }
  const [rows] = await db.query(
    `SELECT o.light_note_user_id AS user_id,
            COUNT(*) AS order_count,
            COALESCE(SUM(o.total_amount), 0) AS total_amount,
            MAX(COALESCE(o.ranking_observed_at, o.verified_at, o.create_time)) AS last_support_at,
            u.alias,
            p.public_id,
            COALESCE(p.participate_in_ranking, 1) AS participate_in_ranking,
            COALESCE(p.show_identity, 0) AS show_identity,
            COALESCE(p.admin_hidden, 0) AS admin_hidden,
            CASE
              WHEN u.head_picture LIKE 'https://%' THEN 1
              WHEN u.head_picture LIKE 'data:image/%;base64,%'
                   AND OCTET_LENGTH(u.head_picture) <= ? THEN 1
              ELSE 0
            END AS has_avatar
       FROM support_orders o
       INNER JOIN user u
         ON u.id = o.light_note_user_id
        AND u.del_flag = '0'
        AND COALESCE(u.role, '') NOT IN ('root', 'test', 'visitor')
       LEFT JOIN support_public_preferences p ON p.user_id = o.light_note_user_id
      WHERE o.light_note_user_id IS NOT NULL
        AND o.verification_state = 'api_verified'
        AND o.provider_status = 2
      GROUP BY o.light_note_user_id, u.alias, p.public_id, p.participate_in_ranking,
               p.show_identity, p.admin_hidden, has_avatar
      HAVING participate_in_ranking = 1
      ORDER BY total_amount DESC, last_support_at ASC, user_id ASC`,
    [MAX_INLINE_AVATAR_BYTES],
  );
  const ranked = [];
  let previousAmount = null;
  let previousRank = 0;
  rows.forEach((row, index) => {
    const totalAmount = money(row.total_amount);
    const rank = totalAmount === previousAmount ? previousRank : index + 1;
    const named = Number(row.show_identity) === 1 && Number(row.admin_hidden) === 0;
    ranked.push({
      rank,
      userId: String(row.user_id),
      anonymous: !named,
      displayName: named ? String(row.alias || '轻笺用户').slice(0, 100) : null,
      publicId: named ? row.public_id || null : null,
      hasAvatar: named && Number(row.has_avatar) === 1,
      totalAmount,
      orderCount: Number(row.order_count || 0),
      lastSupportAt: row.last_support_at || null,
    });
    previousAmount = totalAmount;
    previousRank = rank;
  });
  leaderboardCache = { loadedAt: Date.now(), rows: ranked };
  return ranked;
}

function publicLeaderboardItem(item) {
  return {
    rank: item.rank,
    anonymous: item.anonymous,
    displayName: item.displayName,
    publicId: item.hasAvatar ? item.publicId : null,
    totalAmount: item.totalAmount,
    orderCount: item.orderCount,
  };
}

export async function getAfdianLeaderboard({ userId = '', limit = PUBLIC_LEADERBOARD_LIMIT, db = pool } = {}) {
  const rows = await loadLeaderboardRows(db);
  const normalizedLimit = Math.min(30, Math.max(1, Number.parseInt(limit, 10) || PUBLIC_LEADERBOARD_LIMIT));
  const mine = userId ? rows.find((item) => item.userId === String(userId)) : null;
  return {
    scope: 'all_time',
    items: rows.slice(0, normalizedLimit).map(publicLeaderboardItem),
    mine: mine ? publicLeaderboardItem(mine) : null,
    totalParticipants: rows.length,
  };
}

export async function getAfdianPublicAvatar({ publicId, db = pool }) {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(publicId || ''))) return null;
  const [rows] = await db.query(
    `SELECT u.head_picture AS source
       FROM support_public_preferences p
       INNER JOIN user u
         ON u.id = p.user_id
        AND u.del_flag = '0'
        AND COALESCE(u.role, '') NOT IN ('root', 'test', 'visitor')
      WHERE p.public_id = ?
        AND p.participate_in_ranking = 1
        AND p.show_identity = 1
        AND p.admin_hidden = 0
        AND (
          u.head_picture LIKE 'https://%'
          OR (u.head_picture LIKE 'data:image/%;base64,%' AND OCTET_LENGTH(u.head_picture) <= ?)
        )
      LIMIT 1`,
    [publicId, MAX_INLINE_AVATAR_BYTES],
  );
  const source = String(rows[0]?.source || '');
  if (source.startsWith('https://')) return { redirectUrl: source };
  const match = /^data:image\/(png|jpe?g|gif|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(source);
  if (!match) return null;
  const data = Buffer.from(match[2], 'base64');
  if (!data.length || data.length > MAX_INLINE_AVATAR_BYTES) return null;
  return { data, contentType: `image/${match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase()}` };
}

export async function getAfdianAdminOverview({ db = pool }) {
  const [[verified], [links], [exceptions]] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS verified_orders,
              COUNT(DISTINCT light_note_user_id) AS assigned_supporters,
              COALESCE(SUM(total_amount), 0) AS total_amount,
              COALESCE(SUM(CASE
                WHEN ranking_observed_at >= DATE_FORMAT(NOW(), '%Y-%m-01') THEN total_amount
                ELSE 0
              END), 0) AS month_amount
         FROM support_orders
        WHERE verification_state = 'api_verified' AND provider_status = 2`,
    ),
    db.query('SELECT COUNT(*) AS linked_accounts FROM support_account_links'),
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
  ]);
  return {
    verifiedOrders: Number(verified[0]?.verified_orders || 0),
    assignedSupporters: Number(verified[0]?.assigned_supporters || 0),
    totalAmount: money(verified[0]?.total_amount),
    monthAmount: money(verified[0]?.month_amount),
    linkedAccounts: Number(links[0]?.linked_accounts || 0),
    pendingOrders: Number(exceptions[0]?.pending_orders || 0),
    conflictOrders: Number(exceptions[0]?.conflict_orders || 0),
    unlinkedOrders: Number(exceptions[0]?.unlinked_orders || 0),
  };
}

function adminSearch(raw) {
  const value = String(raw || '').trim().slice(0, 100);
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
  if (state === 'exceptions') {
    conditions.push(
      "(o.verification_state = 'pending' OR o.ownership_source = 'conflict' OR (o.verification_state = 'api_verified' AND o.provider_status = 2 AND o.light_note_user_id IS NULL))",
    );
  }
  const like = adminSearch(search);
  if (like) {
    conditions.push('(o.provider_order_no LIKE ? OR u.alias LIKE ? OR l.provider_name LIKE ?)');
    params.push(like, like, like);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const joins = `LEFT JOIN user u ON u.id = o.light_note_user_id
                 LEFT JOIN support_account_links l ON l.user_id = o.light_note_user_id`;
  const [[countRows], [rows]] = await Promise.all([
    db.query(`SELECT COUNT(*) AS total FROM support_orders o ${joins} ${where}`, params),
    db.query(
      `SELECT o.provider_order_no, o.total_amount, o.provider_status, o.verification_state,
              o.ownership_source, o.light_note_user_id, o.retry_count, o.next_retry_at,
              o.ranking_observed_at, o.verified_at, o.create_time, u.alias, l.provider_name
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

export async function queryAfdianAdminSupporters({ page, pageSize, search = '', db = pool }) {
  const paging = pagination(page, pageSize);
  const like = adminSearch(search);
  const searchSql = like ? 'AND (u.alias LIKE ? OR l.provider_name LIKE ? OR o.light_note_user_id LIKE ?)' : '';
  const searchParams = like ? [like, like, like] : [];
  const base = `FROM support_orders o
                INNER JOIN user u ON u.id = o.light_note_user_id
                LEFT JOIN support_account_links l ON l.user_id = o.light_note_user_id
                LEFT JOIN support_public_preferences p ON p.user_id = o.light_note_user_id
               WHERE o.verification_state = 'api_verified' AND o.provider_status = 2 ${searchSql}`;
  const [[countRows], [rows]] = await Promise.all([
    db.query(`SELECT COUNT(DISTINCT o.light_note_user_id) AS total ${base}`, searchParams),
    db.query(
      `SELECT o.light_note_user_id AS user_id, u.alias, l.provider_name, l.linked_at,
              COUNT(*) AS order_count, SUM(o.total_amount) AS total_amount,
              MAX(COALESCE(o.ranking_observed_at, o.verified_at)) AS last_support_at,
              COALESCE(p.participate_in_ranking, 1) AS participate_in_ranking,
              COALESCE(p.show_identity, 0) AS show_identity,
              COALESCE(p.admin_hidden, 0) AS admin_hidden,
              p.admin_hidden_reason
         ${base}
        GROUP BY o.light_note_user_id, u.alias, l.provider_name, l.linked_at,
                 p.participate_in_ranking, p.show_identity, p.admin_hidden, p.admin_hidden_reason
        ORDER BY total_amount DESC, last_support_at DESC
        LIMIT ? OFFSET ?`,
      [...searchParams, paging.pageSize, paging.offset],
    ),
  ]);
  return { items: rows, total: Number(countRows[0]?.total || 0), page: paging.page, pageSize: paging.pageSize };
}

export async function setAfdianAdminIdentityHidden({
  userId,
  hidden,
  reason = '',
  actorUserId,
  requestId,
  ip,
  db = pool,
}) {
  const normalizedReason = String(reason || '').trim().slice(0, 255);
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId || normalizedUserId.length > 255) {
    throw afdianError('AFDIAN_ADMIN_USER_INVALID', '用户标识不合法', 400);
  }
  if (typeof hidden !== 'boolean' || (hidden && !normalizedReason)) {
    throw afdianError('AFDIAN_ADMIN_HIDE_INVALID', '隐藏公开身份时必须填写原因', 400);
  }
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [supporterRows] = await connection.query(
      `SELECT 1
         FROM support_orders o
         INNER JOIN user u ON u.id = o.light_note_user_id AND u.del_flag = '0'
        WHERE o.light_note_user_id = ?
          AND o.verification_state = 'api_verified'
          AND o.provider_status = 2
        LIMIT 1
        FOR UPDATE`,
      [normalizedUserId],
    );
    if (!supporterRows.length) {
      throw afdianError('AFDIAN_ADMIN_SUPPORTER_NOT_FOUND', '未找到可管理的已确认支持者', 404);
    }
    await connection.query(
      `INSERT INTO support_public_preferences
        (user_id, public_id, admin_hidden, admin_hidden_reason, admin_hidden_by, admin_hidden_at)
       VALUES (?, ?, ?, ?, ?, IF(? = 1, NOW(), NULL))
       ON DUPLICATE KEY UPDATE
         admin_hidden = VALUES(admin_hidden),
         admin_hidden_reason = VALUES(admin_hidden_reason),
         admin_hidden_by = VALUES(admin_hidden_by),
         admin_hidden_at = IF(VALUES(admin_hidden) = 1, NOW(), NULL)`,
      [
        normalizedUserId,
        crypto.randomUUID(),
        hidden ? 1 : 0,
        hidden ? normalizedReason : null,
        actorUserId,
        hidden ? 1 : 0,
      ],
    );
    await recordAdminOperationAudit(
      {
        actorUserId,
        action: hidden ? 'support_identity_hide' : 'support_identity_restore',
        targetType: 'support_public_preference',
        targetId: normalizedUserId,
        outcome: 'succeeded',
        reason: normalizedReason,
        requestId,
        ip,
      },
      { db: connection, required: true },
    );
    await connection.commit();
    invalidateAfdianLeaderboardCache();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export const afdianSupportReadInternals = {
  money,
  pagination,
  preferenceFromRow,
};
