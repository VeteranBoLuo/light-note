import { randomUUID } from 'node:crypto';
import pool from '../../db/index.js';
import { COMMUNITY_CHAT_PRIMARY_ROOM_SLUG } from '../communityChatFeature.js';
import { publishCommunityChatRealtimeEvent } from '../communityChat/realtimeBroker.js';
import {
  CommunityChatError,
  assertCommunityChatMessagingAccess,
  assertCommunityChatPostingEnabled,
} from './communityChatAccessService.js';
import { assertCommunityChatPostingAllowed } from './communityChatModerationService.js';

export const COMMUNITY_CHAT_POLL_MIN_OPTIONS = 2;
export const COMMUNITY_CHAT_POLL_MAX_OPTIONS = 10;
export const COMMUNITY_CHAT_POLL_QUESTION_MAX_LENGTH = 200;
export const COMMUNITY_CHAT_POLL_OPTION_MAX_LENGTH = 80;
export const COMMUNITY_CHAT_POLL_MIN_DURATION_MS = 5 * 60 * 1000;
export const COMMUNITY_CHAT_POLL_MAX_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

const PUBLIC_ID_PATTERN = /^[A-Za-z0-9-]{1,36}$/;
const chatError = (code, status, zhMessage, enMessage) => new CommunityChatError(code, status, zhMessage, enMessage);

function normalizePublicId(value, fieldName) {
  const normalized = String(value || '').trim();
  if (!PUBLIC_ID_PATTERN.test(normalized)) {
    throw chatError('INVALID_INPUT', 400, `${fieldName}无效`, `Invalid ${fieldName}`);
  }
  return normalized;
}

function normalizePollOption(value) {
  if (typeof value !== 'string') {
    throw chatError('INVALID_POLL_OPTION', 400, '投票选项必须是文字', 'Poll options must be text');
  }
  const label = String(value || '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim();
  const length = Array.from(label).length;
  if (!length || length > COMMUNITY_CHAT_POLL_OPTION_MAX_LENGTH) {
    throw chatError(
      'INVALID_POLL_OPTION',
      400,
      `投票选项需为 1-${COMMUNITY_CHAT_POLL_OPTION_MAX_LENGTH} 个字符`,
      `Poll options must contain 1-${COMMUNITY_CHAT_POLL_OPTION_MAX_LENGTH} characters`,
    );
  }
  return label;
}

function assertPollDeadlineRange(timestamp, now = Date.now()) {
  if (timestamp < now + COMMUNITY_CHAT_POLL_MIN_DURATION_MS) {
    throw chatError(
      'POLL_DEADLINE_TOO_SOON',
      400,
      '投票截止时间至少应在 5 分钟后',
      'The poll deadline must be at least 5 minutes from now',
    );
  }
  if (timestamp > now + COMMUNITY_CHAT_POLL_MAX_DURATION_MS) {
    throw chatError(
      'POLL_DEADLINE_TOO_LATE',
      400,
      '投票最长可持续 30 天',
      'A poll can remain open for at most 30 days',
    );
  }
}

function normalizePollDeadline(value, now = Date.now(), { validateDuration = true } = {}) {
  const source = String(value || '').trim();
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(source)) {
    throw chatError(
      'INVALID_POLL_DEADLINE',
      400,
      '投票截止时间必须包含明确时区',
      'The poll deadline must include an explicit time zone',
    );
  }
  const timestamp = new Date(source).getTime();
  if (!Number.isFinite(timestamp)) {
    throw chatError('INVALID_POLL_DEADLINE', 400, '投票截止时间无效', 'Invalid poll deadline');
  }
  if (validateDuration) assertPollDeadlineRange(timestamp, now);
  const endsAtUtc = new Date(timestamp).toISOString();
  return {
    endsAtUtc,
    endsAtSql: endsAtUtc.slice(0, 23).replace('T', ' '),
  };
}

