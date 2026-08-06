import pool from '../../db/index.js';

export const MAX_NOTE_TREE_DEPTH = 8;
export const NOTE_TREE_ROOT_KEY = '__light_note_root__';

const ACTIVE_NOTE = 0;

function normalizeId(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function normalizeParentId(value) {
  return normalizeId(value);
}

function normalizeOptionalParentId(value) {
  return value === undefined ? undefined : normalizeParentId(value);
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function parentKey(parentId) {
  return parentId || NOTE_TREE_ROOT_KEY;
}

function compareNodes(left, right) {
  const pinned = Number(Boolean(numberOrZero(right.isTop))) - Number(Boolean(numberOrZero(left.isTop)));
  if (pinned) return pinned;
  const sort = numberOrZero(left.sort) - numberOrZero(right.sort);
  if (sort) return sort;
  const leftTime = new Date(left.updateTime || 0).getTime() || 0;
  const rightTime = new Date(right.updateTime || 0).getTime() || 0;
  if (leftTime !== rightTime) return rightTime - leftTime;
  return String(right.id).localeCompare(String(left.id));
}

function samePinnedGroup(left, right) {
  return Boolean(left?.isTop) === Boolean(right?.isTop);
}

export class NoteTreeError extends Error {
  constructor(code, message, status = 400, details = null) {
    super(message);
    this.name = 'NoteTreeError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function normalizeTreeNode(row = {}) {
  const id = normalizeId(row.id);
  if (!id) return null;
  return {
    id,
    parentId: normalizeParentId(row.parentId ?? row.parent_id),
    title: String(row.title || ''),
    sort: numberOrZero(row.sort),
    isTop: Boolean(numberOrZero(row.isTop ?? row.is_top)),
    delFlag: numberOrZero(row.delFlag ?? row.del_flag),
    updateTime: row.updateTime ?? row.update_time ?? null,
    treeDeleteBatchId: normalizeId(row.treeDeleteBatchId ?? row.tree_delete_batch_id),
  };
}

/**
 * 由当前用户的一次权威查询构建轻量树快照。
 *
 * 读取面对历史坏数据时采用可恢复策略：缺失父节点、自指和已检测到的环不会
 * 让整个笔记库不可用，而是把相关节点作为根层孤儿返回并标记 invalidParent。
 * 所有写路径仍会严格拒绝这些结构。
 */
export function buildNoteTree(rows = []) {
  const nodesById = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const node = normalizeTreeNode(row);
    if (node) nodesById.set(node.id, node);
  }

  const invalidParentIds = new Set();
  for (const node of nodesById.values()) {
    if (node.parentId && (!nodesById.has(node.parentId) || node.parentId === node.id)) {
      invalidParentIds.add(node.id);
    }
  }

  // 检测多节点环。每条父链最多访问一次；发现环后把环上所有节点降级到根层展示。
  const settled = new Set();
  for (const start of nodesById.values()) {
    if (settled.has(start.id)) continue;
    const path = [];
    const pathIndex = new Map();
    let current = start;
    while (current && !settled.has(current.id)) {
      const seenAt = pathIndex.get(current.id);
      if (seenAt !== undefined) {
        for (const cyclic of path.slice(seenAt)) invalidParentIds.add(cyclic);
        break;
      }
      pathIndex.set(current.id, path.length);
      path.push(current.id);
      if (!current.parentId || invalidParentIds.has(current.id)) break;
      current = nodesById.get(current.parentId);
    }
    for (const id of path) settled.add(id);
  }

  const childrenByParent = new Map([[NOTE_TREE_ROOT_KEY, []]]);
  for (const node of nodesById.values()) {
    const invalidParent = invalidParentIds.has(node.id);
    const effectiveParentId = invalidParent ? null : node.parentId;
    node.invalidParent = invalidParent;
    node.effectiveParentId = effectiveParentId;
    const key = parentKey(effectiveParentId);
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key).push(node);
  }
  for (const children of childrenByParent.values()) children.sort(compareNodes);

  return { nodesById, childrenByParent, invalidParentIds };
}

function queryDb(db) {
  if (!db || typeof db.query !== 'function') {
    throw new NoteTreeError('NOTE_TREE_DB_REQUIRED', '笔记树数据库连接不可用', 500);
  }
  return db;
}

export async function loadOwnedNoteTree(userId, options = {}) {
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) throw new NoteTreeError('NOTE_TREE_USER_REQUIRED', '缺少用户身份', 401);
  const db = queryDb(options.db || pool);
  const includeDeleted = options.includeDeleted === true;
  const lock = options.lock === true;
  const where = includeDeleted ? 'create_by = ?' : 'create_by = ? AND del_flag = 0';
  const [rows] = await db.query(
    `SELECT id, parent_id, title, sort, is_top, del_flag, update_time
       FROM note
      WHERE ${where}
      ORDER BY is_top DESC, sort, update_time DESC, id DESC${lock ? ' FOR UPDATE' : ''}`,
    [normalizedUserId],
  );
  return buildNoteTree(rows);
}

