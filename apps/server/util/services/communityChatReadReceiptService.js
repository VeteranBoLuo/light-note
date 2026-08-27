import pool from '../../db/index.js';
import { COMMUNITY_CHAT_PRIMARY_ROOM_SLUG } from '../communityChatFeature.js';
import { CommunityChatError, assertCommunityChatMessagingAccess } from './communityChatAccessService.js';

export const COMMUNITY_CHAT_READ_RECEIPT_BATCH_MAX = 30;

const PUBLIC_ID_PATTERN = /^[A-Za-z0-9-]{1,36}$/;
const chatError = (code, status, zhMessage, enMessage) => new CommunityChatError(code, status, zhMessage, enMessage);

function normalizeRoomSlug(value) {
  const roomSlug = String(value || '').trim();
  if (roomSlug !== COMMUNITY_CHAT_PRIMARY_ROOM_SLUG) {
    throw chatError('COMMUNITY_CHAT_ROOM_NOT_FOUND', 404, '聊天室不存在或已归档', 'Room not found or archived');
  }
  return roomSlug;
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

export const __test__ = { normalizeRoomSlug };
