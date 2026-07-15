import { insertData } from '../agent/data.js';
import crypto from 'crypto';

const STATUS = new Set(['pending', 'completed']);
const SORT_SQL = Object.freeze({
  smart: `CASE
      WHEN due_at IS NOT NULL AND due_at < NOW() THEN 0
      WHEN due_at IS NOT NULL AND DATE(due_at) = CURDATE() THEN 1
      WHEN priority = 2 THEN 2 ELSE 3 END,
    CASE WHEN due_at IS NULL THEN 1 ELSE 0 END, due_at ASC, update_time DESC`,
  due: 'CASE WHEN due_at IS NULL THEN 1 ELSE 0 END, due_at ASC, update_time DESC',
  newest: 'create_time DESC',
  oldest: 'create_time ASC',
});

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

function parseChecklist(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeChecklist(value) {
  const list = parseChecklist(value);
  if (list.length > 50) throw new Error('清单最多包含 50 项');
  return list.map((item) => {
    const text = String(item?.text || '').trim().slice(0, 200);
    if (!text) throw new Error('清单内容不能为空');
    return {
      id: String(item?.id || crypto.randomUUID()).slice(0, 64),
      text,
      done: Boolean(item?.done),
    };
  });
}

function normalizeDate(value, label) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error(`${label}格式无效`);
    const pad = (part) => String(part).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
  }
  const raw = String(value).trim();
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) throw new Error(`${label}格式无效`);
  const sqlValue = raw.replace('T', ' ').replace(/Z$/, '').slice(0, 19);
  return sqlValue.length === 16 ? `${sqlValue}:00` : sqlValue;
}

function normalizeTodo(values) {
  const title = String(values?.title || '').trim();
  if (!title) throw new Error('待办标题不能为空');
  if (title.length > 200) throw new Error('待办标题不能超过 200 字');
  const description = String(values?.description || '').trim();
  if (description.length > 2000) throw new Error('待办说明不能超过 2000 字');
  const priority = Number(values?.priority ?? 1);
  if (![0, 1, 2].includes(priority)) throw new Error('待办优先级无效');
  const dueAt = normalizeDate(values?.dueAt, '截止时间');
  const reminderAt = normalizeDate(values?.reminderAt, '提醒时间');
  if (reminderAt && !dueAt) throw new Error('设置提醒前请先设置截止时间');
  if (reminderAt && new Date(reminderAt).getTime() > new Date(dueAt).getTime()) {
    throw new Error('提醒时间不能晚于截止时间');
  }
  return {
    title,
    description,
    checklist: normalizeChecklist(values?.checklist),
    priority,
    dueAt,
    reminderAt,
  };
}

async function syncReminder(connection, { todoId, userId, reminderAt }) {
  await connection.query(
    `UPDATE todo_reminders SET status = 'cancelled'
     WHERE todo_id = ? AND user_id = ? AND status IN ('pending','processing')`,
    [todoId, userId],
  );
  if (!reminderAt) return;
  await connection.query(
    `INSERT INTO todo_reminders SET ?
     ON DUPLICATE KEY UPDATE status = 'pending', retry_count = 0, last_error = NULL, sent_at = NULL`,
    [insertData({ todoId, userId, channel: 'in_app', scheduledAt: reminderAt, status: 'pending', retryCount: 0 })],
  );
}

export async function createTodo(connection, userId, values) {
  const todo = normalizeTodo(values);
  const row = insertData({
    userId,
    title: todo.title,
    description: todo.description || null,
    checklist: JSON.stringify(todo.checklist),
    priority: todo.priority,
    status: 'pending',
    dueAt: todo.dueAt,
    delFlag: 0,
  });
  await connection.query('INSERT INTO todo_items SET ?', [row]);
  await syncReminder(connection, { todoId: row.id, userId, reminderAt: todo.reminderAt });
  return { id: row.id };
}

