import { insertData } from '../agent/data.js';
import crypto from 'crypto';
import { invalidatePersonalKnowledgeCache } from '../personalKnowledgeSearch.js';
import { decodeOffsetCursor, encodeOffsetCursor, normalizePageLimit } from '../pageCursor.js';

const STATUS = new Set(['pending', 'completed']);
const FILTER_STATUS = new Set(['all', ...STATUS]);
const TODO_PAGE_CURSOR_SCOPE = 'todos';
const TODO_STATUS_LABELS = Object.freeze({ pending: '待处理', completed: '已完成' });
const TODO_STATUS_TARGET_FIELDS = `id, title, description, checklist, priority, status,
  due_at AS dueAt, completed_at AS completedAt, update_time AS updatedAt`;
const SORT_SQL = Object.freeze({
  smart: `CASE
      WHEN due_at IS NOT NULL AND due_at < NOW() THEN 0
      WHEN due_at IS NOT NULL AND DATE(due_at) = CURDATE() THEN 1
      WHEN priority = 2 THEN 2 ELSE 3 END,
    CASE WHEN due_at IS NULL THEN 1 ELSE 0 END, due_at ASC, update_time DESC, id DESC`,
  due: 'CASE WHEN due_at IS NULL THEN 1 ELSE 0 END, due_at ASC, update_time DESC, id DESC',
  newest: 'create_time DESC, id DESC',
  oldest: 'create_time ASC, id ASC',
});

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

function todoStatusError(code, message, status = 400, data) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  if (data !== undefined) error.data = data;
  return error;
}

function normalizeTodoStatusChange(input = {}) {
  const todoId = String(input?.todoId || '')
    .trim()
    .slice(0, 64);
  const keyword = String(input?.keyword || '')
    .trim()
    .slice(0, 100);
  const status = String(input?.status || '')
    .trim()
    .toLowerCase();
  if (!STATUS.has(status)) {
    throw todoStatusError('TODO_STATUS_INVALID', '待办状态只能设为“待处理”或“已完成”。');
  }
  if (!todoId && !keyword) {
    throw todoStatusError('TODO_TARGET_REQUIRED', '请指定要修改的待办。');
  }
  return { todoId, keyword, status };
}

function todoTitleLikePattern(keyword) {
  // LIKE 的通配符必须按字面标题处理；否则用户写“100%”时可能冻结到另一条待办。
  return `%${String(keyword).replace(/[\\%_]/g, '\\$&')}%`;
}

function snapshotValue(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : 'invalid-date';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function todoStatusVersion(row) {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        id: String(row?.id || ''),
        title: String(row?.title || ''),
        description: snapshotValue(row?.description),
        checklist: snapshotValue(row?.checklist),
        priority: Number(row?.priority ?? 0),
        status: String(row?.status || ''),
        dueAt: snapshotValue(row?.dueAt),
        completedAt: snapshotValue(row?.completedAt),
        updatedAt: snapshotValue(row?.updatedAt),
      }),
    )
    .digest('hex');
}

function todoStatusTarget(row) {
  return {
    todoId: String(row?.id || ''),
    title: String(row?.title || '未命名待办').slice(0, 200),
    status: String(row?.status || 'pending'),
    dueAt: row?.dueAt || null,
    priority: Number(row?.priority || 0),
    expectedVersion: todoStatusVersion(row),
  };
}

function todoStatusCandidate(row) {
  const target = todoStatusTarget(row);
  return {
    todoId: target.todoId,
    title: target.title,
    status: target.status,
    dueAt: target.dueAt,
    priority: target.priority,
  };
}

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

/**
 * 为 Agent 状态修改冻结单个待办目标。这个阶段只读，不产生任何业务副作用；
 * 关键字段会被计算为 expectedVersion 指纹，确认执行时必须在同一事务内再次校验。
 */
