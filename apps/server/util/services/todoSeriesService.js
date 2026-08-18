import crypto from 'crypto';
import { Temporal } from '@js-temporal/polyfill';
import { insertData } from '../agent/data.js';
import { invalidatePersonalKnowledgeCache } from '../personalKnowledgeSearch.js';
import {
  assertTodoPlanReady,
  calculateTodoPlan,
  TODO_PLAN_MAX_REMINDER_JOBS,
  TODO_PLAN_ROLLING_DAYS,
  TODO_PLAN_ROLLING_MIN_OCCURRENCES,
} from '../todoPlanCalculator.js';
import { validateOwnedResourceRefs } from './noteReferenceService.js';
import { normalizeTodoResourceRefs, replaceTodoResourceRefs } from './todoReferenceService.js';
import { incrementTodoPlanMetric } from '../todoPlanMetrics.js';
import { recordTodoCompletion } from '../growthActivityHistory.js';

const WRITE_SCOPES = new Set(['current', 'future', 'series']);
const DELETE_SCOPES = new Set(['current', 'future', 'series']);
const SERIES_ACTIONS = new Set(['pause', 'resume', 'stop']);
const MAX_GENERATION_BATCH = 200;

function serviceError(code, message, status = 400, data) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  if (data !== undefined) error.data = data;
  return error;
}

function parseJson(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value)
    .sort()
    .reduce((result, key) => {
      if (value[key] !== undefined) result[key] = stableObject(value[key]);
      return result;
    }, {});
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function requestHash(input) {
  const { previewHash: _previewHash, idempotencyKey: _idempotencyKey, ...payload } = input || {};
  return sha256(JSON.stringify(stableObject(payload)));
}

function normalizeChecklist(value) {
  const input = Array.isArray(value) ? value : [];
  if (input.length > 50) throw serviceError('TODO_CHECKLIST_LIMIT', '清单最多包含 50 项');
  return input.map((item) => {
    const text = String(item?.text || '')
      .trim()
      .slice(0, 200);
    if (!text) throw serviceError('TODO_CHECKLIST_EMPTY', '清单内容不能为空');
    return {
      id: String(item?.id || crypto.randomUUID()).slice(0, 64),
      text,
      done: Boolean(item?.done),
    };
  });
}

function resetChecklist(value) {
  return normalizeChecklist(value).map((item) => ({ ...item, done: false }));
}

function normalizeContent(input, normalizedPlan) {
  const title = String(normalizedPlan?.title || input?.title || '').trim();
  if (!title) throw serviceError('TODO_TITLE_REQUIRED', '待办标题不能为空');
  const description = String(normalizedPlan?.description || input?.description || '').trim();
  const priority = Number(normalizedPlan?.priority ?? input?.priority ?? 1);
  if (![0, 1, 2].includes(priority)) throw serviceError('TODO_PRIORITY_INVALID', '待办优先级无效');
  return {
    title,
    description: description || null,
    priority,
    checklist: normalizeChecklist(input?.checklist),
    sortOrder: Number.isSafeInteger(Number(input?.sortOrder)) ? Number(input.sortOrder) : Date.now(),
  };
}

function formatReminderInterval(intervalMinutes) {
  const minutes = Math.max(1, Number(intervalMinutes) || 1);
  if (minutes % 1440 === 0) return `${minutes / 1440} 天`;
  if (minutes % 60 === 0) return `${minutes / 60} 小时`;
  return `${minutes} 分钟`;
}

function formatReminderTrigger(trigger = {}, action = '提醒') {
  if (trigger.type === 'at_start') return `任务开始时${action}`;
  if (trigger.type === 'before_due') {
    const offsetMinutes = Math.max(0, Number(trigger.offsetMinutes) || 0);
    return offsetMinutes ? `截止前 ${offsetMinutes} 分钟${action}` : `截止时${action}`;
  }
  return `当天 ${trigger.fixedTime || '09:00'} ${action}`;
}

function previewSummary(preview) {
  const plan = preview.normalizedPlan.plan;
  const timing = preview.normalizedPlan.timing;
  const reminder = preview.normalizedPlan.reminder;
  const taskMode = preview.normalizedPlan.taskMode || (plan.type === 'once' ? 'single' : 'independent');
  const frequencyLabel =
    plan.frequency === 'daily'
      ? '每日'
      : plan.frequency === 'weekly'
        ? '每周'
        : plan.frequency === 'monthly'
          ? '每月'
          : '';
  const count = preview.occurrenceCount || preview.generatedNowCount;
  const planTitle =
    taskMode === 'single'
      ? '将创建 1 条待办'
      : plan.type === 'once'
        ? '将创建 1 条独立待办'
        : plan.type === 'after_completion'
          ? `将创建“完成后 ${plan.interval} ${plan.unit === 'day' ? '天' : plan.unit === 'week' ? '周' : '个月'}再次安排”的任务`
          : `将创建 ${count}${preview.occurrenceCount ? '' : '+'} 项${frequencyLabel}任务`;
  const localDate = (value) => String(value || '').slice(0, 10) || null;
  const firstDate =
    localDate(preview.firstOccurrence?.startAt) ||
    localDate(preview.firstOccurrence?.dueAt) ||
    localDate(preview.firstOccurrence?.occurrenceDate);
  const lastDate =
    localDate(preview.lastOccurrence?.dueAt) ||
    localDate(preview.lastOccurrence?.startAt) ||
    localDate(preview.lastOccurrence?.occurrenceDate);
  const range = !firstDate
    ? '无日期'
    : plan.type === 'after_completion'
      ? `${firstDate} 起`
      : lastDate && lastDate !== firstDate
        ? `${firstDate} 至 ${lastDate}`
        : firstDate;
  const timeParts = [];
  if (timing.startTime) timeParts.push(`${timing.startTime} 开始`);
  if (timing.dueTime) timeParts.push(`${timing.dueTime} 截止`);
  if (!timeParts.length && taskMode === 'independent') timeParts.push('全天待办（未设置开始和截止时间）');
  const channelLabel = reminder.channels.map((channel) => (channel === 'in_app' ? '站内' : '邮箱')).join(' + ');
  let reminderLabel = '不提醒';
  if (reminder.mode === 'once') {
    const onceLabels = {
      at_due: '截止时提醒',
      at_start: '开始时提醒',
      before_due: `截止前 ${reminder.once?.offsetMinutes || 0} 分钟提醒`,
      fixed_at: `${reminder.once?.fixedAt || ''} 提醒`,
    };
    reminderLabel = `${onceLabels[reminder.once?.type] || '提醒一次'} · ${channelLabel}`;
  } else if (reminder.mode === 'repeat') {
    const repeat = reminder.repeat || {};
    const repeatLabel =
      repeat.kind === 'interval'
        ? `每 ${formatReminderInterval(repeat.intervalMinutes)}提醒`
        : repeat.kind === 'weekly'
          ? `每周 ${repeat.weekdays.join('、')} 的 ${repeat.localTime} 提醒`
          : `每月 ${repeat.monthDays.join('、')} 日 ${repeat.localTime} 提醒`;
    reminderLabel = `${repeatLabel} · ${channelLabel}`;
  } else if (reminder.mode === 'nudge') {
    const triggerLabel = formatReminderTrigger(reminder.trigger, '首次提醒');
    const intervalLabel = formatReminderInterval(reminder.nudge.intervalMinutes);
    const stopLabel =
      reminder.nudge.stop === 'max_count'
        ? `达到 ${reminder.nudge.maxCount} 次后停止`
        : `最多 ${reminder.nudge.maxCount} 次，完成或截止时停止`;
    reminderLabel = `${triggerLabel}，之后每 ${intervalLabel}提醒，${stopLabel} · ${channelLabel}`;
  } else if (reminder.mode === 'once_per_instance') {
    reminderLabel = `${formatReminderTrigger(reminder.trigger, '提醒一次')} · ${channelLabel}`;
  }
  return { title: planTitle, range, timing: timeParts.join(' · '), reminder: reminderLabel };
}

export function previewTodoPlan(input = {}, options = {}) {
  const preview = calculateTodoPlan(input, options);
  return { ...preview, displaySummary: previewSummary(preview) };
}

