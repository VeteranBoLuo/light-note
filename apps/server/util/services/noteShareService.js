import { NoteTreeError, resolveOwnedNoteBreadcrumb } from './noteTreeService.js';
import { queryActiveInheritedNoteShares } from '../noteShareExposure.js';

function normalizeId(value) {
  const normalized = String(value ?? '').trim();
  return normalized && normalized.length <= 255 ? normalized : null;
}

export class NoteShareScopeError extends Error {
  constructor(code, message, status = 400, details = null) {
    super(message);
    this.name = 'NoteShareScopeError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function assertShareTicket(ticket) {
  if (!ticket?.rootNoteId || !ticket?.ownerUserId || !['single', 'subtree'].includes(ticket?.scopeType)) {
    throw new NoteShareScopeError('NOTE_SHARE_SESSION_INVALID', '分享会话无效', 403);
  }
}

export function resolveRelativeShareBreadcrumb(ticket, items = []) {
  assertShareTicket(ticket);
  const normalizedItems = Array.isArray(items) ? items : [];
  const rootIndex = normalizedItems.findIndex((item) => String(item?.id) === String(ticket.rootNoteId));
  if (rootIndex < 0) {
    throw new NoteShareScopeError('NOTE_SHARE_PAGE_OUT_OF_SCOPE', '页面不在分享范围内', 404);
  }
  const relative = normalizedItems.slice(rootIndex);
  if (ticket.scopeType === 'single' && relative.length !== 1) {
    throw new NoteShareScopeError('NOTE_SHARE_PAGE_OUT_OF_SCOPE', '页面不在分享范围内', 404);
  }
  return relative.map((item) => ({ id: String(item.id), title: String(item.title || '') }));
}

export async function resolveSharedNoteBreadcrumb({ db, ticket, noteId }) {
  assertShareTicket(ticket);
  const normalizedNoteId = normalizeId(noteId);
  if (!normalizedNoteId) throw new NoteShareScopeError('NOTE_SHARE_PAGE_INVALID', '页面 ID 无效', 400);
  try {
    const result = await resolveOwnedNoteBreadcrumb({
      userId: ticket.ownerUserId,
      noteId: normalizedNoteId,
      db,
    });
    return resolveRelativeShareBreadcrumb(ticket, result.items);
  } catch (error) {
    if (error instanceof NoteTreeError && error.code === 'NOTE_TREE_NODE_NOT_FOUND') {
      throw new NoteShareScopeError('NOTE_SHARE_PAGE_NOT_FOUND', '页面不存在', 404);
    }
    throw error;
  }
}

export async function getSharedNotePage({ db, ticket, noteId }) {
  const breadcrumb = await resolveSharedNoteBreadcrumb({ db, ticket, noteId });
  const [rows] = await db.query(
    `SELECT id, parent_id, title, content, type, revision, update_time
       FROM note
      WHERE id = ? AND create_by = ? AND del_flag = 0
      LIMIT 1`,
    [String(noteId), String(ticket.ownerUserId)],
  );
  if (!rows.length) throw new NoteShareScopeError('NOTE_SHARE_PAGE_NOT_FOUND', '页面不存在', 404);
  return { page: rows[0], breadcrumb };
}

export async function listSharedNoteChildren({ db, ticket, parentId }) {
  const normalizedParentId = normalizeId(parentId);
  if (!normalizedParentId) throw new NoteShareScopeError('NOTE_SHARE_PAGE_INVALID', '页面 ID 无效', 400);
  await resolveSharedNoteBreadcrumb({ db, ticket, noteId: normalizedParentId });
  if (ticket.scopeType === 'single') return [];
  const [rows] = await db.query(
    `SELECT child.id,
            child.parent_id,
            child.title,
            child.type,
            child.revision,
            child.update_time,
            (SELECT COUNT(*)
               FROM note grandchild
              WHERE grandchild.parent_id = child.id
                AND grandchild.create_by = child.create_by
                AND grandchild.del_flag = 0) AS child_count
       FROM note child
      WHERE child.parent_id = ?
        AND child.create_by = ?
        AND child.del_flag = 0
      ORDER BY child.is_top DESC, child.sort, child.update_time DESC, child.id DESC`,
    [normalizedParentId, String(ticket.ownerUserId)],
  );
  return rows.map((row) => ({
    id: String(row.id),
    parentId: row.parent_id ? String(row.parent_id) : null,
    title: String(row.title || ''),
    type: String(row.type || 'html'),
    revision: Math.max(1, Number(row.revision || 1)),
    updateTime: row.update_time ?? null,
    childCount: Number(row.child_count || 0),
    hasChildren: Number(row.child_count || 0) > 0,
  }));
}

/**
 * 返回某个目标父页面当前继承到的有效目录分享。调用方可用它在创建/移动前要求显式确认，
 * 防止用户在不知情的情况下把私密内容放进公开目录。
 */
export async function listActiveInheritedNoteShares({ db, userId, parentId }) {
  const normalizedParentId = normalizeId(parentId);
  if (!normalizedParentId) return [];
  const breadcrumb = await resolveOwnedNoteBreadcrumb({ userId, noteId: normalizedParentId, db });
  const ancestorIds = breadcrumb.items.map((item) => String(item.id));
  if (!ancestorIds.length) return [];
  return queryActiveInheritedNoteShares(db, { userId, ancestorIds });
}

export async function assertNoteShareExposureAcknowledged({ db, userId, parentId, acknowledged = false }) {
  const shares = await listActiveInheritedNoteShares({ db, userId, parentId });
  if (!shares.length || acknowledged === true) return shares;
  throw new NoteTreeError(
    'NOTE_SHARE_EXPOSURE_CONFIRMATION_REQUIRED',
    '目标目录正在公开分享，需要确认后继续',
    409,
    {
      shareCount: shares.length,
      roots: shares.slice(0, 5).map((share) => ({ id: share.rootNoteId, title: share.rootTitle })),
    },
  );
}