export async function prepareTodoStatusChange(db, userId, input = {}) {
  const { todoId, keyword, status } = normalizeTodoStatusChange(input);
  let rows;
  if (todoId) {
    [rows] = await db.query(
      `SELECT ${TODO_STATUS_TARGET_FIELDS}
       FROM todo_items
       WHERE id = ? AND user_id = ? AND del_flag = 0
       LIMIT 1`,
      [todoId, userId],
    );
  } else {
    [rows] = await db.query(
      `SELECT ${TODO_STATUS_TARGET_FIELDS}
       FROM todo_items
       WHERE user_id = ? AND del_flag = 0 AND title LIKE ?
       ORDER BY update_time DESC, id DESC
       LIMIT 6`,
      [userId, todoTitleLikePattern(keyword)],
    );
  }

  if (!rows?.length) {
    throw todoStatusError('TODO_NOT_FOUND', '没有找到可修改的待办，请核对名称后重试。', 404);
  }
  if (rows.length > 5) {
    throw todoStatusError('TODO_KEYWORD_AMBIGUOUS', '匹配到多条待办，请补充更具体的标题后重试。', 409);
  }
  if (rows.length > 1) {
    throw todoStatusError('TODO_SELECTION_REQUIRED', '匹配到多条待办，请先选择要修改的一条。', 409, {
      candidates: rows.map(todoStatusCandidate),
    });
  }

  const target = todoStatusTarget(rows[0]);
  if (target.status === status) {
    throw todoStatusError(
      'TODO_STATUS_NOOP',
      `待办“${target.title}”已是${TODO_STATUS_LABELS[status]}，无需修改。`,
      409,
    );
  }
  const [reminderRows] = await db.query(
    `SELECT COUNT(*) AS activeReminderCount
     FROM todo_reminders
     WHERE todo_id = ? AND user_id = ? AND status IN ('pending','processing')`,
    [target.todoId, userId],
  );
  return {
    todoId: target.todoId,
    status,
    expectedVersion: target.expectedVersion,
    targetTitle: target.title,
    currentStatus: target.status,
    dueAt: target.dueAt,
    priority: target.priority,
    activeReminderCount: Number(reminderRows?.[0]?.activeReminderCount || 0),
  };
}

/**
 * Agent 确认后的状态变更。调用方必须已经开启事务；函数通过 FOR UPDATE 重新读取
 * 目标并校验 prepare 阶段的快照，避免确认卡展示的是 A、实际写入的是后来变化的 B。
 */