function ruleRow(userId, { todoId = null, seriesId = null, reminder }) {
  if (!reminder || reminder.mode === 'none') return null;
  const singleSchedule = ['once', 'repeat'].includes(reminder.mode);
  const singleTrigger =
    reminder.once?.type === 'at_start'
      ? 'at_start'
      : reminder.once?.type === 'before_due'
        ? 'before_due'
        : 'fixed_time';
  return insertData({
    userId,
    todoId,
    seriesId,
    version: 1,
    mode: singleSchedule ? 'single_schedule' : reminder.mode,
    triggerType: singleSchedule ? singleTrigger : reminder.trigger.type,
    fixedLocalTime: singleSchedule ? null : reminder.trigger.fixedTime || null,
    offsetMinutes: singleSchedule ? (reminder.once?.offsetMinutes ?? null) : (reminder.trigger.offsetMinutes ?? null),
    repeatIntervalMinutes: singleSchedule
      ? (reminder.repeat?.intervalMinutes ?? null)
      : (reminder.nudge?.intervalMinutes ?? null),
    stopType: singleSchedule ? (reminder.repeat?.stop?.type ?? null) : (reminder.nudge?.stop ?? null),
    maxCount: singleSchedule ? (reminder.repeat?.stop?.maxCount ?? null) : (reminder.nudge?.maxCount ?? null),
    scheduleJson: singleSchedule ? JSON.stringify({ version: 2, schedule: reminder }) : null,
    channels: JSON.stringify(reminder.channels),
    targetEmail: reminder.targetEmail || null,
    quietPolicy: reminder.quietPolicy || 'defer_once',
    timezone: reminder.timezone || null,
    enabled: 1,
  });
}

function jobRowsForOccurrence({ userId, todoId, seriesId, rule, occurrence, momentEntry, reminder }) {
  if (!rule || !momentEntry?.moments?.length) return [];
  const singleRepeatStop = reminder.mode === 'repeat' ? reminder.repeat?.stop?.type : null;
  const stopAt =
    (reminder.mode === 'nudge' && reminder.nudge?.stop === 'max_count') ||
    (singleRepeatStop && singleRepeatStop !== 'completion_or_due')
      ? null
      : occurrence.dueAtUtc || null;
  const rows = [];
  for (const moment of momentEntry.moments) {
    for (const channel of reminder.channels) {
      const dedupeKey = sha256(
        [todoId, rule.id, rule.version, channel, moment.sequenceNo, moment.scheduledAtUtc].join('|'),
      );
      rows.push(
        insertData({
          userId,
          todoId,
          seriesId,
          ruleId: rule.id,
          ruleVersion: rule.version,
          channel,
          sequenceNo: moment.sequenceNo,
          originalScheduledAtUtc: moment.scheduledAtUtc,
          scheduledAtUtc: moment.scheduledAtUtc,
          scheduledAtLocal: moment.scheduledAtLocal,
          stopAtUtc: stopAt,
          timezone: occurrence.timezone,
          status: moment.deliverable ? 'pending' : 'skipped',
          cancelReason: moment.skippedReason || null,
          dedupeKey,
        }),
      );
    }
  }
  return rows;
}

async function insertReminderJobs(connection, rows) {
  if (!rows.length) return 0;
  const columns = [
    'id',
    'user_id',
    'todo_id',
    'series_id',
    'rule_id',
    'rule_version',
    'channel',
    'sequence_no',
    'original_scheduled_at_utc',
    'scheduled_at_utc',
    'scheduled_at_local',
    'stop_at_utc',
    'timezone',
    'status',
    'lease_token',
    'lease_until',
    'retry_count',
    'provider_message_id',
    'last_error',
    'cancel_reason',
    'sent_at',
    'dedupe_key',
  ];
  const values = rows.map((row) => columns.map((column) => row[column] ?? null));
  const [result] = await connection.query(`INSERT IGNORE INTO todo_reminder_jobs (${columns.join(',')}) VALUES ?`, [
    values,
  ]);
  const inserted = Number(result?.affectedRows || 0);
  const duplicateCount = Math.max(0, rows.length - inserted);
  if (duplicateCount) await incrementTodoPlanMetric(connection, 'reminder_duplicate_prevented', duplicateCount);
  return inserted;
}

function itemRow(
  userId,
  content,
  occurrence,
  { seriesId = null, seriesVersion = null, generatedByTodoId = null } = {},
) {
  return insertData({
    userId,
    title: content.title,
    description: content.description,
    checklist: JSON.stringify(resetChecklist(content.checklist)),
    priority: content.priority,
    sortOrder: content.sortOrder,
    status: 'pending',
    dueAt: occurrence.dueAt,
    startAt: occurrence.startAt,
    planVersion: 2,
    seriesId,
    seriesVersion,
    occurrenceNo: seriesId ? occurrence.occurrenceNo : null,
    occurrenceDate: occurrence.occurrenceDate,
    instanceTimezone: occurrence.timezone,
    isException: 0,
    instanceState: occurrence.state,
    generatedByTodoId,
    recurrenceRule: null,
    recurrenceInstanceAt: occurrence.dueAt || occurrence.startAt,
    delFlag: 0,
  });
}

async function validateResourceRefs(connection, userId, inputRefs) {
  const refs = normalizeTodoResourceRefs(inputRefs) || [];
  if (!refs.length) return [];
  const valid = await validateOwnedResourceRefs(connection, { userId, refs });
  const validMap = new Map(valid.map((entry) => [`${entry.type}:${entry.id}`, entry]));
  if (refs.some((entry) => !validMap.has(`${entry.type}:${entry.id}`))) {
    throw serviceError('TODO_REFERENCE_FORBIDDEN', '部分参考资料不存在或无权访问', 403);
  }
  return refs.map((entry) => ({ ...entry, name: String(validMap.get(`${entry.type}:${entry.id}`)?.name || '') }));
}

async function insertSeriesRefs(connection, { seriesId, userId, refs }) {
  if (!seriesId || !refs.length) return;
  const rows = refs.map((ref, index) => [
    crypto.randomUUID(),
    seriesId,
    userId,
    ref.type,
    ref.id,
    ref.name.slice(0, 500),
    index,
  ]);
  await connection.query(
    `INSERT INTO todo_series_resource_refs
       (id, series_id, user_id, resource_type, resource_id, snapshot_title, sort_order)
     VALUES ?`,
    [rows],
  );
}

async function insertItemRefs(connection, { todoIds, userId, refs }) {
  if (!todoIds.length || !refs.length) return;
  const rows = [];
  for (const todoId of todoIds) {
    refs.forEach((ref, index) => rows.push([todoId, userId, ref.type, ref.id, ref.name.slice(0, 255), index]));
  }
  await connection.query(
    `INSERT IGNORE INTO todo_resource_refs
       (todo_id, user_id, target_type, target_id, target_name_snapshot, sort_order)
     VALUES ?`,
    [rows],
  );
}

async function beginIdempotentRequest(connection, userId, input, hash) {
  const idempotencyKey = String(input?.idempotencyKey || '')
    .trim()
    .slice(0, 64);
  if (!idempotencyKey) throw serviceError('TODO_IDEMPOTENCY_REQUIRED', '缺少创建幂等键');
  const [existingRows] = await connection.query(
    `SELECT request_hash AS requestHash, status, response_json AS responseJson
       FROM todo_plan_requests
      WHERE user_id = ? AND idempotency_key = ? LIMIT 1 FOR UPDATE`,
    [userId, idempotencyKey],
  );
  const existing = existingRows[0];
  if (existing) {
    if (existing.requestHash !== hash) {
      throw serviceError('TODO_IDEMPOTENCY_CONFLICT', '同一幂等键对应的任务计划不同，请重新提交', 409);
    }
    if (existing.status === 'succeeded') return { replay: parseJson(existing.responseJson, {}) };
    throw serviceError('TODO_IDEMPOTENCY_PROCESSING', '该任务计划正在处理，请稍后重试', 409);
  }
  const row = insertData({
    userId,
    idempotencyKey,
    requestHash: hash,
    status: 'processing',
  });
  await connection.query('INSERT INTO todo_plan_requests SET ?', [row]);
  return { requestId: row.id, idempotencyKey };
}

async function finishIdempotentRequest(connection, requestId, response) {
  await connection.query(
    `UPDATE todo_plan_requests
        SET status = 'succeeded', series_id = ?, todo_id = ?, response_json = ?, update_time = NOW()
      WHERE id = ?`,
    [response.seriesId || null, response.todoId || null, JSON.stringify(response), requestId],
  );
}

