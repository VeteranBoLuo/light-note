import { insertData } from '../agent/data.js';
import crypto from 'crypto';
import { invalidatePersonalKnowledgeCache } from '../personalKnowledgeSearch.js';

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
    const text = String(item?.text || '')
      .trim()
      .slice(0, 200);
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

function normalizeReminder(value, dueAt) {
  if (!value) return null;
  const mode = String(value.mode || 'once');
  if (!['once', 'repeat'].includes(mode)) throw new Error('提醒方式无效');
  const channels = [...new Set(Array.isArray(value.channels) ? value.channels.map(String) : [])];
  if (!channels.length || channels.some((channel) => !['in_app', 'email'].includes(channel))) {
    throw new Error('请至少选择一种有效提醒渠道');
  }
  const startAt = normalizeDate(value.startAt, '提醒时间');
  if (!startAt) throw new Error('提醒时间不能为空');
  const endAt = mode === 'repeat' ? normalizeDate(value.endAt, '提醒结束时间') : null;
  const intervalMinutes = mode === 'repeat' ? Number(value.intervalMinutes) : null;
  if (mode === 'repeat') {
    if (!endAt) throw new Error('周期提醒必须设置结束时间');
    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) throw new Error('提醒结束时间必须晚于开始时间');
    if (!Number.isInteger(intervalMinutes) || intervalMinutes < 5 || intervalMinutes > 43200) {
      throw new Error('提醒间隔必须在 5 分钟到 30 天之间');
    }
    const occurrenceCount =
      Math.floor((new Date(endAt).getTime() - new Date(startAt).getTime()) / (intervalMinutes * 60_000)) + 1;
    if (occurrenceCount > 100) throw new Error('单个周期提醒最多执行 100 次');
  }
  const email = channels.includes('email')
    ? String(value.email || '')
        .trim()
        .slice(0, 254)
    : null;
  if (channels.includes('email') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('提醒邮箱格式无效');
  const lastReminderAt = endAt || startAt;
  if (dueAt && new Date(lastReminderAt).getTime() > new Date(dueAt).getTime()) {
    throw new Error('提醒时间不能晚于截止时间');
  }
  return { mode, channels, startAt, endAt, intervalMinutes, email };
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
  const reminderValue = hasOwn(values, 'reminder')
    ? values.reminder
    : values?.reminderAt
      ? { mode: 'once', channels: ['in_app'], startAt: values.reminderAt }
      : null;
  const reminder = normalizeReminder(reminderValue, dueAt);
  return {
    title,
    description,
    checklist: normalizeChecklist(values?.checklist),
    priority,
    dueAt,
    reminder,
  };
}

async function loadReminderConfig(db, todoId, userId, lock = false) {
  const [rows] = await db.query(
    `SELECT id, channel, scheduled_at AS scheduledAt, schedule_start_at AS startAt,
            repeat_interval_minutes AS intervalMinutes, repeat_end_at AS endAt,
            target_email AS email
     FROM todo_reminders
     WHERE todo_id = ? AND user_id = ? AND status IN ('pending','processing')
     ORDER BY create_time ASC${lock ? ' FOR UPDATE' : ''}`,
    [todoId, userId],
  );
  if (!rows.length) return null;
  const first = rows[0];
  const intervalMinutes = first.intervalMinutes === null ? null : Number(first.intervalMinutes);
  return {
    mode: intervalMinutes ? 'repeat' : 'once',
    channels: rows.map((row) => row.channel),
    startAt: first.startAt || first.scheduledAt,
    endAt: first.endAt || null,
    intervalMinutes,
    email: rows.find((row) => row.channel === 'email')?.email || null,
  };
}

async function syncReminder(connection, { todoId, userId, reminder }) {
  await connection.query(
    `UPDATE todo_reminders SET status = 'cancelled'
     WHERE todo_id = ? AND user_id = ? AND status IN ('pending','processing')`,
    [todoId, userId],
  );
  if (!reminder) return;
  for (const channel of reminder.channels) {
    const [existingRows] = await connection.query(
      `SELECT id FROM todo_reminders WHERE todo_id = ? AND user_id = ? AND channel = ?
       ORDER BY (scheduled_at = ?) DESC, create_time DESC LIMIT 1 FOR UPDATE`,
      [todoId, userId, channel, reminder.startAt],
    );
    const values = {
      scheduledAt: reminder.startAt,
      scheduleStartAt: reminder.startAt,
      repeatIntervalMinutes: reminder.intervalMinutes,
      repeatEndAt: reminder.endAt,
      targetEmail: channel === 'email' ? reminder.email : null,
    };
    if (existingRows[0]) {
      await connection.query(
        `UPDATE todo_reminders
         SET scheduled_at = ?, schedule_start_at = ?, repeat_interval_minutes = ?, repeat_end_at = ?,
             target_email = ?, status = 'pending', retry_count = 0, last_error = NULL, sent_at = NULL
         WHERE id = ?`,
        [
          values.scheduledAt,
          values.scheduleStartAt,
          values.repeatIntervalMinutes,
          values.repeatEndAt,
          values.targetEmail,
          existingRows[0].id,
        ],
      );
    } else {
      await connection.query('INSERT INTO todo_reminders SET ?', [
        insertData({
          todoId,
          userId,
          channel,
          ...values,
          status: 'pending',
          retryCount: 0,
        }),
      ]);
    }
  }
}