export async function updateTodo(connection, userId, id, values) {
  const [rows] = await connection.query(
    'SELECT * FROM todo_items WHERE id = ? AND user_id = ? AND del_flag = 0 FOR UPDATE',
    [id, userId],
  );
  const current = rows[0];
  if (!current) return null;
  const [reminderRows] = await connection.query(
    `SELECT scheduled_at FROM todo_reminders
     WHERE todo_id = ? AND user_id = ? AND status IN ('pending','processing')
     ORDER BY scheduled_at DESC LIMIT 1`,
    [id, userId],
  );
  const merged = {
    title: hasOwn(values, 'title') ? values.title : current.title,
    description: hasOwn(values, 'description') ? values.description : current.description,
    checklist: hasOwn(values, 'checklist') ? values.checklist : parseChecklist(current.checklist),
    priority: hasOwn(values, 'priority') ? values.priority : current.priority,
    dueAt: hasOwn(values, 'dueAt') ? values.dueAt : current.due_at,
    reminderAt: hasOwn(values, 'reminderAt') ? values.reminderAt : reminderRows[0]?.scheduled_at || null,
  };
  const todo = normalizeTodo(merged);
  await connection.query(
    `UPDATE todo_items
     SET title = ?, description = ?, checklist = ?, priority = ?, due_at = ?, update_time = NOW()
     WHERE id = ? AND user_id = ? AND del_flag = 0`,
    [todo.title, todo.description || null, JSON.stringify(todo.checklist), todo.priority, todo.dueAt, id, userId],
  );
  await syncReminder(connection, { todoId: id, userId, reminderAt: todo.reminderAt });
  return { id };
}

export async function setTodoStatus(connection, userId, id, status) {
  if (!STATUS.has(status)) throw new Error('待办状态无效');
  const [result] = await connection.query(
    `UPDATE todo_items
     SET status = ?, completed_at = ${status === 'completed' ? 'NOW()' : 'NULL'}, update_time = NOW()
     WHERE id = ? AND user_id = ? AND del_flag = 0 AND status <> ?`,
    [status, id, userId, status],
  );
  if (status === 'completed' && result.affectedRows) {
    await connection.query(
      `UPDATE todo_reminders SET status = 'cancelled'
       WHERE todo_id = ? AND user_id = ? AND status IN ('pending','processing')`,
      [id, userId],
    );
  }
  return Number(result.affectedRows || 0);
}

export async function deleteTodo(connection, userId, id) {
  const [result] = await connection.query(
    `UPDATE todo_items SET del_flag = 1, deleted_at = NOW(), update_time = NOW()
     WHERE id = ? AND user_id = ? AND del_flag = 0`,
    [id, userId],
  );
  if (result.affectedRows) {
    await connection.query(
      `UPDATE todo_reminders SET status = 'cancelled'
       WHERE todo_id = ? AND user_id = ? AND status IN ('pending','processing')`,
      [id, userId],
    );
  }
  return Number(result.affectedRows || 0);
}

export async function listTodos(db, userId, { status = 'pending', keyword = '', sort = 'smart' } = {}) {
  if (!STATUS.has(status) || !SORT_SQL[sort]) throw new Error('无效的待办筛选参数');
  const where = ['user_id = ?', 'status = ?', 'del_flag = 0'];
  const params = [userId, status];
  if (keyword) {
    where.push('(title LIKE ? OR description LIKE ?)');
    const like = `%${String(keyword).trim().slice(0, 100)}%`;
    params.push(like, like);
  }
  const [items] = await db.query(
    `SELECT id, title, description, checklist, priority, status, due_at AS dueAt,
            completed_at AS completedAt, create_time AS createdAt, update_time AS updatedAt,
            (SELECT scheduled_at FROM todo_reminders r
              WHERE r.todo_id = todo_items.id AND r.status IN ('pending','processing')
              ORDER BY scheduled_at DESC LIMIT 1) AS reminderAt
     FROM todo_items WHERE ${where.join(' AND ')} ORDER BY ${status === 'completed' ? 'completed_at DESC' : SORT_SQL[sort]}`,
    params,
  );
  return items.map((item) => ({ ...item, checklist: parseChecklist(item.checklist) }));
}

export async function queryTodoPendingCount(db, userId) {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS pendingTotal FROM todo_items
     WHERE user_id = ? AND status = 'pending' AND del_flag = 0`,
    [userId],
  );
  return Number(row?.pendingTotal || 0);
}
