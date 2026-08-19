import pool from '../db/index.js';
import { L, generateUUID, resultData } from '../util/common.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';
import {
  NOTE_SHARE_EVENT_RETENTION_DAYS,
  getNoteShareState,
  normalizeNoteShareInput,
} from '../util/noteSharePolicy.js';
import {
  createShareToken,
  hashShareAccessCode,
  hashShareToken,
  hashShareVisitorIp,
  verifyShareAccessCode,
} from '../util/sharePolicy.js';
import { issueNoteShareTicket, readNoteShareTicket } from '../util/noteShareTicket.js';
import { NoteShareScopeError, getSharedNotePage, listSharedNoteChildren } from '../util/services/noteShareService.js';
import { normalizeCanonicalNoteRecord } from '../util/noteReadModel.js';

const NOTE_SHARE_SELECT = `
  SELECT
    s.*,
    root.title AS root_title,
    root.type AS root_type,
    root.del_flag AS root_del_flag,
    root.create_by AS root_owner_id,
    owner.alias AS creator_name
  FROM note_shares s
  INNER JOIN note root ON root.id = s.root_note_id AND root.create_by = s.owner_user_id
  LEFT JOIN user owner ON owner.id = s.owner_user_id
`;

function publicError(req, res, status, code, zh, en) {
  return res.send(resultData({ errorCode: code }, status, L(req, zh, en)));
}

function setPublicShareHeaders(res) {
  res.set('Cache-Control', 'no-store');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
}

function getClientIp(req) {
  return String(req.ip || req.socket?.remoteAddress || '').slice(0, 128);
}

async function appendShareEvent(db, req, shareId, eventType, outcome) {
  await db.query(
    `INSERT INTO note_share_events (share_id, event_type, outcome, visitor_hash)
     VALUES (?, ?, ?, ?)`,
    [shareId, eventType, outcome, hashShareVisitorIp(getClientIp(req), shareId)],
  );
}

async function cleanupOldShareEvents() {
  try {
    await pool.query(
      `DELETE FROM note_share_events
       WHERE create_time < DATE_SUB(NOW(), INTERVAL ${NOTE_SHARE_EVENT_RETENTION_DAYS} DAY)
       LIMIT 1000`,
    );
  } catch (error) {
    console.warn('[note-share] retention cleanup failed code=%s', stableAgentErrorCode(error));
  }
}

function mapOwnerShare(row) {
  return {
    id: String(row.id),
    rootNoteId: String(row.root_note_id),
    rootTitle: String(row.root_title || ''),
    scopeType: row.scope_type,
    tokenHint: row.token_hint,
    description: row.description || '',
    requiresCode: Boolean(row.access_code_hash),
    expiresAt: row.expires_at,
    maxAccessCount: row.max_access_count,
    accessCount: Number(row.access_count || 0),
    lastAccessAt: row.last_access_at,
    revokedAt: row.revoked_at,
    createTime: row.create_time,
    state: getNoteShareState(row),
  };
}

function mapPublicPage(record) {
  const row = normalizeCanonicalNoteRecord(record);
  return {
    id: String(row.id),
    parentId: row.parent_id ? String(row.parent_id) : null,
    title: String(row.title || ''),
    content: String(row.content || ''),
    type: String(row.type || 'html'),
    revision: Math.max(1, Number(row.revision || 1)),
    updateTime: row.update_time ?? null,
  };
}

function shareInputError(req, res, error) {
  const code = String(error?.code || '');
  const messages = {
    SHARE_EXPIRY_INVALID: ['分享有效期无效', 'The share expiry is invalid'],
    SHARE_DESCRIPTION_TOO_LONG: ['分享说明不能超过 200 个字符', 'The share description is too long'],
    SHARE_ACCESS_CODE_INVALID: ['访问码需为 4～12 位字母或数字', 'The access code must contain 4–12 letters or digits'],
    SHARE_ACCESS_LIMIT_INVALID: ['访问次数限制需为 1～10000', 'The access limit must be between 1 and 10000'],
    NOTE_SHARE_SCOPE_INVALID: ['分享范围无效', 'The share scope is invalid'],
  };
  const pair = messages[code];
  if (!pair) return false;
  res.send(resultData({ errorCode: code }, 400, L(req, pair[0], pair[1])));
  return true;
}

async function insertNoteShare(connection, { rootNoteId, ownerUserId, input }) {
  const token = createShareToken();
  const shareId = generateUUID();
  await connection.query(
    `INSERT INTO note_shares
       (id, root_note_id, owner_user_id, scope_type, token_hash, token_hint, description,
        access_code_hash, expires_at, max_access_count, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY), ?, 'active')`,
    [
      shareId,
      rootNoteId,
      ownerUserId,
      input.scopeType,
      hashShareToken(token),
      token.slice(-8),
      input.description,
      hashShareAccessCode(input.accessCode),
      input.expiresInDays,
      input.maxAccessCount,
    ],
  );
  return { shareId, token };
}