async function createFromPreview(
  connection,
  userId,
  input,
  preview,
  { requestId, parentSeriesId = null, splitFromOccurrenceNo = null } = {},
) {
  const content = normalizeContent(input, preview.normalizedPlan);
  const plan = preview.normalizedPlan.plan;
  const reminder = preview.normalizedPlan.reminder;
  const timing = preview.normalizedPlan.timing;
  const refs = await validateResourceRefs(connection, userId, input.resourceRefs);
  const seriesId = plan.type === 'once' ? null : crypto.randomUUID();
  let series = null;
  if (seriesId) {
    const scheduleRule = {
      timing,
      plan,
      rollingDays: TODO_PLAN_ROLLING_DAYS,
      rollingMinOccurrences: TODO_PLAN_ROLLING_MIN_OCCURRENCES,
    };
    series = insertData({
      id: seriesId,
      userId,
      title: content.title,
      description: content.description,
      checklistTemplate: JSON.stringify(content.checklist),
      priority: content.priority,
      repeatMode: plan.type,
      status: 'active',
      timezone: timing.timezone,
      scheduleRule: JSON.stringify(scheduleRule),
      version: 1,
      nextOccurrenceNo: preview.occurrences.length + 1,
      generatedThroughDate: preview.occurrences.at(-1)?.occurrenceDate || null,
      parentSeriesId,
      splitFromOccurrenceNo,
      creationKey: input.idempotencyKey || null,
      creationHash: preview.previewHash,
    });
    await connection.query('INSERT INTO todo_series SET ?', [series]);
  }

  const rule = ruleRow(userId, {
    todoId: seriesId ? null : '__pending__',
    seriesId,
    reminder: { ...reminder, timezone: timing.timezone },
  });
  const items = preview.occurrences.map((occurrence) =>
    itemRow(userId, content, occurrence, { seriesId, seriesVersion: series ? series.version : null }),
  );
  if (!seriesId && rule) rule.todo_id = items[0].id;
  for (const item of items) await connection.query('INSERT INTO todo_items SET ?', [item]);
  if (rule) await connection.query('INSERT INTO todo_reminder_rules SET ?', [rule]);

  const jobs = [];
  preview.occurrences.forEach((occurrence, index) => {
    jobs.push(
      ...jobRowsForOccurrence({
        userId,
        todoId: items[index].id,
        seriesId,
        rule,
        occurrence,
        momentEntry: preview.reminderMoments[index],
        reminder,
      }),
    );
  });
  const reminderJobsCreated = await insertReminderJobs(connection, jobs);
  await insertSeriesRefs(connection, { seriesId, userId, refs });
  await insertItemRefs(connection, { todoIds: items.map((item) => item.id), userId, refs });

  const response = {
    todoId: items[0].id,
    seriesId,
    planVersion: 2,
    createdCount: items.length,
    actionableCount: preview.actionableCount,
    skippedCount: preview.skippedCount,
    reminderJobsCreated,
    previewHash: preview.previewHash,
    firstOccurrence: preview.firstOccurrence,
    lastOccurrence: preview.lastOccurrence,
  };
  if (requestId) await finishIdempotentRequest(connection, requestId, response);
  return response;
}

export async function createTodoPlan(connection, userId, input = {}, options = {}) {
  const preview = assertTodoPlanReady(previewTodoPlan(input, options));
  if (!input.previewHash || input.previewHash !== preview.previewHash) {
    throw serviceError('TODO_PREVIEW_STALE', '任务计划预览已变化，请重新确认', 409, {
      preview: { ...preview, occurrences: preview.occurrences.slice(0, 12), reminderMoments: undefined },
    });
  }
  const hash = requestHash(input);
  const request = await beginIdempotentRequest(connection, userId, input, hash);
  if (request.replay) return { ...request.replay, replayed: true };
  const response = await createFromPreview(connection, userId, input, preview, { requestId: request.requestId });
  await invalidatePersonalKnowledgeCache(userId, { database: connection });
  return response;
}

/**
 * 用户主动把一条 v1 待办转换成 v2。旧重复/提醒语义不做自动推断：前端必须先让用户
 * 重新选择计划并提交同一套权威预览；转换成功后才在同一事务里退休旧实例与旧提醒。
 */
export async function convertLegacyTodoPlan(connection, userId, input = {}, options = {}) {
  const legacyTodoId = String(input?.legacyTodoId || '').trim();
  if (!legacyTodoId) throw serviceError('TODO_LEGACY_ID_REQUIRED', '缺少要转换的旧版待办 ID');
  if (input?.legacyConversionAcknowledged !== true) {
    throw serviceError('TODO_LEGACY_ACK_REQUIRED', '请先确认旧版重复与提醒规则不会被自动沿用');
  }
  const [rows] = await connection.query(
    `SELECT id, title, recurrence_rule AS recurrenceRule
       FROM todo_items
      WHERE id = ? AND user_id = ? AND COALESCE(plan_version, 1) = 1 AND del_flag = 0
      LIMIT 1 FOR UPDATE`,
    [legacyTodoId, userId],
  );
  const legacy = rows[0];
  if (!legacy) throw serviceError('TODO_LEGACY_NOT_FOUND', '旧版待办不存在、已转换或无权操作', 404);

  const response = await createTodoPlan(connection, userId, input, options);
  if (response.replayed) {
    // createTodoPlan 的业务幂等命中时，旧任务应已在首次事务中退休；不重复触碰它。
    return { ...response, convertedFromTodoId: legacyTodoId };
  }
  await connection.query(
    `UPDATE todo_items
        SET del_flag = 1, deleted_at = NOW(), update_time = NOW()
      WHERE id = ? AND user_id = ? AND COALESCE(plan_version, 1) = 1 AND del_flag = 0`,
    [legacyTodoId, userId],
  );
  await connection.query(
    `UPDATE todo_reminders
        SET status = 'cancelled', last_error = 'converted_to_v2', update_time = NOW()
      WHERE todo_id = ? AND user_id = ? AND status IN ('pending','processing','paused_complete','paused_delete')`,
    [legacyTodoId, userId],
  );
  await invalidatePersonalKnowledgeCache(userId, { database: connection });
  return {
    ...response,
    convertedFromTodoId: legacyTodoId,
    legacyHadRecurrence: Boolean(parseJson(legacy.recurrenceRule, null)),
  };
}

/** v2 非创建写操作的统一幂等护栏；必须在调用方事务内执行。 */
export async function runIdempotentTodoMutation(connection, userId, input, action, callback) {
  const idempotencyKey = String(input?.idempotencyKey || '')
    .trim()
    .slice(0, 64);
  if (!idempotencyKey) throw serviceError('TODO_IDEMPOTENCY_REQUIRED', '缺少操作幂等键');
  const hash = sha256(
    JSON.stringify(
      stableObject({
        action,
        ...Object.fromEntries(Object.entries(input || {}).filter(([key]) => key !== 'idempotencyKey')),
      }),
    ),
  );
  const [rows] = await connection.query(
    `SELECT action, request_hash AS requestHash, status, response_json AS responseJson
       FROM todo_plan_mutations
      WHERE user_id = ? AND idempotency_key = ? LIMIT 1 FOR UPDATE`,
    [userId, idempotencyKey],
  );
  const existing = rows[0];
  if (existing) {
    if (existing.action !== action || existing.requestHash !== hash) {
      throw serviceError('TODO_IDEMPOTENCY_CONFLICT', '同一幂等键对应的操作不同，请重新提交', 409);
    }
    if (existing.status === 'succeeded') return { ...parseJson(existing.responseJson, {}), replayed: true };
    throw serviceError('TODO_IDEMPOTENCY_PROCESSING', '该操作正在处理，请稍后重试', 409);
  }
  const receipt = insertData({ userId, idempotencyKey, action, requestHash: hash, status: 'processing' });
  await connection.query('INSERT INTO todo_plan_mutations SET ?', [receipt]);
  const response = await callback();
  await connection.query(
    "UPDATE todo_plan_mutations SET status = 'succeeded', response_json = ?, update_time = NOW() WHERE id = ?",
    [JSON.stringify(response), receipt.id],
  );
  return response;
}

function sqlDateTimeFromInstant(instant, timezone) {
  const zoned = instant.toZonedDateTimeISO(timezone);
  const pad = (value) => String(value).padStart(2, '0');
  return `${zoned.year}-${pad(zoned.month)}-${pad(zoned.day)} ${pad(zoned.hour)}:${pad(zoned.minute)}:00`;
}

function utcSqlFromInstant(instant) {
  const utc = instant.toZonedDateTimeISO('UTC');
  const pad = (value) => String(value).padStart(2, '0');
  return `${utc.year}-${pad(utc.month)}-${pad(utc.day)} ${pad(utc.hour)}:${pad(utc.minute)}:00`;
}

function plainDateTimeFromDatabase(value) {
  if (value instanceof Date) {
    return new Temporal.PlainDateTime(
      value.getFullYear(),
      value.getMonth() + 1,
      value.getDate(),
      value.getHours(),
      value.getMinutes(),
      value.getSeconds(),
      value.getMilliseconds(),
    );
  }
  return Temporal.PlainDateTime.from(String(value).replace(' ', 'T'));
}

/**
 * v2「稍后提醒」只移动当前实例每个渠道最早的一条未投递 Job，不改任务时间，也不级联平移
 * 后续催办。当前实例尚无提醒时，创建一条仅属于本实例的单次站内提醒，绝不回写 v1 表。
 */
