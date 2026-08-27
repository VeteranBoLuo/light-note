import pool from '../../db/index.js';
import { COMMUNITY_CHAT_PRIMARY_ROOM_SLUG } from '../communityChatFeature.js';
import {
  CommunityChatError,
  assertCommunityChatMessagingAccess,
  assertCommunityChatReadAccess,
} from './communityChatAccessService.js';

export const COMMUNITY_CHAT_READ_RECEIPT_BATCH_MAX = 30;
export const COMMUNITY_CHAT_READ_RECEIPT_COUNT_BATCH_MAX = 100;
export const COMMUNITY_CHAT_READ_RECEIPT_READER_PAGE_SIZE = 50;
export const COMMUNITY_CHAT_READ_RECEIPT_READER_PAGE_MAX = 100;

const PUBLIC_ID_PATTERN = /^[A-Za-z0-9-]{1,36}$/;
const chatError = (code, status, zhMessage, enMessage) => new CommunityChatError(code, status, zhMessage, enMessage);

function normalizeRoomSlug(value) {
  const roomSlug = String(value || '').trim();
  if (roomSlug !== COMMUNITY_CHAT_PRIMARY_ROOM_SLUG) {
    throw chatError('COMMUNITY_CHAT_ROOM_NOT_FOUND', 404, '聊天室不存在或已归档', 'Room not found or archived');
  }
  return roomSlug;
}

function normalizeReaderPagination(page, pageSize) {
  const normalizedPage = Math.min(10_000, Math.max(1, Math.floor(Number(page) || 1)));
  const normalizedPageSize = Math.min(
    COMMUNITY_CHAT_READ_RECEIPT_READER_PAGE_MAX,
    Math.max(1, Math.floor(Number(pageSize) || COMMUNITY_CHAT_READ_RECEIPT_READER_PAGE_SIZE)),
  );
  return {
    page: normalizedPage,
    pageSize: normalizedPageSize,
    offset: (normalizedPage - 1) * normalizedPageSize,
  };
}

function assertRootReaderAccess(user) {
  if (user?.id && user.role === 'root') return;
  throw chatError(
    'COMMUNITY_CHAT_READ_RECEIPT_READERS_ROOT_REQUIRED',
    403,
    '只有 Root 可以查看已读成员',
    'Only Root can view read-receipt members',
  );
}

export function normalizeReadReceiptCountMessagePublicIds(value) {
  if (!Array.isArray(value) || !value.length) {
    throw chatError(
      'INVALID_READ_RECEIPT_COUNT_MESSAGES',
      400,
      '已读数量消息列表不能为空',
      'The read-count message list cannot be empty',
    );
  }
  const normalized = [...new Set(value.map((item) => String(item || '').trim()))];
  if (
    normalized.length > COMMUNITY_CHAT_READ_RECEIPT_COUNT_BATCH_MAX ||
    normalized.some((publicId) => !PUBLIC_ID_PATTERN.test(publicId))
  ) {
    throw chatError(
      'INVALID_READ_RECEIPT_COUNT_MESSAGES',
      400,
      `每次最多查询 ${COMMUNITY_CHAT_READ_RECEIPT_COUNT_BATCH_MAX} 条有效消息的已读数量`,
      `At most ${COMMUNITY_CHAT_READ_RECEIPT_COUNT_BATCH_MAX} valid message read counts can be queried at once`,
    );
  }
  return normalized;
}

export function normalizeReadReceiptMessagePublicIds(value) {
  if (!Array.isArray(value)) {
    throw chatError('INVALID_READ_RECEIPTS', 400, '已读消息列表无效', 'Invalid read-receipt message list');
  }
  if (!value.length) {
    throw chatError(
      'INVALID_READ_RECEIPTS',
      400,
      '已读消息列表不能为空',
      'The read-receipt message list cannot be empty',
    );
  }
  if (value.length > COMMUNITY_CHAT_READ_RECEIPT_BATCH_MAX) {
    throw chatError(
      'TOO_MANY_READ_RECEIPTS',
      400,
      `每次最多提交 ${COMMUNITY_CHAT_READ_RECEIPT_BATCH_MAX} 条已读回执`,
      `At most ${COMMUNITY_CHAT_READ_RECEIPT_BATCH_MAX} read receipts can be submitted at once`,
    );
  }
  const normalized = value.map((item) => String(item || '').trim());
  if (normalized.some((publicId) => !PUBLIC_ID_PATTERN.test(publicId))) {
    throw chatError('INVALID_READ_RECEIPTS', 400, '已读消息列表无效', 'Invalid read-receipt message list');
  }
  return [...new Set(normalized)];
}