export async function createNoteShare(req, res) {
  const connection = await pool.getConnection();
  let transactionStarted = false;
  try {
    const input = normalizeNoteShareInput(req.body || {});
    const rootNoteId = String(req.body?.rootNoteId || '').trim();
    if (!rootNoteId || rootNoteId.length > 255) {
      return res.send(resultData(null, 400, L(req, '笔记 ID 无效', 'The note ID is invalid')));
    }
    await connection.beginTransaction();
    transactionStarted = true;
    const [notes] = await connection.query(
      'SELECT id FROM note WHERE id = ? AND create_by = ? AND del_flag = 0 FOR UPDATE',
      [rootNoteId, req.user.id],
    );
    if (!notes.length) {
      await connection.rollback();
      transactionStarted = false;
      return res.send(resultData(null, 404, L(req, '笔记不存在或无权限', 'The note was not found')));
    }
    const created = await insertNoteShare(connection, { rootNoteId, ownerUserId: req.user.id, input });
    await appendShareEvent(connection, req, created.shareId, 'created', 'succeeded');
    await connection.commit();
    transactionStarted = false;
    void cleanupOldShareEvents();
    return res.send(
      resultData({
        id: created.shareId,
        token: created.token,
        scopeType: input.scopeType,
        expiresInDays: input.expiresInDays,
      }),
    );
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    if (shareInputError(req, res, error)) return;
    console.error('[note-share] create failed code=%s', stableAgentErrorCode(error));
    return res.send(resultData(null, 500, L(req, '创建分享失败，请稍后重试', 'Could not create the share')));
  } finally {
    connection.release();
  }
}

export async function listNoteShares(req, res) {
  try {
    const rootNoteId = String(req.body?.rootNoteId || '').trim();
    const params = [req.user.id];
    let where = 's.owner_user_id = ?';
    if (rootNoteId) {
      where += ' AND s.root_note_id = ?';
      params.push(rootNoteId);
    }
    const [rows] = await pool.query(
      `${NOTE_SHARE_SELECT}
       WHERE ${where}
       ORDER BY s.create_time DESC
       LIMIT 200`,
      params,
    );
    void cleanupOldShareEvents();
    return res.send(resultData(rows.map(mapOwnerShare)));
  } catch (error) {
    console.error('[note-share] list failed code=%s', stableAgentErrorCode(error));
    return res.send(resultData(null, 500, L(req, '获取分享记录失败', 'Could not load note shares')));
  }
}

export async function revokeNoteShare(req, res) {
  try {
    const [result] = await pool.query(
      `UPDATE note_shares
          SET status = 'revoked', revoked_at = COALESCE(revoked_at, NOW()), update_time = NOW()
        WHERE id = ? AND owner_user_id = ? AND status = 'active'`,
      [String(req.body?.shareId || ''), req.user.id],
    );
    if (!result.affectedRows) {
      return res.send(resultData(null, 404, L(req, '分享不存在或已经失效', 'The share is already unavailable')));
    }
    return res.send(resultData({ revoked: true }));
  } catch (error) {
    console.error('[note-share] revoke failed code=%s', stableAgentErrorCode(error));
    return res.send(resultData(null, 500, L(req, '撤销分享失败', 'Could not revoke the share')));
  }
}

export async function rotateNoteShare(req, res) {
  const connection = await pool.getConnection();
  let transactionStarted = false;
  try {
    const input = normalizeNoteShareInput(req.body || {});
    const shareId = String(req.body?.shareId || '').trim();
    await connection.beginTransaction();
    transactionStarted = true;
    const [rows] = await connection.query(
      `${NOTE_SHARE_SELECT}
       WHERE s.id = ? AND s.owner_user_id = ?
       FOR UPDATE`,
      [shareId, req.user.id],
    );
    if (!rows.length || Number(rows[0].root_del_flag) !== 0) {
      await connection.rollback();
      transactionStarted = false;
      return res.send(resultData(null, 404, L(req, '分享或笔记不存在', 'The share or note was not found')));
    }
    await connection.query(
      `UPDATE note_shares
          SET status = 'revoked', revoked_at = COALESCE(revoked_at, NOW()), update_time = NOW()
        WHERE id = ?`,
      [shareId],
    );
    const created = await insertNoteShare(connection, {
      rootNoteId: rows[0].root_note_id,
      ownerUserId: req.user.id,
      input,
    });
    await appendShareEvent(connection, req, shareId, 'rotated', 'succeeded');
    await connection.commit();
    transactionStarted = false;
    return res.send(resultData({ id: created.shareId, token: created.token, replacedShareId: shareId }));
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    if (shareInputError(req, res, error)) return;
    console.error('[note-share] rotate failed code=%s', stableAgentErrorCode(error));
    return res.send(resultData(null, 500, L(req, '轮换分享链接失败', 'Could not rotate the share link')));
  } finally {
    connection.release();
  }
}

