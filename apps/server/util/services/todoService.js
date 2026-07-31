import { insertData } from '../agent/data.js';
import crypto from 'crypto';
import { invalidatePersonalKnowledgeCache } from '../personalKnowledgeSearch.js';
import { decodeOffsetCursor, encodeOffsetCursor, normalizePageLimit } from '../pageCursor.js';
import {
  copyTodoResourceRefs,
  loadTodoResourceRefMap,
  normalizeTodoResourceRefs,
  replaceTodoResourceRefs,
} from './todoReferenceService.js';

const STATUS = new Set(['pending', 'completed']);
const FILTER_STATUS = new Set(['all', ...STATUS]);
const TODO_PAGE_CURSOR_SCOPE = 'todos';
const TODO_STATUS_LABELS = Object.freeze({ pending: '待处理', completed: '已完成' });
const TODO_STATUS_TARGET_FIELDS = `id, title, description, checklist, priority, status,
  due_at AS dueAt, recurrence_rule AS recurrenceRule,
  completed_at AS completedAt, update_time AS updatedAt`;
// 工作台今日行动流的时间窗筛选:overdue=已逾期,today=今天内到期(含已过时刻)。
const DUE_FILTERS = new Set(['overdue', 'today']);
const DUE_SQL = Object.freeze({
  overdue: 'due_at IS NOT NULL AND due_at < CURDATE()',
  today: 'due_at IS NOT NULL AND due_at >= CURDATE() AND due_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)',
});
const SORT_SQL = Object.freeze({
  smart: `CASE
      WHEN due_at IS NOT NULL AND due_at < NOW() THEN 0
      WHEN due_at IS NOT NULL AND DATE(due_at) = CURDATE() THEN 1
      WHEN priority = 2 THEN 2 ELSE 3 END,
    CASE WHEN due_at IS NULL THEN 1 ELSE 0 END, due_at ASC, sort_order ASC, update_time DESC, id DESC`,
  due: 'CASE WHEN due_at IS NULL THEN 1 ELSE 0 END, due_at ASC, sort_order ASC, update_time DESC, id DESC',
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
        recurrenceRule: snapshotValue(row?.recurrenceRule),
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
    recurring: Boolean(parseJsonObject(row?.recurrenceRule)),
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

function formatSqlDate(value) {
  const date = value instanceof Date ? value : new Date(String(value || '').replace(' ', 'T'));
  if (!Number.isFinite(date.getTime())) return null;
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}:${pad(date.getSeconds())}`;
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

function parseJsonObject(value) {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeRecurrence(value, dueAt) {
  if (!value) return null;
  if (!dueAt) throw new Error('重复任务必须设置截止时间');
  const frequency = String(value.frequency || '');
  if (!['daily', 'weekly', 'monthly'].includes(frequency)) throw new Error('重复任务频率无效');
  const interval = Number(value.interval || 1);
  if (!Number.isInteger(interval) || interval < 1 || interval > 365) throw new Error('重复任务间隔无效');
  const endAt = normalizeDate(value.endAt, '重复任务结束时间');
  if (endAt && new Date(endAt).getTime() <= new Date(dueAt).getTime()) {
    throw new Error('重复任务结束时间必须晚于本次截止时间');
  }
  return { frequency, interval, endAt };
}

export function nextRecurrenceAt(dueAt, recurrence) {
  const rule = parseJsonObject(recurrence);
  const current = new Date(String(dueAt || '').replace(' ', 'T'));
  if (!rule || !Number.isFinite(current.getTime())) return null;
  const next = new Date(current);
  const interval = Number(rule.interval || 1);
  if (rule.frequency === 'daily') next.setDate(next.getDate() + interval);
  else if (rule.frequency === 'weekly') next.setDate(next.getDate() + interval * 7);
  else if (rule.frequency === 'monthly') {
    const desiredDay = next.getDate();
    next.setDate(1);
    next.setMonth(next.getMonth() + interval);
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(desiredDay, lastDay));
  }
  else return null;
  const end = rule.endAt ? new Date(String(rule.endAt).replace(' ', 'T')) : null;
  return end && Number.isFinite(end.getTime()) && next.getTime() > end.getTime() ? null : next;
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
  const recurrence = normalizeRecurrence(values?.recurrence, dueAt);
  return {
    title,
    description,
    checklist: normalizeChecklist(values?.checklist),
    priority,
    dueAt,
    reminder,
    recurrence,
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
  const id = crypto.randomUUID();
  const seriesId = todo.recurrence ? id : null;
  const row = insertData({
    id,
    userId,
    title: todo.title,
    description: todo.description || null,
    checklist: JSON.stringify(todo.checklist),
    priority: todo.priority,
    sortOrder: Number.isSafeInteger(Number(values?.sortOrder)) ? Number(values.sortOrder) : Date.now(),
    status: 'pending',
    dueAt: todo.dueAt,
    seriesId,
    recurrenceRule: todo.recurrence ? JSON.stringify(todo.recurrence) : null,
    recurrenceInstanceAt: todo.recurrence ? todo.dueAt : null,
    delFlag: 0,
  });
  await connection.query('INSERT INTO todo_items SET ?', [row]);
  await syncReminder(connection, { todoId: row.id, userId, reminder: todo.reminder });
  // 参考资料与待办主记录同事务写入,任一引用越权即整体回滚
  const resourceRefs = normalizeTodoResourceRefs(values?.resourceRefs);
  if (resourceRefs?.length) {
    await replaceTodoResourceRefs(connection, { userId, todoId: row.id, refs: resourceRefs });
  }
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
    recurrence: hasOwn(values, 'recurrence') ? values.recurrence : parseJsonObject(current.recurrence_rule),
  };
  const todo = normalizeTodo(merged);
  await connection.query(
    `UPDATE todo_items
     SET title = ?, description = ?, checklist = ?, priority = ?, due_at = ?,
         series_id = ?, recurrence_rule = ?, recurrence_instance_at = ?, update_time = NOW()
     WHERE id = ? AND user_id = ? AND del_flag = 0`,
    [
      todo.title,
      todo.description || null,
      JSON.stringify(todo.checklist),
      todo.priority,
      todo.dueAt,
      todo.recurrence ? current.series_id || id : null,
      todo.recurrence ? JSON.stringify(todo.recurrence) : null,
      todo.recurrence ? todo.dueAt : null,
      id,
      userId,
    ],
  );
  await syncReminder(connection, { todoId: id, userId, reminder: todo.reminder });
  // 只有显式传了 resourceRefs 才整体替换,未传表示本次不改动关系
  const nextRefs = normalizeTodoResourceRefs(values?.resourceRefs);
  if (nextRefs !== null) {
    await replaceTodoResourceRefs(connection, { userId, todoId: id, refs: nextRefs });
  }
  await invalidatePersonalKnowledgeCache(userId, { database: connection });
  return { id };
}

export async function setTodoStatus(connection, userId, id, status, { undoCompletion = false } = {}) {
  if (!STATUS.has(status)) throw new Error('待办状态无效');
  const [currentRows] = await connection.query(
    `SELECT * FROM todo_items WHERE id = ? AND user_id = ? AND del_flag = 0 LIMIT 1 FOR UPDATE`,
    [id, userId],
  );
  const current = currentRows[0];
  if (!current || current.status === status) return 0;
  const reminder = await loadReminderConfig(connection, id, userId, true);
  const [result] = await connection.query(
    `UPDATE todo_items
     SET status = ?, completed_at = ${status === 'completed' ? 'NOW()' : 'NULL'}, update_time = NOW()
     WHERE id = ? AND user_id = ? AND del_flag = 0 AND status <> ?`,
    [status, id, userId, status],
  );
  if (status === 'completed' && result.affectedRows) {
    await connection.query(
      `UPDATE todo_reminders SET status = 'paused_complete'
       WHERE todo_id = ? AND user_id = ? AND status IN ('pending','processing')`,
      [id, userId],
    );
    const recurrence = parseJsonObject(current.recurrence_rule);
    const nextDueAt = nextRecurrenceAt(current.due_at, recurrence);
    if (nextDueAt) {
      const nextDueSql = formatSqlDate(nextDueAt);
      const nextId = crypto.randomUUID();
      const checklist = normalizeChecklist(parseChecklist(current.checklist)).map((item) => ({ ...item, done: false }));
      const [nextResult] = await connection.query(
        `INSERT IGNORE INTO todo_items
          (id, user_id, title, description, checklist, priority, sort_order, status, due_at,
           series_id, recurrence_rule, recurrence_instance_at, del_flag)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, 0)`,
        [
          nextId,
          userId,
          current.title,
          current.description,
          JSON.stringify(checklist),
          current.priority,
          Number(current.sort_order || Date.now()),
          nextDueSql,
          current.series_id || current.id,
          JSON.stringify(recurrence),
          nextDueSql,
        ],
      );
      if (Number(nextResult?.affectedRows || 0) === 1) {
        // 下一实例沿用同一批参考资料,顺序保持一致
        await copyTodoResourceRefs(connection, { userId, fromTodoId: current.id, toTodoId: nextId });
      }
      if (Number(nextResult?.affectedRows || 0) === 1 && reminder) {
        const currentDueMs = new Date(String(current.due_at).replace(' ', 'T')).getTime();
        const delta = nextDueAt.getTime() - currentDueMs;
        const shift = (value) => {
          if (!value) return null;
          const date = new Date(String(value).replace(' ', 'T'));
          return Number.isFinite(date.getTime()) ? new Date(date.getTime() + delta) : null;
        };
        await syncReminder(connection, {
          todoId: nextId,
          userId,
          reminder: {
            ...reminder,
            startAt: shift(reminder.startAt),
            endAt: shift(reminder.endAt),
          },
        });
      }
    }
  } else if (status === 'pending' && result.affectedRows) {
    await connection.query(
      `UPDATE todo_reminders SET status = 'pending'
       WHERE todo_id = ? AND user_id = ? AND status = 'paused_complete'`,
      [id, userId],
    );
    if (undoCompletion) {
      const recurrence = parseJsonObject(current.recurrence_rule);
      const nextDueSql = formatSqlDate(nextRecurrenceAt(current.due_at, recurrence));
      if (nextDueSql) {
        const [generatedRows] = await connection.query(
          `SELECT id FROM todo_items
           WHERE user_id = ? AND series_id = ? AND recurrence_instance_at = ?
             AND status = 'pending' AND del_flag = 0 AND update_time = create_time
           LIMIT 1 FOR UPDATE`,
          [userId, current.series_id || current.id, nextDueSql],
        );
        const generatedId = generatedRows[0]?.id;
        if (generatedId) {
          await connection.query(
            `DELETE FROM todo_items
             WHERE id = ? AND user_id = ? AND status = 'pending' AND del_flag = 0`,
            [generatedId, userId],
          );
        }
      }
    }
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
    recurring: target.recurring,
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
      pausedReminderCount: 0,
    };
  }
  if (target.expectedVersion !== expectedVersion) {
    throw todoStatusError('TODO_STATUS_CONFLICT', '待办在确认前已发生变化，请重新查看后再确认。', 409);
  }

  let pausedReminderCount = 0;
  if (status === 'completed') {
    const [reminderRows] = await connection.query(
      `SELECT COUNT(*) AS activeReminderCount
       FROM todo_reminders
       WHERE todo_id = ? AND user_id = ? AND status IN ('pending','processing')`,
      [target.todoId, userId],
    );
    pausedReminderCount = Number(reminderRows?.[0]?.activeReminderCount || 0);
  }
  const affected = await setTodoStatus(connection, userId, target.todoId, status);
  if (affected !== 1) {
    throw todoStatusError('TODO_STATUS_CONFLICT', '待办状态未能更新，请重新查看后再确认。', 409);
  }

  return {
    state: 'changed',
    todoId: target.todoId,
    title: target.title,
    previousStatus: target.status,
    status,
    dueAt: target.dueAt,
    pausedReminderCount,
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
      `UPDATE todo_reminders SET status = 'paused_delete'
       WHERE todo_id = ? AND user_id = ? AND status IN ('pending','processing')`,
      [id, userId],
    );
    if (invalidateSearch) await invalidatePersonalKnowledgeCache(userId, { database: connection });
  }
  return Number(result.affectedRows || 0);
}

export async function restoreTodo(connection, userId, id, { invalidateSearch = true } = {}) {
  const [result] = await connection.query(
    `UPDATE todo_items SET del_flag = 0, deleted_at = NULL, update_time = NOW()
     WHERE id = ? AND user_id = ? AND del_flag = 1`,
    [id, userId],
  );
  if (result.affectedRows) {
    await connection.query(
      `UPDATE todo_reminders SET status = 'pending'
       WHERE todo_id = ? AND user_id = ? AND status = 'paused_delete'`,
      [id, userId],
    );
    if (invalidateSearch) await invalidatePersonalKnowledgeCache(userId, { database: connection });
  }
  return Number(result.affectedRows || 0);
}

export async function batchSetTodoStatus(connection, userId, ids, status, { undoCompletion = false } = {}) {
  const normalized = [...new Set((Array.isArray(ids) ? ids : []).map(String).filter(Boolean))].slice(0, 100);
  if (!normalized.length) throw new Error('请选择待办');
  let affected = 0;
  for (const id of normalized) {
    affected += await setTodoStatus(connection, userId, id, status, { undoCompletion });
  }
  if (affected !== normalized.length) throw new Error('部分待办已发生变化，请刷新后重试');
  return { affected, ids: normalized };
}

export async function batchDeleteTodos(connection, userId, ids) {
  const normalized = [...new Set((Array.isArray(ids) ? ids : []).map(String).filter(Boolean))].slice(0, 100);
  if (!normalized.length) throw new Error('请选择待办');
  let affected = 0;
  for (const id of normalized) affected += await deleteTodo(connection, userId, id, { invalidateSearch: false });
  if (affected !== normalized.length) throw new Error('部分待办已发生变化，请刷新后重试');
  if (affected) await invalidatePersonalKnowledgeCache(userId, { database: connection });
  return { affected, ids: normalized };
}

export async function batchRestoreTodos(connection, userId, ids) {
  const normalized = [...new Set((Array.isArray(ids) ? ids : []).map(String).filter(Boolean))].slice(0, 100);
  if (!normalized.length) throw new Error('请选择待办');
  let affected = 0;
  for (const id of normalized) {
    affected += await restoreTodo(connection, userId, id, { invalidateSearch: false });
  }
  if (affected !== normalized.length) throw new Error('部分待办已发生变化，请刷新后重试');
  await invalidatePersonalKnowledgeCache(userId, { database: connection });
  return { affected, ids: normalized };
}

export async function reorderTodos(connection, userId, items) {
  const normalized = (Array.isArray(items) ? items : []).slice(0, 100);
  if (!normalized.length) throw new Error('待办顺序不能为空');
  for (const [index, item] of normalized.entries()) {
    const id = String(item?.id || '').trim();
    if (!id) throw new Error('待办 ID 无效');
    const priority = Number(item?.priority);
    if (![0, 1, 2].includes(priority)) throw new Error('待办优先级无效');
    const dueAt = normalizeDate(item?.dueAt, '截止时间');
    const [result] = await connection.query(
      `UPDATE todo_items SET due_at = ?, priority = ?, sort_order = ?, update_time = NOW()
       WHERE id = ? AND user_id = ? AND del_flag = 0`,
      [dueAt, priority, (index + 1) * 1000, id, userId],
    );
    if (Number(result.affectedRows || 0) !== 1) throw new Error('待办不存在或无权操作');
  }
  await invalidatePersonalKnowledgeCache(userId, { database: connection });
  return { affected: normalized.length };
}

export async function snoozeTodo(connection, userId, id, targetAt) {
  const scheduledAt = normalizeDate(targetAt, '稍后提醒时间');
  if (!scheduledAt || new Date(scheduledAt).getTime() <= Date.now()) throw new Error('稍后提醒时间必须晚于当前时间');
  const [rows] = await connection.query(
    'SELECT id FROM todo_items WHERE id = ? AND user_id = ? AND status = ? AND del_flag = 0 LIMIT 1 FOR UPDATE',
    [id, userId, 'pending'],
  );
  if (!rows.length) throw new Error('待办不存在或无权操作');
  const [result] = await connection.query(
    `UPDATE todo_reminders SET scheduled_at = ?, status = 'pending', retry_count = 0, last_error = NULL
     WHERE todo_id = ? AND user_id = ? AND status IN ('pending','processing')`,
    [scheduledAt, id, userId],
  );
  if (!Number(result.affectedRows || 0)) {
    await connection.query('INSERT INTO todo_reminders SET ?', [
      insertData({
        todoId: id,
        userId,
        channel: 'in_app',
        scheduledAt,
        scheduleStartAt: scheduledAt,
        status: 'pending',
        retryCount: 0,
      }),
    ]);
  }
  return { id, scheduledAt };
}

function normalizeTodoListOptions(input = {}) {
  const status = String(input.status || 'all').toLowerCase();
  const sort = String(input.sort || 'smart').toLowerCase();
  if (!FILTER_STATUS.has(status) || !SORT_SQL[sort]) throw new Error('无效的待办筛选参数');
  const due = input.due === undefined || input.due === null ? null : String(input.due).toLowerCase();
  if (due !== null && !DUE_FILTERS.has(due)) throw new Error('无效的待办筛选参数');

  const keyword = String(input.keyword || '')
    .trim()
    .slice(0, 100);
  const paginated = input.limit !== undefined || input.cursor !== undefined;
  const limit = paginated ? normalizePageLimit(input.limit, { defaultLimit: 20, maxLimit: 50 }) : null;
  const offset = paginated ? decodeOffsetCursor(input.cursor, TODO_PAGE_CURSOR_SCOPE) : 0;
  const view = input.view === 'summary' ? 'summary' : 'full';
  const includeTotal = input.includeTotal !== false;
  return { status, sort, keyword, due, paginated, limit, offset, view, includeTotal };
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
  const { status, sort, keyword, due, paginated, limit, offset, view, includeTotal } =
    normalizeTodoListOptions(input);
  const where = ['user_id = ?', 'del_flag = 0'];
  const params = [userId];
  if (status !== 'all') {
    where.push('status = ?');
    params.push(status);
  }
  if (due) {
    where.push(DUE_SQL[due]);
  }
  if (keyword) {
    where.push('(title LIKE ? OR description LIKE ?)');
    const like = `%${keyword}%`;
    params.push(like, like);
  }
  const fields =
    view === 'summary'
      ? 'id, title, checklist, priority, status, due_at AS dueAt, completed_at AS completedAt'
      : `id, title, description, checklist, priority, sort_order AS sortOrder, status, due_at AS dueAt,
            completed_at AS completedAt, series_id AS seriesId, recurrence_rule AS recurrence,
            recurrence_instance_at AS recurrenceInstanceAt, create_time AS createdAt, update_time AS updatedAt`;
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
  // 一次批量取回当前页全部待办的参考资料,避免逐条查询造成 N+1
  const refMap =
    view === 'summary'
      ? new Map()
      : await loadTodoResourceRefMap(db, { userId, todoIds: items.map((item) => item.id) }).catch(() => new Map());
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
      recurrence: parseJsonObject(item.recurrence),
      reminder,
      reminderAt: reminder?.startAt || null,
      resourceRefs: refMap.get(String(item.id)) || [],
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