export function getNoteTreeChildren(snapshot, parentId = null) {
  if (!snapshot?.childrenByParent) return [];
  return [...(snapshot.childrenByParent.get(parentKey(normalizeParentId(parentId))) || [])];
}

export function resolveNoteDescendantIdsFromSnapshot(snapshot, rootNoteId, options = {}) {
  const rootId = normalizeId(rootNoteId);
  if (!rootId || !snapshot?.nodesById?.has(rootId)) {
    throw new NoteTreeError('NOTE_TREE_NODE_NOT_FOUND', '笔记不存在', 404);
  }
  const result = [];
  const visited = new Set([rootId]);
  const queue = [...getNoteTreeChildren(snapshot, rootId)];
  while (queue.length) {
    const node = queue.shift();
    if (!node || visited.has(node.id)) continue;
    visited.add(node.id);
    result.push(node.id);
    queue.push(...getNoteTreeChildren(snapshot, node.id));
  }
  return options.includeRoot === true ? [rootId, ...result] : result;
}

export function resolveNoteBreadcrumbFromSnapshot(snapshot, noteId) {
  const normalizedNoteId = normalizeId(noteId);
  const node = snapshot?.nodesById?.get(normalizedNoteId);
  if (!node) throw new NoteTreeError('NOTE_TREE_NODE_NOT_FOUND', '笔记不存在', 404);
  if (node.invalidParent) {
    return [{ id: node.id, title: node.title }];
  }
  const path = [];
  const visited = new Set();
  let current = node;
  while (current) {
    if (visited.has(current.id)) throw new NoteTreeError('NOTE_TREE_CYCLE', '笔记目录存在循环关系', 409);
    visited.add(current.id);
    path.push({ id: current.id, title: current.title });
    current = current.effectiveParentId ? snapshot.nodesById.get(current.effectiveParentId) : null;
  }
  return path.reverse();
}

export function resolveNoteDepthFromSnapshot(snapshot, noteId) {
  return resolveNoteBreadcrumbFromSnapshot(snapshot, noteId).length;
}

export function resolveNoteSubtreeRelativeDepth(snapshot, rootNoteId) {
  const rootId = normalizeId(rootNoteId);
  if (!rootId || !snapshot?.nodesById?.has(rootId)) {
    throw new NoteTreeError('NOTE_TREE_NODE_NOT_FOUND', '笔记不存在', 404);
  }
  let maxDepth = 0;
  const queue = [{ id: rootId, depth: 0 }];
  const visited = new Set();
  while (queue.length) {
    const item = queue.shift();
    if (visited.has(item.id)) throw new NoteTreeError('NOTE_TREE_CYCLE', '笔记目录存在循环关系', 409);
    visited.add(item.id);
    maxDepth = Math.max(maxDepth, item.depth);
    for (const child of getNoteTreeChildren(snapshot, item.id)) {
      queue.push({ id: child.id, depth: item.depth + 1 });
    }
  }
  return maxDepth;
}

export function assertValidNoteParentFromSnapshot(snapshot, { noteId = null, parentId = null } = {}) {
  const normalizedNoteId = normalizeId(noteId);
  const normalizedParentId = normalizeParentId(parentId);
  const movingNode = normalizedNoteId ? snapshot?.nodesById?.get(normalizedNoteId) : null;
  if (normalizedNoteId && !movingNode) {
    throw new NoteTreeError('NOTE_TREE_NODE_NOT_FOUND', '笔记不存在', 404);
  }

  let parentDepth = 0;
  if (normalizedParentId) {
    const parent = snapshot?.nodesById?.get(normalizedParentId);
    if (!parent || parent.delFlag !== ACTIVE_NOTE) {
      throw new NoteTreeError('NOTE_TREE_PARENT_NOT_FOUND', '目标目录不存在', 404);
    }
    if (parent.invalidParent) {
      throw new NoteTreeError('NOTE_TREE_PARENT_INVALID', '目标目录结构异常，暂时不能移动到这里', 409);
    }
    if (normalizedParentId === normalizedNoteId) {
      throw new NoteTreeError('NOTE_TREE_CYCLE', '不能把页面移动到自己', 409);
    }
    if (movingNode) {
      const descendants = new Set(resolveNoteDescendantIdsFromSnapshot(snapshot, normalizedNoteId));
      if (descendants.has(normalizedParentId)) {
        throw new NoteTreeError('NOTE_TREE_CYCLE', '不能把页面移动到自己的子页面', 409);
      }
    }
    parentDepth = resolveNoteDepthFromSnapshot(snapshot, normalizedParentId);
  }

  const relativeDepth = movingNode ? resolveNoteSubtreeRelativeDepth(snapshot, normalizedNoteId) : 0;
  const resultingMaxDepth = parentDepth + 1 + relativeDepth;
  if (resultingMaxDepth > MAX_NOTE_TREE_DEPTH) {
    throw new NoteTreeError('NOTE_TREE_DEPTH_EXCEEDED', `笔记目录最多支持 ${MAX_NOTE_TREE_DEPTH} 层`, 409, {
      maxDepth: MAX_NOTE_TREE_DEPTH,
      resultingMaxDepth,
    });
  }
  return { parentId: normalizedParentId, resultingMaxDepth, relativeDepth };
}

