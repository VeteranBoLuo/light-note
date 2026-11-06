import crypto from 'node:crypto';
import { Temporal } from '@js-temporal/polyfill';
import { assertTodoPlanReady } from '../todoPlanCalculator.js';
import { createTodoPlan, previewTodoPlan } from './todoSeriesService.js';

function localDateTime(value, timezone) {
  if (!value) return null;
  if (value instanceof Date)
    return Temporal.Instant.from(value.toISOString()).toZonedDateTimeISO(timezone).toPlainDateTime();
  const text = String(value).trim().replace(' ', 'T');
  if (/[Zz]$|[+-]\d{2}:\d{2}$/.test(text))
    return Temporal.Instant.from(text).toZonedDateTimeISO(timezone).toPlainDateTime();
  return Temporal.PlainDateTime.from(text);
}

/** 内部入口创建普通单任务也走新版计算器，不再落入历史重复/提醒模型。 */
export function singleTodoPlanDraft(values = {}) {
  if (values.recurrence || (values.reminder && values.reminder.mode !== 'none')) {
    throw Object.assign(new Error('普通任务入口不能隐式丢弃重复或提醒配置'), {
      code: 'TODO_SINGLE_TASK_INPUT_UNSUPPORTED',
    });
  }
  const timezone = values.timezone || 'Asia/Shanghai';
  const start = localDateTime(values.startAt, timezone);
  const due = localDateTime(values.dueAt, timezone);
  const anchor = (start || due)?.toPlainDate();
  return {
    title: values.title,
    description: values.description,
    priority: values.priority,
    checklist: values.checklist,
    ...(values.listId !== undefined ? { listId: values.listId } : {}),
    ...(values.tagIds !== undefined ? { tagIds: values.tagIds } : {}),
    resourceRefs: values.resourceRefs,
    sortOrder: values.sortOrder,
    taskMode: 'single',
    timing: {
      timezone,
      anchorDate: anchor?.toString() || null,
      startTime: start?.toPlainTime().toString({ smallestUnit: 'minute' }) || null,
      dueTime: due?.toPlainTime().toString({ smallestUnit: 'minute' }) || null,
      dueDayOffset: anchor && due ? anchor.until(due.toPlainDate()).days : 0,
    },
    plan: { type: 'once', pastPolicy: 'keep_overdue' },
    reminder: { mode: 'none', channels: [] },
    singleTaskReminder: { version: 1, mode: 'none', channels: [] },
  };
}

export async function createSingleTodoPlan(connection, userId, values, options = {}) {
  const { idempotencyKey = crypto.randomUUID(), ...planOptions } = options;
  const draft = singleTodoPlanDraft(values);
  const preview = assertTodoPlanReady(previewTodoPlan(draft, planOptions));
  const result = await createTodoPlan(
    connection,
    userId,
    { ...draft, idempotencyKey, previewHash: preview.previewHash },
    planOptions,
  );
  return { ...result, id: result.todoId };
}

/** 只供已核验来源与内容的示例升级调用；原 ID、正文、状态、归属与引用均不重建。 */
export async function upgradePlainTodoPlan(
  connection,
  userId,
  todoId,
  { apply = true, allowCompleted = false, now } = {},
) {
  const [[row]] = await connection.query(
    `SELECT * FROM todo_items WHERE id=? AND user_id=?${apply ? ' FOR UPDATE' : ''}`,
    [todoId, userId],
  );
  if (!row || Number(row.del_flag) !== 0 || Number(row.plan_version || 1) !== 1) return false;
  if (row.series_id || row.recurrence_rule || row.generated_by_todo_id || Number(row.is_exception || 0) !== 0)
    return false;
  if (row.status !== 'pending' && !(allowCompleted && row.status === 'completed')) return false;
  const [[reminders]] = await connection.query(
    `SELECT
      (SELECT COUNT(*) FROM todo_reminders WHERE todo_id=? AND user_id=?) +
      (SELECT COUNT(*) FROM todo_reminder_rules WHERE todo_id=? AND user_id=?) +
      (SELECT COUNT(*) FROM todo_reminder_jobs WHERE todo_id=? AND user_id=?) AS total`,
    [todoId, userId, todoId, userId, todoId, userId],
  );
  if (Number(reminders.total) !== 0) return false;
  const preview = assertTodoPlanReady(
    previewTodoPlan(
      singleTodoPlanDraft({
        title: row.title,
        description: row.description,
        priority: row.priority,
        dueAt: row.due_at,
        startAt: row.start_at,
        timezone: row.instance_timezone || 'Asia/Shanghai',
      }),
      { now },
    ),
  );
  const occurrence = preview.occurrences[0];
  if (!apply) return true;
  await connection.query(
    `UPDATE todo_items SET plan_version=2, occurrence_date=?, instance_timezone=?, instance_state=?, is_exception=0
      WHERE id=? AND user_id=? AND COALESCE(plan_version,1)=1`,
    [occurrence.occurrenceDate, occurrence.timezone, occurrence.state, todoId, userId],
  );
  return true;
}
