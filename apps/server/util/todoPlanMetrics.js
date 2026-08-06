const ALLOWED_METRICS = new Set([
  'series_generation_failures',
  'reminder_duplicate_prevented',
  'quiet_hours_deferred',
  'quiet_hours_skipped',
]);

/** 累计调度指标只允许固定名称，避免把运行时文本拼进 SQL 或产生无限基数。 */
export async function incrementTodoPlanMetric(db, name, amount = 1) {
  if (!ALLOWED_METRICS.has(name)) throw new Error(`TODO_PLAN_METRIC_INVALID:${name}`);
  const value = Math.max(0, Math.trunc(Number(amount) || 0));
  if (!value) return;
  await db.query(
    `INSERT INTO todo_plan_runtime_metrics (metric_name, metric_value)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE metric_value = metric_value + VALUES(metric_value)`,
    [name, value],
  );
}

export const TODO_PLAN_RUNTIME_METRICS = Object.freeze([...ALLOWED_METRICS]);