function shareStateError(req, res, state) {
  const messages = {
    revoked: ['分享已被撤销', 'The share was revoked'],
    expired: ['分享已过期', 'The share expired'],
    note_unavailable: ['分享的笔记已不可用', 'The shared note is unavailable'],
    access_limit_reached: ['分享访问次数已用完', 'The share access limit was reached'],
  };
  const pair = messages[state] || ['分享链接不可用', 'The share is unavailable'];
  return publicError(req, res, 410, `SHARE_${String(state).toUpperCase()}`, pair[0], pair[1]);
}

function scopeError(req, res, error) {
  if (!(error instanceof NoteShareScopeError)) return false;
  publicError(
    req,
    res,
    error.status || 400,
    error.code,
    error.status === 404 ? '页面不存在或不在分享范围内' : '页面请求无效',
    error.status === 404 ? 'The page was not found in this share' : 'The page request is invalid',
  );
  return true;
}

function ticketMatchesShare(ticket, row) {
  return Boolean(
    ticket &&
    String(ticket.shareId) === String(row.id) &&
    String(ticket.rootNoteId) === String(row.root_note_id) &&
    String(ticket.ownerUserId) === String(row.owner_user_id) &&
    String(ticket.scopeType) === String(row.scope_type),
  );
}

export async function resolveNoteShare(req, res) {
  setPublicShareHeaders(res);
  const token = String(req.body?.token || '').trim();
  if (token.length < 32 || token.length > 128) {
    return publicError(req, res, 404, 'SHARE_NOT_FOUND', '分享链接无效', 'The share link is invalid');
  }

  const connection = await pool.getConnection();
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const [rows] = await connection.query(
      `${NOTE_SHARE_SELECT}
       WHERE s.token_hash = ?
       LIMIT 1
       FOR UPDATE`,
      [hashShareToken(token)],
    );
    if (!rows.length) {
      await connection.rollback();
      transactionStarted = false;
      return publicError(req, res, 404, 'SHARE_NOT_FOUND', '分享链接不存在或已失效', 'The share is unavailable');
    }
    const row = rows[0];
    const providedTicket = String(req.body?.accessTicket || '').trim();
    const resumedTicket = providedTicket ? await readNoteShareTicket(providedTicket) : null;
    const resumesReadingSession = ticketMatchesShare(resumedTicket, row);
    const state = getNoteShareState(row, Date.now(), resumesReadingSession ? 'session' : 'access');
    if (state !== 'active') {
      await appendShareEvent(connection, req, row.id, 'viewed', state);
      await connection.commit();
      transactionStarted = false;
      return shareStateError(req, res, state);
    }
    if (!resumesReadingSession && row.access_code_hash && !String(req.body?.accessCode || '').trim()) {
      await appendShareEvent(connection, req, row.id, 'viewed', 'code_required');
      await connection.commit();
      transactionStarted = false;
      return publicError(req, res, 403, 'SHARE_CODE_REQUIRED', '请输入访问码', 'Enter the access code');
    }
    if (!resumesReadingSession && !verifyShareAccessCode(req.body?.accessCode, row.access_code_hash)) {
      await appendShareEvent(connection, req, row.id, 'viewed', 'code_invalid');
      await connection.commit();
      transactionStarted = false;
      return publicError(req, res, 403, 'SHARE_CODE_INVALID', '访问码错误', 'The access code is incorrect');
    }

    const ticketScope = {
      shareId: String(row.id),
      rootNoteId: String(row.root_note_id),
      ownerUserId: String(row.owner_user_id),
      scopeType: String(row.scope_type),
    };
    const pageId = String(req.body?.pageId || row.root_note_id).trim();
    // mysql2 的单条事务连接上保持查询串行；Redis 票据也在提交前签发，失败则不消耗访问次数。
    const { page, breadcrumb } = await getSharedNotePage({ db: connection, ticket: ticketScope, noteId: pageId });
    const children = await listSharedNoteChildren({
      db: connection,
      ticket: ticketScope,
      parentId: row.root_note_id,
    });
    const ticket = await issueNoteShareTicket(ticketScope);
    if (!resumesReadingSession) {
      await connection.query(
        `UPDATE note_shares
            SET access_count = access_count + 1, last_access_at = NOW(), update_time = NOW()
          WHERE id = ?`,
        [row.id],
      );
    }
    await appendShareEvent(connection, req, row.id, 'viewed', resumesReadingSession ? 'session_resumed' : 'succeeded');
    await connection.commit();
    transactionStarted = false;
    void cleanupOldShareEvents();
    return res.send(
      resultData({
        accessTicket: ticket.token,
        ticketExpiresIn: ticket.expiresIn,
        share: {
          id: String(row.id),
          rootNoteId: String(row.root_note_id),
          rootTitle: String(row.root_title || ''),
          rootType: String(row.root_type || 'html'),
          scopeType: row.scope_type,
          description: row.description || '',
          creatorName: row.creator_name || '',
          expiresAt: row.expires_at,
        },
        page: mapPublicPage(page),
        breadcrumb,
        children,
      }),
    );
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    if (scopeError(req, res, error)) return;
    console.error('[note-share] public resolve failed code=%s', stableAgentErrorCode(error));
    return publicError(
      req,
      res,
      503,
      'SHARE_SERVICE_UNAVAILABLE',
      '分享服务暂时不可用',
      'The share service is unavailable',
    );
  } finally {
    connection.release();
  }
}