export function normalizeCommunityChatPollDraft(value, { question, now = Date.now(), validateDuration = true } = {}) {
  const questionLength = Array.from(String(question || '').trim()).length;
  if (!questionLength || questionLength > COMMUNITY_CHAT_POLL_QUESTION_MAX_LENGTH) {
    throw chatError(
      'INVALID_POLL_QUESTION',
      400,
      `投票问题需为 1-${COMMUNITY_CHAT_POLL_QUESTION_MAX_LENGTH} 个字符`,
      `Poll questions must contain 1-${COMMUNITY_CHAT_POLL_QUESTION_MAX_LENGTH} characters`,
    );
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw chatError('INVALID_POLL', 400, '投票参数无效', 'Invalid poll payload');
  }
  if (!Array.isArray(value.options)) {
    throw chatError('INVALID_POLL_OPTIONS', 400, '投票选项无效', 'Invalid poll options');
  }
  if (
    value.options.length < COMMUNITY_CHAT_POLL_MIN_OPTIONS ||
    value.options.length > COMMUNITY_CHAT_POLL_MAX_OPTIONS
  ) {
    throw chatError(
      'INVALID_POLL_OPTIONS',
      400,
      `投票需要 ${COMMUNITY_CHAT_POLL_MIN_OPTIONS}-${COMMUNITY_CHAT_POLL_MAX_OPTIONS} 个选项`,
      `Polls require ${COMMUNITY_CHAT_POLL_MIN_OPTIONS}-${COMMUNITY_CHAT_POLL_MAX_OPTIONS} options`,
    );
  }
  const options = value.options.map(normalizePollOption);
  const optionKeys = options.map((option) => option.toLowerCase());
  if (new Set(optionKeys).size !== optionKeys.length) {
    throw chatError('DUPLICATE_POLL_OPTION', 400, '投票选项不能重复', 'Poll options must be unique');
  }
  return { options, ...normalizePollDeadline(value.endsAt, now, { validateDuration }) };
}

export function assertCommunityChatPollDeadlineRange(poll, now = Date.now()) {
  const timestamp = new Date(String(poll?.endsAtUtc || '')).getTime();
  if (!Number.isFinite(timestamp)) {
    throw chatError('INVALID_POLL_DEADLINE', 400, '投票截止时间无效', 'Invalid poll deadline');
  }
  assertPollDeadlineRange(timestamp, now);
}

export async function assertCommunityChatPollDeadlineRangeInDatabase(db, poll) {
  const [rows] = await db.query(
    `SELECT
       parsed.ends_at_utc IS NULL AS invalid,
       parsed.ends_at_utc < DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 5 MINUTE) AS tooSoon,
       parsed.ends_at_utc > DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 30 DAY) AS tooLate
       FROM (SELECT CAST(? AS DATETIME(3)) AS ends_at_utc) parsed`,
    [poll.endsAtSql],
  );
  const result = rows[0] || {};
  if (Boolean(Number(result.invalid || 0))) {
    throw chatError('INVALID_POLL_DEADLINE', 400, '投票截止时间无效', 'Invalid poll deadline');
  }
  if (Boolean(Number(result.tooSoon || 0))) {
    throw chatError(
      'POLL_DEADLINE_TOO_SOON',
      400,
      '投票截止时间至少应在 5 分钟后',
      'The poll deadline must be at least 5 minutes from now',
    );
  }
  if (Boolean(Number(result.tooLate || 0))) {
    throw chatError(
      'POLL_DEADLINE_TOO_LATE',
      400,
      '投票最长可持续 30 天',
      'A poll can remain open for at most 30 days',
    );
  }
}

export async function insertCommunityChatPoll(db, { messageId, poll }) {
  await db.query(
    `INSERT INTO community_chat_polls (message_id, ends_at_utc)
     VALUES (?, ?)`,
    [messageId, poll.endsAtSql],
  );
  const values = poll.options.map(() => '(?, ?, ?, ?)').join(',');
  await db.query(
    `INSERT INTO community_chat_poll_options (public_id, message_id, label, sort_order)
     VALUES ${values}`,
    poll.options.flatMap((label, sortOrder) => [randomUUID(), messageId, label, sortOrder]),
  );
}

