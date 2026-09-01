const RESOURCE_TYPES = Object.freeze(['bookmark', 'note', 'file']);

function requireUserId(value) {
  const userId = String(value || '').trim();
  if (!userId) {
    const error = new Error('USER_REQUIRED');
    error.code = 'USER_REQUIRED';
    throw error;
  }
  return userId;
}

function normalizeTagId(value) {
  const tagId = String(value || '').trim();
  return tagId === 'add' ? '' : tagId.slice(0, 255);
}

function normalizeResources(rows, type, nameKey) {
  return (rows || []).map((row) => ({
    rawId: String(row?.id ?? ''),
    name: String(row?.[nameKey] || ''),
    type,
  }));
}

function normalizeSelectedIds(rows, activeResourceIds = {}) {
  const selectedIds = { bookmark: [], note: [], file: [] };
  for (const row of rows || []) {
    const type = String(row?.resource_type || '');
    if (!RESOURCE_TYPES.includes(type)) continue;
    const resourceId = String(row.resource_id);
    if (!activeResourceIds[type]?.has(resourceId)) continue;
    selectedIds[type].push(resourceId);
  }
  return selectedIds;
}

/**
 * 标签新增/编辑弹框的轻量初始化读模型。
 *
 * 这里只读取表单实际消费的字段，避免复用业务列表接口时重复计算正文预览、标签聚合、
 * 文件元数据与待整理状态。五个只读查询由连接池并发执行；现有 owner / relation 索引即可覆盖。
 */
export async function getTagEditorBootstrap(db, { userId: rawUserId, tagId: rawTagId } = {}) {
  const userId = requireUserId(rawUserId);
  const tagId = normalizeTagId(rawTagId);

  const tagQuery = tagId
    ? db.query(
        `SELECT t.id, t.name, t.description, t.icon_url, t.sort, t.create_time
           FROM tag t
          WHERE t.id = ? AND t.user_id = ? AND t.del_flag = 0
          LIMIT 1`,
        [tagId, userId],
      )
    : Promise.resolve([[]]);
  const bookmarkQuery = db.query(
    `SELECT b.id, b.name
       FROM bookmark b
      WHERE b.user_id = ? AND b.del_flag = 0
      ORDER BY b.is_top DESC, b.sort, b.create_time DESC, b.id DESC`,
    [userId],
  );
  const noteQuery = db.query(
    `SELECT n.id, n.title
       FROM note n
      WHERE n.create_by = ? AND n.del_flag = 0
      ORDER BY n.is_top DESC, n.sort, n.update_time DESC, n.id DESC`,
    [userId],
  );
  const fileQuery = db.query(
    `SELECT f.id, f.file_name
       FROM files f
      WHERE f.create_by = ? AND f.del_flag = 0
      ORDER BY f.create_time DESC, f.id DESC`,
    [userId],
  );
  const relationQuery = tagId
    ? db.query(
        `SELECT r.resource_type, r.resource_id
           FROM resource_tag_relations r
          WHERE r.user_id = ? AND r.tag_id = ?
            AND r.resource_type IN ('bookmark', 'note', 'file')`,
        [userId, tagId],
      )
    : Promise.resolve([[]]);

  const [[tagRows], [bookmarkRows], [noteRows], [fileRows], [relationRows]] = await Promise.all([
    tagQuery,
    bookmarkQuery,
    noteQuery,
    fileQuery,
    relationQuery,
  ]);

  if (tagId && !tagRows?.length) return null;

  const activeResourceIds = {
    bookmark: new Set((bookmarkRows || []).map((row) => String(row.id))),
    note: new Set((noteRows || []).map((row) => String(row.id))),
    file: new Set((fileRows || []).map((row) => String(row.id))),
  };

  return {
    tag: tagRows?.[0] || null,
    resources: [
      ...normalizeResources(bookmarkRows, 'bookmark', 'name'),
      ...normalizeResources(noteRows, 'note', 'title'),
      ...normalizeResources(fileRows, 'file', 'file_name'),
    ],
    // 关系表可能保留已删除资源的恢复关系。编辑器只能提交当前仍可编辑的候选资源，
    // 否则不可见的历史 ID 会在保存时触发归属校验，导致用户无法修改标签本身。
    selectedIds: normalizeSelectedIds(relationRows, activeResourceIds),
  };
}