async function authorizeNoteShareTicket(req, res, db = pool) {
  setPublicShareHeaders(res);
  let ticket;
  try {
    ticket = await readNoteShareTicket(req.body?.accessTicket);
  } catch (error) {
    console.error('[note-share] session read failed code=%s', stableAgentErrorCode(error));
    publicError(
      req,
      res,
      503,
      'NOTE_SHARE_SESSION_UNAVAILABLE',
      '阅读会话暂时不可用',
      'The reading session is unavailable',
    );
    return null;
  }
  if (!ticket) {
    publicError(
      req,
      res,
      403,
      'NOTE_SHARE_SESSION_INVALID',
      '阅读会话已过期，请重新打开',
      'The reading session expired',
    );
    return null;
  }
  try {
    const [rows] = await db.query(
      `${NOTE_SHARE_SELECT}
       WHERE s.id = ? AND s.root_note_id = ? AND s.owner_user_id = ? AND s.scope_type = ?
       LIMIT 1`,
      [ticket.shareId, ticket.rootNoteId, ticket.ownerUserId, ticket.scopeType],
    );
    const row = rows[0];
    const state = getNoteShareState(row, Date.now(), 'session');
    if (state !== 'active') {
      shareStateError(req, res, state);
      return null;
    }
    return { row, ticket };
  } catch (error) {
    console.error('[note-share] session authorization failed code=%s', stableAgentErrorCode(error));
    publicError(req, res, 503, 'SHARE_SERVICE_UNAVAILABLE', '分享服务暂时不可用', 'The share service is unavailable');
    return null;
  }
}

export async function getNoteSharePage(req, res) {
  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    // 分享状态、实时父链与正文必须来自同一连接/事务快照，避免页面移出范围时发生 TOCTOU 泄露。
    const authorization = await authorizeNoteShareTicket(req, res, connection);
    if (!authorization) {
      await connection.rollback();
      transactionStarted = false;
      return;
    }
    const { page, breadcrumb } = await getSharedNotePage({
      db: connection,
      ticket: authorization.ticket,
      noteId: req.body?.noteId,
    });
    await connection.commit();
    transactionStarted = false;
    return res.send(resultData({ page: mapPublicPage(page), breadcrumb }));
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    if (scopeError(req, res, error)) return;
    console.error('[note-share] page failed code=%s', stableAgentErrorCode(error));
    return publicError(req, res, 503, 'SHARE_SERVICE_UNAVAILABLE', '页面暂时无法加载', 'The page is unavailable');
  } finally {
    connection?.release();
  }
}

export async function getNoteShareTree(req, res) {
  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const authorization = await authorizeNoteShareTicket(req, res, connection);
    if (!authorization) {
      await connection.rollback();
      transactionStarted = false;
      return;
    }
    const items = await listSharedNoteChildren({
      db: connection,
      ticket: authorization.ticket,
      parentId: req.body?.parentId,
    });
    await connection.commit();
    transactionStarted = false;
    return res.send(resultData({ parentId: String(req.body?.parentId || ''), items }));
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    if (scopeError(req, res, error)) return;
    console.error('[note-share] tree failed code=%s', stableAgentErrorCode(error));
    return publicError(req, res, 503, 'SHARE_SERVICE_UNAVAILABLE', '目录暂时无法加载', 'The directory is unavailable');
  } finally {
    connection?.release();
  }
}