function decorateTreeItem(snapshot, node, depth) {
  const children = getNoteTreeChildren(snapshot, node.id);
  const item = {
    id: node.id,
    parentId: node.effectiveParentId,
    title: node.title,
    childCount: children.length,
    hasChildren: children.length > 0,
    isTop: node.isTop,
    sort: node.sort,
    updateTime: node.updateTime,
    ...(node.invalidParent ? { invalidParent: true } : {}),
  };
  if (depth > 1 && children.length) {
    item.children = children.map((child) => decorateTreeItem(snapshot, child, depth - 1));
  }
  return item;
}

export async function queryOwnedNoteTree({ userId, parentId = null, depth = 1, db = pool } = {}) {
  const normalizedDepth = Number(depth);
  if (!Number.isInteger(normalizedDepth) || normalizedDepth < 1 || normalizedDepth > MAX_NOTE_TREE_DEPTH) {
    throw new NoteTreeError('NOTE_TREE_INVALID_DEPTH', `depth 必须在 1 到 ${MAX_NOTE_TREE_DEPTH} 之间`, 400);
  }
  const snapshot = await loadOwnedNoteTree(userId, { db });
  const normalizedParentId = normalizeParentId(parentId);
  if (normalizedParentId && !snapshot.nodesById.has(normalizedParentId)) {
    throw new NoteTreeError('NOTE_TREE_PARENT_NOT_FOUND', '目录不存在', 404);
  }
  return {
    parentId: normalizedParentId,
    items: getNoteTreeChildren(snapshot, normalizedParentId).map((node) =>
      decorateTreeItem(snapshot, node, normalizedDepth),
    ),
  };
}

export async function resolveOwnedNoteBreadcrumb({ userId, noteId, db = pool } = {}) {
  const snapshot = await loadOwnedNoteTree(userId, { db });
  return { items: resolveNoteBreadcrumbFromSnapshot(snapshot, noteId) };
}

export async function resolveOwnedNoteDescendantIds({ userId, rootNoteId, includeRoot = false, db = pool } = {}) {
  const snapshot = await loadOwnedNoteTree(userId, { db });
  return resolveNoteDescendantIdsFromSnapshot(snapshot, rootNoteId, { includeRoot });
}

/**
 * 在创建事务内解析新页面的权威落点。
 *
 * parentId 只作为候选值使用：父页面归属、删除状态和最大深度均通过当前用户的
 * 加锁树快照校验；新页面固定追加到目标父层的普通（非置顶）兄弟组末尾。
 */
export async function prepareOwnedNotePlacement(connection, { userId, parentId = null } = {}) {
  const snapshot = await loadOwnedNoteTree(userId, { db: queryDb(connection), lock: true });
  const placement = assertValidNoteParentFromSnapshot(snapshot, { parentId });
  const siblings = getNoteTreeChildren(snapshot, placement.parentId).filter((node) => !node.isTop);
  const nextSort = siblings.reduce((maximum, node) => Math.max(maximum, numberOrZero(node.sort)), -1) + 1;
  return {
    parentId: placement.parentId,
    sort: nextSort,
    depth: placement.resultingMaxDepth,
  };
}

function resolveAnchorIndex(nodes, anchorId) {
  if (!anchorId) return -1;
  return nodes.findIndex((node) => node.id === anchorId);
}

function assertValidMoveAnchors(nodes, { movedId, previousId, nextId }) {
  if (previousId === movedId || nextId === movedId || (previousId && previousId === nextId)) {
    throw new NoteTreeError('INVALID_SORT_ANCHOR', '排序锚点已失效', 409);
  }

  const previousIndex = resolveAnchorIndex(nodes, previousId);
  const nextIndex = resolveAnchorIndex(nodes, nextId);
  if ((previousId && previousIndex < 0) || (nextId && nextIndex < 0)) {
    throw new NoteTreeError('INVALID_SORT_ANCHOR', '排序锚点已失效', 409);
  }
  if (previousId && nextId && nextIndex !== previousIndex + 1) {
    throw new NoteTreeError('INVALID_SORT_ANCHOR', '排序锚点已失效', 409);
  }

  if (previousId) return previousIndex + 1;
  if (nextId) return nextIndex;
  return nodes.length;
}

