import pool from '../../db/index.js';
import { generateUUID } from '../agent/data.js';
import { getCommunityChatFeatureState } from '../communityChatFeature.js';
import { publishCommunityChatRealtimeEvent } from '../communityChat/realtimeBroker.js';
import { CommunityChatError, assertCommunityChatMessagingAccess } from './communityChatAccessService.js';

const REPORT_REASON_CODES = new Set([
  'spam',
  'harassment',
  'hate',
  'sexual',
  'violence',
  'privacy',
  'fraud',
  'self_harm',
  'other',
]);
const REPORT_STATUSES = new Set(['pending', 'actioned', 'dismissed']);
const MODERATION_ACTIONS = new Set(['dismiss', 'hide_message', 'mute_author', 'ban_author']);
const MIN_MUTE_MINUTES = 15;
const MAX_MUTE_MINUTES = 30 * 24 * 60;

const chatError = (code, status, zhMessage, enMessage) => new CommunityChatError(code, status, zhMessage, enMessage);

function normalizeText(value, maxLength, fieldName) {
  const text = String(value || '').trim();
  if (Array.from(text).length > maxLength) {
    throw chatError(
      'INVALID_INPUT',
      400,
      `${fieldName}不能超过 ${maxLength} 个字符`,
      `${fieldName} must not exceed ${maxLength} characters`,
    );
  }
  return text;
}

function normalizePublicId(value, fieldName) {
  const id = String(value || '').trim();
  if (!id || id.length > 36 || !/^[A-Za-z0-9-]+$/.test(id)) {
    throw chatError('INVALID_INPUT', 400, `${fieldName}无效`, `Invalid ${fieldName}`);
  }
  return id;
}

function normalizeReasonCode(value) {
  const reasonCode = String(value || '').trim();
  if (!REPORT_REASON_CODES.has(reasonCode)) {
    throw chatError('INVALID_REPORT_REASON', 400, '请选择有效的举报原因', 'Select a valid report reason');
  }
  return reasonCode;
}

function normalizeReportDetail(value, reasonCode) {
  const detail = normalizeText(value, 500, '补充说明');
  if (reasonCode === 'other' && !detail) {
    throw chatError('REPORT_DETAIL_REQUIRED', 400, '选择其他原因时必须填写说明', 'Details are required for other');
  }
  return detail;
}

function normalizeMuteMinutes(value) {
  const minutes = Math.floor(Number(value));
  if (!Number.isFinite(minutes) || minutes < MIN_MUTE_MINUTES || minutes > MAX_MUTE_MINUTES) {
    throw chatError(
      'INVALID_MUTE_DURATION',
      400,
      '禁言时长必须在 15 分钟到 30 天之间',
      'Mute duration must be between 15 minutes and 30 days',
    );
  }
  return minutes;
}

function assertRoot(user) {
  if (!user?.id || user.role !== 'root') {
    throw chatError('ROOT_REQUIRED', 403, '没有操作权限', 'You do not have permission');
  }
}

function assertMessagingEnabled(env) {
  if (!getCommunityChatFeatureState(env).messagingEnabled) {
    throw chatError(
      'COMMUNITY_CHAT_MESSAGING_CLOSED',
      403,
      '聊天室消息试点当前未开放',
      'The community messaging pilot is currently closed',
    );
  }
}

async function queryFirst(db, sql, params = []) {
  const [rows] = await db.query(sql, params);
  return rows[0] || null;
}

function authorRole(row) {
  if (row.accountRole === 'root') return 'official';
  if (row.memberRole === 'moderator' && row.memberStatus === 'active') return 'moderator';
  return 'member';
}

function authorName(row) {
  return String(row.accountDeleted) === '0' ? String(row.authorName || '') : '';
}

