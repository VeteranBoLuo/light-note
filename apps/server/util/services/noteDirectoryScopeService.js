import pool from '../../db/index.js';
import { getNoteTreeChildren, loadOwnedNoteTree, resolveNoteDescendantIdsFromSnapshot } from './noteTreeService.js';

function normalizeParentId(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

/**
 * 以笔记树为唯一事实源解析“当前目录”。parentId 表示正在浏览的父页面；
 * 返回范围只包含该目录中的子页面，是否递归由明确的 includeDescendants 决定。
 */
export async function resolveNoteDirectoryScope(
  database = pool,
  { userId: rawUserId, parentId: rawParentId = null, includeDescendants = false } = {},
) {
  const userId = String(rawUserId || '').trim();
  if (!userId) {
    const error = new Error('USER_REQUIRED');
    error.code = 'USER_REQUIRED';
    throw error;
  }
  const parentId = normalizeParentId(rawParentId);
  const snapshot = await loadOwnedNoteTree(userId, { db: database });
  const parent = parentId ? snapshot.nodesById.get(parentId) : null;
  if (parentId && !parent) return null;

  const ids = includeDescendants
    ? parentId
      ? resolveNoteDescendantIdsFromSnapshot(snapshot, parentId)
      : [...snapshot.nodesById.values()].filter((node) => !node.invalidParent).map((node) => node.id)
    : getNoteTreeChildren(snapshot, parentId).map((node) => node.id);

  return Object.freeze({
    directory: Object.freeze({
      parentId,
      title: parent ? String(parent.title || '') : '知识库根目录',
      includeDescendants: includeDescendants === true,
    }),
    resourceRefs: Object.freeze(ids.map((id) => Object.freeze({ type: 'note', id: String(id) }))),
  });
}