async function updateSiblingSort(connection, { userId, parentId, rows, skipId = null }) {
  let updatedCount = 0;
  for (const [index, row] of rows.entries()) {
    if (row.id === skipId || numberOrZero(row.sort) === index) continue;
    const [result] = await connection.query(
      `UPDATE note
          SET sort = ?, update_time = update_time
        WHERE id = ? AND create_by = ? AND del_flag = 0 AND parent_id <=> ?`,
      [index, row.id, userId, parentId],
    );
    updatedCount += Number(result?.affectedRows || 0);
  }
  return updatedCount;
}

/**
 * 在调用方已开启的事务内移动页面节点或调整同级顺序。
 *
 * - 仅使用当前 owner 的完整加锁快照；
 * - parentId === undefined 表示旧排序调用保持当前父页面，null 才表示移动到根；
 * - 排序锚点必须属于目标父层且与被移动页面处于同一置顶分组；
 * - 结构变化不会写正文历史，也显式保留 update_time。
 */
export async function moveOwnedNoteNode(
  connection,
  { userId, id, parentId = undefined, previousId = null, nextId = null } = {},
) {
  const db = queryDb(connection);
  const normalizedUserId = normalizeId(userId);
  const movedId = normalizeId(id);
  if (!normalizedUserId) throw new NoteTreeError('NOTE_TREE_USER_REQUIRED', '缺少用户身份', 401);
  if (!movedId) throw new NoteTreeError('NOTE_TREE_NODE_ID_REQUIRED', '缺少笔记 ID', 400);

  const snapshot = await loadOwnedNoteTree(normalizedUserId, { db, lock: true });
  const moved = snapshot.nodesById.get(movedId);
  if (!moved) throw new NoteTreeError('NOTE_TREE_NODE_NOT_FOUND', '笔记不存在', 404);

  const requestedParentId = normalizeOptionalParentId(parentId);
  const targetParentId = requestedParentId === undefined ? moved.effectiveParentId : requestedParentId;
  assertValidNoteParentFromSnapshot(snapshot, { noteId: movedId, parentId: targetParentId });

  const normalizedPreviousId = normalizeId(previousId);
  const normalizedNextId = normalizeId(nextId);
  const targetGroup = getNoteTreeChildren(snapshot, targetParentId).filter(
    (node) => node.id !== movedId && samePinnedGroup(node, moved),
  );
  const insertIndex = assertValidMoveAnchors(targetGroup, {
    movedId,
    previousId: normalizedPreviousId,
    nextId: normalizedNextId,
  });
  targetGroup.splice(insertIndex, 0, moved);

  const previousParentId = moved.effectiveParentId;
  const parentChanged = previousParentId !== targetParentId;
  const previousGroup = getNoteTreeChildren(snapshot, previousParentId).filter(
    (node) => node.id !== movedId && samePinnedGroup(node, moved),
  );
  const originalGroupIds = getNoteTreeChildren(snapshot, previousParentId)
    .filter((node) => samePinnedGroup(node, moved))
    .map((node) => node.id);
  const targetGroupIds = targetGroup.map((node) => node.id);
  const orderChanged = parentChanged || originalGroupIds.some((nodeId, index) => nodeId !== targetGroupIds[index]);

  if (!orderChanged) {
    return {
      id: movedId,
      parentId: targetParentId,
      previousParentId,
      moved: false,
      updatedCount: 0,
    };
  }

  let updatedCount = 0;
  if (parentChanged) {
    updatedCount += await updateSiblingSort(db, {
      userId: normalizedUserId,
      parentId: previousParentId,
      rows: previousGroup,
    });
  }

  const movedSort = targetGroup.findIndex((node) => node.id === movedId);
  const [moveResult] = await db.query(
    `UPDATE note
        SET parent_id = ?, sort = ?, update_time = update_time
      WHERE id = ? AND create_by = ? AND del_flag = 0`,
    [targetParentId, movedSort, movedId, normalizedUserId],
  );
  if (Number(moveResult?.affectedRows || 0) !== 1) {
    throw new NoteTreeError('NOTE_TREE_MOVE_CONFLICT', '页面状态已变化，请刷新后重试', 409);
  }
  updatedCount += 1;
  updatedCount += await updateSiblingSort(db, {
    userId: normalizedUserId,
    parentId: targetParentId,
    rows: targetGroup,
    skipId: movedId,
  });

  return {
    id: movedId,
    parentId: targetParentId,
    previousParentId,
    moved: true,
    updatedCount,
  };
}
