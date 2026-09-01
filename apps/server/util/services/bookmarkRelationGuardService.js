const GUARD_DEFINITIONS = Object.freeze([
  {
    key: 'snapshot',
    label: '网页快照',
    sql: `SELECT bookmark_id AS bookmarkId, COUNT(*) AS total
            FROM bookmark_snapshot
           WHERE user_id = ? AND bookmark_id IN ({ids})
           GROUP BY bookmark_id`,
  },
  {
    key: 'noteReference',
    label: '笔记引用',
    sql: `SELECT target_id AS bookmarkId, COUNT(*) AS total
            FROM note_resource_refs
           WHERE source_user_id = ? AND target_type = 'bookmark' AND target_id IN ({ids})
           GROUP BY target_id`,
  },
  {
    key: 'todoReference',
    label: '待办引用',
    sql: `SELECT target_id AS bookmarkId, COUNT(*) AS total
            FROM todo_resource_refs
           WHERE user_id = ? AND target_type = 'bookmark' AND target_id IN ({ids})
           GROUP BY target_id`,
  },
  {
    key: 'todoSeriesReference',
    label: '系列待办引用',
    sql: `SELECT resource_id AS bookmarkId, COUNT(*) AS total
            FROM todo_series_resource_refs
           WHERE user_id = ? AND resource_type = 'bookmark' AND resource_id IN ({ids})
           GROUP BY resource_id`,
  },
]);

function emptyGuard() {
  return {
    snapshot: 0,
    noteReference: 0,
    todoReference: 0,
    todoSeriesReference: 0,
    blockers: [],
    blockerCount: 0,
  };
}

/**
 * 阻断注册表是重复治理的失败关闭边界：任何一张已登记关系表查询失败，调用方都不能继续删除。
 */
export async function queryBookmarkRelationGuards(db, { userId, bookmarkIds = [], lock = false }) {
  const ids = [...new Set(bookmarkIds.map(String).filter(Boolean))];
  const guards = new Map(ids.map((id) => [id, emptyGuard()]));
  if (!ids.length) return guards;
  const placeholders = ids.map(() => '?').join(',');
  for (const definition of GUARD_DEFINITIONS) {
    const sql = `${definition.sql.replace('{ids}', placeholders)}${lock ? ' FOR UPDATE' : ''}`;
    const [rows] = await db.query(sql, [userId, ...ids]);
    rows.forEach((row) => {
      const id = String(row.bookmarkId ?? row.bookmark_id ?? '');
      const guard = guards.get(id);
      if (guard) guard[definition.key] = Number(row.total || 0);
    });
  }
  guards.forEach((guard) => {
    guard.blockers = GUARD_DEFINITIONS.filter((definition) => guard[definition.key] > 0).map((definition) => ({
      code: definition.key,
      label: definition.label,
      count: guard[definition.key],
    }));
    guard.blockerCount = guard.blockers.reduce((sum, blocker) => sum + blocker.count, 0);
  });
  return guards;
}
