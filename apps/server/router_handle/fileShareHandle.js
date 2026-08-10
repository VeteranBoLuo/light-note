import { resolveFilePreviewFormat } from '@lightnote/shared';
import pool from '../db/index.js';
import { L, generateUUID, resultData } from '../util/common.js';
import { buildObjectKey, createDownloadSignedUrl } from '../util/obsClient.js';
import { getFileExtension, resolveFileCategory } from '../util/fileCategory.js';
import {
  FILE_SHARE_EVENT_RETENTION_DAYS,
  createShareToken,
  getFileShareState,
  hashShareAccessCode,
  hashShareToken,
  hashShareVisitorIp,
  normalizeFileShareInput,
  verifyShareAccessCode,
} from '../util/fileSharePolicy.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';
import { listArchivePreview, prepareFilePreview, resolveFilePreview } from '../util/filePreview/service.js';
import { issueFilePreviewShareTicket, readFilePreviewShareTicket } from '../util/filePreview/shareTicket.js';
import { sendPreviewError } from './filePreviewHandle.js';

const SHARE_SELECT = `
  SELECT
    s.*,
    f.create_by AS file_owner_id,
    f.file_name,
    f.file_type,
    f.file_size,
    f.obs_key,
    f.directory,
    f.create_time AS file_create_time,
    f.del_flag AS file_del_flag,
    u.alias AS creator_name
  FROM file_shares s
  INNER JOIN files f ON f.id = s.file_id
  LEFT JOIN user u ON u.id = f.create_by
`;

function publicError(req, res, status, code, zh, en) {
  return res.send(resultData({ errorCode: code }, status, L(req, zh, en)));
}

function getClientIp(req) {
  return String(req.ip || req.socket?.remoteAddress || '').slice(0, 128);
}

async function appendShareEvent(db, req, shareId, eventType, outcome) {
  await db.query(
    `INSERT INTO file_share_events (share_id, event_type, outcome, visitor_hash)
     VALUES (?, ?, ?, ?)`,
    [shareId, eventType, outcome, hashShareVisitorIp(getClientIp(req), shareId)],
  );
}

async function cleanupOldShareEvents() {
  try {
    await pool.query(
      `DELETE FROM file_share_events
       WHERE create_time < DATE_SUB(NOW(), INTERVAL ${FILE_SHARE_EVENT_RETENTION_DAYS} DAY)
       LIMIT 1000`,
    );
  } catch (error) {
    console.warn('[file-share] retention cleanup failed code=%s', stableAgentErrorCode(error));
  }
}

function mapOwnerShare(row) {
  return {
    id: row.id,
    fileId: row.file_id,
    fileName: row.file_name,
    tokenHint: row.token_hint,
    description: row.description || '',
    requiresCode: Boolean(row.access_code_hash),
    expiresAt: row.expires_at,
    maxAccessCount: row.max_access_count,
    maxDownloadCount: row.max_download_count,
    accessCount: Number(row.access_count || 0),
    downloadCount: Number(row.download_count || 0),
    lastAccessAt: row.last_access_at,
    lastDownloadAt: row.last_download_at,
    revokedAt: row.revoked_at,
    createTime: row.create_time,
    state: getFileShareState(row),
  };
}

function mapPublicFile(row) {
  return {
    id: String(row.id),
    fileName: row.file_name,
    fileType: row.file_type,
    fileSize: Number(row.file_size || 0),
    createTime: row.file_create_time,
    creatorName: row.creator_name || '',
    description: row.description || '',
    expiresAt: row.expires_at,
    category: resolveFileCategory({ fileName: row.file_name, fileType: row.file_type }),
    ext: getFileExtension(row.file_name),
    requiresCode: Boolean(row.access_code_hash),
    accessCount: Number(row.access_count || 0),
    downloadCount: Number(row.download_count || 0),
    maxAccessCount: row.max_access_count,
    maxDownloadCount: row.max_download_count,
  };
}

function shareInputError(req, res, error) {
  const code = String(error?.code || '');
  const messages = {
    SHARE_EXPIRY_INVALID: ['分享有效期无效', 'The share expiry is invalid'],
    SHARE_DESCRIPTION_TOO_LONG: ['分享说明不能超过 200 个字符', 'The share description is too long'],
    SHARE_ACCESS_CODE_INVALID: [
      '提取码需为 4～12 位字母或数字',
      'The access code must contain 4–12 letters or digits',
    ],
    SHARE_ACCESS_LIMIT_INVALID: ['访问次数限制需为 1～10000', 'The access limit must be between 1 and 10000'],
    SHARE_DOWNLOAD_LIMIT_INVALID: ['下载次数限制需为 1～10000', 'The download limit must be between 1 and 10000'],
  };
  const pair = messages[code];
  if (!pair) return false;
  res.send(resultData({ errorCode: code }, 400, L(req, pair[0], pair[1])));
  return true;
}

