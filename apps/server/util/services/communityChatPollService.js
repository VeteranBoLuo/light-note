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
export const COMMUNITY_CHAT_POLL_SELECTION_MODE_SINGLE = 'single';
export const COMMUNITY_CHAT_POLL_SELECTION_MODE_MULTIPLE = 'multiple';
export const COMMUNITY_CHAT_POLL_VOTER_PAGE_SIZE = 50;
export const COMMUNITY_CHAT_POLL_VOTER_PAGE_MAX = 100;

const PUBLIC_ID_PATTERN = /^[A-Za-z0-9-]{1,36}$/;
const chatError = (code, status, zhMessage, enMessage) => new CommunityChatError(code, status, zhMessage, enMessage);

function normalizePublicId(value, fieldName) {
  const normalized = String(value || '').trim();
  if (!PUBLIC_ID_PATTERN.test(normalized)) {
    throw chatError('INVALID_INPUT', 400, `${fieldName}无效`, `Invalid ${fieldName}`);
  }
  return normalized;
}

function normalizePollVoterPagination(page, pageSize) {
  const normalizedPage = Math.min(10_000, Math.max(1, Math.floor(Number(page) || 1)));
  const normalizedPageSize = Math.min(
    COMMUNITY_CHAT_POLL_VOTER_PAGE_MAX,
    Math.max(1, Math.floor(Number(pageSize) || COMMUNITY_CHAT_POLL_VOTER_PAGE_SIZE)),
  );
  return {
    page: normalizedPage,
    pageSize: normalizedPageSize,
    offset: (normalizedPage - 1) * normalizedPageSize,
  };
}