export async function snoozeV2Todo(connection, userId, current, targetAt) {
  const timezone = String(current.instance_timezone || current.instanceTimezone || 'Asia/Shanghai');
  let target;
  try {
    target = Temporal.PlainDateTime.from(String(targetAt).replace(' ', 'T')).toZonedDateTime(timezone, {
      disambiguation: 'compatible',
    });
  } catch {
    throw serviceError('TODO_SNOOZE_TIME_INVALID', '稍后提醒时间无效');
  }
  if (Temporal.Instant.compare(target.toInstant(), Temporal.Now.instant()) <= 0) {
    throw serviceError('TODO_SNOOZE_TIME_PAST', '稍后提醒时间必须晚于当前时间');
  }
  const scheduledAtUtc = utcSqlFromInstant(target.toInstant());
  const scheduledAtLocal = sqlDateTimeFromInstant(target.toInstant(), timezone);
  const [rows] = await connection.query(
    `SELECT id, channel, status FROM todo_reminder_jobs
      WHERE todo_id = ? AND user_id = ? AND status IN ('pending','paused')
      ORDER BY scheduled_at_utc, sequence_no, id FOR UPDATE`,
    [current.id, userId],
  );
  const firstByChannel = new Map();
  for (const row of rows) {
    if (!firstByChannel.has(row.channel)) firstByChannel.set(row.channel, row);
  }
  if (firstByChannel.size) {
    for (const job of firstByChannel.values()) {
      await connection.query(
        `UPDATE todo_reminder_jobs
            SET status = IF(status = 'paused', 'paused', 'pending'), scheduled_at_utc = ?,
                scheduled_at_local = ?, cancel_reason = 'user_snoozed', lease_token = NULL, lease_until = NULL
          WHERE id = ? AND user_id = ? AND status IN ('pending','paused')`,
        [scheduledAtUtc, scheduledAtLocal, job.id, userId],
      );
    }
    return { id: current.id, scheduledAt: scheduledAtLocal, snoozedJobs: firstByChannel.size };
  }

  const reminder = {
    mode: 'once_per_instance',
    trigger: { type: 'fixed_time', fixedTime: scheduledAtLocal.slice(11, 16) },
    channels: ['in_app'],
    quietPolicy: 'defer_once',
    timezone,
  };
  const rule = ruleRow(userId, { todoId: current.id, reminder });
  await connection.query('UPDATE todo_reminder_rules SET enabled = 0 WHERE todo_id = ? AND user_id = ?', [
    current.id,
    userId,
  ]);
  await connection.query('INSERT INTO todo_reminder_rules SET ?', [rule]);
  const row = insertData({
    userId,
    todoId: current.id,
    seriesId: current.series_id || current.seriesId || null,
    ruleId: rule.id,
    ruleVersion: rule.version,
    channel: 'in_app',
    sequenceNo: 1,
    originalScheduledAtUtc: scheduledAtUtc,
    scheduledAtUtc,
    scheduledAtLocal,
    stopAtUtc: null,
    timezone,
    status: 'pending',
    dedupeKey: sha256([current.id, 'user_snooze', scheduledAtUtc, 'in_app'].join('|')),
  });
  const [inserted] = await connection.query('INSERT IGNORE INTO todo_reminder_jobs SET ?', [row]);
  return {
    id: current.id,
    scheduledAt: scheduledAtLocal,
    snoozedJobs: Number(inserted?.affectedRows || 0),
  };
}

function nextAfterCompletionOccurrence(series, current, completedAt) {
  const schedule = parseJson(series.schedule_rule, {});
  const plan = schedule.plan || {};
  const timing = schedule.timing || {};
  const timezone = series.timezone || timing.timezone || 'Asia/Shanghai';
  const completedZoned =
    completedAt instanceof Date
      ? Temporal.Instant.from(completedAt.toISOString()).toZonedDateTimeISO(timezone)
      : /(?:Z|[+-]\d\d:\d\d)$/u.test(String(completedAt))
        ? Temporal.Instant.from(String(completedAt)).toZonedDateTimeISO(timezone)
        : Temporal.PlainDateTime.from(String(completedAt).replace(' ', 'T')).toZonedDateTime(timezone, {
            disambiguation: 'compatible',
          });
  const duration =
    plan.unit === 'week'
      ? { weeks: plan.interval }
      : plan.unit === 'month'
        ? { months: plan.interval }
        : { days: plan.interval };
  const target = completedZoned.add(duration);
  const hasStart = Boolean(timing.startTime);
  const hasDue = Boolean(timing.dueTime);
  const currentStartAt = current.startAt ?? current.start_at;
  const currentDueAt = current.dueAt ?? current.due_at;
  let due = null;
  if (hasDue) {
    if (hasStart && currentStartAt && currentDueAt) {
      const currentStart = plainDateTimeFromDatabase(currentStartAt).toZonedDateTime(timezone);
      const currentDue = plainDateTimeFromDatabase(currentDueAt).toZonedDateTime(timezone);
      const deltaMinutes = Math.max(0, Math.round(currentStart.until(currentDue, { largestUnit: 'minutes' }).minutes));
      due = target.add({ minutes: deltaMinutes });
    } else {
      due = target;
    }
  }
  return {
    occurrenceNo: Number(current.occurrence_no || 0) + 1,
    occurrenceDate: target.toPlainDate().toString(),
    startAt: hasStart ? sqlDateTimeFromInstant(target.toInstant(), timezone) : null,
    startAtUtc: hasStart ? target.toInstant().toString().slice(0, 19).replace('T', ' ') : null,
    dueAt: due ? sqlDateTimeFromInstant(due.toInstant(), timezone) : null,
    dueAtUtc: due ? due.toInstant().toString().slice(0, 19).replace('T', ' ') : null,
    timezone,
    state: 'normal',
    missed: false,
  };
}

async function loadSeriesRule(connection, seriesId, userId) {
  const [rows] = await connection.query(
    `SELECT * FROM todo_reminder_rules
      WHERE series_id = ? AND user_id = ? AND enabled = 1
      ORDER BY version DESC LIMIT 1`,
    [seriesId, userId],
  );
  return rows[0] || null;
}

function reminderFromRule(rule) {
  if (!rule) return { mode: 'none', channels: [] };
  const versionedSchedule = parseJson(rule.schedule_json, null);
  if (versionedSchedule?.version === 2 && versionedSchedule.schedule) {
    return versionedSchedule.schedule;
  }
  return {
    mode: rule.mode,
    trigger: {
      type: rule.trigger_type,
      ...(rule.fixed_local_time ? { fixedTime: String(rule.fixed_local_time).slice(0, 5) } : {}),
      ...(rule.offset_minutes !== null ? { offsetMinutes: Number(rule.offset_minutes) } : {}),
    },
    channels: parseJson(rule.channels, []),
    targetEmail: rule.target_email || null,
    quietPolicy: rule.quiet_policy || 'defer_once',
    ...(rule.mode === 'nudge'
      ? {
          nudge: {
            intervalMinutes: Number(rule.repeat_interval_minutes),
            stop: rule.stop_type,
            maxCount: Number(rule.max_count),
          },
        }
      : {}),
  };
}

function reminderMomentsForAdHocOccurrence(occurrence, reminder, now = new Date()) {
  if (!reminder || reminder.mode === 'none') return [];
  const start = occurrence.startAt ? plainDateTimeFromDatabase(occurrence.startAt) : null;
  const due = occurrence.dueAt ? plainDateTimeFromDatabase(occurrence.dueAt) : null;
  const anchorDate = start?.toPlainDate() || Temporal.PlainDate.from(occurrence.occurrenceDate);
  const dueDayOffset = start && due ? Math.max(0, start.toPlainDate().until(due.toPlainDate()).days) : 0;
  const pad = (value) => String(value).padStart(2, '0');
  const timing = {
    timezone: occurrence.timezone,
    anchorDate: anchorDate.toString(),
    startTime: start ? `${pad(start.hour)}:${pad(start.minute)}` : null,
    dueTime: due ? `${pad(due.hour)}:${pad(due.minute)}` : null,
    dueDayOffset,
  };
  const preview = calculateTodoPlan(
    {
      title: 'next',
      timing,
      plan: { type: 'once', pastPolicy: 'keep_overdue' },
      reminder,
    },
    { now },
  );
  return preview.reminderMoments[0]?.moments || [];
}

async function copySeriesRefsToItem(connection, seriesId, userId, todoId) {
  await connection.query(
    `INSERT IGNORE INTO todo_resource_refs
       (todo_id, user_id, target_type, target_id, target_name_snapshot, sort_order)
     SELECT ?, user_id, resource_type, resource_id, LEFT(snapshot_title, 255), sort_order
       FROM todo_series_resource_refs WHERE series_id = ? AND user_id = ?`,
    [todoId, seriesId, userId],
  );
}