async function insertShare(connection, { fileId, ownerUserId, input }) {
  const token = createShareToken();
  const shareId = generateUUID();
  await connection.query(
    `INSERT INTO file_shares
       (id, file_id, owner_user_id, token_hash, token_hint, description, access_code_hash,
        expires_at, max_access_count, max_download_count, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY), ?, ?, 'active')`,
    [
      shareId,
      fileId,
      ownerUserId,
      hashShareToken(token),
      token.slice(-8),
      input.description,
      hashShareAccessCode(input.accessCode),
      input.expiresInDays,
      input.maxAccessCount,
      input.maxDownloadCount,
    ],
  );
  return { shareId, token };
}

export async function createFileShare(req, res) {
  const connection = await pool.getConnection();
  try {
    const input = normalizeFileShareInput(req.body || {});
    const fileId = Number(req.body?.fileId);
    if (!Number.isInteger(fileId) || fileId < 1) {
      return res.send(resultData(null, 400, L(req, '文件 ID 无效', 'The file ID is invalid')));
    }
    await connection.beginTransaction();
    const [files] = await connection.query(
      'SELECT id FROM files WHERE id = ? AND create_by = ? AND del_flag = 0 FOR UPDATE',
      [fileId, req.user.id],
    );
    if (!files.length) {
      await connection.rollback();
      return res.send(resultData(null, 404, L(req, '文件不存在或无权限', 'The file was not found')));
    }
    const created = await insertShare(connection, { fileId, ownerUserId: req.user.id, input });
    await appendShareEvent(connection, req, created.shareId, 'created', 'succeeded');
    await connection.commit();
    void cleanupOldShareEvents();
    return res.send(
      resultData({
        id: created.shareId,
        token: created.token,
        expiresInDays: input.expiresInDays,
      }),
    );
  } catch (error) {
    await connection.rollback();
    if (shareInputError(req, res, error)) return;
    console.error('[file-share] create failed code=%s', stableAgentErrorCode(error));
    return res.send(resultData(null, 500, L(req, '创建分享失败，请稍后重试', 'Could not create the share')));
  } finally {
    connection.release();
  }
}

export async function listFileShares(req, res) {
  try {
    const params = [req.user.id];
    let where = 's.owner_user_id = ?';
    const fileId = Number(req.body?.fileId);
    if (Number.isInteger(fileId) && fileId > 0) {
      where += ' AND s.file_id = ?';
      params.push(fileId);
    }
    const [rows] = await pool.query(
      `${SHARE_SELECT}
       WHERE ${where}
       ORDER BY s.create_time DESC
       LIMIT 200`,
      params,
    );
    void cleanupOldShareEvents();
    return res.send(resultData(rows.map(mapOwnerShare)));
  } catch (error) {
    console.error('[file-share] list failed code=%s', stableAgentErrorCode(error));
    return res.send(resultData(null, 500, L(req, '获取分享记录失败', 'Could not load file shares')));
  }
}

export async function revokeFileShare(req, res) {
  try {
    const [result] = await pool.query(
      `UPDATE file_shares
       SET status = 'revoked', revoked_at = COALESCE(revoked_at, NOW()), update_time = NOW()
       WHERE id = ? AND owner_user_id = ? AND status = 'active'`,
      [String(req.body?.shareId || ''), req.user.id],
    );
    if (!result.affectedRows) {
      return res.send(resultData(null, 404, L(req, '分享不存在或已经失效', 'The share is already unavailable')));
    }
    return res.send(resultData({ revoked: true }));
  } catch (error) {
    console.error('[file-share] revoke failed code=%s', stableAgentErrorCode(error));
    return res.send(resultData(null, 500, L(req, '撤销分享失败', 'Could not revoke the share')));
  }
}

