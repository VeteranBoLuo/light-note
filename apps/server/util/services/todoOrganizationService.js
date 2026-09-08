import crypto from 'node:crypto';
import { invalidatePersonalKnowledgeCache } from '../personalKnowledgeSearch.js';

const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
export function organizationError(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}
export function normalizeTodoOrganization(input = {}) {
  const output = {};
  if (own(input, 'listId')) {
    if (input.listId !== null && (typeof input.listId !== 'string' || input.listId.length > 64)) {
      throw organizationError('TODO_LIST_INVALID', '清单无效');
    }
    output.listId = input.listId?.trim() || null;
  }
  if (own(input, 'tagIds')) {
    if (
      input.tagIds !== null &&
      (!Array.isArray(input.tagIds) ||
        input.tagIds.length > 4 ||
        input.tagIds.some((id) => typeof id !== 'string' || !id.trim() || id.length > 255))
    ) {
      throw organizationError('TODO_TAGS_INVALID', '标签格式无效，最多关联 4 个标签');
    }
    output.tagIds = [...new Set((input.tagIds || []).map((id) => id.trim()))];
  }
  return output;
}
export async function validateTodoOrganization(db, userId, input, { lock = true } = {}) {
  const value = normalizeTodoOrganization(input);
  if (value.listId) {
    const [rows] = await db.query(
      `SELECT id FROM todo_lists WHERE id = ? AND user_id = ?${lock ? ' FOR UPDATE' : ''}`,
      [value.listId, userId],
    );
    if (!rows.length) throw organizationError('TODO_LIST_FORBIDDEN', '清单不存在或无权访问', 403);
  }
  if (value.tagIds?.length) {
    const [rows] = await db.query(
      `SELECT id FROM tag WHERE id IN (?) AND user_id = ? AND del_flag = 0${lock ? ' FOR UPDATE' : ''}`,
      [value.tagIds, userId],
    );
    if (new Set(rows.map((row) => String(row.id))).size !== value.tagIds.length)
      throw organizationError('TODO_TAG_FORBIDDEN', '标签不存在或无权访问', 403);
  }
  return value;
}
export async function writeTodoOrganization(db, userId, ids, input, targetType = 'todo') {
  if (!ids.length) return;
  const value = await validateTodoOrganization(db, userId, input);
  const table = targetType === 'series' ? 'todo_series' : 'todo_items';
  if (own(value, 'listId'))
    await db.query(`UPDATE ${table} SET list_id = ?, update_time = NOW() WHERE id IN (?) AND user_id = ?`, [
      value.listId,
      ids,
      userId,
    ]);
  if (own(value, 'tagIds')) {
    await db.query('DELETE FROM todo_tag_relations WHERE target_type = ? AND target_id IN (?) AND user_id = ?', [
      targetType,
      ids,
      userId,
    ]);
    if (value.tagIds.length)
      await db.query('INSERT INTO todo_tag_relations (user_id, target_type, target_id, tag_id) VALUES ?', [
        ids.flatMap((id) => value.tagIds.map((tag) => [userId, targetType, id, tag])),
      ]);
  }
}
export async function readTodoOrganization(db, userId, id, targetType = 'todo') {
  const table = targetType === 'series' ? 'todo_series' : 'todo_items';
  const [rows] = await db.query(`SELECT list_id AS listId FROM ${table} WHERE id = ? AND user_id = ?`, [id, userId]);
  const [tags] = await db.query(
    'SELECT r.tag_id AS id FROM todo_tag_relations r INNER JOIN tag t ON t.id = r.tag_id AND t.user_id = r.user_id AND t.del_flag = 0 WHERE r.target_type = ? AND r.target_id = ? AND r.user_id = ?',
    [targetType, id, userId],
  );
  return { listId: rows[0]?.listId || null, tagIds: tags.map((tag) => String(tag.id)) };
}
export async function copyTodoOrganization(db, userId, fromId, toId, targetType = 'todo') {
  // INSERT SELECT retains only live, owned tags and never copies deleted lists.
  const table = targetType === 'series' ? 'todo_series' : 'todo_items';
  await db.query(
    `UPDATE todo_items destination INNER JOIN ${table} source ON source.id = ? AND source.user_id = destination.user_id LEFT JOIN todo_lists l ON l.id = source.list_id AND l.user_id = source.user_id SET destination.list_id = l.id WHERE destination.id = ? AND destination.user_id = ?`,
    [fromId, toId, userId],
  );
  await db.query("DELETE FROM todo_tag_relations WHERE target_type = 'todo' AND target_id = ? AND user_id = ?", [
    toId,
    userId,
  ]);
  await db.query(
    `INSERT IGNORE INTO todo_tag_relations (user_id, target_type, target_id, tag_id) SELECT r.user_id, 'todo', ?, r.tag_id FROM todo_tag_relations r INNER JOIN tag t ON t.id = r.tag_id AND t.user_id = r.user_id AND t.del_flag = 0 WHERE r.target_type = ? AND r.target_id = ? AND r.user_id = ?`,
    [toId, targetType, fromId, userId],
  );
}
export async function hydrateTodoOrganization(db, userId, items) {
  if (!items.length) return items;
  const ids = items.map((item) => item.id);
  const [rows] = await db.query(
    `SELECT i.id, l.id AS listId, l.name AS listName, l.color AS listColor FROM todo_items i LEFT JOIN todo_lists l ON l.id = i.list_id AND l.user_id = i.user_id WHERE i.id IN (?) AND i.user_id = ?`,
    [ids, userId],
  );
  const [tags] = await db.query(
    `SELECT r.target_id AS todoId, t.id, t.name FROM todo_tag_relations r INNER JOIN tag t ON t.id = r.tag_id AND t.user_id = r.user_id AND t.del_flag = 0 WHERE r.user_id = ? AND r.target_type = 'todo' AND r.target_id IN (?) ORDER BY t.sort, t.name, t.id`,
    [userId, ids],
  );
  const map = new Map(rows.map((row) => [String(row.id), row]));
  const tagMap = new Map();
  for (const tag of tags) {
    const key = String(tag.todoId);
    if (!tagMap.has(key)) tagMap.set(key, []);
    tagMap.get(key).push({ id: String(tag.id), name: tag.name });
  }
  return items.map((item) => {
    const row = map.get(String(item.id));
    return {
      ...item,
      listId: row?.listId || null,
      list: row?.listId ? { id: row.listId, name: row.listName, color: row.listColor } : null,
      tags: tagMap.get(String(item.id)) || [],
    };
  });
}
export async function updateTodoOrganization(db, userId, input) {
  const ids = [...new Set((Array.isArray(input.ids) ? input.ids : [input.id]).map((id) => String(id || '')))];
  if (!ids.length || ids.length > 100 || ids.some((id) => !id || id.length > 64))
    throw organizationError('TODO_IDS_INVALID', '请选择有效待办');
  const scope = input.scope || 'current';
  if (!['current', 'future', 'series'].includes(scope) || (scope !== 'current' && ids.length !== 1))
    throw organizationError('TODO_SCOPE_INVALID', '修改范围无效');
  if (input.tagMode && (!['add', 'remove'].includes(input.tagMode) || scope !== 'current' || !Array.isArray(input.tagIds)))
    throw organizationError('TODO_TAG_MODE_INVALID', '标签修改方式无效');
  const [rows] = await db.query(
    'SELECT id, status, series_id AS seriesId, occurrence_no AS occurrenceNo FROM todo_items WHERE id IN (?) AND user_id = ? AND del_flag = 0 FOR UPDATE',
    [ids, userId],
  );
  if (rows.length !== ids.length) throw organizationError('TODO_NOT_FOUND', '待办不存在或无权操作', 404);
  if (rows.some((row) => row.status === 'completed'))
    throw organizationError('TODO_COMPLETED_READ_ONLY', '已完成的待办不能编辑', 409);
  let targets = ids;
  if (scope !== 'current') {
    const item = rows[0];
    if (!item.seriesId) throw organizationError('TODO_NOT_SERIES', '该待办不属于重复计划');
    const [series] = await db.query('SELECT id FROM todo_series WHERE id = ? AND user_id = ? FOR UPDATE', [
      item.seriesId,
      userId,
    ]);
    if (!series.length) throw organizationError('TODO_NOT_SERIES', '旧版重复任务请逐条调整');
    const [instances] = await db.query(
      `SELECT id FROM todo_items WHERE series_id = ? AND user_id = ? AND status = 'pending' AND del_flag = 0 ${scope === 'future' ? 'AND occurrence_no >= ?' : ''} FOR UPDATE`,
      scope === 'future' ? [item.seriesId, userId, item.occurrenceNo] : [item.seriesId, userId],
    );
    targets = instances.map((item) => item.id);
    await writeTodoOrganization(db, userId, [item.seriesId], input, 'series');
  }
  if (input.tagMode) {
    const patch = normalizeTodoOrganization(input);
    for (const id of targets) {
      const current = await readTodoOrganization(db, userId, id);
      const tagIds = input.tagMode === 'add'
        ? [...new Set([...current.tagIds, ...patch.tagIds])]
        : current.tagIds.filter((tag) => !patch.tagIds.includes(tag));
      await writeTodoOrganization(db, userId, [id], { tagIds });
    }
  } else await writeTodoOrganization(db, userId, targets, input);
  await invalidatePersonalKnowledgeCache(userId, { database: db });
  return { affected: targets.length };
}
export async function listTodoLists(db, userId) {
  const [rows] = await db.query(
    `SELECT l.id, l.name, l.color, l.create_time AS createdAt, SUM(i.status = 'pending') AS pendingTotal, SUM(i.status = 'completed') AS completedTotal FROM todo_lists l LEFT JOIN todo_items i ON i.list_id = l.id AND i.user_id = l.user_id AND i.status IN ('pending', 'completed') AND i.del_flag = 0 AND COALESCE(i.instance_state, 'normal') = 'normal' WHERE l.user_id = ? GROUP BY l.id ORDER BY l.create_time, l.id`,
    [userId],
  );
  return rows.map((row) => ({ ...row, pendingTotal: Number(row.pendingTotal || 0), completedTotal: Number(row.completedTotal || 0) }));
}
export async function saveTodoList(db, userId, input) {
  const name = String(input.name || '').trim();
  const color = String(input.color || '#6554ed');
  if (!name || name.length > 40 || !/^#[0-9a-f]{6}$/i.test(color))
    throw organizationError('TODO_LIST_INVALID', '清单名称或颜色无效');
  const id = input.id ? String(input.id) : crypto.randomUUID();
  if (input.id) {
    const [rows] = await db.query('SELECT id FROM todo_lists WHERE id = ? AND user_id = ? FOR UPDATE', [id, userId]);
    if (!rows.length) throw organizationError('TODO_LIST_NOT_FOUND', '清单不存在', 404);
    await db.query('UPDATE todo_lists SET name = ?, color = ? WHERE id = ? AND user_id = ?', [name, color, id, userId]);
  } else
    await db.query('INSERT INTO todo_lists (id, user_id, name, color) VALUES (?, ?, ?, ?)', [id, userId, name, color]);
  return { id, name, color };
}
export async function deleteTodoList(db, userId, id) {
  const [rows] = await db.query('SELECT id FROM todo_lists WHERE id = ? AND user_id = ? FOR UPDATE', [id, userId]);
  if (!rows.length) throw organizationError('TODO_LIST_NOT_FOUND', '清单不存在', 404);
  for (const table of ['todo_items', 'todo_series'])
    await db.query(`UPDATE ${table} SET list_id = NULL WHERE list_id = ? AND user_id = ?`, [id, userId]);
  await db.query('DELETE FROM todo_lists WHERE id = ? AND user_id = ?', [id, userId]);
  return { id };
}

export function todoOrganizationFilters(input = {}, alias = 'todo_items') {
  const where = [],
    params = [];
  if (own(input, 'listId')) {
    if (input.listId) {
      where.push(`${alias}.list_id = ?`);
      params.push(String(input.listId));
    } else where.push(`${alias}.list_id IS NULL`);
  }
  const scopes = {
    today: `${alias}.due_at >= CURDATE() AND ${alias}.due_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)`,
    week: `${alias}.due_at >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY) AND ${alias}.due_at < DATE_ADD(CURDATE(), INTERVAL (7 - WEEKDAY(CURDATE())) DAY)`,
    important: `${alias}.priority = 2`,
    overdue: `${alias}.due_at < NOW()`,
    scheduled: `(${alias}.start_at IS NOT NULL OR ${alias}.due_at IS NOT NULL OR ${alias}.occurrence_date IS NOT NULL)`,
  };
  if (input.scope && input.scope !== 'all') {
    if (!scopes[input.scope]) throw organizationError('TODO_SCOPE_INVALID', '筛选范围无效');
    where.push(`(${scopes[input.scope]})`);
  }
  if (input.priority !== undefined && input.priority !== '') {
    const p = Number(input.priority);
    if (![0, 1, 2].includes(p)) throw organizationError('TODO_PRIORITY_INVALID', '优先级无效');
    where.push(`${alias}.priority = ?`);
    params.push(p);
  }
  const { tagIds } = normalizeTodoOrganization(own(input, 'tagIds') ? { tagIds: input.tagIds } : {});
  for (const id of tagIds || []) {
    where.push(
      `EXISTS (SELECT 1 FROM todo_tag_relations tr INNER JOIN tag tag_filter ON tag_filter.id = tr.tag_id AND tag_filter.user_id = tr.user_id AND tag_filter.del_flag = 0 WHERE tr.target_type = 'todo' AND tr.target_id = ${alias}.id AND tr.user_id = ${alias}.user_id AND tr.tag_id = ?)`,
    );
    params.push(id);
  }
  if (input.rangeStart || input.rangeEnd) {
    const validDate = (value) =>
      typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value;
    if (
      !validDate(input.rangeStart) ||
      !validDate(input.rangeEnd) ||
      input.rangeEnd < input.rangeStart ||
      Date.parse(input.rangeEnd) - Date.parse(input.rangeStart) > 93 * 86400000
    )
      throw organizationError('TODO_RANGE_INVALID', '日期范围无效');
    where.push(
      `COALESCE(${alias}.due_at, ${alias}.start_at, ${alias}.occurrence_date) >= ? AND COALESCE(${alias}.start_at, ${alias}.due_at, ${alias}.occurrence_date) < DATE_ADD(?, INTERVAL 1 DAY)`,
    );
    params.push(input.rangeStart, input.rangeEnd);
  }
  return { where, params };
}
export async function todoWorkspaceCounts(db, userId, input = {}) {
  const filter = todoOrganizationFilters(input);
  if (input.keyword?.trim()) {
    filter.where.push('(title LIKE ? OR description LIKE ?)');
    const like = `%${String(input.keyword).trim().slice(0, 100)}%`;
    filter.params.push(like, like);
  }
  const base = `user_id = ? AND del_flag = 0 AND COALESCE(instance_state, 'normal') = 'normal'`;
  const [[global], [status]] = await Promise.all([
    db.query(
      `SELECT status, COUNT(*) AS allTotal, SUM(list_id IS NULL) AS unassigned, SUM(priority = 2) AS important, SUM(due_at < NOW()) AS overdue, SUM(due_at >= CURDATE() AND due_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)) AS today, SUM(due_at >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY) AND due_at < DATE_ADD(CURDATE(), INTERVAL (7 - WEEKDAY(CURDATE())) DAY)) AS week, SUM(start_at IS NOT NULL OR due_at IS NOT NULL OR occurrence_date IS NOT NULL) AS scheduled FROM todo_items WHERE ${base} AND status IN ('pending', 'completed') GROUP BY status`,
      [userId],
    ),
    db.query(
      `SELECT status, CASE WHEN status = 'completed' THEN 'completed' WHEN priority = 2 OR due_at < NOW() THEN 'focus' ELSE COALESCE(list_id, 'unassigned') END AS groupKey, COUNT(*) AS total FROM todo_items WHERE ${base}${filter.where.length ? ' AND ' + filter.where.join(' AND ') : ''} GROUP BY status, groupKey`,
      [userId, ...filter.params],
    ),
  ]);
  const totals = { pending: 0, completed: 0, all: 0 };
  const groupCounts = {};
  for (const row of status) {
    if (row.status in totals) totals[row.status] += Number(row.total);
    if (row.groupKey && (!input.status || input.status === 'all' || input.status === row.status))
      groupCounts[row.groupKey] = (groupCounts[row.groupKey] || 0) + Number(row.total);
  }
  totals.all = totals.pending + totals.completed;
  const numericCounts = (row = {}) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'status').map(([key, value]) => [key, Number(value || 0)]));
  const emptyCounts = { allTotal: 0, unassigned: 0, important: 0, overdue: 0, today: 0, week: 0, scheduled: 0 };
  const pending = numericCounts(global.find(row => !row.status || row.status === 'pending') || emptyCounts);
  const completed = numericCounts(global.find(row => row.status === 'completed') || emptyCounts);
  return {
    overview: pending,
    navigationCounts: { pending, completed },
    statusTotals: totals,
    groupCounts: { ...groupCounts, all: totals[input.status || 'all'] || 0 },
  };
}
