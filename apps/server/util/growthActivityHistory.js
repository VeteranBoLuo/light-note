/**
 * 把会被后续删除/重开的业务关系固化为零经验成长事件。
 * ref_id 只保存不可逆哈希，不写标题、正文、路径或原始资源 ID；INSERT IGNORE 保证同一事实幂等。
 */
export async function recordTodoCompletion(db, { userId, todoId }) {
  await db.query(
    `INSERT IGNORE INTO growth_events
       (user_id, source, ref_id, day, amount, status, meta, create_time)
     SELECT ?, 'todo_complete', SHA2(CONCAT('todo:', CAST(id AS CHAR)), 256), NULL, 0, 'granted',
            JSON_OBJECT('kind', 'todo'), completed_at
       FROM todo_items
      WHERE id = ? AND user_id = ? AND completed_at IS NOT NULL
      LIMIT 1`,
    [String(userId), String(todoId), String(userId)],
  );
}

export async function recordOrganizeCompletions(db, { userId, resourceType, resourceIds }) {
  const ids = [...new Set((Array.isArray(resourceIds) ? resourceIds : []).map(String).filter(Boolean))];
  if (!ids.length) return;
  const placeholders = ids.map(() => '?').join(',');
  await db.query(
    `INSERT IGNORE INTO growth_events
       (user_id, source, ref_id, day, amount, status, meta, create_time)
     SELECT ri.user_id, 'organize_complete',
            SHA2(CONCAT('organize:', ri.resource_type, ':', ri.resource_id), 256),
            NULL, 0, 'granted', JSON_OBJECT('kind', 'organize'), ri.complete_time
       FROM resource_inbox ri
      WHERE ri.user_id = ? AND ri.resource_type = ? AND ri.status = 'completed'
        AND ri.complete_time IS NOT NULL AND ri.resource_id IN (${placeholders})
        AND NOT EXISTS (
          SELECT 1 FROM onboarding_seed_resources osr
           WHERE osr.user_id = ri.user_id AND osr.resource_type = ri.resource_type
             AND osr.resource_id = ri.resource_id
        )`,
    [String(userId), String(resourceType), ...ids],
  );
}
