import { createHash } from 'node:crypto';
import { Temporal } from '@js-temporal/polyfill';
import { DEFAULT_AGENT_STORAGE_TIME_ZONE } from '../agent/timeRange.js';

const storageTime = (value) =>
  Temporal.PlainDateTime.from(value.replace(' ', 'T')).toZonedDateTime(DEFAULT_AGENT_STORAGE_TIME_ZONE);

// 单次行动由任务/系列事实决定，和提醒次数无关。
export async function compileBriefTodoFacts(database, userId, calendar, definitions) {
  const reminder = `COALESCE(
    (SELECT CONVERT_TZ(COALESCE(MIN(IF(j.scheduled_at_utc>=?,j.scheduled_at_utc,NULL)),MAX(j.scheduled_at_utc)),'+00:00','+08:00') FROM todo_reminder_jobs j
      WHERE j.todo_id=i.id AND j.user_id=i.user_id
        AND j.status IN ('pending','processing','sent','failed','unknown')
        AND j.scheduled_at_utc>=? AND j.scheduled_at_utc<?),
    (SELECT COALESCE(MIN(IF(r.scheduled_at>=?,r.scheduled_at,NULL)),MAX(r.scheduled_at)) FROM todo_reminders r
      WHERE r.todo_id=i.id AND r.user_id=i.user_id
        AND r.status IN ('pending','processing','sent','failed')
        AND r.scheduled_at>=? AND r.scheduled_at<?))`;
  const base = `SELECT i.id,i.title,i.priority,DATE_FORMAT(i.due_at,'%Y-%m-%d %H:%i:%s') AS dueAt,DATE_FORMAT(i.start_at,'%Y-%m-%d %H:%i:%s') AS startAt,
      DATE_FORMAT(i.occurrence_date,'%Y-%m-%d') AS occurrenceDate,${reminder} AS reminderAt
    FROM todo_items i WHERE i.user_id=? AND i.del_flag=0 AND i.status='pending'
      AND NOT EXISTS(SELECT 1 FROM onboarding_seed_resources seed
        WHERE seed.user_id=i.user_id AND seed.resource_type='todo' AND seed.resource_id=i.id)
      AND COALESCE(i.instance_state,'normal')='normal'
      AND NULLIF(i.series_id,'') IS NULL
      AND (i.recurrence_rule IS NULL OR i.recurrence_rule='' OR i.recurrence_rule='null')`;
  const candidates = `SELECT t.*,CASE
      WHEN dueAt<? OR (dueAt IS NULL AND occurrenceDate<?) THEN 'todo_overdue'
      WHEN dueAt<? OR (dueAt IS NULL AND occurrenceDate=?) THEN 'todo_due_today'
      ELSE 'todo_scheduled_today' END AS factId,
      CASE WHEN dueAt<? OR (dueAt IS NULL AND occurrenceDate<=?) THEN COALESCE(dueAt,occurrenceDate)
        WHEN startAt>=? AND startAt<? THEN LEAST(startAt,COALESCE(reminderAt,startAt))
        ELSE reminderAt END AS actionAt
    FROM (${base}) t WHERE dueAt<? OR (dueAt IS NULL AND occurrenceDate<=?)
      OR (startAt>=? AND startAt<?) OR reminderAt IS NOT NULL`;
  const utcTime = (value) =>
    storageTime(value).withTimeZone('UTC').toPlainDateTime().toString().slice(0, 19).replace('T', ' ');
  const params = [
    calendar.now,
    calendar.date,
    calendar.todayEnd,
    calendar.date,
    calendar.todayEnd,
    calendar.date,
    calendar.todayStart,
    calendar.todayEnd,
    utcTime(calendar.now),
    utcTime(calendar.todayStart),
    utcTime(calendar.todayEnd),
    calendar.now,
    calendar.todayStart,
    calendar.todayEnd,
    userId,
    calendar.todayEnd,
    calendar.date,
    calendar.todayStart,
    calendar.todayEnd,
  ];
  // 在完整有效候选中选一项；不另查全量待办数量，也不让未展示事项触发简报重写。
  const [items] = await database.query(
    `SELECT * FROM (${candidates}) candidates ORDER BY priority DESC,
      CASE WHEN factId='todo_overdue' AND dueAt IS NOT NULL THEN 0 WHEN actionAt>=? THEN 1 ELSE 2 END,
      ABS(TIMESTAMPDIFF(SECOND,actionAt,?)),id ASC LIMIT 1`,
    [...params, calendar.now, calendar.now],
  );
  return definitions.map(([id, zh, en, route]) => {
    const selected = items.find((row) => row.factId === id);
    const entries = items
      .filter((row) => row.factId === id)
      .map((row) => ({
        id: String(row.id),
        title: String(row.title || '')
          .replace(/\s+/gu, ' ')
          .trim()
          .slice(0, 120),
        at: row.actionAt
          ? String(row.actionAt).length === 10
            ? row.actionAt
            : storageTime(String(row.actionAt))
                .withTimeZone(calendar.timezone)
                .toPlainDateTime()
                .toString()
                .slice(0, 16)
          : '',
        reason:
          id === 'todo_scheduled_today'
            ? String(row.startAt || '').slice(0, 16) === String(row.actionAt || '').slice(0, 16)
              ? 'start'
              : 'reminder'
            : row.dueAt
              ? 'due'
              : 'plan',
      }));
    return {
      id,
      label: calendar.locale === 'en-US' ? en : zh,
      route,
      count: selected ? 1 : 0,
      samples: entries.length ? [entries[0].title] : [],
      revision: selected ? createHash('sha256').update(JSON.stringify(selected)).digest('hex') : '',
      entries,
    };
  });
}