function pollMessageIds(rows) {
  return [
    ...new Set(
      rows
        .filter((row) => row.messageKind === 'poll')
        .map((row) => Number(row.internalId))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
}

export async function loadCommunityChatPolls(
  db,
  rows,
  { viewerUserId = '', viewerIsRoot = false, pollsEnabled = false } = {},
) {
  const messageIds = pollMessageIds(rows);
  const byMessageId = new Map();
  if (!messageIds.length) return byMessageId;
  const placeholders = messageIds.map(() => '?').join(',');
  const [pollRows] = await db.query(
    `SELECT poll.message_id AS messageId,
            CONCAT(
              DATE_FORMAT(poll.ends_at_utc, '%Y-%m-%dT%H:%i:%s.'),
              LPAD(FLOOR(MICROSECOND(poll.ends_at_utc) / 1000), 3, '0'),
              'Z'
            ) AS endsAt,
            CONCAT(
              DATE_FORMAT(poll.closed_at_utc, '%Y-%m-%dT%H:%i:%s.'),
              LPAD(FLOOR(MICROSECOND(poll.closed_at_utc) / 1000), 3, '0'),
              'Z'
            ) AS closedAt,
            IF(poll.closed_at_utc IS NOT NULL, 1, 0) AS manuallyClosed,
            IF(poll.ends_at_utc <= UTC_TIMESTAMP(3), 1, 0) AS deadlinePassed,
            option_row.public_id AS optionPublicId, option_row.label, option_row.sort_order AS sortOrder,
            COUNT(vote.user_id) AS voteCount,
            MAX(CASE WHEN vote.user_id = ? THEN 1 ELSE 0 END) AS selectedByViewer
       FROM community_chat_polls poll
       JOIN community_chat_poll_options option_row ON option_row.message_id = poll.message_id
       LEFT JOIN community_chat_poll_votes vote
              ON vote.message_id = poll.message_id AND vote.option_id = option_row.id
      WHERE poll.message_id IN (${placeholders})
      GROUP BY poll.message_id, poll.ends_at_utc, poll.closed_at_utc,
               option_row.id, option_row.public_id, option_row.label, option_row.sort_order
      ORDER BY poll.message_id ASC, option_row.sort_order ASC, option_row.id ASC`,
    [viewerUserId || '', ...messageIds],
  );
  const statusByMessageId = new Map(rows.map((row) => [Number(row.internalId), row.status]));
  for (const row of pollRows) {
    const messageId = Number(row.messageId);
    let poll = byMessageId.get(messageId);
    if (!poll) {
      const manuallyClosed = Boolean(Number(row.manuallyClosed || 0));
      const deadlinePassed = Boolean(Number(row.deadlinePassed || 0));
      const closed = manuallyClosed || deadlinePassed;
      poll = {
        endsAt: row.endsAt,
        closedAt: row.closedAt || null,
        closed,
        closeReason: manuallyClosed ? 'manual' : deadlinePassed ? 'deadline' : null,
        resultsVisible: Boolean(viewerIsRoot || closed),
        selectedOptionPublicId: null,
        totalVoterCount: 0,
        canVote: Boolean(viewerUserId && pollsEnabled && statusByMessageId.get(messageId) === 'active' && !closed),
        canClose: Boolean(viewerIsRoot && statusByMessageId.get(messageId) === 'active' && !closed),
        options: [],
      };
      byMessageId.set(messageId, poll);
    }
    const voteCount = Number(row.voteCount || 0);
    poll.totalVoterCount += voteCount;
    if (Boolean(Number(row.selectedByViewer || 0))) poll.selectedOptionPublicId = row.optionPublicId;
    poll.options.push({ publicId: row.optionPublicId, label: row.label, voteCount });
  }
  for (const poll of byMessageId.values()) {
    if (poll.resultsVisible) continue;
    delete poll.totalVoterCount;
    for (const option of poll.options) delete option.voteCount;
  }
  return byMessageId;
}

async function queryFirst(db, sql, params = []) {
  const [rows] = await db.query(sql, params);
  return rows[0] || null;
}

async function loadInteractivePoll(db, messagePublicId, userId, { lock = false } = {}) {
  return queryFirst(
    db,
    `SELECT message.id AS internalId, message.public_id AS publicId, message.status,
            room.slug AS roomSlug, message.user_id AS authorUserId,
            IF(poll.closed_at_utc IS NOT NULL OR poll.ends_at_utc <= UTC_TIMESTAMP(3), 1, 0) AS closed
       FROM community_chat_messages message
       JOIN community_chat_rooms room ON room.id = message.room_id
       JOIN community_chat_polls poll ON poll.message_id = message.id
       JOIN user viewer ON viewer.id = ? AND viewer.del_flag = 0 AND viewer.role <> 'deleted'
      WHERE message.public_id = ?
        AND message.message_kind = 'poll'
        AND message.status = 'active'
        AND room.slug = ?
        AND room.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM community_chat_message_deletions deletion
           WHERE deletion.user_id = ? AND deletion.message_id = message.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM community_chat_blocks blocked
           WHERE blocked.user_id = ? AND blocked.blocked_user_id = message.user_id
        )
      LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [userId, messagePublicId, COMMUNITY_CHAT_PRIMARY_ROOM_SLUG, userId, userId],
  );
}

async function loadOnePoll(db, target, { userId, viewerIsRoot, pollsEnabled }) {
  const polls = await loadCommunityChatPolls(db, [{ ...target, messageKind: 'poll' }], {
    viewerUserId: userId,
    viewerIsRoot,
    pollsEnabled,
  });
  return polls.get(Number(target.internalId)) || null;
}

export async function voteCommunityChatPoll({ user, messagePublicId, optionPublicId, env = process.env, db = pool }) {
  const normalizedMessagePublicId = normalizePublicId(messagePublicId, '消息标识');
  const normalizedOptionPublicId = normalizePublicId(optionPublicId, '投票选项');
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { feature } = await assertCommunityChatMessagingAccess({ user, env, db: connection, lock: true });
    if (!feature.pollsEnabled) {
      throw chatError('COMMUNITY_CHAT_POLLS_DISABLED', 403, '投票功能当前未开放', 'Polls are currently disabled');
    }
    await assertCommunityChatPostingEnabled({ env, db: connection, lock: true });
    await assertCommunityChatPostingAllowed({ user, db: connection, lock: true });
    const target = await loadInteractivePoll(connection, normalizedMessagePublicId, user.id, { lock: true });
    if (!target) {
      throw chatError('POLL_NOT_INTERACTIVE', 409, '这项投票已不可参与', 'This poll is no longer available');
    }
    if (Boolean(Number(target.closed || 0))) {
      throw chatError('POLL_CLOSED', 409, '投票已经结束', 'This poll has ended');
    }
    const option = await queryFirst(
      connection,
      `SELECT id FROM community_chat_poll_options
        WHERE message_id = ? AND public_id = ?
        LIMIT 1 FOR UPDATE`,
      [target.internalId, normalizedOptionPublicId],
    );
    if (!option) {
      throw chatError('POLL_OPTION_UNAVAILABLE', 409, '这个投票选项已不可用', 'This poll option is unavailable');
    }
    await connection.query(
      `INSERT INTO community_chat_poll_votes (message_id, user_id, option_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE option_id = VALUES(option_id), update_time = CURRENT_TIMESTAMP`,
      [target.internalId, user.id, option.id],
    );
    const poll = await loadOnePoll(connection, target, {
      userId: user.id,
      viewerIsRoot: user.role === 'root',
      pollsEnabled: true,
    });
    await connection.commit();
    publishCommunityChatRealtimeEvent(
      'message.updated',
      {
        roomSlug: target.roomSlug,
        messagePublicId: target.publicId,
        reason: 'poll_vote',
      },
      { targetUserId: target.authorUserId },
    );
    return { messagePublicId: target.publicId, poll };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function closeCommunityChatPoll({ user, messagePublicId, env = process.env, db = pool }) {
  const normalizedMessagePublicId = normalizePublicId(messagePublicId, '消息标识');
  if (user?.role !== 'root') {
    throw chatError('POLL_CLOSE_ROOT_REQUIRED', 403, '只有 Root 可以结束投票', 'Only Root can close polls');
  }
  const connection = await db.getConnection();
  let changed = false;
  try {
    await connection.beginTransaction();
    const { feature } = await assertCommunityChatMessagingAccess({ user, env, db: connection, lock: true });
    const target = await loadInteractivePoll(connection, normalizedMessagePublicId, user.id, { lock: true });
    if (!target) {
      throw chatError('POLL_NOT_INTERACTIVE', 409, '这项投票已不可管理', 'This poll is no longer available');
    }
    if (!Boolean(Number(target.closed || 0))) {
      const [result] = await connection.query(
        `UPDATE community_chat_polls
            SET closed_at_utc = UTC_TIMESTAMP(3), closed_by = ?
          WHERE message_id = ? AND closed_at_utc IS NULL AND ends_at_utc > UTC_TIMESTAMP(3)`,
        [user.id, target.internalId],
      );
      changed = Number(result?.affectedRows || 0) === 1;
    }
    const poll = await loadOnePoll(connection, target, {
      userId: user.id,
      viewerIsRoot: true,
      pollsEnabled: feature.pollsEnabled,
    });
    await connection.commit();
    if (changed) {
      publishCommunityChatRealtimeEvent('message.updated', {
        roomSlug: target.roomSlug,
        messagePublicId: target.publicId,
        reason: 'poll_closed',
      });
    }
    return { messagePublicId: target.publicId, poll, changed };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export const __test__ = {
  assertPollDeadlineRange,
  normalizePollDeadline,
  normalizePollOption,
};
