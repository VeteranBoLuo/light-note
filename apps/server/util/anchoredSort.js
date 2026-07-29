const RESOURCE_SORT_CONFIG = {
  bookmark: {
    table: 'bookmark',
    ownerColumn: 'user_id',
    fallbackOrder: 'create_time DESC',
    updateSql: 'UPDATE bookmark SET sort = ? WHERE id = ? AND user_id = ? AND del_flag = 0',
  },
  note: {
    table: 'note',
    ownerColumn: 'create_by',
    fallbackOrder: 'COALESCE(update_time, create_time) DESC',
    // 笔记的 update_time 可能配置为 ON UPDATE；排序不应伪装成正文更新时间。
    updateSql: 'UPDATE note SET sort = ?, update_time = update_time WHERE id = ? AND create_by = ? AND del_flag = 0',
  },
};

function normalizeId(value) {
  return String(value ?? '').trim();
}

function samePinnedGroup(left, right) {
  return Number(Boolean(Number(left?.isTop))) === Number(Boolean(Number(right?.isTop)));
}

export class AnchoredSortError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AnchoredSortError';
    this.code = code;
  }
}

/**
 * 按相邻资源锚点移动单个条目。
 *
 * 前端分页后只掌握已加载前缀，不能再把这段数据从 0 开始整体编号，否则会
 * 与未加载资源的 sort 冲突。这里在事务内仅查询轻量排序字段，找到资源在
 * 全局同置顶分组中的真实位置，再重排该分组；未加载资源的相对顺序保持不变。
 */
export async function moveOwnedResourceByAnchors(
  connection,
  { resourceType, userId, id, previousId = null, nextId = null },
) {
  const config = RESOURCE_SORT_CONFIG[resourceType];
  if (!config) {
    throw new AnchoredSortError('UNSUPPORTED_RESOURCE_TYPE', '不支持的资源类型');
  }

  const movedId = normalizeId(id);
  const normalizedUserId = normalizeId(userId);
  const normalizedPreviousId = normalizeId(previousId);
  const normalizedNextId = normalizeId(nextId);
  if (!movedId || !normalizedUserId) {
    throw new AnchoredSortError('INVALID_SORT_MOVE', '排序参数无效');
  }

  const [rows] = await connection.query(
    `
      SELECT id, COALESCE(is_top, 0) AS isTop, sort
      FROM ${config.table}
      WHERE ${config.ownerColumn} = ? AND del_flag = 0
      ORDER BY COALESCE(is_top, 0) DESC, sort, ${config.fallbackOrder}, id DESC
      FOR UPDATE
    `,
    [normalizedUserId],
  );

  const moved = rows.find((row) => normalizeId(row.id) === movedId);
  if (!moved) {
    throw new AnchoredSortError('RESOURCE_NOT_FOUND', '资源不存在');
  }

  const group = rows.filter((row) => samePinnedGroup(row, moved));
  const originalIds = group.map((row) => normalizeId(row.id));
  const reordered = group.filter((row) => normalizeId(row.id) !== movedId);
  if (!reordered.length) {
    return { id: movedId, moved: false, updatedCount: 0 };
  }

  let insertIndex = -1;
  if (normalizedPreviousId) {
    const previousIndex = reordered.findIndex(
      (row) => normalizeId(row.id) === normalizedPreviousId && samePinnedGroup(row, moved),
    );
    if (previousIndex >= 0) insertIndex = previousIndex + 1;
  }
  if (insertIndex < 0 && normalizedNextId) {
    const nextIndex = reordered.findIndex(
      (row) => normalizeId(row.id) === normalizedNextId && samePinnedGroup(row, moved),
    );
    if (nextIndex >= 0) insertIndex = nextIndex;
  }
  if (insertIndex < 0) {
    throw new AnchoredSortError('INVALID_SORT_ANCHOR', '排序锚点已失效');
  }

  reordered.splice(insertIndex, 0, moved);
  const reorderedIds = reordered.map((row) => normalizeId(row.id));
  if (originalIds.every((resourceId, index) => resourceId === reorderedIds[index])) {
    return { id: movedId, moved: false, updatedCount: 0 };
  }

  let updatedCount = 0;
  for (const [index, row] of reordered.entries()) {
    if (Number(row.sort) === index) continue;
    const [updateResult] = await connection.query(config.updateSql, [index, row.id, normalizedUserId]);
    updatedCount += Number(updateResult?.affectedRows || 0);
  }

  return {
    id: movedId,
    moved: true,
    updatedCount,
  };
}