export async function applyTodoStatusChange(connection, userId, input = {}) {
  const { todoId, status } = normalizeTodoStatusChange(input);
  const expectedVersion = String(input?.expectedVersion || '').trim();
  if (!expectedVersion) {
    throw todoStatusError('TODO_STATUS_PREVIEW_REQUIRED', '待办状态修改需要重新生成确认预览。', 409);
  }
  const [rows] = await connection.query(
    `SELECT ${TODO_STATUS_TARGET_FIELDS}
     FROM todo_items
     WHERE id = ? AND user_id = ? AND del_flag = 0
     LIMIT 1 FOR UPDATE`,
    [todoId, userId],
  );
  const row = rows?.[0];
  if (!row) {
    throw todoStatusError('TODO_NOT_FOUND', '该待办已不存在或不再可修改，请重新发起操作。', 404);
  }
  const target = todoStatusTarget(row);
  if (target.status === status) {
    return {
      state: 'noop',
      todoId: target.todoId,
      title: target.title,
      status,
      previousStatus: target.status,
      cancelledReminderCount: 0,
    };
  }
  if (target.expectedVersion !== expectedVersion) {
    throw todoStatusError('TODO_STATUS_CONFLICT', '待办在确认前已发生变化，请重新查看后再确认。', 409);
  }

  const [updateResult] = await connection.query(
    `UPDATE todo_items
     SET status = ?, completed_at = ${status === 'completed' ? 'NOW()' : 'NULL'}, update_time = NOW()
     WHERE id = ? AND user_id = ? AND del_flag = 0`,
    [status, target.todoId, userId],
  );
  if (Number(updateResult?.affectedRows || 0) !== 1) {
    throw todoStatusError('TODO_STATUS_CONFLICT', '待办状态未能更新，请重新查看后再确认。', 409);
  }

  let cancelledReminderCount = 0;
  if (status === 'completed') {
    const [reminderResult] = await connection.query(
      `UPDATE todo_reminders SET status = 'cancelled'
       WHERE todo_id = ? AND user_id = ? AND status IN ('pending','processing')`,
      [target.todoId, userId],
    );
    cancelledReminderCount = Number(reminderResult?.affectedRows || 0);
  }
  await invalidatePersonalKnowledgeCache(userId, { database: connection });
  return {
    state: 'changed',
    todoId: target.todoId,
    title: target.title,
    previousStatus: target.status,
    status,
    dueAt: target.dueAt,
    cancelledReminderCount,
  };
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

function normalizeTodoListOptions(input = {}) {
  const status = String(input.status || 'all').toLowerCase();
  const sort = String(input.sort || 'smart').toLowerCase();
  if (!FILTER_STATUS.has(status) || !SORT_SQL[sort]) throw new Error('无效的待办筛选参数');

  const keyword = String(input.keyword || '')
    .trim()
    .slice(0, 100);
  const paginated = input.limit !== undefined || input.cursor !== undefined;
  const limit = paginated ? normalizePageLimit(input.limit, { defaultLimit: 20, maxLimit: 50 }) : null;
  const offset = paginated ? decodeOffsetCursor(input.cursor, TODO_PAGE_CURSOR_SCOPE) : 0;
  const view = input.view === 'summary' ? 'summary' : 'full';
  const includeTotal = input.includeTotal !== false;
  return { status, sort, keyword, paginated, limit, offset, view, includeTotal };
}

function todoOrderSql(status, sort) {
  if (status === 'completed') return 'completed_at DESC, update_time DESC, id DESC';
  if (status === 'all') return `CASE WHEN status = 'pending' THEN 0 ELSE 1 END, ${SORT_SQL[sort]}`;
  return SORT_SQL[sort];
}

async function loadTodoReminderMap(db, items, userId, view) {
  if (!items.length) return new Map();
  const placeholders = items.map(() => '?').join(',');
  const fields =
    view === 'summary'
      ? 'todo_id AS todoId, channel'
      : `todo_id AS todoId, channel, scheduled_at AS scheduledAt, schedule_start_at AS startAt,
            repeat_interval_minutes AS intervalMinutes, repeat_end_at AS endAt, target_email AS email`;
  const [reminderRows] = await db.query(
    `SELECT ${fields}
     FROM todo_reminders
     WHERE todo_id IN (${placeholders}) AND user_id = ? AND status IN ('pending','processing')
     ORDER BY create_time ASC`,
    [...items.map((item) => item.id), userId],
  );
  const reminders = new Map();
  for (const row of reminderRows) {
    if (view === 'summary') {
      const channels = reminders.get(row.todoId) || [];
      if (['in_app', 'email'].includes(row.channel) && !channels.includes(row.channel)) channels.push(row.channel);
      reminders.set(row.todoId, channels);
      continue;
    }
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
  return reminders;
}

/**
 * 待办列表的唯一查询入口。页面调用 full 视图；Agent 只能调用 summary 视图，
 * 因此待办说明和提醒邮箱不会进入模型上下文。
 */
export async function listTodoPage(db, userId, input = {}) {
  const { status, sort, keyword, paginated, limit, offset, view, includeTotal } = normalizeTodoListOptions(input);
  const where = ['user_id = ?', 'del_flag = 0'];
  const params = [userId];
  if (status !== 'all') {
    where.push('status = ?');
    params.push(status);
  }
  if (keyword) {
    where.push('(title LIKE ? OR description LIKE ?)');
    const like = `%${keyword}%`;
    params.push(like, like);
  }
  const fields =
    view === 'summary'
      ? 'id, title, checklist, priority, status, due_at AS dueAt, completed_at AS completedAt'
      : `id, title, description, checklist, priority, status, due_at AS dueAt,
            completed_at AS completedAt, create_time AS createdAt, update_time AS updatedAt`;
  const pageSql = `SELECT ${fields}
     FROM todo_items WHERE ${where.join(' AND ')}
     ORDER BY ${todoOrderSql(status, sort)}${paginated ? ' LIMIT ? OFFSET ?' : ''}`;
  const pageParams = paginated ? [...params, limit + 1, offset] : params;
  const [[rows], countResult] = await Promise.all([
    db.query(pageSql, pageParams),
    includeTotal ? db.query(`SELECT COUNT(*) AS total FROM todo_items WHERE ${where.join(' AND ')}`, params) : null,
  ]);
  const hasMore = paginated && rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const reminders = await loadTodoReminderMap(db, items, userId, view);
  const mappedItems = items.map((item) => {
    if (view === 'summary') {
      const checklist = parseChecklist(item.checklist);
      return {
        id: String(item.id),
        title: item.title || '未命名待办',
        priority: Number(item.priority || 0),
        status: item.status,
        dueAt: item.dueAt || null,
        completedAt: item.completedAt || null,
        checklistProgress: {
          completed: checklist.filter((entry) => Boolean(entry?.done)).length,
          total: checklist.length,
        },
        reminderChannels: reminders.get(item.id) || [],
      };
    }
    const reminder = reminders.get(item.id) || null;
    return {
      ...item,
      checklist: parseChecklist(item.checklist),
      reminder,
      reminderAt: reminder?.startAt || null,
    };
  });
  return {
    items: mappedItems,
    total: includeTotal ? Number(countResult?.[0]?.[0]?.total || 0) : mappedItems.length,
    nextCursor: hasMore ? encodeOffsetCursor(TODO_PAGE_CURSOR_SCOPE, offset + items.length) : null,
  };
}

/** 页面兼容入口：维持既有数组返回形态，同时复用统一筛选、排序与分页规则。 */
export async function listTodos(db, userId, options = {}) {
  const result = await listTodoPage(db, userId, { ...options, view: 'full', includeTotal: false });
  return result.items;
}

export async function queryTodoPendingCount(db, userId) {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS pendingTotal FROM todo_items
     WHERE user_id = ? AND status = 'pending' AND del_flag = 0`,
    [userId],
  );
  return Number(row?.pendingTotal || 0);
}
