/**
 * 把会被后续删除/重开的业务关系固化为零经验成长事件。
 * ref_id 只保存不可逆哈希，不写标题、正文、路径或原始资源 ID；INSERT IGNORE 保证同一事实幂等。
 */
const TODO_ACTIVITY_PHASES = Object.freeze({
  create: Object.freeze({
    source: 'todo_create',
    refPrefix: 'todo_create:',
    kind: 'todo_create',
    timeColumn: 'create_time',
    condition: '',
  }),
  complete: Object.freeze({
    source: 'todo_complete',
    // C5 已使用 todo: 生成完成事实哈希；保留前缀才能继续幂等，避免重开后再次完成产生重复事实。
    refPrefix: 'todo:',
    kind: 'todo',
    timeColumn: 'completed_at',
    condition: 'AND completed_at IS NOT NULL',
  }),
});

async function recordTodoActivity(db, { userId, todoId, phase }) {
  const activity = TODO_ACTIVITY_PHASES[phase];
  if (!activity) throw new Error('INVALID_TODO_ACTIVITY_PHASE');
  await db.query(
    `INSERT IGNORE INTO growth_events
       (user_id, source, ref_id, day, amount, status, meta, create_time)
     SELECT ?, ?, SHA2(CONCAT(?, CAST(id AS CHAR)), 256), NULL, 0, 'granted',
            JSON_OBJECT('kind', ?, 'meaningful', true), ${activity.timeColumn}
       FROM todo_items
      WHERE id = ? AND user_id = ? ${activity.condition}
      LIMIT 1`,
    [String(userId), activity.source, activity.refPrefix, activity.kind, String(todoId), String(userId)],
  );
}

export const recordTodoCreation = (db, input) => recordTodoActivity(db, { ...input, phase: 'create' });
export const recordTodoCompletion = (db, input) => recordTodoActivity(db, { ...input, phase: 'complete' });

export async function recordOrganizeCompletions(db, { userId, resourceType, resourceIds }) {
  const ids = [...new Set((Array.isArray(resourceIds) ? resourceIds : []).map(String).filter(Boolean))];
  if (!ids.length) return;
  const placeholders = ids.map(() => '?').join(',');
  await db.query(
    `INSERT IGNORE INTO growth_events
       (user_id, source, ref_id, day, amount, status, meta, create_time)
     SELECT ri.user_id, 'organize_complete',
            SHA2(CONCAT('organize:', ri.resource_type, ':', ri.resource_id), 256),
            NULL, 0, 'granted', JSON_OBJECT('kind', 'organize', 'meaningful', true), ri.complete_time
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
