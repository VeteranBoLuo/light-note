import { randomBytes, randomUUID } from 'node:crypto';
import pool from '../../db/index.js';
import { COMMUNITY_CHAT_PRIMARY_ROOM_SLUG } from '../communityChatFeature.js';
import { MAX_LEVEL, levelForExp, rankOf } from '../growth.js';
import {
  CommunityChatError,
  assertCommunityChatMessagingAccess,
  assertCommunityChatReadAccess,
} from './communityChatAccessService.js';

export const COMMUNITY_CHAT_ID_PREFIX = 'ln_';
export const COMMUNITY_CHAT_ID_CODE_LENGTH = 6;
export const COMMUNITY_CHAT_ID_MAX_CODE_LENGTH = 8;
export const COMMUNITY_CHAT_ID_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

const MAX_ID_GENERATION_ATTEMPTS = 12;
const DEFAULT_SEARCH_LIMIT = 8;
const MAX_SEARCH_LIMIT = 10;
const MAX_SEARCH_QUERY_LENGTH = 32;
const RECENT_MESSAGE_CANDIDATE_LIMIT = 200;
const USER_PUBLIC_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const chatError = (code, status, zhMessage, enMessage) => new CommunityChatError(code, status, zhMessage, enMessage);

function queryFirst(db, sql, params = []) {
  return db.query(sql, params).then(([rows]) => rows[0] || null);
}

function publicIdentity(row) {
  if (!row) return null;
  return {
    userPublicId: String(row.userPublicId || ''),
    communityId: String(row.communityId || ''),
  };
}

function isDuplicateEntry(error) {
  return error?.code === 'ER_DUP_ENTRY' || Number(error?.errno) === 1062;
}

function randomCommunityCode(length = COMMUNITY_CHAT_ID_CODE_LENGTH) {
  const size = Math.min(
    COMMUNITY_CHAT_ID_MAX_CODE_LENGTH,
    Math.max(COMMUNITY_CHAT_ID_CODE_LENGTH, Number(length) || COMMUNITY_CHAT_ID_CODE_LENGTH),
  );
  const bytes = randomBytes(size);
  let code = '';
  for (let index = 0; index < size; index += 1) {
    code += COMMUNITY_CHAT_ID_ALPHABET[bytes[index] % COMMUNITY_CHAT_ID_ALPHABET.length];
  }
  return code;
}

export function generateCommunityId(length = COMMUNITY_CHAT_ID_CODE_LENGTH) {
  return `${COMMUNITY_CHAT_ID_PREFIX}${randomCommunityCode(length)}`;
}

export function normalizeCommunityChatUserPublicIds(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw chatError('INVALID_MENTION_TARGETS', 400, '提及对象无效', 'Invalid mention targets');
  }
  const normalized = [];
  const seen = new Set();
  for (const item of value) {
    const publicId = String(item || '')
      .trim()
      .toLowerCase();
    if (!USER_PUBLIC_ID_PATTERN.test(publicId)) {
      throw chatError('INVALID_MENTION_TARGETS', 400, '提及对象无效', 'Invalid mention targets');
    }
    if (seen.has(publicId)) continue;
    seen.add(publicId);
    normalized.push(publicId);
  }
  return normalized;
}

function normalizeSearchQuery(value) {
  const query = String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/^@/u, '')
    .trim();
  if (Array.from(query).length > MAX_SEARCH_QUERY_LENGTH) {
    throw chatError(
      'COMMUNITY_MEMBER_SEARCH_QUERY_TOO_LONG',
      400,
      `成员搜索不能超过 ${MAX_SEARCH_QUERY_LENGTH} 个字符`,
      `Member search must not exceed ${MAX_SEARCH_QUERY_LENGTH} characters`,
    );
  }
  return query;
}

function normalizeSearchLimit(value) {
  return Math.min(MAX_SEARCH_LIMIT, Math.max(1, Math.floor(Number(value) || DEFAULT_SEARCH_LIMIT)));
}