export async function rotateFileShare(req, res) {
  const connection = await pool.getConnection();
  try {
    const input = normalizeFileShareInput(req.body || {});
    const shareId = String(req.body?.shareId || '');
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `${SHARE_SELECT}
       WHERE s.id = ? AND s.owner_user_id = ?
       FOR UPDATE`,
      [shareId, req.user.id],
    );
    if (!rows.length || Number(rows[0].file_del_flag) !== 0) {
      await connection.rollback();
      return res.send(resultData(null, 404, L(req, '分享或文件不存在', 'The share or file was not found')));
    }
    await connection.query(
      `UPDATE file_shares
       SET status = 'revoked', revoked_at = COALESCE(revoked_at, NOW()), update_time = NOW()
       WHERE id = ?`,
      [shareId],
    );
    const created = await insertShare(connection, {
      fileId: rows[0].file_id,
      ownerUserId: req.user.id,
      input,
    });
    await appendShareEvent(connection, req, shareId, 'rotated', 'succeeded');
    await connection.commit();
    return res.send(resultData({ id: created.shareId, token: created.token, replacedShareId: shareId }));
  } catch (error) {
    await connection.rollback();
    if (shareInputError(req, res, error)) return;
    console.error('[file-share] rotate failed code=%s', stableAgentErrorCode(error));
    return res.send(resultData(null, 500, L(req, '轮换分享链接失败', 'Could not rotate the share link')));
  } finally {
    connection.release();
  }
}

async function authorizePublicShare(req, res, { eventType, countColumn, previewOnly = false }) {
  const token = String(req.body?.token || '').trim();
  if (token.length < 32 || token.length > 128) {
    publicError(req, res, 404, 'SHARE_NOT_FOUND', '分享链接无效', 'The share link is invalid');
    return null;
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `${SHARE_SELECT}
       WHERE s.token_hash = ?
       LIMIT 1
       FOR UPDATE`,
      [hashShareToken(token)],
    );
    if (!rows.length) {
      await connection.rollback();
      publicError(req, res, 404, 'SHARE_NOT_FOUND', '分享链接不存在或已失效', 'The share is unavailable');
      return null;
    }
    const row = rows[0];
    const state = getFileShareState(row, Date.now(), countColumn === 'access_count' ? 'access' : 'download');
    if (state !== 'active') {
      await appendShareEvent(connection, req, row.id, eventType, state);
      await connection.commit();
      const stateMessage = {
        revoked: ['分享已被撤销', 'The share was revoked'],
        expired: ['分享已过期', 'The share expired'],
        file_unavailable: ['分享的文件已不可用', 'The shared file is unavailable'],
        access_limit_reached: ['分享访问次数已用完', 'The share access limit was reached'],
        download_limit_reached: ['分享下载次数已用完', 'The share download limit was reached'],
      }[state] || ['分享链接不可用', 'The share is unavailable'];
      publicError(req, res, 410, `SHARE_${state.toUpperCase()}`, stateMessage[0], stateMessage[1]);
      return null;
    }
    if (row.access_code_hash && !String(req.body?.accessCode || '').trim()) {
      await appendShareEvent(connection, req, row.id, eventType, 'code_required');
      await connection.commit();
      publicError(req, res, 403, 'SHARE_CODE_REQUIRED', '请输入提取码', 'Enter the access code');
      return null;
    }
    if (!verifyShareAccessCode(req.body?.accessCode, row.access_code_hash)) {
      await appendShareEvent(connection, req, row.id, eventType, 'code_invalid');
      await connection.commit();
      publicError(req, res, 403, 'SHARE_CODE_INVALID', '提取码错误', 'The access code is incorrect');
      return null;
    }
    if (previewOnly && !resolveFilePreviewFormat({ fileName: row.file_name, fileType: row.file_type })) {
      await appendShareEvent(connection, req, row.id, eventType, 'preview_unsupported');
      await connection.commit();
      publicError(
        req,
        res,
        415,
        'FILE_PREVIEW_UNSUPPORTED',
        '此文件格式暂不支持在线预览',
        'This file format cannot be previewed online',
      );
      return null;
    }
    await connection.query(
      `UPDATE file_shares
       SET ${countColumn} = ${countColumn} + 1,
           ${countColumn === 'access_count' ? 'last_access_at' : 'last_download_at'} = NOW(),
           update_time = NOW()
       WHERE id = ?`,
      [row.id],
    );
    await appendShareEvent(connection, req, row.id, eventType, 'succeeded');
    await connection.commit();
    row[countColumn] = Number(row[countColumn] || 0) + 1;
    return row;
  } catch (error) {
    await connection.rollback();
    console.error('[file-share] public authorization failed code=%s', stableAgentErrorCode(error));
    publicError(req, res, 500, 'SHARE_SERVICE_UNAVAILABLE', '分享服务暂时不可用', 'The share service is unavailable');
    return null;
  } finally {
    connection.release();
  }
}

