// 按需经营读模型：CLI 与管理员手动报告共享，只返回聚合，调用方提供只读连接。
const DAY = 86400000;
const HINT = 'SELECT /*+ MAX_EXECUTION_TIME(5000) */';
const OWN = "'activity_bookmark','activity_note','activity_file'";
const CORE = `${OWN},'todo_create','todo_complete','organize_complete'`;
const USERS = "u.role = 'user' AND u.del_flag = 0 AND u.create_time >= ? AND u.create_time <= ?";
export const REPORT_VERSION = 'core-usage-v1';

function invalid() {
  throw Object.assign(new Error('CORE_USAGE_INVALID_OPTIONS'), { code: 'CORE_USAGE_INVALID_OPTIONS' });
}
function instant(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  )
    invalid();
  const time = Date.parse(value);
  if (!Number.isFinite(time)) invalid();
  const zone = value.endsWith('Z') ? 0 : offset(value.slice(-6));
  if (new Date(time + zone * 60000).toISOString().slice(0, 19) !== value.slice(0, 19)) invalid();
  return time;
}
function offset(value) {
  if (!/^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(value || '')) invalid();
  const minutes = Number(value.slice(1, 3)) * 60 + Number(value.slice(4));
  if (minutes > 840) invalid();
  return (value[0] === '-' ? -1 : 1) * minutes;
}
const sqlTime = (time, minutes) => new Date(time + minutes * 60000).toISOString().slice(0, 19).replace('T', ' ');
export function normalizeCoreUsageOptions(input = {}) {
  const days = input.days ?? 28;
  if (!Number.isInteger(days) || days < 7 || days > 90) invalid();
  const asOf = instant(input.asOf ?? new Date().toISOString());
  const minutes = offset(input.storageOffset);
  const coverage = {};
  for (const key of ['growth', 'conversion'])
    coverage[key] = input[`${key}CoverageStart`] == null ? null : instant(input[`${key}CoverageStart`]);
  if (Object.values(coverage).some((start) => start !== null && start > asOf)) invalid();
  const retention = input.conversionRetentionDays ?? 180;
  if (!Number.isInteger(retention) || retention < 1 || retention > 3650) invalid();
  return {
    days,
    asOf,
    minutes,
    storageOffset: input.storageOffset,
    start: asOf - days * DAY,
    matureEnd: asOf - 7 * DAY,
    coverage,
    retention,
  };
}
export function buildCoreUsageQueries(o) {
  const all = [sqlTime(o.start, o.minutes), sqlTime(o.asOf, o.minutes)];
  const mature = [all[0], sqlTime(o.matureEnd, o.minutes)];
  return {
    cohort: {
      sql: `${HINT} COUNT(*) AS registered, COALESCE(SUM(u.create_time <= ?),0) AS eligible FROM user u WHERE ${USERS}`,
      params: [mature[1], ...all],
    },
    growth: {
      sql: `${HINT} COALESCE(SUM(EXISTS(SELECT 1 FROM growth_events e WHERE e.user_id=u.id AND e.status='granted'
        AND e.source IN (${OWN}) AND e.create_time >= u.create_time AND e.create_time < DATE_ADD(u.create_time,INTERVAL 7 DAY))),0) AS own_count,
      COALESCE(SUM(EXISTS(SELECT 1 FROM growth_events e WHERE e.user_id=u.id AND e.status='granted'
        AND e.source IN (${OWN},'todo_create') AND e.create_time >= u.create_time AND e.create_time < DATE_ADD(u.create_time,INTERVAL 7 DAY))),0) AS first_count,
      COALESCE(SUM((SELECT COUNT(DISTINCT DATE(CONVERT_TZ(e.create_time, ?, '+08:00'))) FROM growth_events e
        WHERE e.user_id=u.id AND e.status='granted' AND e.source IN (${CORE})
        AND e.create_time >= u.create_time AND e.create_time < DATE_ADD(u.create_time,INTERVAL 7 DAY)) >= 2),0) AS returning_count
      FROM user u WHERE ${USERS}`,
      params: [o.storageOffset, ...mature],
    },
    conversion: {
      sql: `${HINT} COUNT(*) AS own_count FROM user u WHERE ${USERS}
    AND EXISTS (SELECT 1 FROM conversion_events e WHERE e.user_id=u.id AND e.event='first_own_resource'
      AND e.create_time >= u.create_time AND e.create_time < DATE_ADD(u.create_time,INTERVAL 7 DAY))`,
      params: mature,
    },
    interaction: {
      sql: `${HINT} COUNT(*) AS returning_count FROM user u WHERE ${USERS}
    AND (SELECT COUNT(DISTINCT a.activity_date) FROM user_activity_daily a WHERE a.user_id=u.id
      AND a.activity_date >= DATE(CONVERT_TZ(u.create_time, ?, '+08:00'))
      AND a.activity_date <= DATE(DATE_ADD(CONVERT_TZ(u.create_time, ?, '+08:00'),INTERVAL 7 DAY))
      AND a.first_active_at >= CONVERT_TZ(u.create_time, ?, '+08:00')
      AND a.first_active_at < DATE_ADD(CONVERT_TZ(u.create_time, ?, '+08:00'),INTERVAL 7 DAY)) >= 2`,
      params: [...mature, ...Array(4).fill(o.storageOffset)],
    },
  };
}
function reason(error) {
  if (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error?.code)) return 'schema_unavailable';
  if (error?.code === 'ER_QUERY_TIMEOUT' || error?.errno === 3024) return 'query_timeout';
  return 'source_unavailable';
}
function metric(eligible, observed, coverageStart, o, failure = null) {
  let status = 'available';
  let reasons = [];
  if (failure) {
    status = 'unavailable';
    reasons = [failure];
  } else if (eligible === 0) {
    status = 'no_mature_cohort';
  } else if (coverageStart === null) {
    status = 'coverage_unknown';
    reasons = ['coverage_start_unverified'];
  } else if (coverageStart > o.start) {
    status = 'partial_coverage';
    reasons = ['cohort_precedes_coverage'];
  }
  return {
    eligible,
    observed: failure ? null : Number(observed || 0),
    value: status === 'available' ? Math.round((Number(observed || 0) / eligible) * 10000) / 100 : null,
    status,
    reasons,
    coverageStart: coverageStart === null ? null : new Date(coverageStart).toISOString(),
  };
}
// One checkout, one read-only snapshot, sequential SELECTs, each capped by MySQL itself.
export async function generateCoreUsageReport(db, input = {}) {
  const o = normalizeCoreUsageOptions(input);
  const connection = await db.getConnection();
  const queries = buildCoreUsageQueries(o);
  const timings = [];
  const run = async (name, sql, params = []) => {
    const started = performance.now();
    try {
      return (await connection.query(sql, params))[0];
    } finally {
      timings.push({ source: name, elapsedMs: Math.round((performance.now() - started) * 100) / 100 });
    }
  };
  try {
    const [environment] = await run(
      'environment',
      `${HINT} VERSION() AS version, @@session.max_execution_time AS maxExecutionTime, TIMESTAMPDIFF(MINUTE,UTC_TIMESTAMP(),NOW()) AS utcOffsetMinutes`,
    );
    if (!/^(5\.7\.|8\.)/.test(environment.version) || /mariadb/i.test(environment.version))
      throw Object.assign(new Error('CORE_USAGE_UNSUPPORTED_ENGINE'), { code: 'CORE_USAGE_UNSUPPORTED_ENGINE' });
    if (Number(environment.utcOffsetMinutes) !== o.minutes)
      throw Object.assign(new Error('CORE_USAGE_TIMEZONE_MISMATCH'), { code: 'CORE_USAGE_TIMEZONE_MISMATCH' });
    const indices = await run(
      'indices',
      `${HINT} TABLE_NAME AS tableName, INDEX_NAME AS indexName, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('user','growth_events','conversion_events','user_activity_daily') GROUP BY TABLE_NAME,INDEX_NAME`,
    );
    const indexed = (table, prefix) =>
      indices.some((r) => r.tableName === table && (r.cols === prefix || r.cols.startsWith(prefix + ',')));
    if (!indexed('user', 'del_flag,create_time') && !indexed('user', 'create_time'))
      throw Object.assign(new Error('CORE_USAGE_COHORT_INDEX_MISSING'), { code: 'CORE_USAGE_COHORT_INDEX_MISSING' });
    await connection.beginTransaction();
    const [cohort] = await run('cohort', queries.cohort.sql, queries.cohort.params);
    const eligible = Number(cohort.eligible);
    const report = {
      version: REPORT_VERSION,
      asOf: new Date(o.asOf).toISOString(),
      windowStart: new Date(o.start).toISOString(),
      days: o.days,
      calendar: 'UTC+08:00',
      storageOffset: o.storageOffset,
      cohort: { registered: Number(cohort.registered), eligible, immature: Number(cohort.registered) - eligible },
      metrics: {},
      limitations: ['current_account_status_filter', 'success_facts_may_be_deduplicated', 'no_channel_attribution'],
      timings,
    };
    const requirements = {
      growth: ['growth_events', 'user_id,source,status,create_time'],
      conversion: ['conversion_events', 'user_id,event,create_time'],
      interaction: ['user_activity_daily', 'user_id,activity_date'],
    };
    for (const source of ['growth', 'conversion', 'interaction']) {
      let values = null,
        failure = null,
        coverage = o.coverage[source] ?? null;
      try {
        if (!indexed(...requirements[source])) failure = 'required_index_missing';
        else {
          if (source === 'interaction') {
            const rows = await run(
              'interaction_coverage',
              `${HINT} DATE_FORMAT(started_at,'%Y-%m-%d %H:%i:%s') AS startedAt FROM user_activity_metadata WHERE id=1`,
            );
            coverage = rows[0]?.startedAt ? instant(rows[0].startedAt.replace(' ', 'T') + '+08:00') : null;
          }
          if (source === 'conversion' && coverage !== null)
            coverage = Math.max(coverage, Math.max(Date.now(), o.asOf) - o.retention * DAY);
          values = (await run(source, queries[source].sql, queries[source].params))[0];
        }
      } catch (error) {
        failure = reason(error);
      }
      const fields =
        source === 'growth'
          ? { a7Resources: 'own_count', a7Overall: 'first_count', r7Core: 'returning_count' }
          : source === 'conversion'
            ? { a7ResourcesLegacy: 'own_count' }
            : { r7InteractionProxy: 'returning_count' };
      for (const [name, column] of Object.entries(fields))
        report.metrics[name] = metric(eligible, values?.[column], coverage, o, failure);
    }
    for (const [name, missing] of Object.entries({
      u7Reuse: 'missing_linkage',
      extensionRepeat: 'incomplete_history',
      acquisitionChannel: 'missing_attribution',
      organizeTaskFunnel: 'missing_linkage',
    }))
      report.metrics[name] = { eligible: null, observed: null, value: null, status: 'unavailable', reasons: [missing] };
    await connection.commit();
    return report;
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}