export async function generateAfterCompletionNext(connection, userId, current, completedAt) {
  const seriesId = current.seriesId ?? current.series_id;
  const occurrenceNo = Number(current.occurrenceNo ?? current.occurrence_no ?? 0);
  const [seriesRows] = await connection.query(
    `SELECT * FROM todo_series WHERE id = ? AND user_id = ? LIMIT 1 FOR UPDATE`,
    [seriesId, userId],
  );
  const series = seriesRows[0];
  if (!series || series.status !== 'active' || series.repeat_mode !== 'after_completion') return null;
  const schedule = parseJson(series.schedule_rule, {});
  const end = schedule.plan?.end || { mode: 'never' };
  const nextNo = occurrenceNo + 1;
  if (end.mode === 'count' && nextNo > Number(end.count || 0)) {
    await connection.query("UPDATE todo_series SET status = 'ended' WHERE id = ?", [series.id]);
    return null;
  }
  const [existingRows] = await connection.query(
    `SELECT id, del_flag AS delFlag, generated_by_todo_id AS generatedByTodoId
       FROM todo_items WHERE series_id = ? AND occurrence_no = ? LIMIT 1 FOR UPDATE`,
    [series.id, nextNo],
  );
  const existing = existingRows[0];
  if (existing && !existing.delFlag) return existing.id;
  const occurrence = nextAfterCompletionOccurrence(series, current, completedAt);
  const content = {
    title: series.title,
    description: series.description,
    checklist: parseJson(series.checklist_template, []),
    priority: Number(series.priority),
    sortOrder: Number(current.sortOrder ?? current.sort_order ?? Date.now()),
  };
  const item = itemRow(userId, content, occurrence, {
    seriesId: series.id,
    seriesVersion: series.version,
    generatedByTodoId: current.id,
  });
  if (existing) {
    if (String(existing.generatedByTodoId || '') !== String(current.id)) {
      throw serviceError('TODO_NEXT_INSTANCE_CONFLICT', '下一项实例已存在，无法按新的完成时间重新安排', 409);
    }
    item.id = existing.id;
    await connection.query(
      `UPDATE todo_items
          SET title = ?, description = ?, checklist = ?, priority = ?, sort_order = ?, status = 'pending',
              start_at = ?, due_at = ?, completed_at = NULL, plan_version = 2, series_version = ?,
              occurrence_date = ?, instance_timezone = ?, is_exception = 0, instance_state = 'normal',
              generated_by_todo_id = ?, recurrence_rule = NULL, recurrence_instance_at = ?,
              del_flag = 0, deleted_at = NULL, update_time = NOW()
        WHERE id = ? AND user_id = ? AND del_flag = 1`,
      [
        content.title,
        content.description,
        JSON.stringify(resetChecklist(content.checklist)),
        content.priority,
        content.sortOrder,
        occurrence.startAt,
        occurrence.dueAt,
        series.version,
        occurrence.occurrenceDate,
        occurrence.timezone,
        current.id,
        occurrence.dueAt || occurrence.startAt,
        existing.id,
        userId,
      ],
    );
    await connection.query(
      `DELETE FROM todo_reminder_jobs
        WHERE todo_id = ? AND user_id = ? AND status = 'cancelled' AND cancel_reason = 'completion_undone'`,
      [existing.id, userId],
    );
  } else {
    await connection.query('INSERT INTO todo_items SET ?', [item]);
  }
  await copySeriesRefsToItem(connection, series.id, userId, item.id);
  const rule = await loadSeriesRule(connection, series.id, userId);
  const reminder = reminderFromRule(rule);
  const moments = reminderMomentsForAdHocOccurrence(occurrence, reminder);
  const jobs = jobRowsForOccurrence({
    userId,
    todoId: item.id,
    seriesId: series.id,
    rule,
    occurrence,
    momentEntry: { moments },
    reminder,
  });
  await insertReminderJobs(connection, jobs);
  await connection.query(
    `UPDATE todo_series SET next_occurrence_no = ?, generated_through_date = ?, update_time = NOW() WHERE id = ?`,
    [nextNo + 1, occurrence.occurrenceDate, series.id],
  );
  return item.id;
}

export async function setV2TodoStatus(connection, userId, current, status, { undoCompletion = false } = {}) {
  const seriesId = current.seriesId ?? current.series_id;
  const completedAt = status === 'completed' ? new Date() : null;
  const [result] = await connection.query(
    `UPDATE todo_items
        SET status = ?, completed_at = ${status === 'completed' ? 'NOW()' : 'NULL'}, update_time = NOW()
      WHERE id = ? AND user_id = ? AND del_flag = 0 AND status <> ?`,
    [status, current.id, userId, status],
  );
  if (!result.affectedRows) return 0;
  if (status === 'completed') {
    await recordTodoCompletion(connection, { userId, todoId: current.id });
    try {
      const { persistAchievementMetricFromDatabase } = await import('../growthAchievementState.js');
      await persistAchievementMetricFromDatabase(userId, 'completedTodoCount', { db: connection });
    } catch (error) {
      console.warn('[todo-series] 成长成就状态同步失败 code=%s', String(error?.code || 'ACHIEVEMENT_SYNC_FAILED'));
    }
    await connection.query(
      `UPDATE todo_reminder_jobs
          SET status = 'cancelled', cancel_reason = 'completed', lease_token = NULL, lease_until = NULL
        WHERE todo_id = ? AND user_id = ? AND status IN ('pending','paused')`,
      [current.id, userId],
    );
    if (seriesId) {
      await generateAfterCompletionNext(connection, userId, current, completedAt);
    }
  } else {
    if (seriesId && undoCompletion) {
      const [generatedRows] = await connection.query(
        `SELECT id, status, is_exception AS isException, del_flag AS delFlag
           FROM todo_items WHERE generated_by_todo_id = ? AND user_id = ? LIMIT 1 FOR UPDATE`,
        [current.id, userId],
      );
      const generated = generatedRows[0];
      if (generated) {
        if (generated.status !== 'pending' || generated.isException || generated.delFlag) {
          throw serviceError('TODO_UNDO_CONFLICT', '下一项已被处理，不能自动撤销本次完成', 409, {
            generatedTodoId: generated.id,
          });
        }
        await connection.query('UPDATE todo_items SET del_flag = 1, deleted_at = NOW() WHERE id = ?', [generated.id]);
        await connection.query(
          "UPDATE todo_reminder_jobs SET status = 'cancelled', cancel_reason = 'completion_undone' WHERE todo_id = ? AND status IN ('pending','paused')",
          [generated.id],
        );
      }
    }
    await connection.query(
      `UPDATE todo_reminder_jobs
          SET status = IF(original_scheduled_at_utc > UTC_TIMESTAMP(), 'pending', 'skipped'),
              scheduled_at_utc = original_scheduled_at_utc,
              cancel_reason = IF(original_scheduled_at_utc > UTC_TIMESTAMP(), NULL, 'past_after_reopen')
        WHERE todo_id = ? AND user_id = ? AND status = 'cancelled' AND cancel_reason = 'completed'`,
      [current.id, userId],
    );
  }
  await invalidatePersonalKnowledgeCache(userId, { database: connection });
  return 1;
}

export async function ensureSeriesBuffer(connection, seriesId, { now = new Date(), throughDate = null } = {}) {
  const [seriesRows] = await connection.query('SELECT * FROM todo_series WHERE id = ? LIMIT 1 FOR UPDATE', [seriesId]);
  const series = seriesRows[0];
  if (!series || series.status !== 'active' || series.repeat_mode !== 'scheduled') return { createdCount: 0 };
  const schedule = parseJson(series.schedule_rule, {});
  if (schedule.plan?.end?.mode !== 'never') return { createdCount: 0 };
  const [existingRows] = await connection.query(
    `SELECT COALESCE(MAX(occurrence_no), 0) AS maxOccurrenceNo FROM todo_items WHERE series_id = ?`,
    [series.id],
  );
  const occurrenceStart = Math.max(
    1,
    Number(series.next_occurrence_no || 1),
    Number(existingRows[0]?.maxOccurrenceNo || 0) + 1,
  );
  const rule = await loadSeriesRule(connection, series.id, series.user_id);
  const reminder = reminderFromRule(rule);
  const remindersPerOccurrence =
    reminder.mode === 'none' ? 0 : reminder.mode === 'nudge' ? Number(reminder.nudge?.maxCount || 1) : 1;
  const reminderJobsPerOccurrence = remindersPerOccurrence * reminder.channels.length;
  const occurrenceLimit = Math.min(
    MAX_GENERATION_BATCH,
    reminderJobsPerOccurrence
      ? Math.max(1, Math.floor(TODO_PLAN_MAX_REMINDER_JOBS / reminderJobsPerOccurrence))
      : MAX_GENERATION_BATCH,
  );
  const preview = calculateTodoPlan(
    {
      title: series.title,
      description: series.description,
      priority: series.priority,
      timing: schedule.timing,
      plan: schedule.plan,
      reminder,
    },
    {
      now,
      occurrenceStart,
      occurrenceLimit,
      rollingThroughDate: throughDate,
      allowEmptyOccurrences: true,
      enforceReminderJobLimit: false,
    },
  );
  const missing = preview.occurrences;
  if (!missing.length) return { createdCount: 0 };
  const content = {
    title: series.title,
    description: series.description,
    checklist: parseJson(series.checklist_template, []),
    priority: Number(series.priority),
    sortOrder: Date.now(),
  };
  const items = [];
  const jobs = [];
  for (const occurrence of missing) {
    const item = itemRow(series.user_id, content, occurrence, { seriesId: series.id, seriesVersion: series.version });
    const [inserted] = await connection.query('INSERT IGNORE INTO todo_items SET ?', [item]);
    // 唯一键兜底命中时，不得继续为未落库的随机 item.id 创建孤立提醒 Job。
    if (!Number(inserted?.affectedRows || 0)) continue;
    items.push(item);
    const momentEntry = preview.reminderMoments.find((entry) => entry.occurrenceNo === occurrence.occurrenceNo);
    jobs.push(
      ...jobRowsForOccurrence({
        userId: series.user_id,
        todoId: item.id,
        seriesId: series.id,
        rule,
        occurrence,
        momentEntry,
        reminder,
      }),
    );
  }
  for (const item of items) await copySeriesRefsToItem(connection, series.id, series.user_id, item.id);
  const reminderJobsCreated = await insertReminderJobs(connection, jobs);
  await connection.query(
    `UPDATE todo_series SET next_occurrence_no = ?, generated_through_date = ?, last_generation_error = NULL WHERE id = ?`,
    [Math.max(...missing.map((entry) => entry.occurrenceNo)) + 1, missing.at(-1).occurrenceDate, series.id],
  );
  return { createdCount: items.length, reminderJobsCreated };
}

