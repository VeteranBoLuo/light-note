import pool from '../../db/index.js';
import { randomUUID } from 'node:crypto';
import { removeInboxRelations } from '../resourceInbox.js';
import { MAX_NOTE_TREE_DEPTH, NOTE_TREE_ROOT_KEY } from '../noteTreeConstants.js';

export { MAX_NOTE_TREE_DEPTH, NOTE_TREE_ROOT_KEY } from '../noteTreeConstants.js';

const ACTIVE_NOTE = 0;
const MAX_NOTE_TREE_SEARCH_LENGTH = 120;

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

function normalizeTreeSearchKeyword(value) {
  const normalized = String(value ?? '').trim();
  if (normalized.length > MAX_NOTE_TREE_SEARCH_LENGTH) {
    throw new NoteTreeError(
      'NOTE_TREE_SEARCH_TOO_LONG',
      `目录搜索关键词不能超过 ${MAX_NOTE_TREE_SEARCH_LENGTH} 个字符`,
      400,
    );
  }
  return normalized.toLocaleLowerCase();
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
    `SELECT id, parent_id, title, sort, is_top, del_flag, update_time, tree_delete_batch_id
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

function decorateTreeSearchItem(snapshot, node, visibleIds, matchedIds) {
  const children = getNoteTreeChildren(snapshot, node.id);
  const visibleChildren = children.filter((child) => visibleIds.has(child.id));
  return {
    id: node.id,
    parentId: node.effectiveParentId,
    title: node.title,
    childCount: children.length,
    hasChildren: children.length > 0,
    isTop: node.isTop,
    sort: node.sort,
    updateTime: node.updateTime,
    matched: matchedIds.has(node.id),
    ...(node.invalidParent ? { invalidParent: true } : {}),
    ...(visibleChildren.length
      ? {
          children: visibleChildren.map((child) =>
            decorateTreeSearchItem(snapshot, child, visibleIds, matchedIds),
          ),
        }
      : {}),
  };
}

/**
 * 目录标题搜索只在服务端的轻量元数据快照中执行。命中范围可以限定为当前目录的
 * 后代，但返回树始终补齐到知识库根层的祖先路径，让重名页面仍能被准确定位。
 * 不返回正文，也不为了展示路径把范围外的兄弟或后代带入结果。
 */
export function searchNoteTreeFromSnapshot(snapshot, keyword, { parentId = null } = {}) {
  const normalizedKeyword = normalizeTreeSearchKeyword(keyword);
  const normalizedParentId = normalizeParentId(parentId);
  if (normalizedParentId && !snapshot?.nodesById?.has(normalizedParentId)) {
    throw new NoteTreeError('NOTE_TREE_PARENT_NOT_FOUND', '目录不存在', 404);
  }
  if (!normalizedKeyword) return { keyword: '', matchCount: 0, items: [] };

  const allowedIds = normalizedParentId
    ? new Set(resolveNoteDescendantIdsFromSnapshot(snapshot, normalizedParentId))
    : new Set(snapshot?.nodesById?.keys?.() || []);
  const matchedIds = new Set();
  for (const id of allowedIds) {
    const node = snapshot.nodesById.get(id);
    if (String(node?.title || '').toLocaleLowerCase().includes(normalizedKeyword)) matchedIds.add(id);
  }

  const visibleIds = new Set(matchedIds);
  for (const matchId of matchedIds) {
    let current = snapshot.nodesById.get(matchId);
    const visited = new Set();
    while (current?.effectiveParentId) {
      if (visited.has(current.id)) break;
      visited.add(current.id);
      visibleIds.add(current.effectiveParentId);
      current = snapshot.nodesById.get(current.effectiveParentId);
    }
  }

  return {
    keyword: String(keyword ?? '').trim(),
    matchCount: matchedIds.size,
    items: getNoteTreeChildren(snapshot, null)
      .filter((node) => visibleIds.has(node.id))
      .map((node) => decorateTreeSearchItem(snapshot, node, visibleIds, matchedIds)),
  };
}

export async function queryOwnedNoteTree({ userId, parentId = null, depth = 1, keyword = '', db = pool } = {}) {
  const normalizedDepth = depth === 'all' ? MAX_NOTE_TREE_DEPTH : Number(depth);
  if (!Number.isInteger(normalizedDepth) || normalizedDepth < 1 || normalizedDepth > MAX_NOTE_TREE_DEPTH) {
    throw new NoteTreeError('NOTE_TREE_INVALID_DEPTH', `depth 必须在 1 到 ${MAX_NOTE_TREE_DEPTH} 之间`, 400);
  }
  const snapshot = await loadOwnedNoteTree(userId, { db });
  const normalizedParentId = normalizeParentId(parentId);
  if (normalizedParentId && !snapshot.nodesById.has(normalizedParentId)) {
    throw new NoteTreeError('NOTE_TREE_PARENT_NOT_FOUND', '目录不存在', 404);
  }
  const normalizedKeyword = String(keyword ?? '').trim();
  if (normalizedKeyword) {
    const search = searchNoteTreeFromSnapshot(snapshot, normalizedKeyword, { parentId: normalizedParentId });
    return {
      parentId: normalizedParentId,
      maxDepth: MAX_NOTE_TREE_DEPTH,
      ...search,
    };
  }
  return {
    parentId: normalizedParentId,
    maxDepth: MAX_NOTE_TREE_DEPTH,
    items: getNoteTreeChildren(snapshot, normalizedParentId).map((node) =>
      decorateTreeItem(snapshot, node, normalizedDepth),
    ),
  };
}

export async function resolveOwnedNoteBreadcrumb({ userId, noteId, db = pool } = {}) {
  const snapshot = await loadOwnedNoteTree(userId, { db });
  return { items: resolveNoteBreadcrumbFromSnapshot(snapshot, noteId) };
}

/**
 * 预览新建页面落点时使用的只读权威校验。与事务内 prepareOwnedNotePlacement 复用
 * 同一套 owner、异常父链和 8 层深度规则，避免先签发一张注定无法执行的确认卡。
 */
export async function resolveOwnedNoteCreateTarget({ userId, parentId = null, db = pool } = {}) {
  const snapshot = await loadOwnedNoteTree(userId, { db });
  const placement = assertValidNoteParentFromSnapshot(snapshot, { parentId });
  return {
    parentId: placement.parentId,
    depth: placement.resultingMaxDepth,
    items: placement.parentId ? resolveNoteBreadcrumbFromSnapshot(snapshot, placement.parentId) : [],
  };
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

function noteSiblingGroupKey(parentId, isTop) {
  return `${parentKey(parentId)}\u0000${isTop ? '1' : '0'}`;
}

/**
 * 在同一个事务和 owner 加锁快照内批量移动互不重叠的页面子树。
 *
 * 如果请求同时选择父页面和后代，只移动最外层父页面；全部后代随父页面保留原结构。
 * 各置顶分组分别追加到目标目录末尾，避免批量移动破坏现有置顶语义。
 */
export async function moveOwnedNoteNodes(connection, { userId, ids, parentId = null } = {}) {
  const db = queryDb(connection);
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) throw new NoteTreeError('NOTE_TREE_USER_REQUIRED', '缺少用户身份', 401);
  const requestedIds = normalizeNoteIdList(ids, { max: 100 });
  const targetParentId = normalizeParentId(parentId);
  const snapshot = await loadOwnedNoteTree(normalizedUserId, { db, lock: true });

  for (const id of requestedIds) {
    if (!snapshot.nodesById.has(id)) {
      throw new NoteTreeError('NOTE_TREE_NODE_NOT_FOUND', '笔记不存在', 404, { id });
    }
  }

  const selectedIds = new Set(requestedIds);
  const rootIdsInRequestOrder = requestedIds.filter((id) => !hasSelectedAncestor(snapshot, id, selectedIds));
  const roots = rootIdsInRequestOrder.map((id) => snapshot.nodesById.get(id));
  for (const root of roots) {
    assertValidNoteParentFromSnapshot(snapshot, { noteId: root.id, parentId: targetParentId });
  }

  const movingRootIds = new Set(rootIdsInRequestOrder);
  const affectedGroups = new Map();
  const registerGroup = (groupParentId, isTop) => {
    const key = noteSiblingGroupKey(groupParentId, isTop);
    if (!affectedGroups.has(key)) affectedGroups.set(key, { parentId: groupParentId, isTop });
  };
  for (const root of roots) {
    registerGroup(root.effectiveParentId, root.isTop);
    registerGroup(targetParentId, root.isTop);
  }

  const desiredRootSort = new Map();
  let updatedCount = 0;
  for (const group of affectedGroups.values()) {
    const rows = getNoteTreeChildren(snapshot, group.parentId).filter(
      (node) => Boolean(node.isTop) === Boolean(group.isTop) && !movingRootIds.has(node.id),
    );
    if (group.parentId === targetParentId) {
      rows.push(...roots.filter((root) => Boolean(root.isTop) === Boolean(group.isTop)));
    }

    for (const [sort, row] of rows.entries()) {
      if (movingRootIds.has(row.id)) {
        desiredRootSort.set(row.id, sort);
        if (row.effectiveParentId === targetParentId && numberOrZero(row.sort) === sort) continue;
        const [result] = await db.query(
          `UPDATE note
              SET parent_id = ?, sort = ?, update_time = update_time
            WHERE id = ? AND create_by = ? AND del_flag = 0`,
          [targetParentId, sort, row.id, normalizedUserId],
        );
        if (Number(result?.affectedRows || 0) !== 1) {
          throw new NoteTreeError('NOTE_TREE_MOVE_CONFLICT', '页面状态已变化，请刷新后重试', 409, {
            id: row.id,
          });
        }
        updatedCount += 1;
        continue;
      }

      if (numberOrZero(row.sort) === sort) continue;
      const [result] = await db.query(
        `UPDATE note
            SET sort = ?, update_time = update_time
          WHERE id = ? AND create_by = ? AND del_flag = 0 AND parent_id <=> ?`,
        [sort, row.id, normalizedUserId, group.parentId],
      );
      updatedCount += Number(result?.affectedRows || 0);
    }
  }

  const items = roots.map((root) => {
    const sort = desiredRootSort.get(root.id);
    const moved = root.effectiveParentId !== targetParentId || numberOrZero(root.sort) !== sort;
    return {
      id: root.id,
      parentId: targetParentId,
      previousParentId: root.effectiveParentId,
      sort,
      moved,
    };
  });
  const affectedIds = new Set();
  for (const root of roots) {
    affectedIds.add(root.id);
    for (const descendantId of resolveNoteDescendantIdsFromSnapshot(snapshot, root.id)) affectedIds.add(descendantId);
  }

  return {
    items,
    requestedCount: requestedIds.length,
    rootCount: roots.length,
    movedCount: items.filter((item) => item.moved).length,
    affectedCount: affectedIds.size,
    updatedCount,
    parentId: targetParentId,
  };
}

function normalizeNoteIdList(values, { max = null, required = true } = {}) {
  const ids = [...new Set((Array.isArray(values) ? values : []).map(normalizeId).filter(Boolean))];
  if (required && ids.length === 0) {
    throw new NoteTreeError('NOTE_TREE_NODE_ID_REQUIRED', '缺少笔记 ID', 400);
  }
  if (max && ids.length > max) {
    throw new NoteTreeError('NOTE_TREE_TOO_MANY_NODES', `单次最多处理 ${max} 个页面`, 400, { max });
  }
  return ids;
}

function normalizeDeleteItems(items) {
  const rawItems = Array.isArray(items) ? items : [];
  if (rawItems.length === 0 || rawItems.length > 100) {
    throw new NoteTreeError('NOTE_TREE_INVALID_DELETE_REQUEST', '删除参数无效', 400, { max: 100 });
  }
  const normalized = [];
  const seen = new Map();
  for (const rawItem of rawItems) {
    const id = normalizeId(rawItem?.id);
    const expectedDescendantCount = Number(rawItem?.expectedDescendantCount);
    if (!id || !Number.isInteger(expectedDescendantCount) || expectedDescendantCount < 0) {
      throw new NoteTreeError('NOTE_TREE_INVALID_DELETE_REQUEST', '删除参数无效', 400);
    }
    if (seen.has(id)) {
      if (seen.get(id) !== expectedDescendantCount) {
        throw new NoteTreeError('NOTE_TREE_INVALID_DELETE_REQUEST', '同一页面的删除数量不一致', 400);
      }
      continue;
    }
    seen.set(id, expectedDescendantCount);
    normalized.push({ id, expectedDescendantCount });
  }
  return normalized;
}

function hasSelectedAncestor(snapshot, noteId, selectedIds) {
  const visited = new Set([noteId]);
  let currentId = snapshot.nodesById.get(noteId)?.effectiveParentId || null;
  while (currentId) {
    if (selectedIds.has(currentId)) return true;
    if (visited.has(currentId)) {
      throw new NoteTreeError('NOTE_TREE_CYCLE', '笔记目录存在循环关系', 409);
    }
    visited.add(currentId);
    currentId = snapshot.nodesById.get(currentId)?.effectiveParentId || null;
  }
  return false;
}

/**
 * 在调用方事务内原子删除一棵或多棵互不重叠的页面子树。
 *
 * 每个有效根节点使用独立批次 ID；如果批量选择同时包含父页面和其后代，后代会
 * 被父页面批次覆盖，不会产生两个相互交叠的恢复批次。前端提供的数量只用于并发
 * 确认，真实范围始终由加锁后的 owner 树重新计算。
 */
export async function deleteOwnedNoteSubtrees(connection, { userId, items } = {}) {
  const db = queryDb(connection);
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) throw new NoteTreeError('NOTE_TREE_USER_REQUIRED', '缺少用户身份', 401);
  const requests = normalizeDeleteItems(items);
  const snapshot = await loadOwnedNoteTree(normalizedUserId, { db, lock: true });
  const validated = [];

  for (const request of requests) {
    if (!snapshot.nodesById.has(request.id)) {
      throw new NoteTreeError('NOTE_TREE_NODE_NOT_FOUND', '笔记不存在', 404, { id: request.id });
    }
    const descendantIds = resolveNoteDescendantIdsFromSnapshot(snapshot, request.id);
    if (descendantIds.length !== request.expectedDescendantCount) {
      throw new NoteTreeError('NOTE_TREE_DELETE_CONFLICT', '页面数量已变化，请重新确认', 409, {
        id: request.id,
        expectedDescendantCount: request.expectedDescendantCount,
        actualDescendantCount: descendantIds.length,
        totalCount: descendantIds.length + 1,
      });
    }
    validated.push({ ...request, descendantIds });
  }

  const selectedIds = new Set(validated.map((item) => item.id));
  const effectiveRoots = validated.filter((item) => !hasSelectedAncestor(snapshot, item.id, selectedIds));
  const results = [];
  const deletedIds = [];

  for (const root of effectiveRoots) {
    const subtreeIds = [root.id, ...root.descendantIds];
    const placeholders = subtreeIds.map(() => '?').join(',');
    const batchId = randomUUID();
    const [result] = await db.query(
      `UPDATE note
          SET del_flag = 1, deleted_at = NOW(), tree_delete_batch_id = ?
        WHERE create_by = ? AND del_flag = 0 AND id IN (${placeholders})`,
      [batchId, normalizedUserId, ...subtreeIds],
    );
    if (Number(result?.affectedRows || 0) !== subtreeIds.length) {
      throw new NoteTreeError('NOTE_TREE_DELETE_CONFLICT', '页面状态已变化，请刷新后重试', 409, {
        id: root.id,
        expectedTotalCount: subtreeIds.length,
        actualUpdatedCount: Number(result?.affectedRows || 0),
      });
    }
    deletedIds.push(...subtreeIds);
    results.push({
      id: root.id,
      batchId,
      descendantCount: root.descendantIds.length,
      totalCount: subtreeIds.length,
    });
  }

  await removeInboxRelations(db, {
    userId: normalizedUserId,
    items: deletedIds.map((resourceId) => ({ resourceType: 'note', resourceId })),
  });

  return {
    items: results,
    requestedCount: requests.length,
    rootCount: results.length,
    deletedCount: deletedIds.length,
  };
}

function normalizeDeletedNoteRow(row = {}) {
  const id = normalizeId(row.id);
  if (!id) return null;
  return {
    id,
    parentId: normalizeParentId(row.parentId ?? row.parent_id),
    treeDeleteBatchId: normalizeId(row.treeDeleteBatchId ?? row.tree_delete_batch_id),
  };
}

function buildDeletedSelectionWhere({ userId, ids = [], time = null, restoreAll = false }) {
  let where = 'create_by = ? AND del_flag = 1';
  const params = [userId];
  if (!restoreAll && ids.length) {
    where += ` AND id IN (${ids.map(() => '?').join(',')})`;
    params.push(...ids);
  }
  if (!restoreAll && time) {
    where += ' AND deleted_at >= ? AND deleted_at <= ?';
    params.push(time.start, time.end);
  }
  return { where, params };
}

async function collectOwnedDeletedNoteBatchRows(
  db,
  { userId, ids = [], time = null, restoreAll = false, lock = false } = {},
) {
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) throw new NoteTreeError('NOTE_TREE_USER_REQUIRED', '缺少用户身份', 401);
  const normalizedIds = normalizeNoteIdList(ids, { required: false });
  if (!restoreAll && normalizedIds.length === 0 && !time) {
    throw new NoteTreeError('NOTE_TREE_RESTORE_FILTER_REQUIRED', '缺少恢复范围', 400);
  }
  const { where, params } = buildDeletedSelectionWhere({
    userId: normalizedUserId,
    ids: normalizedIds,
    time,
    restoreAll,
  });
  const lockSql = lock ? ' FOR UPDATE' : '';
  const [selectedRows] = await db.query(
    `SELECT id, parent_id, tree_delete_batch_id
       FROM note
      WHERE ${where}${lockSql}`,
    params,
  );
  const selected = selectedRows.map(normalizeDeletedNoteRow).filter(Boolean);
  if (selected.length === 0 || restoreAll) return selected;

  const batchIds = [...new Set(selected.map((row) => row.treeDeleteBatchId).filter(Boolean))];
  if (batchIds.length === 0) return selected;
  const placeholders = batchIds.map(() => '?').join(',');
  const [batchRows] = await db.query(
    `SELECT id, parent_id, tree_delete_batch_id
       FROM note
      WHERE create_by = ? AND del_flag = 1 AND tree_delete_batch_id IN (${placeholders})${lockSql}`,
    [normalizedUserId, ...batchIds],
  );
  const byId = new Map(selected.map((row) => [row.id, row]));
  for (const row of batchRows.map(normalizeDeletedNoteRow).filter(Boolean)) byId.set(row.id, row);
  return [...byId.values()];
}

function findRestoreCycleIds(rowsById) {
  const cycleIds = new Set();
  const settled = new Set();
  for (const startId of rowsById.keys()) {
    if (settled.has(startId)) continue;
    const path = [];
    const pathIndex = new Map();
    let currentId = startId;
    while (currentId && rowsById.has(currentId) && !settled.has(currentId)) {
      const seenAt = pathIndex.get(currentId);
      if (seenAt !== undefined) {
        for (const id of path.slice(seenAt)) cycleIds.add(id);
        break;
      }
      pathIndex.set(currentId, path.length);
      path.push(currentId);
      currentId = rowsById.get(currentId)?.parentId || null;
    }
    for (const id of path) settled.add(id);
  }
  return cycleIds;
}

function buildRestoreChildren(rowsById, reparentIds) {
  const children = new Map();
  for (const row of rowsById.values()) {
    if (reparentIds.has(row.id) || !row.parentId || !rowsById.has(row.parentId)) continue;
    if (!children.has(row.parentId)) children.set(row.parentId, []);
    children.get(row.parentId).push(row.id);
  }
  return children;
}

function resolveRestoreReparentIds({ rows, activeSnapshot }) {
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const reparentIds = findRestoreCycleIds(rowsById);

  for (const row of rowsById.values()) {
    if (!row.parentId || rowsById.has(row.parentId)) continue;
    const activeParent = activeSnapshot.nodesById.get(row.parentId);
    if (!activeParent || activeParent.invalidParent) reparentIds.add(row.id);
  }

  // 目录在删除期间可能被移动得更深，历史坏数据也可能本就超过当前上限。
  // 逐轮把越界分支提升到根，直到所有恢复节点都落在 1..MAX_NOTE_TREE_DEPTH。
  let changed = true;
  while (changed) {
    changed = false;
    const childrenByParent = buildRestoreChildren(rowsById, reparentIds);
    const roots = [...rowsById.values()].filter(
      (row) => reparentIds.has(row.id) || !row.parentId || !rowsById.has(row.parentId),
    );
    for (const root of roots) {
      let rootDepth = 1;
      if (!reparentIds.has(root.id) && root.parentId) {
        const activeParent = activeSnapshot.nodesById.get(root.parentId);
        if (!activeParent || activeParent.invalidParent) {
          reparentIds.add(root.id);
          changed = true;
          continue;
        }
        rootDepth = resolveNoteDepthFromSnapshot(activeSnapshot, activeParent.id) + 1;
      }
      const queue = [{ id: root.id, depth: rootDepth }];
      const visited = new Set();
      while (queue.length) {
        const current = queue.shift();
        if (visited.has(current.id)) continue;
        visited.add(current.id);
        if (current.depth > MAX_NOTE_TREE_DEPTH) {
          if (!reparentIds.has(current.id)) {
            reparentIds.add(current.id);
            changed = true;
          }
          continue;
        }
        for (const childId of childrenByParent.get(current.id) || []) {
          queue.push({ id: childId, depth: current.depth + 1 });
        }
      }
    }
  }
  return reparentIds;
}

export async function previewOwnedNoteTrashRestore({
  userId,
  ids = [],
  time = null,
  restoreAll = false,
  db = pool,
} = {}) {
  const rows = await collectOwnedDeletedNoteBatchRows(queryDb(db), { userId, ids, time, restoreAll });
  return {
    count: rows.length,
    batchCount: new Set(rows.map((row) => row.treeDeleteBatchId).filter(Boolean)).size,
  };
}

/**
 * 在调用方事务内恢复删除批次。恢复范围只会从命中的批次向内扩展，不会沿 parent_id
 * 把更早、不同批次删除的子页面一并恢复。若原父页面已物理删除、仍在其他删除批次，
 * 或移动后深度不再合法，则把当前恢复分支提升到根目录，保证活动树始终可见且无环。
 */
export async function restoreOwnedNoteTrash(
  connection,
  { userId, ids = [], time = null, restoreAll = false } = {},
) {
  const db = queryDb(connection);
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) throw new NoteTreeError('NOTE_TREE_USER_REQUIRED', '缺少用户身份', 401);
  // 全部页面树写路径统一先锁活动树，再锁删除行，降低并发移动/恢复间的死锁概率。
  const activeSnapshot = await loadOwnedNoteTree(normalizedUserId, { db, lock: true });
  const rows = await collectOwnedDeletedNoteBatchRows(db, {
    userId: normalizedUserId,
    ids,
    time,
    restoreAll,
    lock: true,
  });
  if (rows.length === 0) return { count: 0, batchCount: 0, rerootedCount: 0, ids: [] };

  const reparentIds = [...resolveRestoreReparentIds({ rows, activeSnapshot })];
  if (reparentIds.length) {
    const placeholders = reparentIds.map(() => '?').join(',');
    await db.query(
      `UPDATE note
          SET parent_id = NULL, update_time = update_time
        WHERE create_by = ? AND del_flag = 1 AND id IN (${placeholders})`,
      [normalizedUserId, ...reparentIds],
    );
  }

  const restoreIds = rows.map((row) => row.id);
  const placeholders = restoreIds.map(() => '?').join(',');
  const [result] = await db.query(
    `UPDATE note
        SET del_flag = 0, deleted_at = NULL, tree_delete_batch_id = NULL, update_time = update_time
      WHERE create_by = ? AND del_flag = 1 AND id IN (${placeholders})`,
    [normalizedUserId, ...restoreIds],
  );
  if (Number(result?.affectedRows || 0) !== restoreIds.length) {
    throw new NoteTreeError('NOTE_TREE_RESTORE_CONFLICT', '页面状态已变化，请刷新后重试', 409, {
      expectedCount: restoreIds.length,
      actualUpdatedCount: Number(result?.affectedRows || 0),
    });
  }
  return {
    count: restoreIds.length,
    batchCount: new Set(rows.map((row) => row.treeDeleteBatchId).filter(Boolean)).size,
    rerootedCount: reparentIds.length,
    ids: restoreIds,
  };
}

/**
 * 解析笔记物理删除的权威范围并提前解除外部子节点的 parent_id。
 * 同批次节点一起删除；不同批次（例如更早单删的子页面）不会被误删，而是提升到根。
 */
export async function prepareOwnedNotePhysicalDelete(connection, { userId, ids } = {}) {
  const db = queryDb(connection);
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) throw new NoteTreeError('NOTE_TREE_USER_REQUIRED', '缺少用户身份', 401);
  const normalizedIds = normalizeNoteIdList(ids);
  // 与移动/删除/恢复保持相同锁顺序：活动树在前，回收站批次在后。
  await loadOwnedNoteTree(normalizedUserId, { db, lock: true });
  const rows = await collectOwnedDeletedNoteBatchRows(db, {
    userId: normalizedUserId,
    ids: normalizedIds,
    lock: true,
  });
  const deleteIds = rows.map((row) => row.id);
  if (deleteIds.length === 0) return { ids: [], expandedCount: 0, rerootedCount: 0 };

  const placeholders = deleteIds.map(() => '?').join(',');
  const [reparentResult] = await db.query(
    `UPDATE note
        SET parent_id = NULL, update_time = update_time
      WHERE create_by = ?
        AND parent_id IN (${placeholders})
        AND id NOT IN (${placeholders})`,
    [normalizedUserId, ...deleteIds, ...deleteIds],
  );
  return {
    ids: deleteIds,
    expandedCount: Math.max(0, deleteIds.length - normalizedIds.length),
    rerootedCount: Number(reparentResult?.affectedRows || 0),
  };
}