export async function createTodo(connection, userId, values, { invalidateSearch = true } = {}) {
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
  await syncReminder(connection, { todoId: row.id, userId, reminder: todo.reminder });
  if (invalidateSearch) await invalidatePersonalKnowledgeCache(userId, { database: connection });
  return { id: row.id };
}

export async function updateTodo(connection, userId, id, values) {
  const [rows] = await connection.query(
    'SELECT * FROM todo_items WHERE id = ? AND user_id = ? AND del_flag = 0 FOR UPDATE',
    [id, userId],
  );
  const current = rows[0];
  if (!current) return null;
  const currentReminder = await loadReminderConfig(connection, id, userId, true);
  const merged = {
    title: hasOwn(values, 'title') ? values.title : current.title,
    description: hasOwn(values, 'description') ? values.description : current.description,
    checklist: hasOwn(values, 'checklist') ? values.checklist : parseChecklist(current.checklist),
    priority: hasOwn(values, 'priority') ? values.priority : current.priority,
    dueAt: hasOwn(values, 'dueAt') ? values.dueAt : current.due_at,
    reminder: hasOwn(values, 'reminder')
      ? values.reminder
      : hasOwn(values, 'reminderAt')
        ? values.reminderAt
          ? { mode: 'once', channels: ['in_app'], startAt: values.reminderAt }
          : null
        : currentReminder,
  };
  const todo = normalizeTodo(merged);
  await connection.query(
    `UPDATE todo_items
     SET title = ?, description = ?, checklist = ?, priority = ?, due_at = ?, update_time = NOW()
     WHERE id = ? AND user_id = ? AND del_flag = 0`,
    [todo.title, todo.description || null, JSON.stringify(todo.checklist), todo.priority, todo.dueAt, id, userId],
  );
  await syncReminder(connection, { todoId: id, userId, reminder: todo.reminder });
  await invalidatePersonalKnowledgeCache(userId, { database: connection });
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
  if (result.affectedRows) await invalidatePersonalKnowledgeCache(userId, { database: connection });
  return Number(result.affectedRows || 0);
}

export async function deleteTodo(connection, userId, id, { invalidateSearch = true } = {}) {
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
    if (invalidateSearch) await invalidatePersonalKnowledgeCache(userId, { database: connection });
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
            completed_at AS completedAt, create_time AS createdAt, update_time AS updatedAt
     FROM todo_items WHERE ${where.join(' AND ')} ORDER BY ${status === 'completed' ? 'completed_at DESC' : SORT_SQL[sort]}`,
    params,
  );
  if (!items.length) return [];
  const placeholders = items.map(() => '?').join(',');
  const [reminderRows] = await db.query(
    `SELECT todo_id AS todoId, channel, scheduled_at AS scheduledAt, schedule_start_at AS startAt,
            repeat_interval_minutes AS intervalMinutes, repeat_end_at AS endAt, target_email AS email
     FROM todo_reminders
     WHERE todo_id IN (${placeholders}) AND user_id = ? AND status IN ('pending','processing')
     ORDER BY create_time ASC`,
    [...items.map((item) => item.id), userId],
  );
  const reminders = new Map();
  for (const row of reminderRows) {
    const current = reminders.get(row.todoId) || {
      mode: row.intervalMinutes ? 'repeat' : 'once',
      channels: [],
      startAt: row.startAt || row.scheduledAt,
      endAt: row.endAt || null,
      intervalMinutes: row.intervalMinutes === null ? null : Number(row.intervalMinutes),
      email: null,
    };
    current.channels.push(row.channel);
    if (row.channel === 'email') current.email = row.email || null;
    reminders.set(row.todoId, current);
  }
  return items.map((item) => {
    const reminder = reminders.get(item.id) || null;
    return {
      ...item,
      checklist: parseChecklist(item.checklist),
      reminder,
      reminderAt: reminder?.startAt || null,
    };
  });
}

export async function queryTodoPendingCount(db, userId) {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS pendingTotal FROM todo_items
     WHERE user_id = ? AND status = 'pending' AND del_flag = 0`,
    [userId],
  );
  return Number(row?.pendingTotal || 0);
}