function parseJsonObject(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function loadModerationMessage(db, publicId, { lock = false } = {}) {
  return queryFirst(
    db,
    `SELECT message.id, message.public_id AS publicId, message.user_id AS userId,
            message.content, message.status, message.create_time AS createdAt,
            room.slug AS roomSlug, room.name_zh AS roomNameZh, room.name_en AS roomNameEn,
            COALESCE(NULLIF(account.alias, ''), '') AS authorName,
            COALESCE(account.del_flag, '1') AS accountDeleted, account.role AS accountRole,
            membership.role AS memberRole, membership.status AS memberStatus
       FROM community_chat_messages message
       INNER JOIN community_chat_rooms room ON room.id = message.room_id
       LEFT JOIN user account ON account.id = message.user_id
       LEFT JOIN community_chat_members membership ON membership.user_id = message.user_id
      WHERE message.public_id = ?
      LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [publicId],
  );
}

export async function getCommunityChatBlockedUserIds({ userId, db = pool }) {
  const [rows] = await db.query(
    `SELECT blocked_user_id AS blockedUserId FROM community_chat_blocks WHERE user_id = ?`,
    [userId],
  );
  return new Set(rows.map((row) => row.blockedUserId));
}

export async function assertCommunityChatPostingAllowed({ user, db = pool, lock = false }) {
  if (user?.role === 'root') return;
  const sanction = await queryFirst(
    db,
    `SELECT expires_at AS expiresAt
       FROM community_chat_member_sanctions
      WHERE user_id = ? AND type = 'mute' AND status = 'active'
        AND expires_at IS NOT NULL AND expires_at > NOW()
      ORDER BY expires_at DESC, id DESC
      LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [user?.id || ''],
  );
  if (sanction) {
    throw chatError(
      'COMMUNITY_CHAT_MUTED',
      403,
      '当前账号处于社区禁言期，请在到期后再发言',
      'This account is temporarily muted in the community',
    );
  }
}

export async function reportCommunityChatMessage({
  user,
  messagePublicId,
  reasonCode,
  detail = '',
  env = process.env,
  db = pool,
}) {
  const normalizedMessagePublicId = normalizePublicId(messagePublicId, '消息标识');
  const normalizedReasonCode = normalizeReasonCode(reasonCode);
  const normalizedDetail = normalizeReportDetail(detail, normalizedReasonCode);
  assertMessagingEnabled(env);

  const connection = await db.getConnection();
  let expectedMessageId = null;
  try {
    await connection.beginTransaction();
    await assertCommunityChatMessagingAccess({ user, env, db: connection, lock: true });
    const target = await loadModerationMessage(connection, normalizedMessagePublicId, { lock: true });
    if (!target || target.status !== 'active') {
      throw chatError('REPORT_MESSAGE_UNAVAILABLE', 404, '要举报的消息已不可用', 'The message is unavailable');
    }
    if (target.userId === user.id) {
      throw chatError('REPORT_OWN_MESSAGE_FORBIDDEN', 400, '不能举报自己的消息', 'You cannot report your own message');
    }
    expectedMessageId = target.id;

    const existing = await queryFirst(
      connection,
      `SELECT id, status FROM community_chat_reports
        WHERE reporter_id = ? AND message_id = ?
        LIMIT 1 FOR UPDATE`,
      [user.id, target.id],
    );
    if (existing) {
      await connection.commit();
      return { id: existing.id, status: existing.status, alreadyReported: true };
    }

    const reportId = generateUUID();
    const evidenceSnapshot = JSON.stringify({
      messagePublicId: target.publicId,
      roomSlug: target.roomSlug,
      roomNameZh: target.roomNameZh,
      roomNameEn: target.roomNameEn,
      authorName: authorName(target),
      authorRole: authorRole(target),
      content: target.content,
      messageCreatedAt: target.createdAt,
      capturedAt: new Date().toISOString(),
    });
    await connection.query(
      `INSERT INTO community_chat_reports
         (id, reporter_id, message_id, reason_code, detail, evidence_snapshot, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [reportId, user.id, target.id, normalizedReasonCode, normalizedDetail, evidenceSnapshot],
    );
    await connection.commit();
    return { id: reportId, status: 'pending', alreadyReported: false };
  } catch (error) {
    await connection.rollback();
    if (error?.code === 'ER_DUP_ENTRY' && expectedMessageId !== null && typeof db.query === 'function') {
      const existing = await queryFirst(
        db,
        `SELECT id, status FROM community_chat_reports WHERE reporter_id = ? AND message_id = ? LIMIT 1`,
        [user.id, expectedMessageId],
      );
      if (existing) return { id: existing.id, status: existing.status, alreadyReported: true };
    }
    throw error;
  } finally {
    connection.release();
  }
}

export async function blockCommunityChatMessageAuthor({ user, messagePublicId, env = process.env, db = pool }) {
  const normalizedMessagePublicId = normalizePublicId(messagePublicId, '消息标识');
  assertMessagingEnabled(env);

  const connection = await db.getConnection();
  let expectedTargetUserId = null;
  let expectedDisplayName = '';
  try {
    await connection.beginTransaction();
    await assertCommunityChatMessagingAccess({ user, env, db: connection, lock: true });
    const target = await loadModerationMessage(connection, normalizedMessagePublicId, { lock: true });
    if (!target || !['active', 'hidden'].includes(target.status)) {
      throw chatError('BLOCK_MESSAGE_UNAVAILABLE', 404, '无法从该消息屏蔽作者', 'The message author is unavailable');
    }
    if (target.userId === user.id) {
      throw chatError('BLOCK_SELF_FORBIDDEN', 400, '不能屏蔽自己', 'You cannot block yourself');
    }
    if (target.accountRole === 'root') {
      throw chatError(
        'BLOCK_OFFICIAL_FORBIDDEN',
        400,
        '官方安全消息不能被屏蔽',
        'Official safety messages cannot be blocked',
      );
    }
    expectedTargetUserId = target.userId;
    expectedDisplayName = authorName(target);

    const existing = await queryFirst(
      connection,
      `SELECT id FROM community_chat_blocks
        WHERE user_id = ? AND blocked_user_id = ?
        LIMIT 1 FOR UPDATE`,
      [user.id, target.userId],
    );
    const blockId = existing?.id || generateUUID();
    if (!existing) {
      await connection.query(`INSERT INTO community_chat_blocks (id, user_id, blocked_user_id) VALUES (?, ?, ?)`, [
        blockId,
        user.id,
        target.userId,
      ]);
    }
    await connection.commit();
    return {
      id: blockId,
      displayName: authorName(target),
      alreadyBlocked: Boolean(existing),
    };
  } catch (error) {
    await connection.rollback();
    if (error?.code === 'ER_DUP_ENTRY' && expectedTargetUserId && typeof db.query === 'function') {
      const existing = await queryFirst(
        db,
        `SELECT id FROM community_chat_blocks WHERE user_id = ? AND blocked_user_id = ? LIMIT 1`,
        [user.id, expectedTargetUserId],
      );
      if (existing) return { id: existing.id, displayName: expectedDisplayName, alreadyBlocked: true };
    }
    throw error;
  } finally {
    connection.release();
  }
}

export async function listCommunityChatBlocks({ user, env = process.env, db = pool }) {
  assertMessagingEnabled(env);
  await assertCommunityChatMessagingAccess({ user, env, db });
  const [rows] = await db.query(
    `SELECT block.id, block.create_time AS createTime,
            CASE WHEN account.del_flag = '0' THEN COALESCE(NULLIF(account.alias, ''), '') ELSE '' END AS displayName,
            CASE
              WHEN membership.role = 'moderator' AND membership.status = 'active' THEN 'moderator'
              ELSE 'member'
            END AS role
       FROM community_chat_blocks block
       LEFT JOIN user account ON account.id = block.blocked_user_id
       LEFT JOIN community_chat_members membership ON membership.user_id = block.blocked_user_id
      WHERE block.user_id = ?
      ORDER BY block.create_time DESC, block.id DESC
      LIMIT 100`,
    [user.id],
  );
  return { items: rows };
}

export async function unblockCommunityChatUser({ user, blockId, env = process.env, db = pool }) {
  const normalizedBlockId = normalizePublicId(blockId, '屏蔽记录');
  assertMessagingEnabled(env);
  await assertCommunityChatMessagingAccess({ user, env, db });
  const [result] = await db.query(`DELETE FROM community_chat_blocks WHERE id = ? AND user_id = ?`, [
    normalizedBlockId,
    user.id,
  ]);
  if (!result.affectedRows) {
    throw chatError('BLOCK_NOT_FOUND', 404, '未找到该屏蔽记录', 'Block record not found');
  }
  return { id: normalizedBlockId, unblocked: true };
}

export async function listCommunityChatReports({ user, status = 'pending', page = 1, pageSize = 30, db = pool }) {
  assertRoot(user);
  const normalizedStatus = REPORT_STATUSES.has(status) ? status : 'pending';
  const normalizedPage = Math.max(1, Math.floor(Number(page) || 1));
  const normalizedPageSize = Math.min(100, Math.max(1, Math.floor(Number(pageSize) || 30)));
  const offset = (normalizedPage - 1) * normalizedPageSize;

  const [[rows], [countRows]] = await Promise.all([
    db.query(
      `SELECT report.id, report.reason_code AS reasonCode, report.detail, report.evidence_snapshot AS evidenceSnapshot,
              report.status, report.review_note AS reviewNote, report.reviewed_at AS reviewedAt,
              report.create_time AS createTime, message.public_id AS messagePublicId,
              message.status AS messageStatus, room.slug AS roomSlug,
              COALESCE(NULLIF(reporter.alias, ''), '') AS reporterName,
              COALESCE(NULLIF(author.alias, ''), '') AS authorName,
              action.action AS resolutionAction, action.expires_at AS actionExpiresAt
         FROM community_chat_reports report
         INNER JOIN community_chat_messages message ON message.id = report.message_id
         INNER JOIN community_chat_rooms room ON room.id = message.room_id
         LEFT JOIN user reporter ON reporter.id = report.reporter_id
         LEFT JOIN user author ON author.id = message.user_id
         LEFT JOIN community_chat_moderation_actions action ON action.report_id = report.id
        WHERE report.status = ?
        ORDER BY report.create_time ASC, report.id ASC
        LIMIT ? OFFSET ?`,
      [normalizedStatus, normalizedPageSize, offset],
    ),
    db.query(`SELECT COUNT(*) AS total FROM community_chat_reports WHERE status = ?`, [normalizedStatus]),
  ]);

  return {
    items: rows.map((row) => ({ ...row, evidenceSnapshot: parseJsonObject(row.evidenceSnapshot) })),
    total: Number(countRows[0]?.total || 0),
    page: normalizedPage,
    pageSize: normalizedPageSize,
    status: normalizedStatus,
  };
}

export async function reviewCommunityChatReport({ user, reportId, action, note, durationMinutes, db = pool }) {
  assertRoot(user);
  const normalizedReportId = normalizePublicId(reportId, '举报标识');
  const normalizedAction = String(action || '').trim();
  if (!MODERATION_ACTIONS.has(normalizedAction)) {
    throw chatError('INVALID_MODERATION_ACTION', 400, '审核处置无效', 'Invalid moderation action');
  }
  const reviewNote = normalizeText(note, 500, '处置说明');
  if (!reviewNote) {
    throw chatError('MODERATION_NOTE_REQUIRED', 400, '处置时必须填写原因', 'A moderation reason is required');
  }
  const muteMinutes = normalizedAction === 'mute_author' ? normalizeMuteMinutes(durationMinutes) : null;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const report = await queryFirst(
      connection,
      `SELECT report.id, report.status, report.message_id AS messageId,
              message.public_id AS messagePublicId, message.user_id AS targetUserId,
              message.status AS messageStatus, room.slug AS roomSlug,
              account.role AS accountRole, membership.status AS memberStatus
         FROM community_chat_reports report
         INNER JOIN community_chat_messages message ON message.id = report.message_id
         INNER JOIN community_chat_rooms room ON room.id = message.room_id
         LEFT JOIN user account ON account.id = message.user_id
         LEFT JOIN community_chat_members membership ON membership.user_id = message.user_id
        WHERE report.id = ?
        LIMIT 1 FOR UPDATE`,
      [normalizedReportId],
    );
    if (!report) {
      throw chatError('COMMUNITY_REPORT_NOT_FOUND', 404, '未找到该举报', 'Report not found');
    }
    if (report.status !== 'pending') {
      throw chatError('COMMUNITY_REPORT_REVIEWED', 409, '该举报已经处理，请刷新列表', 'This report was reviewed');
    }
    if (normalizedAction !== 'dismiss' && (report.accountRole === 'root' || report.targetUserId === user.id)) {
      throw chatError(
        'MODERATION_TARGET_PROTECTED',
        409,
        '不能对受保护账号执行该处置',
        'The target account is protected',
      );
    }
    if (
      ['mute_author', 'ban_author'].includes(normalizedAction) &&
      !['invited', 'active'].includes(report.memberStatus)
    ) {
      throw chatError('MODERATION_MEMBER_UNAVAILABLE', 409, '该成员当前不可执行此处置', 'The member is unavailable');
    }

    if (normalizedAction !== 'dismiss') {
      await connection.query(
        `UPDATE community_chat_messages SET status = 'hidden' WHERE id = ? AND status = 'active'`,
        [report.messageId],
      );
      await connection.query(
        `UPDATE community_chat_rooms
            SET pinned_message_id = NULL, pinned_by = NULL, pinned_at = NULL
          WHERE pinned_message_id = ?`,
        [report.messageId],
      );
    }

    if (normalizedAction === 'mute_author') {
      await connection.query(
        `UPDATE community_chat_member_sanctions
            SET status = 'revoked', revoked_by = ?, revoked_at = NOW()
          WHERE user_id = ? AND type = 'mute' AND status = 'active'
            AND expires_at IS NOT NULL AND expires_at > NOW()`,
        [user.id, report.targetUserId],
      );
      await connection.query(
        `INSERT INTO community_chat_member_sanctions
           (id, user_id, type, status, expires_at, reason, created_by)
         VALUES (?, ?, 'mute', 'active', DATE_ADD(NOW(), INTERVAL ? MINUTE), ?, ?)`,
        [generateUUID(), report.targetUserId, muteMinutes, reviewNote, user.id],
      );
    }

    if (normalizedAction === 'ban_author') {
      await connection.query(
        `UPDATE community_chat_members
            SET status = 'banned', rules_version = NULL, rules_accepted_at = NULL, revoked_at = NOW()
          WHERE user_id = ?`,
        [report.targetUserId],
      );
      await connection.query(
        `UPDATE community_chat_member_sanctions
            SET status = 'revoked', revoked_by = ?, revoked_at = NOW()
          WHERE user_id = ? AND status = 'active'`,
        [user.id, report.targetUserId],
      );
      await connection.query(
        `INSERT INTO community_chat_access_audit (actor_user_id, target_user_id, action, reason)
         VALUES (?, ?, 'community_banned', ?)`,
        [user.id, report.targetUserId, reviewNote],
      );
    }

    const reportStatus = normalizedAction === 'dismiss' ? 'dismissed' : 'actioned';
    await connection.query(
      `UPDATE community_chat_reports
          SET status = ?, reviewed_by = ?, review_note = ?, reviewed_at = NOW()
        WHERE id = ?`,
      [reportStatus, user.id, reviewNote, report.id],
    );

    const metadata = JSON.stringify({
      previousMessageStatus: report.messageStatus,
      durationMinutes: muteMinutes,
    });
    if (normalizedAction === 'mute_author') {
      await connection.query(
        `INSERT INTO community_chat_moderation_actions
           (id, report_id, actor_user_id, target_user_id, message_id, action, reason, expires_at, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), ?)`,
        [
          generateUUID(),
          report.id,
          user.id,
          report.targetUserId,
          report.messageId,
          normalizedAction,
          reviewNote,
          muteMinutes,
          metadata,
        ],
      );
    } else {
      await connection.query(
        `INSERT INTO community_chat_moderation_actions
           (id, report_id, actor_user_id, target_user_id, message_id, action, reason, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          generateUUID(),
          report.id,
          user.id,
          report.targetUserId,
          report.messageId,
          normalizedAction,
          reviewNote,
          metadata,
        ],
      );
    }

    await connection.commit();
    if (normalizedAction !== 'dismiss') {
      publishCommunityChatRealtimeEvent('message.removed', {
        roomSlug: report.roomSlug,
        messagePublicId: report.messagePublicId,
        reason: 'moderation',
      });
    }
    if (normalizedAction === 'ban_author') {
      publishCommunityChatRealtimeEvent(
        'access.changed',
        { reason: 'community_banned', disconnect: true },
        { targetUserId: report.targetUserId },
      );
    }
    return {
      id: report.id,
      status: reportStatus,
      action: normalizedAction,
      messageStatus: normalizedAction === 'dismiss' ? report.messageStatus : 'hidden',
      durationMinutes: muteMinutes,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export const __test__ = {
  normalizeMuteMinutes,
  normalizeReasonCode,
  normalizeReportDetail,
  normalizeText,
  parseJsonObject,
};