async function authorizePreviewTicket(req, res) {
  let ticket;
  try {
    ticket = await readFilePreviewShareTicket(req.body?.previewTicket);
  } catch (error) {
    console.error('[file-share] preview ticket read failed code=%s', stableAgentErrorCode(error));
    publicError(
      req,
      res,
      503,
      'SHARE_PREVIEW_TICKET_UNAVAILABLE',
      '预览会话暂时不可用',
      'The preview session is unavailable',
    );
    return null;
  }
  if (!ticket) {
    publicError(
      req,
      res,
      403,
      'SHARE_PREVIEW_TICKET_INVALID',
      '预览会话已过期，请重新打开',
      'The preview session expired',
    );
    return null;
  }
  try {
    const [rows] = await pool.query(
      `${SHARE_SELECT}
       WHERE s.id = ? AND s.file_id = ? AND s.owner_user_id = ?
       LIMIT 1`,
      [ticket.shareId, ticket.fileId, ticket.ownerUserId],
    );
    const row = rows[0];
    const state = getFileShareState(row, Date.now(), 'session');
    if (state !== 'active') {
      publicError(req, res, 410, `SHARE_${state.toUpperCase()}`, '分享已失效', 'The share is unavailable');
      return null;
    }
    return row;
  } catch (error) {
    console.error('[file-share] preview ticket authorization failed code=%s', stableAgentErrorCode(error));
    publicError(req, res, 503, 'SHARE_SERVICE_UNAVAILABLE', '分享服务暂时不可用', 'The share service is unavailable');
    return null;
  }
}

export async function resolveFileShare(req, res) {
  const row = await authorizePublicShare(req, res, {
    eventType: 'viewed',
    countColumn: 'access_count',
  });
  if (!row) return;
  return res.send(resultData(mapPublicFile(row)));
}

export async function downloadFileShare(req, res) {
  const row = await authorizePublicShare(req, res, {
    eventType: 'downloaded',
    countColumn: 'download_count',
  });
  if (!row) return;
  const objectKey = row.obs_key || buildObjectKey(row.file_owner_id, row.file_name);
  const { url, expiresIn } = createDownloadSignedUrl({ objectKey, expires: 600 });
  if (!url) {
    return publicError(
      req,
      res,
      500,
      'SHARE_DOWNLOAD_URL_FAILED',
      '获取下载链接失败',
      'Could not create a download link',
    );
  }
  return res.send(resultData({ downloadUrl: url, fileName: row.file_name, expiresIn }));
}

export async function prepareFileSharePreview(req, res) {
  const row = await authorizePublicShare(req, res, {
    eventType: 'downloaded',
    countColumn: 'download_count',
    previewOnly: true,
  });
  if (!row) return;
  try {
    const [state, ticket] = await Promise.all([
      prepareFilePreview({
        ownerUserId: row.file_owner_id,
        fileId: row.file_id,
        retry: req.body?.retry === true,
      }),
      issueFilePreviewShareTicket({
        shareId: row.id,
        fileId: row.file_id,
        ownerUserId: row.file_owner_id,
      }),
    ]);
    const sourceObjectKey = row.obs_key || buildObjectKey(row.file_owner_id, row.file_name);
    const { url: sourceDownloadUrl, expiresIn: sourceUrlExpiresIn } = createDownloadSignedUrl({
      objectKey: sourceObjectKey,
      expires: 600,
    });
    return res.send(
      resultData({
        ...state,
        previewTicket: ticket.token,
        ticketExpiresIn: ticket.expiresIn,
        sourceDownloadUrl: sourceDownloadUrl || '',
        sourceUrlExpiresIn,
      }),
    );
  } catch (error) {
    return sendPreviewError(req, res, error, 'share-prepare');
  }
}

export async function resolveFileSharePreview(req, res) {
  const row = await authorizePreviewTicket(req, res);
  if (!row) return;
  try {
    const state = await resolveFilePreview({ ownerUserId: row.file_owner_id, fileId: row.file_id });
    return res.send(resultData(state));
  } catch (error) {
    return sendPreviewError(req, res, error, 'share-resolve');
  }
}

export async function listFileShareArchivePreview(req, res) {
  const row = await authorizePreviewTicket(req, res);
  if (!row) return;
  try {
    const data = await listArchivePreview({
      ownerUserId: row.file_owner_id,
      fileId: row.file_id,
      directory: req.body?.directory,
      query: req.body?.query,
      offset: req.body?.offset,
      limit: req.body?.limit,
      touch: false,
    });
    return res.send(resultData(data));
  } catch (error) {
    return sendPreviewError(req, res, error, 'share-archive-list');
  }
}
