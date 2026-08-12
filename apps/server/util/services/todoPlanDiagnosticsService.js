function parseJson(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function number(value) {
  return Number(value || 0);
}

export async function getTodoPlanDiagnostics(db, input = {}) {
  const limit = Math.min(100, Math.max(1, Math.trunc(Number(input.limit) || 50)));
  const status = ['active', 'paused', 'ended'].includes(String(input.status)) ? String(input.status) : 'all';
  const keyword = String(input.keyword || '')
    .trim()
    .slice(0, 100);
  const like = `%${keyword.replace(/[\\%_]/g, '\\$&')}%`;

  const [[summaryRows], [jobRows], [metricRows], [seriesRows]] = await Promise.all([
    db.query(
      `SELECT
         (SELECT COUNT(*) FROM todo_series WHERE status = 'active') AS activeSeriesCount,
         (SELECT COUNT(*) FROM todo_series WHERE status = 'paused') AS pausedSeriesCount,
         (SELECT COUNT(*) FROM todo_series WHERE status = 'active' AND last_generation_error IS NOT NULL) AS seriesWithError,
         (SELECT COALESCE(MAX(GREATEST(0, TIMESTAMPDIFF(SECOND,
                   DATE_ADD(generated_through_date, INTERVAL 1 DAY), UTC_TIMESTAMP()))), 0)
            FROM todo_series
           WHERE status = 'active' AND repeat_mode = 'scheduled' AND generated_through_date IS NOT NULL) AS seriesGenerationLagSeconds,
         (SELECT COUNT(*) FROM todo_reminder_jobs
           WHERE series_id IS NOT NULL AND status = 'pending' AND scheduled_at_utc < UTC_TIMESTAMP())
           AS reminderJobsOverdue,
         (SELECT COALESCE(AVG(GREATEST(0, TIMESTAMPDIFF(SECOND, original_scheduled_at_utc, sent_at))), 0)
            FROM todo_reminder_jobs
           WHERE series_id IS NOT NULL AND status = 'sent' AND sent_at IS NOT NULL)
           AS reminderDeliveryLatencySeconds`,
    ),
    db.query(`SELECT status, COUNT(*) AS count FROM todo_reminder_jobs WHERE series_id IS NOT NULL GROUP BY status`),
    db.query(`SELECT metric_name AS metricName, metric_value AS metricValue FROM todo_plan_runtime_metrics`),
    db.query(
      `SELECT s.id, s.user_id AS userId, COALESCE(NULLIF(u.alias, ''), u.email, s.user_id) AS userLabel,
              s.title, s.repeat_mode AS repeatMode, s.status, s.timezone,
              s.schedule_rule AS scheduleRule, s.version,
              s.next_occurrence_no AS nextOccurrenceNo,
              s.generated_through_date AS generatedThroughDate,
              s.parent_series_id AS parentSeriesId,
              s.split_from_occurrence_no AS splitFromOccurrenceNo,
              s.last_generation_error AS lastGenerationError,
              s.update_time AS updateTime,
              COALESCE(i.instanceCount, 0) AS instanceCount,
              COALESCE(i.completedCount, 0) AS completedCount,
              COALESCE(i.skippedCount, 0) AS skippedCount,
              i.nextOccurrenceDate,
              COALESCE(j.reminderJobCount, 0) AS reminderJobCount,
              COALESCE(j.failedJobCount, 0) AS failedJobCount,
              COALESCE(j.unknownJobCount, 0) AS unknownJobCount,
              COALESCE(j.pendingJobCount, 0) AS pendingJobCount,
              IF(j.nextReminderAtUtc IS NULL, NULL,
                CONCAT(DATE_FORMAT(j.nextReminderAtUtc, '%Y-%m-%dT%H:%i:%s'), 'Z')) AS nextReminderAtUtc
         FROM todo_series s
         LEFT JOIN user u ON u.id = s.user_id
         LEFT JOIN (
           SELECT series_id,
                  COUNT(*) AS instanceCount,
                  SUM(status = 'completed' AND instance_state = 'normal') AS completedCount,
                  SUM(instance_state = 'skipped') AS skippedCount,
                  MIN(CASE WHEN status = 'pending' AND instance_state = 'normal' THEN occurrence_date END) AS nextOccurrenceDate
             FROM todo_items
            WHERE plan_version = 2 AND del_flag = 0 AND series_id IS NOT NULL
            GROUP BY series_id
         ) i ON i.series_id = s.id
         LEFT JOIN (
           SELECT series_id,
                  COUNT(*) AS reminderJobCount,
                  SUM(status = 'failed') AS failedJobCount,
                  SUM(status = 'unknown') AS unknownJobCount,
                  SUM(status IN ('pending','processing','paused')) AS pendingJobCount,
                  MIN(CASE WHEN status IN ('pending','processing','paused') THEN scheduled_at_utc END)
                    AS nextReminderAtUtc
             FROM todo_reminder_jobs
            WHERE series_id IS NOT NULL
            GROUP BY series_id
         ) j ON j.series_id = s.id
        WHERE (? = 'all' OR s.status = ?)
          AND (? = '' OR s.id LIKE ? ESCAPE '\\\\' OR s.title LIKE ? ESCAPE '\\\\'
               OR s.user_id LIKE ? ESCAPE '\\\\' OR u.email LIKE ? ESCAPE '\\\\' OR u.alias LIKE ? ESCAPE '\\\\')
        ORDER BY (s.last_generation_error IS NOT NULL) DESC,
                 FIELD(s.status, 'active', 'paused', 'ended'), s.update_time DESC
        LIMIT ${limit}`,
      [status, status, keyword, like, like, like, like, like],
    ),
  ]);

  const summary = summaryRows[0] || {};
  const jobs = Object.fromEntries(jobRows.map((row) => [String(row.status), number(row.count)]));
  const runtime = Object.fromEntries(metricRows.map((row) => [String(row.metricName), number(row.metricValue)]));
  return {
    metrics: {
      active_series_count: number(summary?.activeSeriesCount),
      paused_series_count: number(summary?.pausedSeriesCount),
      series_generation_lag_seconds: number(summary?.seriesGenerationLagSeconds),
      series_generation_failures: number(runtime.series_generation_failures),
      series_with_error: number(summary?.seriesWithError),
      reminder_jobs_pending: number(jobs.pending),
      reminder_jobs_overdue: number(summary?.reminderJobsOverdue),
      reminder_jobs_processing: number(jobs.processing),
      reminder_jobs_unknown: number(jobs.unknown),
      reminder_jobs_failed: number(jobs.failed),
      reminder_delivery_latency_seconds: number(summary?.reminderDeliveryLatencySeconds),
      reminder_duplicate_prevented: number(runtime.reminder_duplicate_prevented),
      quiet_hours_deferred: number(runtime.quiet_hours_deferred),
      quiet_hours_skipped: number(runtime.quiet_hours_skipped),
    },
    series: seriesRows.map((row) => ({
      id: String(row.id),
      userId: String(row.userId),
      userLabel: row.userLabel,
      title: row.title,
      repeatMode: row.repeatMode,
      status: row.status,
      timezone: row.timezone,
      scheduleRule: parseJson(row.scheduleRule, {}),
      version: number(row.version),
      nextOccurrenceNo: number(row.nextOccurrenceNo),
      generatedThroughDate: row.generatedThroughDate,
      parentSeriesId: row.parentSeriesId || null,
      splitFromOccurrenceNo: row.splitFromOccurrenceNo === null ? null : number(row.splitFromOccurrenceNo),
      lastGenerationError: row.lastGenerationError || null,
      updateTime: row.updateTime,
      instanceCount: number(row.instanceCount),
      completedCount: number(row.completedCount),
      skippedCount: number(row.skippedCount),
      nextOccurrenceDate: row.nextOccurrenceDate || null,
      reminderJobCount: number(row.reminderJobCount),
      pendingJobCount: number(row.pendingJobCount),
      failedJobCount: number(row.failedJobCount),
      unknownJobCount: number(row.unknownJobCount),
      nextReminderAtUtc: row.nextReminderAtUtc || null,
    })),
    generatedAt: new Date().toISOString(),
  };
}