/**
 * 日历翻月时按需把当前用户的长期固定日程补到可视范围末尾。
 * 最多只允许向今天之后一年探查，避免一个 UI 请求生成无界数据。
 */
export async function ensureTodoCalendarRange(connection, userId, input = {}, { now = new Date() } = {}) {
  let endDate;
  try {
    endDate = Temporal.PlainDate.from(String(input.endDate || '').trim());
  } catch {
    throw serviceError('TODO_CALENDAR_RANGE_INVALID', '日历结束日期格式无效');
  }
  const today = Temporal.Instant.from(now.toISOString()).toZonedDateTimeISO('Asia/Shanghai').toPlainDate();
  if (Temporal.PlainDate.compare(endDate, today.add({ days: 366 })) > 0) {
    throw serviceError('TODO_CALENDAR_RANGE_TOO_LARGE', '日历最多可提前加载未来一年');
  }
  if (Temporal.PlainDate.compare(endDate, today) < 0) return { createdCount: 0, seriesCount: 0 };

  const [rows] = await connection.query(
    `SELECT id
       FROM todo_series
      WHERE user_id = ? AND status = 'active' AND repeat_mode = 'scheduled'
        AND JSON_UNQUOTE(JSON_EXTRACT(schedule_rule, '$.plan.end.mode')) = 'never'
        AND (generated_through_date IS NULL OR generated_through_date < ?)
      ORDER BY generated_through_date, id`,
    [userId, endDate.toString()],
  );
  let createdCount = 0;
  let seriesCount = 0;
  for (const row of rows) {
    let generatedForSeries = 0;
    // 一年每日计划最多 367 项；单批上限 200，因此最多三轮即可覆盖。
    for (let batch = 0; batch < 3; batch += 1) {
      const result = await ensureSeriesBuffer(connection, row.id, {
        now,
        throughDate: endDate.toString(),
      });
      generatedForSeries += Number(result.createdCount || 0);
      if (Number(result.createdCount || 0) < MAX_GENERATION_BATCH) break;
    }
    if (generatedForSeries > 0) seriesCount += 1;
    createdCount += generatedForSeries;
  }
  return { createdCount, seriesCount };
}

function timingFromSingleTodo(todo, timezone) {
  const start = todo.start_at ? plainDateTimeFromDatabase(todo.start_at) : null;
  const due = todo.due_at ? plainDateTimeFromDatabase(todo.due_at) : null;
  const anchor = start?.toPlainDate() || due?.toPlainDate() || null;
  const dueDayOffset = start && due ? Math.max(0, start.toPlainDate().until(due.toPlainDate()).days) : 0;
  const pad = (value) => String(value).padStart(2, '0');
  return {
    timezone,
    anchorDate: anchor?.toString() || null,
    startTime: start ? `${pad(start.hour)}:${pad(start.minute)}` : null,
    dueTime: due ? `${pad(due.hour)}:${pad(due.minute)}` : null,
    dueDayOffset,
  };
}

/**
 * 补齐默认单待办的长期重复提醒。只复算确定性的未来 60 天窗口，现有 dedupe key
 * 会吞掉已存在的时刻；不会生成新的 todo_items，也不会引入第二套调度器。
 */
export async function ensureSingleReminderBuffer(connection, ruleId, { now = new Date() } = {}) {
  const [rows] = await connection.query(
    `SELECT r.*, i.title, i.description, i.priority, i.start_at, i.due_at, i.status AS todo_status,
            i.del_flag
       FROM todo_reminder_rules r
       JOIN todo_items i ON i.id = r.todo_id AND i.user_id = r.user_id
      WHERE r.id = ? AND r.enabled = 1 AND r.mode = 'single_schedule'
      LIMIT 1 FOR UPDATE`,
    [ruleId],
  );
  const rule = rows[0];
  if (!rule || rule.todo_status !== 'pending' || rule.del_flag) return { reminderJobsCreated: 0 };
  const reminder = reminderFromRule(rule);
  if (reminder.mode !== 'repeat') return { reminderJobsCreated: 0 };
  if (!['completion', 'completion_or_due', 'manual'].includes(reminder.repeat?.stop?.type)) {
    return { reminderJobsCreated: 0 };
  }
  const timing = timingFromSingleTodo(rule, rule.timezone || 'Asia/Shanghai');
  const preview = calculateTodoPlan(
    {
      taskMode: 'single',
      title: rule.title,
      description: rule.description || '',
      priority: Number(rule.priority || 1),
      timing,
      plan: { type: 'once', pastPolicy: 'keep_overdue' },
      reminder: { mode: 'none' },
      singleTaskReminder: reminder,
    },
    { now, enforceReminderJobLimit: false },
  );
  const occurrence = preview.occurrences[0];
  const jobs = jobRowsForOccurrence({
    userId: rule.user_id,
    todoId: rule.todo_id,
    seriesId: null,
    rule,
    occurrence,
    momentEntry: preview.reminderMoments[0],
    reminder,
  });
  return { reminderJobsCreated: await insertReminderJobs(connection, jobs) };
}

export async function runSeriesAction(connection, userId, input = {}) {
  const seriesId = String(input.seriesId || '').trim();
  const action = String(input.action || '').trim();
  if (!seriesId || !SERIES_ACTIONS.has(action)) throw serviceError('TODO_SERIES_ACTION_INVALID', '系列操作参数无效');
  const [rows] = await connection.query(
    'SELECT id, status FROM todo_series WHERE id = ? AND user_id = ? LIMIT 1 FOR UPDATE',
    [seriesId, userId],
  );
  const series = rows[0];
  if (!series) throw serviceError('TODO_SERIES_NOT_FOUND', '任务系列不存在或无权操作', 404);
  if (action === 'pause') {
    if (series.status === 'ended') throw serviceError('TODO_SERIES_ENDED', '已结束的任务系列不能暂停', 409);
    if (series.status === 'paused') return { seriesId, status: 'paused', affectedJobs: 0 };
    await connection.query("UPDATE todo_series SET status = 'paused' WHERE id = ?", [seriesId]);
    const [jobs] = await connection.query(
      `UPDATE todo_reminder_jobs SET status = 'paused', cancel_reason = 'series_paused', lease_token = NULL, lease_until = NULL
        WHERE series_id = ? AND user_id = ? AND status = 'pending'`,
      [seriesId, userId],
    );
    return { seriesId, status: 'paused', affectedJobs: Number(jobs.affectedRows || 0) };
  }
  if (action === 'resume') {
    if (series.status === 'ended') throw serviceError('TODO_SERIES_ENDED', '已结束的任务系列不能恢复', 409);
    await connection.query("UPDATE todo_series SET status = 'active' WHERE id = ?", [seriesId]);
    const [jobs] = await connection.query(
      `UPDATE todo_reminder_jobs
          SET status = IF(original_scheduled_at_utc > UTC_TIMESTAMP(), 'pending', 'skipped'),
              scheduled_at_utc = original_scheduled_at_utc,
              cancel_reason = IF(original_scheduled_at_utc > UTC_TIMESTAMP(), NULL, 'past_while_paused')
        WHERE series_id = ? AND user_id = ? AND status = 'paused'`,
      [seriesId, userId],
    );
    const generated = await ensureSeriesBuffer(connection, seriesId);
    return { seriesId, status: 'active', affectedJobs: Number(jobs.affectedRows || 0), ...generated };
  }
  if (series.status === 'ended') return { seriesId, status: 'ended', affectedItems: 0, affectedJobs: 0 };
  await connection.query("UPDATE todo_series SET status = 'ended' WHERE id = ?", [seriesId]);
  const [items] = await connection.query(
    `UPDATE todo_items SET del_flag = 1, deleted_at = NOW()
      WHERE series_id = ? AND user_id = ? AND status = 'pending' AND occurrence_date >= CURDATE() AND del_flag = 0`,
    [seriesId, userId],
  );
  const [jobs] = await connection.query(
    `UPDATE todo_reminder_jobs SET status = 'cancelled', cancel_reason = 'series_stopped', lease_token = NULL, lease_until = NULL
      WHERE series_id = ? AND user_id = ? AND status IN ('pending','paused')`,
    [seriesId, userId],
  );
  return {
    seriesId,
    status: 'ended',
    affectedItems: Number(items.affectedRows || 0),
    affectedJobs: Number(jobs.affectedRows || 0),
  };
}