export async function getCommunityChatIdentityByUserId({ userId, db = pool, lock = false }) {
  const row = await queryFirst(
    db,
    `SELECT public_id AS userPublicId, community_id AS communityId
      FROM community_chat_user_identities
      WHERE user_id = ?
      LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [userId],
  );
  return publicIdentity(row);
}

/**
 * 社区 ID 是首次生成后永久稳定的公开身份。当前从 6 位去歧义码起步；唯一索引冲突时重试，
 * 未来若空间接近阈值可只把新生成长度提升到 7～8 位，不改任何既有 ID。
 */
export async function ensureCommunityChatIdentity({ userId, db = pool }) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) {
    throw chatError('COMMUNITY_IDENTITY_USER_REQUIRED', 400, '社区身份账号无效', 'Invalid community identity account');
  }

  const existing = await getCommunityChatIdentityByUserId({ userId: normalizedUserId, db });
  if (existing) return existing;

  for (let attempt = 0; attempt < MAX_ID_GENERATION_ATTEMPTS; attempt += 1) {
    const userPublicId = randomUUID();
    const communityId = generateCommunityId();
    try {
      await db.query(
        `INSERT INTO community_chat_user_identities (user_id, public_id, community_id)
         VALUES (?, ?, ?)`,
        [normalizedUserId, userPublicId, communityId],
      );
      return { userPublicId, communityId };
    } catch (error) {
      if (!isDuplicateEntry(error)) throw error;
      // 事务内用 current read，避免 REPEATABLE READ 快照看不到刚赢得唯一键竞争的并发记录。
      const concurrent = await getCommunityChatIdentityByUserId({ userId: normalizedUserId, db, lock: true });
      if (concurrent) return concurrent;
    }
  }

  throw chatError(
    'COMMUNITY_ID_GENERATION_UNAVAILABLE',
    503,
    '社区 ID 暂时无法生成，请稍后重试',
    'A community ID could not be generated. Try again later.',
  );
}

export async function ensureCommunityChatIdentityForUser({ user, env = process.env, db = pool }) {
  await assertCommunityChatMessagingAccess({ user, env, db });
  return ensureCommunityChatIdentity({ userId: user.id, db });
}

function publicMember(row) {
  const level = row.accountRole === 'root' ? MAX_LEVEL : levelForExp(Number(row.exp || 0));
  const userPublicId = String(row.userPublicId || '');
  return {
    userPublicId,
    displayName: String(row.displayName || ''),
    communityId: String(row.communityId || ''),
    avatar: Number(row.hasAvatar || 0) ? `/api/community-chat/members/${encodeURIComponent(userPublicId)}/avatar` : '',
    frameId: row.frameId || null,
    level,
    levelName: rankOf(level).name,
    role:
      row.accountRole === 'root'
        ? 'official'
        : row.memberRole === 'moderator' && row.memberStatus === 'active'
          ? 'moderator'
          : 'member',
    reason: row.accountRole === 'root' ? 'official' : Number(row.hasRecentMessage || 0) ? 'recent' : 'member',
  };
}

export async function searchCommunityChatMembers({ user, roomSlug, query, limit, env = process.env, db = pool }) {
  const normalizedRoomSlug = String(roomSlug || '').trim();
  if (normalizedRoomSlug !== COMMUNITY_CHAT_PRIMARY_ROOM_SLUG) {
    throw chatError('COMMUNITY_CHAT_ROOM_NOT_FOUND', 404, '聊天室不存在或已归档', 'Room not found or archived');
  }
  const normalizedQuery = normalizeSearchQuery(query);
  const pageSize = normalizeSearchLimit(limit);
  const { feature } = await assertCommunityChatMessagingAccess({ user, env, db });

  const inviteAccessClause =
    feature.accessMode === 'invite_only'
      ? `AND (
           account.role = 'root'
           OR (
             membership.status = 'active'
             AND membership.rules_version = ?
           )
         )`
      : `AND COALESCE(membership.status, '') <> 'banned'`;
  const inviteAccessParams = feature.accessMode === 'invite_only' ? [feature.rulesVersion] : [];
  const queryClause = normalizedQuery
    ? `AND (
         LOCATE(LOWER(?), LOWER(COALESCE(NULLIF(account.alias, ''), ''))) > 0
         OR LOCATE(LOWER(?), LOWER(identity.community_id)) > 0
       )`
    : '';
  const queryParams = normalizedQuery ? [normalizedQuery, normalizedQuery] : [];

  const [rows] = await db.query(
    `SELECT identity.public_id AS userPublicId, identity.community_id AS communityId,
            COALESCE(NULLIF(account.alias, ''), '轻笺用户') AS displayName,
            account.role AS accountRole,
            membership.role AS memberRole, membership.status AS memberStatus,
            COALESCE(growth.exp, 0) AS exp, growth.equipped_frame AS frameId,
            CASE
              WHEN account.head_picture LIKE 'https://%'
                OR account.head_picture LIKE 'http://%'
                OR (
                  account.head_picture LIKE 'data:image/%;base64,%'
                  AND OCTET_LENGTH(account.head_picture) <= 524288
                )
              THEN 1 ELSE 0
            END AS hasAvatar,
            CASE WHEN recent.user_id IS NULL THEN 0 ELSE 1 END AS hasRecentMessage,
            COALESCE(recent.last_message_id, 0) AS lastMessageId
       FROM community_chat_user_identities identity
       JOIN user account ON account.id = identity.user_id
                        AND account.del_flag = 0
                        AND account.role <> 'visitor'
       LEFT JOIN community_chat_members membership ON membership.user_id = account.id
       LEFT JOIN user_growth growth ON growth.user_id = account.id
       LEFT JOIN (
         SELECT recent_candidates.user_id, MAX(recent_candidates.id) AS last_message_id
           FROM (
             SELECT message.user_id, message.id
               FROM community_chat_messages message
               JOIN community_chat_rooms recent_room ON recent_room.id = message.room_id
              WHERE recent_room.slug = ?
                AND message.status = 'active'
              ORDER BY message.id DESC
              LIMIT ${RECENT_MESSAGE_CANDIDATE_LIMIT}
           ) recent_candidates
          GROUP BY recent_candidates.user_id
       ) recent ON recent.user_id = account.id
      WHERE identity.user_id <> ?
        ${inviteAccessClause}
        AND NOT EXISTS (
          SELECT 1
            FROM community_chat_blocks blocked
           WHERE (blocked.user_id = ? AND blocked.blocked_user_id = identity.user_id)
              OR (blocked.user_id = identity.user_id AND blocked.blocked_user_id = ?)
        )
        ${queryClause}
      ORDER BY
        CASE WHEN account.role = 'root' THEN 0 ELSE 1 END ASC,
        CASE
          WHEN ? <> '' AND LOWER(identity.community_id) = LOWER(?) THEN 0
          WHEN ? <> '' AND LOWER(COALESCE(NULLIF(account.alias, ''), '')) = LOWER(?) THEN 1
          WHEN ? <> '' AND LOWER(identity.community_id) LIKE CONCAT(LOWER(?), '%') THEN 2
          WHEN ? <> '' AND LOWER(COALESCE(NULLIF(account.alias, ''), '')) LIKE CONCAT(LOWER(?), '%') THEN 3
          ELSE 4
        END ASC,
        lastMessageId DESC,
        identity.community_id ASC
      LIMIT ?`,
    [
      normalizedRoomSlug,
      user.id,
      ...inviteAccessParams,
      user.id,
      user.id,
      ...queryParams,
      normalizedQuery,
      normalizedQuery,
      normalizedQuery,
      normalizedQuery,
      normalizedQuery,
      normalizedQuery,
      normalizedQuery,
      normalizedQuery,
      pageSize,
    ],
  );

  return {
    items: rows.map(publicMember).filter((item) => item.userPublicId && item.communityId),
  };
}

export async function getCommunityChatMemberAvatarSource({ user, userPublicId, env = process.env, db = pool }) {
  const normalizedPublicId = normalizeCommunityChatUserPublicIds([userPublicId])[0];
  await assertCommunityChatReadAccess({ user, env, db });
  const viewerUserId = user?.id && user?.role !== 'visitor' ? user.id : '';
  const row = await queryFirst(
    db,
    `SELECT account.head_picture AS source
       FROM community_chat_user_identities identity
       JOIN user account ON account.id = identity.user_id AND account.del_flag = 0
       LEFT JOIN community_chat_members membership ON membership.user_id = account.id
      WHERE identity.public_id = ?
        AND COALESCE(membership.status, '') <> 'banned'
        AND (
          ? = ''
          OR NOT EXISTS (
            SELECT 1
              FROM community_chat_blocks blocked
             WHERE (blocked.user_id = ? AND blocked.blocked_user_id = identity.user_id)
                OR (blocked.user_id = identity.user_id AND blocked.blocked_user_id = ?)
          )
        )
      LIMIT 1`,
    [normalizedPublicId, viewerUserId, viewerUserId, viewerUserId],
  );
  const source = String(row?.source || '');
  if (
    !source ||
    (!/^https?:\/\//i.test(source) && !/^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(source))
  ) {
    throw chatError('COMMUNITY_CHAT_MEMBER_AVATAR_NOT_FOUND', 404, '头像当前不可用', 'Avatar is unavailable');
  }
  return { source };
}

export const __test__ = {
  normalizeSearchQuery,
  normalizeSearchLimit,
  publicIdentity,
  randomCommunityCode,
};