export async function loadCommunityChatReadCounts(db, rows, { viewerIsRoot = false } = {}) {
  const messageIds = [
    ...new Set(
      rows
        .filter(
          (row) =>
            viewerIsRoot &&
            row.status === 'active' &&
            row.authorAccountRole === 'root' &&
            Boolean(Number(row.readReceiptEnabled || 0)),
        )
        .map((row) => Number(row.internalId))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
  const byMessageId = new Map();
  if (!messageIds.length) return byMessageId;
  const placeholders = messageIds.map(() => '?').join(',');
  const [countRows] = await db.query(
    `SELECT message_id AS messageId, COUNT(*) AS readCount
       FROM community_chat_message_read_receipts
      WHERE message_id IN (${placeholders})
      GROUP BY message_id`,
    messageIds,
  );
  for (const row of countRows) byMessageId.set(Number(row.messageId), Number(row.readCount || 0));
  for (const messageId of messageIds) if (!byMessageId.has(messageId)) byMessageId.set(messageId, 0);
  return byMessageId;
}

/**
 * Root 前台停留时使用轻量批量读模型校准当前窗口的聚合数；不加载消息正文或成员身份，
 * 也不把每条成员回执放大成 WebSocket 广播。
 */
export async function listCommunityChatReadReceiptCounts({
  user,
  roomSlug,
  messagePublicIds,
  env = process.env,
  db = pool,
}) {
  assertRootReaderAccess(user);
  const normalizedRoomSlug = normalizeRoomSlug(roomSlug);
  const normalizedPublicIds = normalizeReadReceiptCountMessagePublicIds(messagePublicIds);
  await assertCommunityChatReadAccess({ user, env, db });

  const placeholders = normalizedPublicIds.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT message.public_id AS messagePublicId,
            COUNT(receipt.user_id) AS readCount
       FROM community_chat_messages message
       JOIN community_chat_rooms room ON room.id = message.room_id
       JOIN user author ON author.id = message.user_id AND author.role = 'root' AND author.del_flag = 0
       LEFT JOIN community_chat_message_read_receipts receipt ON receipt.message_id = message.id
      WHERE room.slug = ?
        AND room.status = 'active'
        AND message.public_id IN (${placeholders})
        AND message.status = 'active'
        AND message.read_receipt_enabled = 1
        AND NOT EXISTS (
          SELECT 1 FROM community_chat_message_deletions deletion
           WHERE deletion.user_id = ? AND deletion.message_id = message.id
        )
      GROUP BY message.id, message.public_id
      ORDER BY message.id ASC`,
    [normalizedRoomSlug, ...normalizedPublicIds, user.id],
  );
  return {
    roomSlug: normalizedRoomSlug,
    items: rows.map((row) => ({
      messagePublicId: String(row.messagePublicId || ''),
      readCount: Math.max(0, Number(row.readCount || 0)),
    })),
  };
}

/**
 * 已读身份只在 Root 主动打开单条消息明细时按需读取。普通消息列表继续只返回聚合数量，
 * 避免把成员身份随每一页历史消息重复下发，也让普通成员永远无法从响应中推断名单。
 */
export async function listCommunityChatReadReceiptReaders({
  user,
  messagePublicId,
  page,
  pageSize,
  env = process.env,
  db = pool,
}) {
  assertRootReaderAccess(user);
  const normalizedMessagePublicId = String(messagePublicId || '').trim();
  if (!PUBLIC_ID_PATTERN.test(normalizedMessagePublicId)) {
    throw chatError('INVALID_MESSAGE_ID', 400, '消息标识无效', 'Invalid message identifier');
  }
  const pagination = normalizeReaderPagination(page, pageSize);
  await assertCommunityChatReadAccess({ user, env, db });

  const [messageRows] = await db.query(
    `SELECT message.id AS internalId,
            (SELECT COUNT(*)
               FROM community_chat_message_read_receipts receipt
              WHERE receipt.message_id = message.id) AS readCount
       FROM community_chat_messages message
       JOIN community_chat_rooms room ON room.id = message.room_id
       JOIN user author ON author.id = message.user_id AND author.role = 'root' AND author.del_flag = 0
      WHERE message.public_id = ?
        AND message.status = 'active'
        AND message.read_receipt_enabled = 1
        AND room.slug = ?
        AND room.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM community_chat_message_deletions deletion
           WHERE deletion.user_id = ? AND deletion.message_id = message.id
        )
      LIMIT 1`,
    [normalizedMessagePublicId, COMMUNITY_CHAT_PRIMARY_ROOM_SLUG, user.id],
  );
  const target = messageRows[0];
  if (!target) {
    throw chatError(
      'COMMUNITY_CHAT_READ_RECEIPT_MESSAGE_NOT_FOUND',
      404,
      '这条发言不存在或不再提供已读明细',
      'This message is unavailable or no longer exposes read receipts',
    );
  }

  const [readerRows] = await db.query(
    `SELECT identity.public_id AS userPublicId,
            identity.community_id AS communityId,
            COALESCE(NULLIF(reader.alias, ''), '轻笺用户') AS displayName,
            receipt.first_seen_at AS firstSeenAt,
            growth.equipped_frame AS frameId,
            CASE
              WHEN COALESCE(membership.status, '') <> 'banned'
               AND (
                 reader.head_picture LIKE 'https://%'
                 OR reader.head_picture LIKE 'http://%'
                 OR (
                   reader.head_picture LIKE 'data:image/%;base64,%'
                   AND OCTET_LENGTH(reader.head_picture) <= 524288
                 )
               )
              THEN 1 ELSE 0
            END AS hasAvatar
       FROM community_chat_message_read_receipts receipt
       JOIN user reader ON reader.id = receipt.user_id
                       AND reader.del_flag = 0
                       AND reader.role <> 'deleted'
       LEFT JOIN community_chat_user_identities identity ON identity.user_id = reader.id
       LEFT JOIN community_chat_members membership ON membership.user_id = reader.id
       LEFT JOIN user_growth growth ON growth.user_id = reader.id
      WHERE receipt.message_id = ?
      ORDER BY receipt.first_seen_at ASC, receipt.user_id ASC
      LIMIT ? OFFSET ?`,
    [target.internalId, pagination.pageSize, pagination.offset],
  );
  const items = readerRows.map((row) => {
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
      firstSeenAt: row.firstSeenAt,
    };
  });
  const total = Math.max(Number(target.readCount || 0), pagination.offset + items.length);
  return {
    messagePublicId: normalizedMessagePublicId,
    items,
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
    hasMore: pagination.offset + items.length < total,
  };
}

export async function recordCommunityChatReadReceipts({
  user,
  roomSlug,
  messagePublicIds,
  env = process.env,
  db = pool,
}) {
  const normalizedRoomSlug = normalizeRoomSlug(roomSlug);
  const normalizedPublicIds = normalizeReadReceiptMessagePublicIds(messagePublicIds);

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { feature } = await assertCommunityChatMessagingAccess({ user, env, db: connection });
    if (!feature.readReceiptsEnabled) {
      throw chatError(
        'COMMUNITY_CHAT_READ_RECEIPTS_DISABLED',
        403,
        '发言已读功能当前未开放',
        'Message read receipts are currently disabled',
      );
    }
    const placeholders = normalizedPublicIds.map(() => '?').join(',');
    const [eligibleRows] = await connection.query(
      `SELECT message.id, message.public_id AS publicId
         FROM community_chat_messages message
         JOIN community_chat_rooms room ON room.id = message.room_id
         JOIN user author ON author.id = message.user_id AND author.role = 'root' AND author.del_flag = 0
         JOIN user reader ON reader.id = ? AND reader.role <> 'deleted' AND reader.del_flag = 0
        WHERE room.slug = ?
          AND room.status = 'active'
          AND message.public_id IN (${placeholders})
          AND message.status = 'active'
          AND message.read_receipt_enabled = 1
          AND message.user_id <> ?
          AND NOT EXISTS (
            SELECT 1 FROM community_chat_message_deletions deletion
             WHERE deletion.user_id = ? AND deletion.message_id = message.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM community_chat_blocks blocked
             WHERE blocked.user_id = ? AND blocked.blocked_user_id = message.user_id
          )
        ORDER BY message.id ASC
        LOCK IN SHARE MODE`,
      [user.id, normalizedRoomSlug, ...normalizedPublicIds, user.id, user.id, user.id],
    );
    let recorded = 0;
    if (eligibleRows.length) {
      const values = eligibleRows.map(() => '(?, ?)').join(',');
      const [result] = await connection.query(
        `INSERT IGNORE INTO community_chat_message_read_receipts (message_id, user_id)
         VALUES ${values}`,
        eligibleRows.flatMap((row) => [row.id, user.id]),
      );
      recorded = Number(result?.affectedRows || 0);
    }
    await connection.commit();
    return {
      roomSlug: normalizedRoomSlug,
      acceptedMessagePublicIds: eligibleRows.map((row) => row.publicId),
      recorded,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export const __test__ = { assertRootReaderAccess, normalizeReaderPagination, normalizeRoomSlug };