function assertRootPollVoterAccess(user) {
  if (user?.id && user.role === 'root') return;
  throw chatError(
    'COMMUNITY_CHAT_POLL_VOTERS_ROOT_REQUIRED',
    403,
    '只有 Root 可以查看投票成员',
    'Only Root can view poll voters',
  );
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

function normalizePollSelection(value, optionCount) {
  const selectionMode = value.selectionMode ?? COMMUNITY_CHAT_POLL_SELECTION_MODE_SINGLE;
  if (
    selectionMode !== COMMUNITY_CHAT_POLL_SELECTION_MODE_SINGLE &&
    selectionMode !== COMMUNITY_CHAT_POLL_SELECTION_MODE_MULTIPLE
  ) {
    throw chatError('INVALID_POLL_SELECTION_MODE', 400, '投票选择方式无效', 'Invalid poll selection mode');
  }
  if (selectionMode === COMMUNITY_CHAT_POLL_SELECTION_MODE_SINGLE) {
    if (value.maxSelections !== undefined && value.maxSelections !== null && value.maxSelections !== 1) {
      throw chatError(
        'INVALID_POLL_MAX_SELECTIONS',
        400,
        '单选投票最多只能选择 1 项',
        'Single-choice polls must allow exactly one selection',
      );
    }
    return { selectionMode, maxSelections: 1 };
  }
  if (!Number.isInteger(value.maxSelections) || value.maxSelections < 2 || value.maxSelections > optionCount) {
    throw chatError(
      'INVALID_POLL_MAX_SELECTIONS',
      400,
      `多选投票最多可选项数需为 2-${optionCount}`,
      `The multiple-choice limit must be between 2 and ${optionCount}`,
    );
  }
  return { selectionMode, maxSelections: value.maxSelections };
}

function normalizeVoteOptionPublicIds({ optionPublicIds, optionPublicId }) {
  if (optionPublicIds !== undefined && optionPublicId !== undefined) {
    throw chatError(
      'INVALID_POLL_SELECTION',
      400,
      '不能同时提交新旧两种投票参数',
      'Do not mix the current and legacy vote payloads',
    );
  }
  const source = optionPublicIds !== undefined ? optionPublicIds : [optionPublicId];
  if (!Array.isArray(source) || !source.length || source.length > COMMUNITY_CHAT_POLL_MAX_OPTIONS) {
    throw chatError('INVALID_POLL_SELECTION', 400, '请选择有效的投票选项', 'Choose valid poll options');
  }
  const normalized = source.map((value) => normalizePublicId(value, '投票选项'));
  if (new Set(normalized).size !== normalized.length) {
    throw chatError(
      'DUPLICATE_POLL_SELECTION',
      400,
      '同一个投票选项不能重复选择',
      'The same poll option cannot be selected more than once',
    );
  }
  return normalized;
}

function interactivePollSelection(target) {
  const optionCount = Number(target.optionCount);
  const maxSelections = Number(target.maxSelections);
  const validOptionCount =
    Number.isInteger(optionCount) &&
    optionCount >= COMMUNITY_CHAT_POLL_MIN_OPTIONS &&
    optionCount <= COMMUNITY_CHAT_POLL_MAX_OPTIONS;
  if (validOptionCount && target.selectionMode === COMMUNITY_CHAT_POLL_SELECTION_MODE_SINGLE && maxSelections === 1) {
    return { selectionMode: COMMUNITY_CHAT_POLL_SELECTION_MODE_SINGLE, maxSelections: 1 };
  }
  if (
    validOptionCount &&
    target.selectionMode === COMMUNITY_CHAT_POLL_SELECTION_MODE_MULTIPLE &&
    Number.isInteger(maxSelections) &&
    maxSelections >= 2 &&
    maxSelections <= optionCount
  ) {
    return { selectionMode: COMMUNITY_CHAT_POLL_SELECTION_MODE_MULTIPLE, maxSelections };
  }
  throw chatError(
    'POLL_CONFIGURATION_INVALID',
    409,
    '这项投票的选择规则异常，暂时无法参与',
    'This poll has an invalid selection configuration',
  );
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
  return {
    options,
    ...normalizePollSelection(value, options.length),
    ...normalizePollDeadline(value.endsAt, now, { validateDuration }),
  };
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
    `INSERT INTO community_chat_polls (message_id, selection_mode, max_selections, ends_at_utc)
     VALUES (?, ?, ?, ?)`,
    [messageId, poll.selectionMode, poll.maxSelections, poll.endsAtSql],
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
            poll.selection_mode AS selectionMode,
            poll.max_selections AS maxSelections,
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
            COUNT(COALESCE(multi_vote.user_id, single_vote.user_id)) AS voteCount,
            MAX(CASE WHEN COALESCE(multi_vote.user_id, single_vote.user_id) = ? THEN 1 ELSE 0 END)
              AS selectedByViewer,
            CASE WHEN poll.selection_mode = 'multiple' THEN (
              SELECT COUNT(DISTINCT multi_voter.user_id)
                FROM community_chat_poll_multi_votes multi_voter
               WHERE multi_voter.message_id = poll.message_id
            ) ELSE NULL END AS totalVoterCount
       FROM community_chat_polls poll
       JOIN community_chat_poll_options option_row ON option_row.message_id = poll.message_id
       LEFT JOIN community_chat_poll_votes single_vote
              ON poll.selection_mode = 'single'
             AND single_vote.message_id = poll.message_id
             AND single_vote.option_id = option_row.id
       LEFT JOIN community_chat_poll_multi_votes multi_vote
              ON poll.selection_mode = 'multiple'
             AND multi_vote.message_id = poll.message_id
             AND multi_vote.option_id = option_row.id
      WHERE poll.message_id IN (${placeholders})
      GROUP BY poll.message_id, poll.selection_mode, poll.max_selections, poll.ends_at_utc, poll.closed_at_utc,
               option_row.id, option_row.public_id, option_row.label, option_row.sort_order
      ORDER BY poll.message_id ASC, option_row.sort_order ASC, option_row.id ASC`,
    [viewerUserId || '', ...messageIds],
  );
  const statusByMessageId = new Map(rows.map((row) => [Number(row.internalId), row.status]));
  for (const row of pollRows) {
    const messageId = Number(row.messageId);
    let poll = byMessageId.get(messageId);
    if (!poll) {
      const selectionMode =
        row.selectionMode === COMMUNITY_CHAT_POLL_SELECTION_MODE_MULTIPLE
          ? COMMUNITY_CHAT_POLL_SELECTION_MODE_MULTIPLE
          : COMMUNITY_CHAT_POLL_SELECTION_MODE_SINGLE;
      const manuallyClosed = Boolean(Number(row.manuallyClosed || 0));
      const deadlinePassed = Boolean(Number(row.deadlinePassed || 0));
      const closed = manuallyClosed || deadlinePassed;
      poll = {
        endsAt: row.endsAt,
        closedAt: row.closedAt || null,
        closed,
        closeReason: manuallyClosed ? 'manual' : deadlinePassed ? 'deadline' : null,
        resultsVisible: Boolean(viewerIsRoot || closed),
        selectionMode,
        maxSelections:
          selectionMode === COMMUNITY_CHAT_POLL_SELECTION_MODE_MULTIPLE
            ? Math.max(2, Number(row.maxSelections || 2))
            : 1,
        selectedOptionPublicIds: [],
        selectedOptionPublicId: null,
        totalVoterCount:
          selectionMode === COMMUNITY_CHAT_POLL_SELECTION_MODE_MULTIPLE
            ? Math.max(0, Number(row.totalVoterCount || 0))
            : 0,
        canVote: Boolean(viewerUserId && pollsEnabled && statusByMessageId.get(messageId) === 'active' && !closed),
        canClose: Boolean(viewerIsRoot && statusByMessageId.get(messageId) === 'active' && !closed),
        options: [],
      };
      byMessageId.set(messageId, poll);
    }
    const voteCount = Number(row.voteCount || 0);
    if (poll.selectionMode === COMMUNITY_CHAT_POLL_SELECTION_MODE_SINGLE) poll.totalVoterCount += voteCount;
    if (Boolean(Number(row.selectedByViewer || 0))) poll.selectedOptionPublicIds.push(row.optionPublicId);
    poll.options.push({ publicId: row.optionPublicId, label: row.label, voteCount });
  }
  for (const poll of byMessageId.values()) {
    // 旧客户端只认识单值字段；多选返回第一项作为滚动兼容预览，新客户端始终使用完整数组。
    poll.selectedOptionPublicId = poll.selectedOptionPublicIds[0] || null;
    // 进行中的投票只在成员完成自己的首次选择后公开聚合结果；身份名单始终由独立 Root 接口按需读取。
    poll.resultsVisible = Boolean(poll.resultsVisible || poll.selectedOptionPublicIds.length);
    if (poll.resultsVisible) continue;
    delete poll.totalVoterCount;
    for (const option of poll.options) delete option.voteCount;
  }
  return byMessageId;
}

/**
 * 投票成员身份不随消息或聚合结果下发，只允许 Root 在主动查看某个选项时分页读取。
 * 单选与多选票表仍是唯一事实源，查询分支只能来自数据库中的权威 selection_mode。
 */
export async function listCommunityChatPollOptionVoters({
  user,
  messagePublicId,
  optionPublicId,
  page,
  pageSize,
  env = process.env,
  db = pool,
}) {
  assertRootPollVoterAccess(user);
  const normalizedMessagePublicId = normalizePublicId(messagePublicId, '消息标识');
  const normalizedOptionPublicId = normalizePublicId(optionPublicId, '投票选项');
  const pagination = normalizePollVoterPagination(page, pageSize);
  await assertCommunityChatMessagingAccess({ user, env, db });

  const [targetRows] = await db.query(
    `SELECT message.id AS messageId,
            poll.selection_mode AS selectionMode,
            option_row.id AS optionId,
            option_row.label,
            CASE WHEN poll.selection_mode = 'multiple' THEN (
              SELECT COUNT(*)
                FROM community_chat_poll_multi_votes multi_vote
               WHERE multi_vote.message_id = message.id
                 AND multi_vote.option_id = option_row.id
            ) ELSE (
              SELECT COUNT(*)
                FROM community_chat_poll_votes single_vote
               WHERE single_vote.message_id = message.id
                 AND single_vote.option_id = option_row.id
            ) END AS voteCount
       FROM community_chat_messages message
       JOIN community_chat_rooms room ON room.id = message.room_id
       JOIN community_chat_polls poll ON poll.message_id = message.id
       JOIN community_chat_poll_options option_row
         ON option_row.message_id = message.id AND option_row.public_id = ?
      WHERE message.public_id = ?
        AND message.message_kind = 'poll'
        AND message.status IN ('active', 'recalled')
        AND room.slug = ?
        AND room.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM community_chat_message_deletions deletion
           WHERE deletion.user_id = ? AND deletion.message_id = message.id
        )
      LIMIT 1`,
    [normalizedOptionPublicId, normalizedMessagePublicId, COMMUNITY_CHAT_PRIMARY_ROOM_SLUG, user.id],
  );
  const target = targetRows[0];
  if (!target) {
    throw chatError(
      'COMMUNITY_CHAT_POLL_OPTION_NOT_FOUND',
      404,
      '这项投票选项不存在或已不可查看',
      'This poll option is unavailable',
    );
  }

  if (
    target.selectionMode !== COMMUNITY_CHAT_POLL_SELECTION_MODE_SINGLE &&
    target.selectionMode !== COMMUNITY_CHAT_POLL_SELECTION_MODE_MULTIPLE
  ) {
    throw chatError(
      'COMMUNITY_CHAT_POLL_CONFIGURATION_INVALID',
      409,
      '投票配置异常，暂时无法查看成员',
      'The poll configuration is invalid',
    );
  }

  const voteTable =
    target.selectionMode === COMMUNITY_CHAT_POLL_SELECTION_MODE_MULTIPLE
      ? 'community_chat_poll_multi_votes'
      : 'community_chat_poll_votes';
  const [voterRows] = await db.query(
    `SELECT identity.public_id AS userPublicId,
            identity.community_id AS communityId,
            COALESCE(NULLIF(voter.alias, ''), '轻笺用户') AS displayName,
            growth.equipped_frame AS frameId,
            CASE
              WHEN COALESCE(membership.status, '') <> 'banned'
               AND (
                 voter.head_picture LIKE 'https://%'
                 OR voter.head_picture LIKE 'http://%'
                 OR (
                   voter.head_picture LIKE 'data:image/%;base64,%'
                   AND OCTET_LENGTH(voter.head_picture) <= 524288
                 )
               )
              THEN 1 ELSE 0
            END AS hasAvatar
       FROM ${voteTable} vote
       JOIN user voter ON voter.id = vote.user_id
                      AND voter.del_flag = 0
                      AND voter.role <> 'deleted'
       LEFT JOIN community_chat_user_identities identity ON identity.user_id = voter.id
       LEFT JOIN community_chat_members membership ON membership.user_id = voter.id
       LEFT JOIN user_growth growth ON growth.user_id = voter.id
      WHERE vote.message_id = ? AND vote.option_id = ?
      ORDER BY vote.update_time ASC, vote.user_id ASC
      LIMIT ? OFFSET ?`,
    [target.messageId, target.optionId, pagination.pageSize, pagination.offset],
  );
  const items = voterRows.map((row) => {
    const userPublicId = String(row.userPublicId || '');
    return {
      userPublicId,
      communityId: String(row.communityId || ''),
      displayName: String(row.displayName || ''),
      avatar:
        userPublicId && Number(row.hasAvatar || 0)
          ? `/api/community-chat/members/${encodeURIComponent(userPublicId)}/avatar`
          : '',
      frameId: row.frameId || null,
    };
  });
  const total = Math.max(0, Number(target.voteCount || 0));
  return {
    messagePublicId: normalizedMessagePublicId,
    selectionMode:
      target.selectionMode === COMMUNITY_CHAT_POLL_SELECTION_MODE_MULTIPLE
        ? COMMUNITY_CHAT_POLL_SELECTION_MODE_MULTIPLE
        : COMMUNITY_CHAT_POLL_SELECTION_MODE_SINGLE,
    option: {
      publicId: normalizedOptionPublicId,
      label: String(target.label || ''),
      voteCount: total,
    },
    items,
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
    hasMore: items.length === pagination.pageSize && pagination.offset + items.length < total,
  };
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
            poll.selection_mode AS selectionMode, poll.max_selections AS maxSelections,
            (SELECT COUNT(*) FROM community_chat_poll_options option_count
              WHERE option_count.message_id = poll.message_id) AS optionCount,
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

export async function voteCommunityChatPoll({
  user,
  messagePublicId,
  optionPublicIds,
  optionPublicId,
  env = process.env,
  db = pool,
}) {
  const normalizedMessagePublicId = normalizePublicId(messagePublicId, '消息标识');
  const normalizedOptionPublicIds = normalizeVoteOptionPublicIds({ optionPublicIds, optionPublicId });
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
    const { selectionMode, maxSelections } = interactivePollSelection(target);
    if (normalizedOptionPublicIds.length > maxSelections) {
      throw chatError(
        'POLL_SELECTION_LIMIT_EXCEEDED',
        400,
        `这项投票最多可选择 ${maxSelections} 项`,
        `This poll allows at most ${maxSelections} selections`,
      );
    }
    const optionPlaceholders = normalizedOptionPublicIds.map(() => '?').join(',');
    const [options] = await connection.query(
      `SELECT id, public_id AS publicId FROM community_chat_poll_options
        WHERE message_id = ? AND public_id IN (${optionPlaceholders})
        ORDER BY sort_order ASC, id ASC
        FOR UPDATE`,
      [target.internalId, ...normalizedOptionPublicIds],
    );
    if (options.length !== normalizedOptionPublicIds.length) {
      throw chatError('POLL_OPTION_UNAVAILABLE', 409, '这个投票选项已不可用', 'This poll option is unavailable');
    }
    if (selectionMode === COMMUNITY_CHAT_POLL_SELECTION_MODE_SINGLE) {
      await connection.query(
        `INSERT INTO community_chat_poll_votes (message_id, user_id, option_id)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE option_id = VALUES(option_id), update_time = CURRENT_TIMESTAMP`,
        [target.internalId, user.id, options[0].id],
      );
    } else {
      await connection.query(
        `DELETE FROM community_chat_poll_multi_votes
          WHERE message_id = ? AND user_id = ?`,
        [target.internalId, user.id],
      );
      const values = options.map(() => '(?, ?, ?)').join(',');
      await connection.query(
        `INSERT INTO community_chat_poll_multi_votes (message_id, user_id, option_id)
         VALUES ${values}`,
        options.flatMap((option) => [target.internalId, user.id, option.id]),
      );
    }
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
  normalizePollSelection,
  normalizeVoteOptionPublicIds,
  interactivePollSelection,
  assertRootPollVoterAccess,
  normalizePollVoterPagination,
};
