import { resolveOwnedResourceRefSummaries, validateOwnedResourceRefs } from './noteReferenceService.js';

/**
 * 待办「参考资料」关系的唯一读写入口。
 *
 * 归属校验与标题解析复用 noteReferenceService 里已经过测试的实现,
 * 这里只负责待办侧的规范化、事务内替换与批量 hydration。
 */

const TARGET_TYPES = new Set(['bookmark', 'note', 'file']);
export const MAX_TODO_RESOURCE_REFS = 10;
const MAX_TARGET_ID_LENGTH = 255;

export function referenceError(message, status = 400, code = 'TODO_REFERENCE_INVALID') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

/** 规范化入参:类型白名单 + ID 长度 + 去重 + 数量上限,任一非法整体拒绝。 */
export function normalizeTodoResourceRefs(values) {
  if (values === undefined || values === null) return null;
  if (!Array.isArray(values)) throw referenceError('参考资料格式不正确');

  const seen = new Set();
  const refs = [];
  for (const value of values) {
    const type = String(value?.type || '').toLowerCase();
    const id = value?.id === undefined || value?.id === null ? '' : String(value.id);
    if (!TARGET_TYPES.has(type)) throw referenceError('参考资料类型不支持');
    if (!id || id.length > MAX_TARGET_ID_LENGTH) throw referenceError('参考资料标识不合法');
    const key = `${type}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ type, id });
  }
  if (refs.length > MAX_TODO_RESOURCE_REFS) {
    throw referenceError(`单条待办最多关联 ${MAX_TODO_RESOURCE_REFS} 个参考资料`);
  }
  return refs;
}

/**
 * 在调用方事务内整体替换某待办的参考资料。
 * 任一引用不属于当前用户即抛错,由外层事务回滚,不留半条关系。
 */
export async function replaceTodoResourceRefs(connection, { userId, todoId, refs } = {}) {
  const ownerId = String(userId || '').trim();
  const targetTodoId = String(todoId || '').trim();
  if (!ownerId || !targetTodoId) return { count: 0 };

  const normalized = Array.isArray(refs) ? refs : [];
  await connection.query('DELETE FROM todo_resource_refs WHERE todo_id = ? AND user_id = ?', [targetTodoId, ownerId]);
  if (!normalized.length) return { count: 0 };

  const valid = await validateOwnedResourceRefs(connection, { userId: ownerId, refs: normalized });
  const validMap = new Map(valid.map((item) => [`${item.type}:${item.id}`, item]));
  const missing = normalized.filter((ref) => !validMap.has(`${ref.type}:${ref.id}`));
  if (missing.length) throw referenceError('部分参考资料不存在或无权访问', 403, 'TODO_REFERENCE_FORBIDDEN');

  const rows = normalized.map((ref, index) => [
    targetTodoId,
    ownerId,
    ref.type,
    ref.id,
    String(validMap.get(`${ref.type}:${ref.id}`)?.name || '').slice(0, MAX_TARGET_ID_LENGTH),
    index,
  ]);
  await connection.query(
    `INSERT INTO todo_resource_refs
       (todo_id, user_id, target_type, target_id, target_name_snapshot, sort_order)
     VALUES ?`,
    [rows],
  );
  return { count: rows.length };
}

/**
 * 批量读取多条待办的参考资料。列表页一次查询取回当前页全部引用,再在内存分组,避免 N+1。
 * @returns Map<todoId, Array<{type,id,title,snapshotTitle,available}>>
 */
export async function loadTodoResourceRefMap(db, { userId, todoIds } = {}) {
  const ownerId = String(userId || '').trim();
  const ids = [...new Set((Array.isArray(todoIds) ? todoIds : []).map((id) => String(id || '')).filter(Boolean))];
  if (!ownerId || !ids.length) return new Map();

  const [rows] = await db.query(
    `SELECT todo_id AS todoId, target_type AS type, target_id AS id,
            target_name_snapshot AS snapshotTitle, sort_order AS sortOrder
       FROM todo_resource_refs
      WHERE user_id = ? AND todo_id IN (${ids.map(() => '?').join(',')})
      ORDER BY todo_id, sort_order, target_type, target_id`,
    [ownerId, ...ids],
  );
  if (!rows.length) return new Map();

  // 标题按当前权限实时解析:目标被删除或转移后显示为不可用,不泄露其他账号资源的存在性
  const summaries = await resolveOwnedResourceRefSummaries(db, {
    userId: ownerId,
    refs: rows.map((row) => ({ type: row.type, id: row.id })),
  });

  const result = new Map();
  rows.forEach((row, index) => {
    const summary = summaries[index] || {};
    const list = result.get(String(row.todoId)) || [];
    list.push({
      type: row.type,
      id: String(row.id),
      title: summary.available ? summary.title : row.snapshotTitle || '',
      snapshotTitle: row.snapshotTitle || '',
      available: Boolean(summary.available),
      ...(summary.available && summary.url ? { url: summary.url } : {}),
    });
    result.set(String(row.todoId), list);
  });
  return result;
}

/** 重复任务生成下一实例时复制参考资料,顺序保持一致。 */
export async function copyTodoResourceRefs(connection, { userId, fromTodoId, toTodoId } = {}) {
  const ownerId = String(userId || '').trim();
  const source = String(fromTodoId || '').trim();
  const target = String(toTodoId || '').trim();
  if (!ownerId || !source || !target || source === target) return { count: 0 };

  const [result] = await connection.query(
    `INSERT INTO todo_resource_refs
       (todo_id, user_id, target_type, target_id, target_name_snapshot, sort_order)
     SELECT ?, user_id, target_type, target_id, target_name_snapshot, sort_order
       FROM todo_resource_refs
      WHERE todo_id = ? AND user_id = ?`,
    [target, source, ownerId],
  );
  return { count: Number(result?.affectedRows || 0) };
}