export async function skipTodoInstance(connection, userId, todoId) {
  const [rows] = await connection.query(
    `SELECT id, series_id AS seriesId, status, instance_state AS instanceState FROM todo_items
      WHERE id = ? AND user_id = ? AND plan_version = 2 AND del_flag = 0 LIMIT 1 FOR UPDATE`,
    [todoId, userId],
  );
  if (!rows[0]) throw serviceError('TODO_NOT_FOUND', '待办不存在或无权操作', 404);
  if (!rows[0].seriesId) throw serviceError('TODO_NOT_SERIES_INSTANCE', '仅任务系列实例可以跳过');
  if (rows[0].status !== 'pending') {
    throw serviceError('TODO_INSTANCE_NOT_PENDING', '只有待处理的任务实例可以跳过', 409);
  }
  if (rows[0].instanceState === 'skipped') return { todoId, state: 'skipped', affectedJobs: 0 };
  await connection.query(
    `UPDATE todo_items SET instance_state = 'skipped', update_time = NOW()
      WHERE id = ? AND user_id = ? AND status = 'pending' AND instance_state = 'normal'`,
    [todoId, userId],
  );
  const [jobs] = await connection.query(
    `UPDATE todo_reminder_jobs SET status = 'cancelled', cancel_reason = 'instance_skipped', lease_token = NULL, lease_until = NULL
      WHERE todo_id = ? AND user_id = ? AND status IN ('pending','paused')`,
    [todoId, userId],
  );
  return { todoId, state: 'skipped', affectedJobs: Number(jobs.affectedRows || 0) };
}

async function cancelRange(connection, userId, current, { includeAll = false } = {}) {
  const where = includeAll ? '' : 'AND occurrence_no >= ?';
  const params = includeAll
    ? [current.series_id, userId]
    : [current.series_id, userId, Number(current.occurrence_no || 0)];
  const [items] = await connection.query(
    `UPDATE todo_items SET del_flag = 1, deleted_at = NOW(), update_time = NOW()
      WHERE series_id = ? AND user_id = ? ${where} AND status = 'pending' AND del_flag = 0`,
    params,
  );
  const [jobs] = await connection.query(
    `UPDATE todo_reminder_jobs j
       JOIN todo_items i ON i.id = j.todo_id
        SET j.status = 'cancelled', j.cancel_reason = 'series_replaced', j.lease_token = NULL, j.lease_until = NULL
      WHERE i.series_id = ? AND i.user_id = ? ${includeAll ? '' : 'AND i.occurrence_no >= ?'}
        AND j.status IN ('pending','paused')`,
    params,
  );
  return { affectedItems: Number(items.affectedRows || 0), affectedJobs: Number(jobs.affectedRows || 0) };
}

export async function updateTodoPlan(connection, userId, input = {}, options = {}) {
  const todoId = String(input.todoId || '').trim();
  const scope = String(input.scope || 'current');
  if (!todoId || !WRITE_SCOPES.has(scope)) throw serviceError('TODO_UPDATE_SCOPE_INVALID', '修改范围无效');
  const [rows] = await connection.query(
    `SELECT * FROM todo_items WHERE id = ? AND user_id = ? AND plan_version = 2 AND del_flag = 0 LIMIT 1 FOR UPDATE`,
    [todoId, userId],
  );
  const current = rows[0];
  if (!current) throw serviceError('TODO_NOT_FOUND', '待办不存在或无权操作', 404);
  const preview = assertTodoPlanReady(previewTodoPlan(input, options));
  if (!input.previewHash || input.previewHash !== preview.previewHash) {
    throw serviceError('TODO_PREVIEW_STALE', '任务计划预览已变化，请重新确认', 409);
  }
  if (scope === 'current' && current.series_id && preview.normalizedPlan.plan.type !== 'once') {
    throw serviceError('TODO_CURRENT_SCOPE_PLAN_INVALID', '仅修改当前实例时不能创建新的重复计划，请改选“当前及以后”');
  }
  if (scope === 'current' && !current.series_id && preview.normalizedPlan.plan.type !== 'once') {
    await connection.query(
      `UPDATE todo_items SET del_flag = 1, deleted_at = NOW(), update_time = NOW()
        WHERE id = ? AND user_id = ? AND plan_version = 2 AND del_flag = 0`,
      [current.id, userId],
    );
    await connection.query('UPDATE todo_reminder_rules SET enabled = 0 WHERE todo_id = ? AND user_id = ?', [
      todoId,
      userId,
    ]);
    const [cancelledJobs] = await connection.query(
      `UPDATE todo_reminder_jobs
          SET status = 'cancelled', cancel_reason = 'single_replaced_by_series', lease_token = NULL, lease_until = NULL
        WHERE todo_id = ? AND user_id = ? AND status IN ('pending','paused')`,
      [todoId, userId],
    );
    const response = await createFromPreview(connection, userId, input, preview);
    await invalidatePersonalKnowledgeCache(userId, { database: connection });
    return {
      ...response,
      scope,
      replacedTodoId: current.id,
      affectedItems: 1,
      affectedJobs: Number(cancelledJobs.affectedRows || 0),
    };
  }
  if (scope === 'current') {
    const content = normalizeContent(input, preview.normalizedPlan);
    const occurrence = preview.occurrences[0];
    const [ruleVersions] = await connection.query(
      'SELECT COALESCE(MAX(version), 0) AS maxVersion FROM todo_reminder_rules WHERE todo_id = ? AND user_id = ? FOR UPDATE',
      [todoId, userId],
    );
    const nextRuleVersion = Number(ruleVersions[0]?.maxVersion || 0) + 1;
    await connection.query(
      `UPDATE todo_items SET title = ?, description = ?, checklist = ?, priority = ?, start_at = ?, due_at = ?,
              occurrence_date = ?, instance_timezone = ?, is_exception = 1, update_time = NOW()
        WHERE id = ?`,
      [
        content.title,
        content.description,
        JSON.stringify(content.checklist),
        content.priority,
        occurrence.startAt,
        occurrence.dueAt,
        occurrence.occurrenceDate,
        occurrence.timezone,
        current.id,
      ],
    );
    await connection.query('UPDATE todo_reminder_rules SET enabled = 0 WHERE todo_id = ? AND user_id = ?', [
      todoId,
      userId,
    ]);
    await connection.query(
      `UPDATE todo_reminder_jobs SET status = 'cancelled', cancel_reason = 'instance_updated'
        WHERE todo_id = ? AND user_id = ? AND status IN ('pending','paused')`,
      [todoId, userId],
    );
    // 已被 Worker 领取的投递不能伪装成“已取消”：保留租约让 Worker 记录 sent/failed/unknown；
    // 若明确失败后回到 pending，下面的取消原因会阻止旧规则再次投递。
    await connection.query(
      `UPDATE todo_reminder_jobs SET cancel_reason = 'instance_updated'
        WHERE todo_id = ? AND user_id = ? AND status = 'processing'`,
      [todoId, userId],
    );
    const reminder = preview.normalizedPlan.reminder;
    const rule = ruleRow(userId, {
      todoId,
      reminder: { ...reminder, timezone: occurrence.timezone },
    });
    if (rule) rule.version = nextRuleVersion;
    if (rule) await connection.query('INSERT INTO todo_reminder_rules SET ?', [rule]);
    const jobs = jobRowsForOccurrence({
      userId,
      todoId,
      seriesId: current.series_id,
      rule,
      occurrence,
      momentEntry: preview.reminderMoments[0],
      reminder,
    });
    await insertReminderJobs(connection, jobs);
    if (input.resourceRefs !== undefined) {
      await replaceTodoResourceRefs(connection, {
        userId,
        todoId,
        refs: normalizeTodoResourceRefs(input.resourceRefs) || [],
      });
    }
    await invalidatePersonalKnowledgeCache(userId, { database: connection });
    return { todoId, scope, affectedItems: 1, reminderJobsCreated: jobs.length };
  }
  if (!current.series_id) throw serviceError('TODO_NOT_SERIES_INSTANCE', '该待办不属于任务系列');
  const includeAll = scope === 'series';
  const cancelled = await cancelRange(connection, userId, current, { includeAll });
  await connection.query("UPDATE todo_series SET status = 'ended', update_time = NOW() WHERE id = ? AND user_id = ?", [
    current.series_id,
    userId,
  ]);
  const replacementInput = {
    ...input,
    idempotencyKey: String(input.idempotencyKey || crypto.randomUUID()),
  };
  const response = await createFromPreview(connection, userId, replacementInput, preview, {
    parentSeriesId: current.series_id,
    splitFromOccurrenceNo: Number(current.occurrence_no || 1),
  });
  await invalidatePersonalKnowledgeCache(userId, { database: connection });
  return { ...response, scope, replacedSeriesId: current.series_id, ...cancelled };
}

