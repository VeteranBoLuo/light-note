const RESOURCE_SORT_CONFIG = {
  bookmark: {
    table: 'bookmark',
    ownerColumn: 'user_id',
    fallbackOrder: 'create_time DESC',
  },
  note: {
    table: 'note',
    ownerColumn: 'create_by',
    scopeColumn: 'parent_id',
    fallbackOrder: 'COALESCE(update_time, create_time) DESC',
    // 笔记的 update_time 可能配置为 ON UPDATE；排序不应伪装成正文更新时间。
    updateSql:
      'UPDATE note SET sort = ?, update_time = update_time WHERE id = ? AND create_by = ? AND del_flag = 0 AND parent_id <=> ?',
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

export async function writeResourceSortBatches(
  connection,
  table,
  userId,
  changes,
  { batchSize = 50, includeDeleted = false } = {},
) {
  if (table !== 'tag' && table !== 'bookmark') throw new Error('INVALID_SORT_TABLE');
  const activeFilter = includeDeleted ? '' : ' AND del_flag = 0';
  let updatedCount = 0;
  for (let offset = 0; offset < changes.length; offset += batchSize) {
    const batch = changes.slice(offset, offset + batchSize);
    const [result] = await connection.query(
      `UPDATE ${table} SET sort = CASE id ${batch.map(() => 'WHEN ? THEN ?').join(' ')} ELSE sort END
        WHERE id IN (${batch.map(() => '?').join(',')}) AND user_id = ?${activeFilter}`,
      [...batch.flatMap(({ id, sort }) => [id, sort]), ...batch.map(({ id }) => id), userId],
    );
    updatedCount += Number(result?.affectedRows || 0);
  }
  return updatedCount;
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
  { resourceType, userId, id, parentId = null, previousId = null, nextId = null, tagId = null },
) {
  const config = RESOURCE_SORT_CONFIG[resourceType];
  if (!config) {
    throw new AnchoredSortError('UNSUPPORTED_RESOURCE_TYPE', '不支持的资源类型');
  }

  const movedId = normalizeId(id);
  const normalizedUserId = normalizeId(userId);
  const normalizedPreviousId = normalizeId(previousId);
  const normalizedNextId = normalizeId(nextId);
  const normalizedParentId = normalizeId(parentId) || null;
  if (!movedId || !normalizedUserId) {
    throw new AnchoredSortError('INVALID_SORT_MOVE', '排序参数无效');
  }
  const taggedBookmarkMove = resourceType === 'bookmark' && tagId !== null;
  const normalizedTagId = typeof tagId === 'string' ? tagId.trim() : '';
  if (
    taggedBookmarkMove &&
    (!normalizedTagId || normalizedTagId.length > 255 || Boolean(normalizedPreviousId) === Boolean(normalizedNextId))
  ) {
    throw new AnchoredSortError('INVALID_SORT_MOVE', '排序参数无效');
  }

  const scopeWhere = config.scopeColumn ? ` AND ${config.scopeColumn} <=> ?` : '';
  const [rows] = await connection.query(
    `
      SELECT id, COALESCE(is_top, 0) AS isTop, sort
      FROM ${config.table}
      WHERE ${config.ownerColumn} = ? AND del_flag = 0${scopeWhere}
      ORDER BY COALESCE(is_top, 0) DESC, sort, ${config.fallbackOrder}, id DESC
      FOR UPDATE
    `,
    [normalizedUserId, ...(config.scopeColumn ? [normalizedParentId] : [])],
  );

  const moved = rows.find((row) => normalizeId(row.id) === movedId);
  if (!moved) {
    throw new AnchoredSortError('RESOURCE_NOT_FOUND', '资源不存在');
  }

  const group = rows.filter((row) => samePinnedGroup(row, moved));
  const originalIds = group.map((row) => normalizeId(row.id));
  const reordered = group.filter((row) => normalizeId(row.id) !== movedId);
  if (!reordered.length && !taggedBookmarkMove) {
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
  if (taggedBookmarkMove) {
    const [members] = await connection.query(
      `SELECT r.resource_id
         FROM resource_tag_relations r
         INNER JOIN tag t ON t.id = r.tag_id
        WHERE r.tag_id = ? AND r.resource_type = 'bookmark' AND r.resource_id IN (?, ?)
          AND r.user_id = ? AND t.user_id = ? AND t.del_flag = 0
        FOR UPDATE`,
      [normalizedTagId, movedId, normalizedPreviousId || normalizedNextId, normalizedUserId, normalizedUserId],
    );
    if (members.length !== 2) {
      throw new AnchoredSortError('BOOKMARK_SORT_TAG_CHANGED', '书签已不在当前标签下，请刷新后重试');
    }
  }

  reordered.splice(insertIndex, 0, moved);
  const reorderedIds = reordered.map((row) => normalizeId(row.id));
  if (originalIds.every((resourceId, index) => resourceId === reorderedIds[index])) {
    return { id: movedId, moved: false, updatedCount: 0 };
  }

  const changes = reordered.flatMap((row, sort) => Number(row.sort) === sort ? [] : [{ id: row.id, sort }]);
  let updatedCount;
  if (resourceType === 'bookmark') {
    updatedCount = await writeResourceSortBatches(connection, config.table, normalizedUserId, changes);
  } else {
    updatedCount = 0;
    for (const { id, sort } of changes) {
      const [result] = await connection.query(config.updateSql, [sort, id, normalizedUserId, normalizedParentId]);
      updatedCount += Number(result?.affectedRows || 0);
    }
  }

  return {
    id: movedId,
    moved: true,
    updatedCount,
  };
}
