// 分页前按任务分组，未关联的旧 Execution 始终独立。时间筛选作用于账本，不改变扣费事实。
const groupKey = "IF(organize_run_id IS NULL, CONCAT('execution:',id), CONCAT('organize:',organize_run_id))";
async function readGroups(database, where, params, pageSize, offset) {
  const [rows, count] = await Promise.all([
    database.query(
      `SELECT g.*, r.status AS run_status FROM (
      SELECT MIN(id) AS id, organize_run_id, MIN(skill_id) AS skill_id, MIN(task_type) AS task_type,
        COUNT(*) AS execution_count, COUNT(DISTINCT organize_item_id) AS resource_count,
        CASE WHEN organize_run_id IS NULL THEN MAX(status) WHEN SUM(status='running')>0 THEN 'running'
          WHEN SUM(status<>'success')>0 THEN IF(SUM(status='success')>0,'partial','failed') ELSE 'success' END AS status,
        1 AS model_called, SUM(provider_call_count) AS provider_call_count,
        SUM(provider_tokens) AS provider_tokens, SUM(charged_tokens) AS charged_tokens,
        SUM(GREATEST(0,provider_tokens-charged_tokens)) AS platform_covered_tokens,
        MIN(usage_complete) AS usage_complete,
        IF(organize_run_id IS NULL,MAX(quota_settlement_status),IF(SUM(quota_settlement_status='deferred')>0,'deferred','reconciled')) AS quota_settlement_status,
        SUM(duration_ms) AS duration_ms, MAX(created_at) AS created_at
      FROM ai_executions WHERE ${where}
      GROUP BY ${groupKey}, organize_run_id
    ) g LEFT JOIN organize_suggestion_runs r ON r.id=g.organize_run_id AND r.user_id=?
    ORDER BY g.created_at DESC,g.id DESC LIMIT ? OFFSET ?`,
      [...params, params[0], pageSize, offset],
    ),
    database.query(`SELECT COUNT(DISTINCT ${groupKey}) AS total FROM ai_executions WHERE ${where}`, params),
  ]);
  return { rows: rows[0], total: Number(count[0]?.[0]?.total || 0) };
}

export function mapGroupedUsage(row, mapItem) {
  const item = mapItem(row);
  if (!row.organize_run_id) return item;
  return {
    ...item,
    organizeRunId: row.organize_run_id,
    platformCoveredTokens: Number(row.platform_covered_tokens ?? item.platformCoveredTokens),
    labelKey: 'organizeRun',
    resourceCount: Number(row.resource_count || 0),
    executionCount: Number(row.execution_count || 0),
    runStatus: row.run_status || null,
    // 任务可能暂停或仍有尚未外发的资源，不能只看已经结算的调用便宣称完成。
    status: ['preparing', 'running'].includes(row.run_status)
      ? 'running'
      : row.run_status === 'paused'
        ? 'paused'
        : ['ended', 'cancelled'].includes(row.run_status)
          ? 'aborted'
          : item.status,
  };
}

// 迁移尚未执行时继续提供旧明细，不能让整个用量页不可用；不吞掉其它数据库错误。
export async function readGroupedUsage(database, where, params, pageSize, offset) {
  try {
    return { ...(await readGroups(database, where, params, pageSize, offset)), available: true };
  } catch (error) {
    if (!['ER_BAD_FIELD_ERROR', 'ER_NO_SUCH_TABLE'].includes(error.code)) throw error;
    const [rows, count] = await Promise.all([
      database.query(
        `SELECT id, skill_id, task_type, status, model_called, provider_call_count,
        provider_tokens, charged_tokens, usage_complete, quota_settlement_status, duration_ms, created_at
        FROM ai_executions WHERE ${where} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`,
        [...params, pageSize, offset],
      ),
      database.query(`SELECT COUNT(*) AS total FROM ai_executions WHERE ${where}`, params),
    ]);
    return { rows: rows[0], total: Number(count[0]?.[0]?.total || 0), available: false };
  }
}
