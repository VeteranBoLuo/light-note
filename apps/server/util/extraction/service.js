import pool from '../../db/index.js';
import { requireExtractionSchema } from './schema.js';
import { insertData } from '../common.js';
import { resolveExtractionSourceVersions } from './sourceVersions.js';
import {
  EXTRACTION_ACTIVE_STATUSES,
  EXTRACTION_LIMITS,
  extractionRecordMatches,
  sortExtractionRecords,
} from '@lightnote/shared/extraction';
import {
  assertVersion,
  digest,
  fail,
  json,
  materialRefs,
  normalizePlan,
  planIdentity,
  requestId,
  reviewRecord,
  text,
} from './domain.js';
export function extractionEnabled(env = process.env) {
  return env.TOOLBOX_EXTRACTION_ENABLED === 'true';
}
export function requireExtractionEnabled() {
  if (!extractionEnabled()) fail('DISABLED', '资料转表格暂未开放新任务', 503);
}
export async function transaction(database, work) {
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
export async function owned(connection, userId, id, lock = false) {
  const [[row]] = await connection.query(
    `SELECT * FROM toolbox_extractions WHERE id=? AND user_id=?${lock ? ' FOR UPDATE' : ''}`,
    [id, userId],
  );
  if (!row) fail('NOT_FOUND', '提取表不存在', 404);
  return row;
}
export async function activeAccount(connection, userId, lock = false) {
  const [[user]] = await connection.query(`SELECT id,role,del_flag FROM user WHERE id=?${lock ? ' FOR UPDATE' : ''}`, [
    userId,
  ]);
  if (!user || Number(user.del_flag) || !['user', 'test', 'root'].includes(user.role))
    fail('ACCOUNT_UNAVAILABLE', '当前账号不能执行提取任务', 403);
  return user;
}
export function formatExtraction(row) {
  return {
    id: row.id,
    title: row.title,
    goal: row.goal,
    status: row.status,
    phase: row.phase,
    plan: json(row.plan_json),
    version: Number(row.version),
    dataVersion: Number(row.data_version),
    errorCode: row.error_code,
    acceptPartial: Boolean(row.accept_partial),
    inFlight: Boolean(row.lease_token),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
export async function createExtraction({ userId, input, database = pool }) {
  requireExtractionEnabled();
  await requireExtractionSchema(database);
  const request = requestId(input.requestId),
    refs = materialRefs(input.resourceRefs);
  const title = text(input.title, 120, true).trim(),
    goal = text(input.goal ?? '', 1000);
  const inputDigest = digest({ title, goal, refs });
  return transaction(database, async (connection) => {
    await activeAccount(connection, userId, true);
    const [[prior]] = await connection.query(
      'SELECT * FROM toolbox_extractions WHERE user_id=? AND request_id=? FOR UPDATE',
      [userId, request],
    );
    if (prior) {
      if (prior.input_digest !== inputDigest) fail('IDEMPOTENCY_CONFLICT', '同一请求不能更换输入', 409);
      return formatExtraction(prior);
    }
    const [[count]] = await connection.query('SELECT COUNT(*) AS total FROM toolbox_extractions WHERE user_id=?', [
      userId,
    ]);
    if (Number(count.total) >= 100) fail('TABLE_LIMIT', '最多保留 100 张提取表，请先删除不需要的表', 409);
    const versions = await resolveExtractionSourceVersions({
      userId,
      resourceRefs: refs,
      database: connection,
    });
    if (
      versions.length !== refs.length ||
      versions.some(
        (ref, i) =>
          ref.type !== refs[i].type || ref.id !== refs[i].id || (refs[i].version && ref.version !== refs[i].version),
      )
    )
      fail('SOURCE_CHANGED', '部分资料已变化或不可用，请重新选择', 409);
    const table = insertData({ userId, requestId: request, inputDigest, title, goal });
    await connection.query('INSERT INTO toolbox_extractions SET ?', table);
    for (const [position, ref] of versions.entries())
      await connection.query(
        'INSERT INTO toolbox_extraction_sources SET ?, expires_at=DATE_ADD(NOW(), INTERVAL 24 HOUR)',
        insertData({
          extractionId: table.id,
          userId,
          position,
          resourceType: ref.type,
          resourceId: ref.id,
          resourceVersion: ref.version,
          title: ref.title || '',
        }),
      );
    return formatExtraction(await owned(connection, userId, table.id));
  });
}
export async function listExtractions({ userId, database = pool }) {
  await requireExtractionSchema(database);
  const [rows] = await database.query(
    'SELECT * FROM toolbox_extractions WHERE user_id=? ORDER BY updated_at DESC LIMIT 100',
    [userId],
  );
  return rows.map(formatExtraction);
}
export async function readExtraction({ userId, id, database = pool }) {
  await requireExtractionSchema(database);
  const row = await owned(database, userId, id);
  const [sources] = await database.query(
    'SELECT id,resource_type,resource_id,resource_version,title,status,coverage_json,window_count,processed_windows,error_code,expires_at FROM toolbox_extraction_sources WHERE extraction_id=? AND user_id=? ORDER BY position',
    [id, userId],
  );
  const [[counts]] = await database.query(
    'SELECT COUNT(*) total,COALESCE(SUM(excluded),0) excluded,COALESCE(SUM(excluded=0 AND pending_cells>0),0) pending FROM toolbox_extraction_records WHERE extraction_id=? AND user_id=?',
    [id, userId],
  );
  const [[usage]] = await database.query(
    `SELECT COUNT(e.id) calls,COALESCE(SUM(e.charged_tokens),0) chargedTokens,
    COALESCE(SUM(e.status='running' OR e.quota_settlement_status='deferred'),0) unsettled
    FROM toolbox_extraction_receipts r JOIN ai_executions e ON e.request_id=r.request_id AND e.actor_user_id=r.user_id
    WHERE r.extraction_id=? AND r.user_id=? AND JSON_UNQUOTE(JSON_EXTRACT(r.response_json,'$.kind'))='execution'`,
    [id, userId],
  );
  return {
    ...formatExtraction(row),
    enabled: extractionEnabled(),
    counts: { total: Number(counts.total), excluded: Number(counts.excluded), pending: Number(counts.pending) },
    usage: {
      calls: Number(usage.calls),
      chargedTokens: Number(usage.chargedTokens),
      unsettled: Number(usage.unsettled),
    },
    sources: sources.map((s) => ({
      id: s.id,
      type: s.resource_type,
      resourceId: s.resource_id,
      version: s.resource_version,
      title: s.title,
      status: s.status,
      coverage: json(s.coverage_json, {}),
      windows: Number(s.window_count),
      processed: Number(s.processed_windows),
      errorCode: s.error_code,
      expiresAt: s.expires_at,
    })),
    budget: {
      kind: 'ai_quota',
      suggestionCalls: 2,
      remainingExtractionCalls: sources.reduce(
        (n, s) => n + Math.max(0, Number(s.window_count) - Number(s.processed_windows)),
        0,
      ),
    },
  };
}
export async function withReceipt(connection, { userId, id, input }, work) {
  requestId(input.requestId);
  const hash = digest(input);
  const [[receipt]] = await connection.query(
    'SELECT digest,response_json FROM toolbox_extraction_receipts WHERE extraction_id=? AND request_id=? AND user_id=? FOR UPDATE',
    [id, input.requestId, userId],
  );
  if (receipt) {
    if (receipt.digest !== hash) fail('IDEMPOTENCY_CONFLICT', '同一请求不能更换输入', 409);
    return json(receipt.response_json);
  }
  const result = await work();
  await connection.query(
    'INSERT INTO toolbox_extraction_receipts (extraction_id,user_id,request_id,digest,response_json) VALUES (?,?,?,?,?)',
    [id, userId, input.requestId, hash, JSON.stringify(result)],
  );
  return result;
}
export async function actOnExtraction({ userId, id, input, database = pool }) {
  await requireExtractionSchema(database);
  return transaction(database, async (connection) => {
    await activeAccount(connection, userId, true);
    const row = await owned(connection, userId, id, true);
    return withReceipt(connection, { userId, id, input }, async () => {
      assertVersion(row.version, input.version);
      const [sources] = await connection.query(
        'SELECT * FROM toolbox_extraction_sources WHERE extraction_id=? AND user_id=? ORDER BY position',
        [id, userId],
      );
      const live = Boolean(row.lease_token);
      let status = row.status,
        phase = row.phase,
        plan = json(row.plan_json),
        acceptPartial = Boolean(row.accept_partial);
      if (['analyze', 'sample', 'extract', 'resume', 'retry', 'retry_prepare'].includes(input.action))
        requireExtractionEnabled();
      if (input.action === 'analyze') {
        if (live || !['ready', 'preview', 'failed'].includes(status) || phase === 'extract')
          fail('STATE_CONFLICT', '当前不能重新分析', 409);
        if (!sources.length || sources.some((s) => s.status !== 'ready' && s.status !== 'completed'))
          fail('SOURCE_NOT_READY', '请先处理不可读取的资料', 409);
        acceptPartial = input.acceptPartial === true;
        if (sources.some((s) => json(s.coverage_json)?.complete !== true) && !acceptPartial)
          fail('PARTIAL_CONFIRMATION', '请确认按可读取范围处理', 409);
        await connection.query('DELETE FROM toolbox_extraction_records WHERE extraction_id=? AND user_id=?', [
          id,
          userId,
        ]);
        await connection.query(
          "UPDATE toolbox_extraction_sources SET processed_windows=0,status='ready' WHERE extraction_id=? AND user_id=?",
          [id, userId],
        );
        plan = null;
        phase = 'suggest';
        status = 'queued';
      } else if (input.action === 'sample') {
        if (live || !['preview', 'ready'].includes(status) || phase === 'extract')
          fail('STATE_CONFLICT', '当前不能刷新样例', 409);
        if (!sources.length || sources.some((s) => !['ready', 'completed'].includes(s.status)))
          fail('SOURCE_NOT_READY', '请先处理不可读取的资料', 409);
        if (sources.some((s) => !s.source_json || new Date(s.expires_at).getTime() <= Date.now()))
          fail('MATERIAL_EXPIRED', '准备材料已过期，请新建提取', 409);
        acceptPartial = input.acceptPartial === true || acceptPartial;
        if (sources.some((s) => json(s.coverage_json)?.complete !== true) && !acceptPartial)
          fail('PARTIAL_CONFIRMATION', '请确认按可读取范围处理', 409);
        plan = normalizePlan(input.plan);
        await connection.query('DELETE FROM toolbox_extraction_records WHERE extraction_id=? AND user_id=?', [
          id,
          userId,
        ]);
        await connection.query(
          "UPDATE toolbox_extraction_sources SET processed_windows=0,status='ready' WHERE extraction_id=? AND user_id=?",
          [id, userId],
        );
        phase = 'sample';
        status = 'queued';
      } else if (input.action === 'extract') {
        if (live || !['preview', 'ready'].includes(status) || !plan)
          fail('STATE_CONFLICT', '请先完成 AI 建议或填写字段', 409);
        if (sources.some((s) => !s.source_json || new Date(s.expires_at).getTime() <= Date.now()))
          fail('MATERIAL_EXPIRED', '准备材料已过期，请新建提取', 409);
        if (!sources.length || sources.some((s) => !['ready', 'completed'].includes(s.status)))
          fail('SOURCE_NOT_READY', '请先处理不可读取的资料', 409);
        acceptPartial = input.acceptPartial === true || acceptPartial;
        if (sources.some((s) => json(s.coverage_json)?.complete !== true) && !acceptPartial)
          fail('PARTIAL_CONFIRMATION', '请确认按可读取范围处理', 409);
        const nextPlan = normalizePlan(input.plan || plan);
        if (planIdentity(nextPlan) !== planIdentity(plan)) {
          await connection.query('DELETE FROM toolbox_extraction_records WHERE extraction_id=? AND user_id=?', [
            id,
            userId,
          ]);
          await connection.query(
            "UPDATE toolbox_extraction_sources SET processed_windows=0,status='ready' WHERE extraction_id=? AND user_id=?",
            [id, userId],
          );
        }
        plan = nextPlan;
        phase = 'extract';
        status = 'queued';
      } else if (input.action === 'plan') {
        if (live || !['preview', 'ready'].includes(status) || phase === 'extract')
          fail('STRUCTURE_LOCKED', '开始提取后不能更改结构', 409);
        const nextPlan = normalizePlan(input.plan);
        if (!plan || planIdentity(nextPlan) !== planIdentity(plan)) {
          await connection.query('DELETE FROM toolbox_extraction_records WHERE extraction_id=? AND user_id=?', [
            id,
            userId,
          ]);
          await connection.query(
            "UPDATE toolbox_extraction_sources SET processed_windows=0,status='ready' WHERE extraction_id=? AND user_id=?",
            [id, userId],
          );
        }
        plan = nextPlan;
      } else if (input.action === 'pause') {
        if (!EXTRACTION_ACTIVE_STATUSES.includes(status)) fail('STATE_CONFLICT', '当前没有活动任务', 409);
        status = 'paused';
      } else if (['resume', 'retry'].includes(input.action)) {
        if (live || !['paused', 'failed', 'partial'].includes(status)) fail('STATE_CONFLICT', '当前任务不能继续', 409);
        if (row.error_code === 'EXTRACTION_OUTCOME_UNKNOWN' && input.confirmUncertain !== true)
          fail('UNCERTAIN_CONFIRMATION', '上次付费调用结果不确定，请明确确认重试', 409);
        if (
          phase !== 'prepare' &&
          sources.some(
            (s) => s.status !== 'completed' && (!s.source_json || new Date(s.expires_at).getTime() <= Date.now()),
          )
        )
          fail('MATERIAL_EXPIRED', '准备材料已过期，已有结果仍保留', 409);
        if (phase !== 'prepare')
          await connection.query(
            "UPDATE toolbox_extraction_sources SET status='ready',error_code=NULL WHERE extraction_id=? AND user_id=? AND status='failed'",
            [id, userId],
          );
        status = phase === 'prepare' ? 'preparing' : 'queued';
      } else if (input.action === 'retry_prepare') {
        if (live || phase !== 'prepare' || status === 'ended') fail('STATE_CONFLICT', '当前不能重新准备资料', 409);
        await connection.query(
          "UPDATE toolbox_extraction_sources SET status='preparing',error_code=NULL WHERE extraction_id=? AND user_id=? AND status='failed'",
          [id, userId],
        );
        status = 'preparing';
      } else if (input.action === 'remove_source') {
        if (live || phase !== 'prepare' || status === 'ended')
          fail('STATE_CONFLICT', '分析开始或结束后不能移除资料', 409);
        await connection.query('DELETE FROM toolbox_extraction_sources WHERE id=? AND extraction_id=? AND user_id=?', [
          input.sourceId,
          id,
          userId,
        ]);
        status = 'preparing';
      } else if (input.action === 'end') {
        if (live) fail('IN_FLIGHT', '请先暂停并等待在途处理完成', 409);
        status = 'ended';
      } else fail('ACTION_INVALID', '不支持的操作');
      await connection.query(
        'UPDATE toolbox_extractions SET status=?,phase=?,plan_json=?,accept_partial=?,version=version+1,data_version=data_version+1,error_code=NULL,available_at=NOW() WHERE id=? AND user_id=?',
        [status, phase, plan ? JSON.stringify(plan) : null, acceptPartial ? 1 : 0, id, userId],
      );
      return formatExtraction(await owned(connection, userId, id));
    });
  });
}
export function formatRecord(row) {
  return {
    ...json(row.payload_json),
    reviews: json(row.reviews_json, {}),
    version: Number(row.version),
    excluded: Boolean(row.excluded),
    published: Boolean(row.published),
  };
}
export async function recordSnapshot({ userId, id, filter = {}, database = pool }) {
  await requireExtractionSchema(database);
  return transaction(database, async (connection) => {
    // The first consistent read fixes both metadata and rows to one InnoDB snapshot.
    const table = await owned(connection, userId, id);
    const [rows] = await connection.query(
      'SELECT * FROM toolbox_extraction_records WHERE extraction_id=? AND user_id=? ORDER BY created_at,id',
      [id, userId],
    );
    const [sources] = await connection.query(
      'SELECT id,title,resource_type,resource_id,resource_version,coverage_json,status FROM toolbox_extraction_sources WHERE extraction_id=? AND user_id=? ORDER BY position',
      [id, userId],
    );
    return {
      table: formatExtraction(table),
      filter,
      sources: sources.map((s) => ({
        id: s.id,
        title: s.title,
        type: s.resource_type,
        resourceId: s.resource_id,
        version: s.resource_version,
        coverage: json(s.coverage_json),
        status: s.status,
      })),
      records: sortExtractionRecords(
        rows.map(formatRecord).filter((r) => extractionRecordMatches(r, filter)),
        json(table.plan_json)?.fields || [],
        filter,
      ),
    };
  });
}
export async function readRecords(options) {
  const snapshot = await recordSnapshot(options);
  const page = Math.max(1, Math.trunc(Number(options.page) || 1)),
    pageSize = 50;
  return {
    dataVersion: snapshot.table.dataVersion,
    total: snapshot.records.length,
    page,
    pageSize,
    records: snapshot.records.slice((page - 1) * pageSize, page * pageSize),
  };
}
export async function reviewExtractionRecord({ userId, id, recordId, input, database = pool }) {
  await requireExtractionSchema(database);
  return transaction(database, async (connection) => {
    await activeAccount(connection, userId, true);
    const table = await owned(connection, userId, id, true);
    if (table.phase !== 'extract' && table.status !== 'ended') fail('SAMPLE_READONLY', '请先确认提取，再核对记录', 409);
    return withReceipt(connection, { userId, id, input: { ...input, recordId } }, async () => {
      const [[row]] = await connection.query(
        'SELECT * FROM toolbox_extraction_records WHERE extraction_id=? AND user_id=? AND id=? FOR UPDATE',
        [id, userId, recordId],
      );
      if (!row) fail('RECORD_NOT_FOUND', '记录不存在', 404);
      const record = reviewRecord(formatRecord(row), input);
      await connection.query(
        'UPDATE toolbox_extraction_records SET reviews_json=?,version=?,excluded=?,pending_cells=? WHERE extraction_id=? AND id=? AND user_id=?',
        [
          JSON.stringify(record.reviews),
          record.version,
          record.excluded ? 1 : 0,
          record.cells.filter((c) => !record.reviews[c.fieldId]?.checked).length,
          id,
          recordId,
          userId,
        ],
      );
      await connection.query('UPDATE toolbox_extractions SET data_version=data_version+1 WHERE id=? AND user_id=?', [
        id,
        userId,
      ]);
      return record;
    });
  });
}
export async function deleteExtraction({ userId, id, version, database = pool }) {
  await requireExtractionSchema(database);
  return transaction(database, async (connection) => {
    await activeAccount(connection, userId, true);
    const row = await owned(connection, userId, id, true);
    assertVersion(row.version, version);
    if (row.lease_token || row.status === 'paused' || EXTRACTION_ACTIVE_STATUSES.includes(row.status))
      fail('ACTIVE', '请先暂停并结束活动任务再删除', 409);
    for (const table of [
      'toolbox_extraction_records',
      'toolbox_extraction_sources',
      'toolbox_extraction_receipts',
      'toolbox_extractions',
    ])
      await connection.query(
        `DELETE FROM ${table} WHERE ${table === 'toolbox_extractions' ? 'id' : 'extraction_id'}=? AND user_id=?`,
        [id, userId],
      );
    return { deleted: true };
  });
}

export async function inspectExtractionSource({ userId, id, sourceId, database = pool }) {
  await requireExtractionSchema(database);
  await owned(database, userId, id);
  const [[source]] = await database.query(
    'SELECT resource_type,resource_id,resource_version,title FROM toolbox_extraction_sources WHERE id=? AND extraction_id=? AND user_id=?',
    [sourceId, id, userId],
  );
  if (!source) fail('SOURCE_UNAVAILABLE', '来源资料不可用', 404);
  const [current] = await resolveExtractionSourceVersions({
    userId,
    resourceRefs: [{ type: source.resource_type, id: source.resource_id }],
    database,
  });
  return {
    type: source.resource_type,
    id: source.resource_id,
    title: source.title,
    available: Boolean(current),
    changed: Boolean(current && current.version !== source.resource_version),
  };
}

export async function nextPendingCell(options) {
  const snapshot = await recordSnapshot(options);
  const cells = snapshot.records.flatMap((record) => record.cells.map((cell) => ({ record, fieldId: cell.fieldId })));
  const direction = options.direction === -1 ? -1 : 1;
  let index = cells.findIndex((item) => item.record.id === options.recordId && item.fieldId === options.fieldId);
  if (index < 0) index = direction === 1 ? -1 : 0;
  for (let step = 1; step <= cells.length; step++) {
    const item = cells[(index + direction * step + cells.length) % cells.length];
    if (!item.record.reviews[item.fieldId]?.checked) return item;
  }
  return null;
}