export async function deleteTodoPlan(connection, userId, input = {}) {
  const todoId = String(input.todoId || '').trim();
  const scope = String(input.scope || 'current');
  if (!todoId || !DELETE_SCOPES.has(scope)) throw serviceError('TODO_DELETE_SCOPE_INVALID', '删除范围无效');
  const [rows] = await connection.query(
    `SELECT * FROM todo_items WHERE id = ? AND user_id = ? AND plan_version = 2 AND del_flag = 0 LIMIT 1 FOR UPDATE`,
    [todoId, userId],
  );
  const current = rows[0];
  if (!current) throw serviceError('TODO_NOT_FOUND', '待办不存在或无权操作', 404);
  if (scope === 'current' || !current.series_id) {
    await connection.query('UPDATE todo_items SET del_flag = 1, deleted_at = NOW(), update_time = NOW() WHERE id = ?', [
      todoId,
    ]);
    const [jobs] = await connection.query(
      `UPDATE todo_reminder_jobs SET status = 'cancelled', cancel_reason = 'instance_deleted'
        WHERE todo_id = ? AND user_id = ? AND status IN ('pending','paused')`,
      [todoId, userId],
    );
    return { todoId, scope: 'current', affectedItems: 1, affectedJobs: Number(jobs.affectedRows || 0) };
  }
  if (scope === 'series') {
    const cancelled = await cancelRange(connection, userId, current, { includeAll: true });
    await connection.query(
      "UPDATE todo_series SET status = 'ended', update_time = NOW() WHERE id = ? AND user_id = ?",
      [current.series_id, userId],
    );
    return { todoId, scope, seriesId: current.series_id, status: 'ended', ...cancelled };
  }
  const cancelled = await cancelRange(connection, userId, current);
  await connection.query("UPDATE todo_series SET status = 'ended', update_time = NOW() WHERE id = ?", [
    current.series_id,
  ]);
  return { todoId, scope, seriesId: current.series_id, ...cancelled };
}

export async function loadV2SeriesMap(db, userId, items) {
  const seriesIds = [...new Set(items.map((item) => item.seriesId).filter(Boolean))];
  if (!seriesIds.length) return new Map();
  const [rows] = await db.query(
    `SELECT s.id, s.repeat_mode AS repeatMode, s.status, s.timezone, s.schedule_rule AS scheduleRule,
            s.version,
            SUM(CASE WHEN i.instance_state = 'normal' THEN 1 ELSE 0 END) AS generatedCount,
            SUM(CASE WHEN i.status = 'completed' AND i.instance_state = 'normal' THEN 1 ELSE 0 END) AS completedCount,
            SUM(CASE WHEN i.instance_state = 'skipped' THEN 1 ELSE 0 END) AS skippedCount
       FROM todo_series s
       LEFT JOIN todo_items i ON i.series_id = s.id AND i.del_flag = 0
      WHERE s.user_id = ? AND s.id IN (${seriesIds.map(() => '?').join(',')})
      GROUP BY s.id`,
    [userId, ...seriesIds],
  );
  return new Map(
    rows.map((row) => {
      const schedule = parseJson(row.scheduleRule, {});
      const knownTotal = schedule.plan?.end?.mode === 'count' ? Number(schedule.plan.end.count) : null;
      return [
        String(row.id),
        {
          id: String(row.id),
          repeatMode: row.repeatMode,
          status: row.status,
          timezone: row.timezone,
          version: Number(row.version),
          plan: schedule.plan || null,
          timing: schedule.timing || null,
          progress: {
            completed: Number(row.completedCount || 0),
            skipped: Number(row.skippedCount || 0),
            generated: Number(row.generatedCount || 0),
            total: knownTotal,
          },
        },
      ];
    }),
  );
}

export async function loadV2ReminderMap(db, userId, items) {
  const ids = items.map((item) => String(item.id));
  if (!ids.length) return new Map();
  const seriesIds = [
    ...new Set(
      items
        .map((item) => item.seriesId)
        .filter(Boolean)
        .map(String),
    ),
  ];
  const ruleConditions = [`todo_id IN (${ids.map(() => '?').join(',')})`];
  const ruleParams = [userId, ...ids];
  if (seriesIds.length) {
    ruleConditions.push(`series_id IN (${seriesIds.map(() => '?').join(',')})`);
    ruleParams.push(...seriesIds);
  }
  const [rules] = await db.query(
    `SELECT id, todo_id AS todoId, series_id AS seriesId, mode,
            trigger_type AS triggerType, fixed_local_time AS fixedTime,
            offset_minutes AS offsetMinutes, repeat_interval_minutes AS intervalMinutes,
            max_count AS maxCount, stop_type AS stopType, channels,
            target_email AS targetEmail, quiet_policy AS quietPolicy,
            schedule_json AS scheduleJson
       FROM todo_reminder_rules
      WHERE user_id = ? AND enabled = 1 AND (${ruleConditions.join(' OR ')})
      ORDER BY update_time DESC, create_time DESC`,
    ruleParams,
  );
  const [jobs] = await db.query(
    `SELECT todo_id AS todoId, channel, sequence_no AS sequenceNo, scheduled_at_local AS scheduledAtLocal, status
       FROM todo_reminder_jobs
      WHERE user_id = ? AND todo_id IN (${ids.map(() => '?').join(',')})
        AND status IN ('pending','processing','paused')
      ORDER BY todo_id, scheduled_at_utc, channel`,
    [userId, ...ids],
  );
  const directRules = new Map();
  const seriesRules = new Map();
  for (const rule of rules) {
    if (rule.todoId && !directRules.has(String(rule.todoId))) directRules.set(String(rule.todoId), rule);
    if (rule.seriesId && !seriesRules.has(String(rule.seriesId))) seriesRules.set(String(rule.seriesId), rule);
  }
  const jobsByTodo = new Map();
  for (const job of jobs) {
    const key = String(job.todoId);
    const list = jobsByTodo.get(key) || [];
    list.push(job);
    jobsByTodo.set(key, list);
  }
  const map = new Map();
  for (const item of items) {
    const todoId = String(item.id);
    const rule = directRules.get(todoId) || (item.seriesId ? seriesRules.get(String(item.seriesId)) : null);
    if (!rule) continue;
    const activeJobs = jobsByTodo.get(todoId) || [];
    const channels = parseJson(rule.channels, []);
    const versionedSchedule = parseJson(rule.scheduleJson, null);
    const schedule = versionedSchedule?.version === 2 ? versionedSchedule.schedule : null;
    const current = {
      ...(schedule || {}),
      mode: rule.mode,
      triggerType: rule.triggerType,
      trigger: {
        type: rule.triggerType,
        ...(rule.fixedTime ? { fixedTime: String(rule.fixedTime).slice(0, 5) } : {}),
        ...(rule.offsetMinutes !== null ? { offsetMinutes: Number(rule.offsetMinutes) } : {}),
      },
      channels,
      nextAt: activeJobs[0]?.scheduledAtLocal || null,
      targetEmail: rule.targetEmail || null,
      quietPolicy: rule.quietPolicy || 'defer_once',
      intervalMinutes: rule.intervalMinutes === null ? null : Number(rule.intervalMinutes),
      maxCount: rule.maxCount === null ? null : Number(rule.maxCount),
      ...(rule.mode === 'nudge'
        ? {
            nudge: {
              intervalMinutes: Number(rule.intervalMinutes),
              maxCount: Number(rule.maxCount),
              stop: rule.stopType,
            },
          }
        : {}),
      remainingCount: new Set(activeJobs.map((job) => Number(job.sequenceNo))).size,
      paused: activeJobs.length > 0 && activeJobs.every((job) => job.status === 'paused'),
    };
    if (schedule) {
      current.mode = schedule.mode;
      current.version = schedule.version || 1;
      current.channels = schedule.channels || channels;
      current.targetEmail = schedule.targetEmail || null;
      current.scheduleVersion = versionedSchedule.version;
    }
    map.set(todoId, current);
  }
  return map;
}

export const todoSeriesInternals = {
  jobRowsForOccurrence,
  nextAfterCompletionOccurrence,
  plainDateTimeFromDatabase,
  previewSummary,
  reminderMomentsForAdHocOccurrence,
  reminderFromRule,
  requestHash,
};
