import { organizeOutcomeGroup } from '@lightnote/shared/organize-progress';
import {
  assertOrganizeProcessingSchema,
  readOrganizeOverview,
  readOrganizeReview,
  markProcessingAi,
  settleProcessingRun,
} from './organizeProcessingPipeline.js';
import {
  availableResourceSql,
  effectiveStatusSql,
  actionableStatuses,
  unavailableReason,
} from './organizeSuggestionAvailability.js';
import { prepareOrganizeFile, understandOrganizeFile, applyVisualEvidence } from './organizeFileEvidence.js';
import { prepareTagIconChoice, prepareTagIconRoute } from '../tagIconService.js';
import {
  previewV2,
  startV2,
  pauseV2,
  resumeV2,
  endV2,
  isRunV2,
  lifecycleState,
  runRuleBatch,
  refreshPendingSource,
} from './organizeSuggestionLifecycle.js';
import crypto from 'node:crypto';
import { isAiQuotaErrorCode } from '@lightnote/shared/ai-quota-protocol';
import pool from '../../db/index.js';
import { suggestionError } from './organizeSuggestionRules.js';
import { readCurrentSuggestionSource } from './organizeSuggestionSources.js';
import { createUserAiExecutionConfig } from '../aiBillingCatalog.js';
import { runAiExecution } from '../aiExecution/service.js';
import { getActiveAiExecution } from '../aiExecution/context.js';
import { withActiveUserAiDispatch, lockActiveUserForUpdate } from '../aiOutboundDispatchGuard.js';
import { getActiveSecurityRestrictions } from '../security/services/securityRestrictionService.js';
import { isOrganizeAiSuggestionsEnabled } from '../organizeAiSuggestionFeature.js';
import {
  suggestResourceMetadata,
  estimateResourceMetadataTokens,
  prepareResourceMetadata,
  compileFileMetadataPlan,
} from './organizeSuggestionModel.js';
import { applySuggestionMutation } from './organizeSuggestionActions.js';
import { invalidatePersonalKnowledgeCache } from '../personalKnowledgeSearch.js';
import { json, transaction } from './organizeSuggestionStorage.js';
export { json, transaction } from './organizeSuggestionStorage.js';
const uuid = (value) =>
  /^[\da-f]{8}-[\da-f]{4}-[1-5][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/iu.test(String(value || ''));
async function ownedRun(db, userId, id, lock = false) {
  const [rows] = await db.query(
    `SELECT * FROM organize_suggestion_runs WHERE user_id=? AND id=?${lock ? ' FOR UPDATE' : ''}`,
    [userId, id],
  );
  if (!rows.length) throw suggestionError('ORGANIZE_RUN_NOT_FOUND', '整理任务不存在', 404);
  return rows[0];
}
export async function previewSuggestionRun(db = pool, { userId, input, requestId }) {
  if (!uuid(requestId)) throw suggestionError('ORGANIZE_REQUEST_INVALID', '请求标识无效');
  await assertOrganizeProcessingSchema(db);
  return previewV2(db, { userId, input, requestId, runVersion: 3 });
}

function mapRun(row) {
  return {
    id: row.id,
    status: row.status,
    createdAt: row.created_at,
    ...lifecycleState(row),
    options: json(row.options_json),
    summary: json(row.summary_json),
  };
}
export async function createSuggestionRun(db = pool, { userId, id, requestId = id, replaceRunId }) {
  if (!uuid(requestId)) throw suggestionError('ORGANIZE_REQUEST_INVALID', '请求标识无效');
  const version = await ownedRun(db, userId, id);
  if (isRunV2(version)) return startV2(db, { userId, id, requestId, replaceRunId });
  return transaction(db, async (c) => {
    await lockActiveUserForUpdate(c, userId);
    const run = await ownedRun(c, userId, id, true);
    if (run.status !== 'preview') return mapRun(run);
    const [active] = await c.query(
      "SELECT * FROM organize_suggestion_runs WHERE user_id=? AND id<>? AND status IN ('preparing','running','paused') ORDER BY id FOR UPDATE",
      [userId, id],
    );
    if (active.some((row) => row.id !== replaceRunId))
      throw suggestionError('ORGANIZE_ACTIVE_RUN_EXISTS', '仍有未结束的整理，请确认结束后再开始', 409);
    for (const old of active) await endV2(c, old);
    if (!json(run.summary_json).total) throw suggestionError('ORGANIZE_SCOPE_EMPTY', '没有可处理的资料');
    const needsAi = json(run.summary_json).aiTotal > 0;
    if (needsAi && !isOrganizeAiSuggestionsEnabled()) {
      await c.query(
        "UPDATE organize_suggestions SET status='failed',payload_json=JSON_SET(payload_json,'$.reason','AI 建议暂不可用，可稍后重新整理') WHERE run_id=? AND status='queued'",
        [id],
      );
      await c.query(
        "UPDATE organize_suggestion_items SET ai_status='failed',error_code='ORGANIZE_AI_DISABLED' WHERE run_id=? AND ai_status IN ('queued','waiting_content','preparing_content')",
        [id],
      );
    }
    run.status = needsAi && isOrganizeAiSuggestionsEnabled() ? 'running' : 'completed';
    try {
      await c.query('UPDATE organize_suggestion_runs SET status=?,start_request_id=? WHERE id=?', [
        run.status,
        requestId,
        id,
      ]);
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY')
        throw suggestionError('ORGANIZE_REQUEST_CONFLICT', '请求标识已用于其他任务', 409);
      throw error;
    }
    return mapRun(run);
  });
}
export async function listSuggestionRuns(db = pool, { userId }) {
  const [rows] = await db.query(
    "SELECT * FROM organize_suggestion_runs WHERE user_id=? AND status<>'preview' ORDER BY (status IN ('preparing','running','paused')) DESC,COALESCE(started_at,created_at) DESC,id DESC LIMIT 50",
    [userId],
  );
  return rows.map(mapRun);
}
export async function getSuggestionRun(db = pool, { userId, id, after = '', resourceType = '', kind = '' }) {
  const run = await ownedRun(db, userId, id);
  const [progress] = await db.query(
    'SELECT resource_type,ai_status,COUNT(*) AS total FROM organize_suggestion_items WHERE run_id=? AND user_id=? GROUP BY resource_type,ai_status',
    [id, userId],
  );
  const [counts] = await db.query(
    `SELECT ${effectiveStatusSql()} AS status,COUNT(*) AS total FROM organize_suggestions s JOIN organize_suggestion_items i ON i.id=s.item_id AND i.user_id=s.user_id WHERE s.run_id=? AND s.user_id=? GROUP BY 1`,
    [id, userId],
  );
  const where = ['i.run_id=?', 'i.user_id=?', 'i.id>?'];
  const params = [id, userId, after];
  if (resourceType) {
    where.push('i.resource_type=?');
    params.push(resourceType);
  }
  if (kind) {
    where.push('EXISTS(SELECT 1 FROM organize_suggestions s WHERE s.item_id=i.id AND s.kind=?)');
    params.push(kind);
  }
  const [items] = await db.query(
    `SELECT i.*, (${availableResourceSql()}) AS resource_available, (${availableResourceSql('i', true)}) AS resource_trashed FROM organize_suggestion_items i WHERE ${where.join(' AND ')} ORDER BY i.id LIMIT 31`,
    params,
  );
  const page = items.slice(0, 30);
  const [suggestions] = page.length
    ? await db.query(
        'SELECT * FROM organize_suggestions WHERE user_id=? AND run_id=? AND item_id IN (?) ORDER BY kind',
        [userId, id, page.map((i) => i.id)],
      )
    : [[]];
  const [ruleProgress] = isRunV2(run)
    ? await db.query(
        'SELECT rule_status,COUNT(*) AS total FROM organize_suggestion_items WHERE run_id=? GROUP BY rule_status',
        [id],
      )
    : [[]];
  const itemOutcomes = new Map();
  const overview =
    Number(run.run_version) === 3 ? await readOrganizeOverview(db, run, ruleProgress, itemOutcomes) : undefined;
  const review = overview?.review || (await readOrganizeReview(db, run, itemOutcomes));
  let groupTotals;
  if (resourceType === 'tag') {
    groupTotals = {};
    for (const { type, outcome } of itemOutcomes.values())
      if (type === 'tag') {
        const group = organizeOutcomeGroup(outcome);
        groupTotals[group] = (groupTotals[group] || 0) + 1;
      }
  }
  return {
    ...mapRun(run),
    ...(overview ? { overview } : {}),
    review,
    ...(groupTotals ? { groupTotals } : {}),
    ...lifecycleState(run, progress, ruleProgress),
    progress,
    counts,
    items: page.map((i) => ({
      id: i.id,
      resource: json(i.snapshot_json),
      aiStatus: i.ai_status,
      ruleStatus: i.rule_status,
      outcome: itemOutcomes.get(i.id)?.outcome,
      errorCode: i.error_code,
      suggestions: suggestions
        .filter((s) => s.item_id === i.id)
        .map((s) => {
          const { archiveDraft, ...payload } = json(s.payload_json);
          const expired =
            Number(i.resource_available) === 0 && i.resource_available != null && actionableStatuses.includes(s.status);
          return {
            ...payload,
            id: s.id,
            status: expired ? 'expired' : s.status,
            ...(expired ? { reason: unavailableReason(Number(i.resource_trashed) === 1) } : {}),
          };
        }),
    })),
    nextCursor: items.length > 30 ? page.at(-1).id : null,
  };
}
export async function getArchiveDraft(db = pool, { userId, runId, suggestionId }) {
  const [rows] = await db.query(
    `SELECT s.payload_json FROM organize_suggestions s
     JOIN organize_suggestion_items i ON i.id=s.item_id AND i.user_id=s.user_id
     JOIN bookmark b ON CONVERT(b.id USING utf8mb4) COLLATE utf8mb4_unicode_ci=i.resource_id
       AND CONVERT(b.user_id USING utf8mb4) COLLATE utf8mb4_unicode_ci=i.user_id AND b.del_flag=0
     WHERE s.id=? AND s.run_id=? AND s.user_id=? AND s.kind='archive' AND i.resource_type='bookmark'`,
    [suggestionId, runId, userId],
  );
  const draft = rows[0] && json(rows[0].payload_json).archiveDraft;
  if (!draft || draft.status !== 'ready')
    throw suggestionError('ORGANIZE_ARCHIVE_NOT_READY', '没有可预览的网页正文，请重新整理', 404);
  return {
    title: draft.title,
    content: draft.content,
    char_count: draft.charCount,
    source: draft.source,
    update_time: draft.generatedAt,
  };
}

export async function cancelSuggestionRun(db = pool, { userId, id }) {
  return transaction(db, async (c) => {
    const run = await ownedRun(c, userId, id, true);
    if (run.status === 'preview') throw suggestionError('ORGANIZE_RUN_NOT_STARTED', '任务尚未开始', 409);
    if (['completed', 'ended'].includes(run.status)) return { id, status: run.status };
    if (isRunV2(run)) {
      await endV2(c, run);
      return { id, status: 'ended' };
    }
    // 已开始的项继续交付；只取消未取得执行租约的项。
    await c.query(
      "UPDATE organize_suggestions s JOIN organize_suggestion_items i ON i.id=s.item_id SET s.status='cancelled',s.payload_json=JSON_SET(s.payload_json,'$.reason','尚未开始的分析已取消，已有结果保留') WHERE i.run_id=? AND i.user_id=? AND i.ai_status='queued' AND s.status='queued'",
      [id, userId],
    );
    await c.query(
      "UPDATE organize_suggestion_items SET ai_status='cancelled' WHERE run_id=? AND user_id=? AND ai_status='queued'",
      [id, userId],
    );
    await c.query("UPDATE organize_suggestion_runs SET status='cancelled' WHERE id=? AND user_id=?", [id, userId]);
    return { id, status: 'cancelled' };
  });
}
export async function actOnSuggestion(
  db = pool,
  { userId, runId, suggestionId, action, value, requestId, batchOnly = false },
) {
  if (!['apply', 'ignore'].includes(action) || !uuid(requestId))
    throw suggestionError('ORGANIZE_ACTION_INVALID', '操作无效');
  let preparedIcon;
  if (action === 'apply' && value?.iconName) {
    const [rows] = await db.query(
      'SELECT kind,status,payload_json FROM organize_suggestions WHERE id=? AND run_id=? AND user_id=?',
      [suggestionId, runId, userId],
    );
    if (!rows.length || rows[0].kind !== 'tag_icon')
      throw suggestionError('ORGANIZE_SUGGESTION_NOT_FOUND', '建议不存在', 404);
    if (['applied', 'ignored'].includes(rows[0].status)) return { status: rows[0].status };
    preparedIcon = await prepareTagIconChoice(value, json(rows[0].payload_json)?.candidates || []);
  }
  let cleanup;
  const result = await transaction(db, async (c) => {
    await lockActiveUserForUpdate(c, userId);
    const run = await ownedRun(c, userId, runId, true);
    if (run.status === 'preview') throw suggestionError('ORGANIZE_RUN_NOT_STARTED', '请先确认并开始整理', 409);
    const [rows] = await c.query(
      'SELECT * FROM organize_suggestions WHERE id=? AND run_id=? AND user_id=? FOR UPDATE',
      [suggestionId, runId, userId],
    );
    const suggestion = rows[0];
    if (!suggestion) throw suggestionError('ORGANIZE_SUGGESTION_NOT_FOUND', '建议不存在', 404);
    if (batchOnly && !['archive', 'tags', 'title'].includes(suggestion.kind))
      throw suggestionError('ORGANIZE_BATCH_UNSUPPORTED', '此建议需要单独处理', 409);
    if (['applied', 'ignored'].includes(suggestion.status)) return { status: suggestion.status };
    if (suggestion.status === 'expired') {
      const expired = json(suggestion.payload_json);
      throw suggestionError(
        expired.reasonCode || 'ORGANIZE_RESOURCE_UNAVAILABLE',
        expired.reason || '建议已失效，请重新检查',
        409,
      );
    }
    if (
      !['pending', 'insufficient', 'no_suggestion', 'info'].includes(suggestion.status) &&
      !(suggestion.kind === 'tag_icon' && suggestion.status === 'failed')
    )
      throw suggestionError('ORGANIZE_SUGGESTION_STATE', '当前建议不能操作', 409);
    const payload = json(suggestion.payload_json);
    if (
      batchOnly &&
      (suggestion.status !== 'pending' ||
        (suggestion.kind === 'archive'
          ? payload.archiveDraft?.status !== 'ready'
          : suggestion.kind === 'tags'
            ? !Array.isArray(payload.after) || !payload.after.length
            : typeof payload.after !== 'string' || !payload.after.trim()))
    )
      throw suggestionError('ORGANIZE_SUGGESTION_STATE', '此建议没有可直接应用的结果', 409);
    if (action === 'ignore') {
      await c.query("UPDATE organize_suggestions SET status='ignored',applied_request_id=? WHERE id=?", [
        requestId,
        suggestionId,
      ]);
      return { status: 'ignored' };
    }
    const [itemRows] = await c.query('SELECT * FROM organize_suggestion_items WHERE id=? AND user_id=? FOR UPDATE', [
      suggestion.item_id,
      userId,
    ]);
    const item = itemRows[0];
    const [table, owner] = {
      tag: ['tag', 'user_id'],
      note: ['note', 'create_by'],
      bookmark: ['bookmark', 'user_id'],
      file: ['files', 'create_by'],
    }[item.resource_type];
    await c.query(`SELECT id FROM ${table} WHERE id=? AND ${owner}=? AND del_flag=0 FOR UPDATE`, [
      item.resource_id,
      userId,
    ]);
    // 清理前的第一份一致性读取必须晚于关系锁，避免引用/分享使用旧快照。
    if (item.resource_type === 'note' && ['empty', 'duplicate'].includes(suggestion.kind)) {
      await c.query('SELECT id FROM note WHERE create_by=? AND del_flag=0 ORDER BY id FOR UPDATE', [userId]);
      await c.query('SELECT id FROM note_shares WHERE owner_user_id=? FOR UPDATE', [userId]);
      await c.query(
        "SELECT target_id FROM note_resource_refs WHERE source_user_id=? AND target_type='note' AND target_id=? FOR UPDATE",
        [userId, item.resource_id],
      );
      await c.query(
        "SELECT target_id FROM todo_resource_refs WHERE user_id=? AND target_type='note' AND target_id=? FOR UPDATE",
        [userId, item.resource_id],
      );
      await c.query(
        "SELECT resource_id FROM todo_series_resource_refs WHERE user_id=? AND resource_type='note' AND resource_id=? FOR UPDATE",
        [userId, item.resource_id],
      );
    }
    const expire = async (code, message) => {
      await c.query("UPDATE organize_suggestions SET status='expired',payload_json=? WHERE id=?", [
        JSON.stringify({ ...payload, reason: message, reasonCode: code }),
        suggestionId,
      ]);
      return { conflict: { code, message } };
    };
    const current = await readCurrentSuggestionSource(c, userId, item.resource_type, item.resource_id);
    if (!current) {
      const [deleted] = await c.query(`SELECT del_flag FROM ${table} WHERE id=? AND ${owner}=?`, [
        item.resource_id,
        userId,
      ]);
      const trashed = Number(deleted[0]?.del_flag) === 1;
      return expire(
        trashed ? 'ORGANIZE_RESOURCE_TRASHED' : 'ORGANIZE_RESOURCE_UNAVAILABLE',
        unavailableReason(trashed),
      );
    }
    if (current.version !== item.version_hash)
      return expire('ORGANIZE_RESOURCE_CHANGED', '资料已更新，需重新检查后再应用');
    if (['queued', 'running'].includes(item.ai_status))
      throw suggestionError('ORGANIZE_ANALYSIS_RUNNING', '请等待当前资料分析完成后再应用', 409);
    const mutation = await applySuggestionMutation(c, {
      userId,
      current,
      payload,
      value,
      kind: suggestion.kind,
      runId,
      preparedIcon,
    });
    cleanup = mutation.cleanup;
    if (mutation.deleted) {
      if (Number(run.run_version) === 3) {
        await c.query(
          "UPDATE organize_processing_jobs SET status='skipped',lease_token=NULL,lease_expires_at=NULL WHERE item_id=? AND status IN ('queued','waiting','running')",
          [item.id],
        );
        await settleProcessingRun(c, run.id);
      }
      if (isRunV2(run))
        await c.query("UPDATE organize_suggestion_items SET rule_status='removed',ai_status='not_needed' WHERE id=?", [
          item.id,
        ]);
      await c.query(
        "UPDATE organize_suggestions SET status='closed' WHERE item_id=? AND status NOT IN ('applied','ignored')",
        [item.id],
      );
    } else {
      const next = await readCurrentSuggestionSource(c, userId, current.type, current.id);
      if (current.type === 'file' && json(item.snapshot_json)?.reading) next.reading = json(item.snapshot_json).reading;
      await c.query('UPDATE organize_suggestion_items SET version_hash=?,snapshot_json=? WHERE id=?', [
        next.version,
        JSON.stringify(next),
        item.id,
      ]);
    }
    await c.query("UPDATE organize_suggestions SET status='applied',payload_json=?,applied_request_id=? WHERE id=?", [
      JSON.stringify({
        ...payload,
        proposedAfter: payload.after,
        after: ['tags', 'title', 'tag_icon'].includes(suggestion.kind) ? mutation.applied : payload.after,
        applied: mutation.applied,
      }),
      requestId,
      suggestionId,
    ]);
    return { status: 'applied', applied: mutation.applied };
  });
  if (result.conflict) throw suggestionError(result.conflict.code, result.conflict.message, 409);
  // 提交完成后的派生缓存清理失败不能伪装成业务写入失败。
  if (cleanup) void cleanup().catch(() => {});
  void invalidatePersonalKnowledgeCache(userId).catch(() => {});
  return result;
}
async function finishItem(c, job, status, result, errorCode = null) {
  const run = await ownedRun(c, job.user_id, job.run_id, true);
  if (
    ['file', 'tag'].includes(job.resource_type) &&
    status === 'completed' &&
    !['running', 'paused', ...(Number(run.run_version) === 3 ? ['ended'] : [])].includes(run.status)
  )
    return false;
  const [live] = await c.query('SELECT lease_token FROM organize_suggestion_items WHERE id=? FOR UPDATE', [job.id]);
  if (live[0]?.lease_token !== job.lease_token) return false;
  const [rows] = await c.query(
    "SELECT * FROM organize_suggestions WHERE item_id=? AND status IN ('queued','running')",
    [job.id],
  );
  for (const row of rows) {
    const payload = json(row.payload_json);
    const value = result?.[row.kind];
    const hasValue = Array.isArray(value) ? value.length > 0 : Boolean(value);
    const covered = row.kind === 'tags' && result?.tagOutcome === 'already_associated';
    const nextStatus =
      status === 'completed'
        ? hasValue
          ? 'pending'
          : covered
            ? 'not_applicable'
            : result?.reading && !result.reading.complete
              ? 'failed'
              : row.kind === 'tag_icon'
                ? 'no_suggestion'
                : 'insufficient'
        : status;
    const after =
      row.kind === 'tag_icon' ? value?.[0] || null : row.kind === 'title' ? value?.name || null : value || null;
    await c.query('UPDATE organize_suggestions SET status=?,payload_json=? WHERE id=?', [
      nextStatus,
      JSON.stringify({
        ...payload,
        after,
        ...(row.kind === 'tag_icon' ? { candidates: value || [] } : {}),
        ...(result?.reading ? { reading: result.reading } : {}),
        ...(row.kind === 'tags' && result?.tagOutcome ? { reasonCode: result.tagOutcome } : {}),
        reason:
          status === 'completed'
            ? row.kind === 'tag_icon'
              ? hasValue
                ? '根据标签名称匹配图标'
                : '暂无合适推荐，可手动选择'
              : hasValue
                ? row.kind === 'title'
                  ? value.evidence
                  : '根据资料内容建议的核心主题标签'
                : row.kind === 'tags'
                  ? result?.fetchReason && result?.tagOutcome !== 'already_associated'
                    ? '网页暂时无法读取，已按现有书签信息分析，未发现可追加标签'
                    : {
                        already_associated: '推荐主题已由现有标签覆盖，无需追加',
                        filtered: '生成的标签未通过依据校验，可手动补充',
                        no_suggestion: '没有发现适合追加的主题标签，可手动补充',
                      }[result?.tagOutcome] || '没有充分依据，可手动补充'
                  : '没有充分依据，可手动补充'
            : errorCode === 'ORGANIZE_RESOURCE_CHANGED'
              ? '资料已变化，请重新整理'
              : String(errorCode || '').startsWith('BOOKMARK_PAGE_')
                ? '网页暂时无法读取，请完善书签信息后重新整理'
                : '分析未完成，请重新整理',
      }),
      row.id,
    ]);
  }
  await c.query(
    'UPDATE organize_suggestion_items SET ai_status=?,error_code=?,lease_token=NULL,lease_expires_at=NULL WHERE id=?',
    [
      status === 'completed' && result?.reading && !result.reading.complete && !(result.tags || []).length
        ? 'failed'
        : status,
      errorCode || (result?.reading?.complete === false ? result.reading.reasonCode : null),
      job.id,
    ],
  );
  if (Number(run.run_version) === 3) {
    const finalStatus =
      status === 'completed' && result?.reading?.complete === false
        ? result.tags?.length
          ? 'partial'
          : 'failed'
        : status;
    await markProcessingAi(c, job.id, finalStatus, null, errorCode);
    await settleProcessingRun(c, job.run_id);
    return true;
  }
  const [pending] = await c.query(
    "SELECT COUNT(*) AS total FROM organize_suggestion_items WHERE run_id=? AND ai_status IN ('queued','running','waiting_content','preparing_content')",
    [job.run_id],
  );
  if (!Number(pending[0].total))
    await c.query(
      "UPDATE organize_suggestion_runs SET status='completed' WHERE id=? AND status IN ('running','paused') AND rule_phase='completed'",
      [job.run_id],
    );
  return true;
}
export async function runSingleSuggestionItem(workerId, db = pool, dependencies = {}) {
  let job;
  try {
    if (!dependencies.skipRules && (await runRuleBatch(db))) return true;
    job = await transaction(db, async (c) => {
      // MySQL 5.7: serialize the short claim transaction; release locks before any AI call.
      const [runs] = await c.query(`SELECT r.id,r.status,r.run_version FROM organize_suggestion_runs r
        WHERE ${dependencies.pipeline === 'v3' ? 'r.run_version=3 AND' : dependencies.pipeline === 'legacy' ? 'r.run_version<>3 AND' : ''} r.status IN ('running','paused','ended','cancelled') AND (r.run_version<>3 OR r.rule_phase='completed') AND EXISTS (
          SELECT 1 FROM organize_suggestion_items i WHERE i.run_id=r.id AND
          ((r.status='running' AND (i.ai_status='queued' OR (i.ai_status='waiting_content' AND (i.next_check_at IS NULL OR i.next_check_at<=NOW())))) OR (i.ai_status IN ('running','preparing_content') AND i.lease_expires_at<NOW()))
        ) ORDER BY r.created_at,r.id LIMIT 1 FOR UPDATE`);
      if (!runs.length) return null;
      const [rows] = await c.query(
        `SELECT i.* FROM organize_suggestion_items i WHERE i.run_id=? AND
        ((?='running' AND (i.ai_status='queued' OR (i.ai_status='waiting_content' AND (i.next_check_at IS NULL OR i.next_check_at<=NOW())))) OR (i.ai_status IN ('running','preparing_content') AND i.lease_expires_at<NOW()))
        ORDER BY i.id LIMIT 1 FOR UPDATE`,
        [runs[0].id, runs[0].status],
      );
      if (!rows.length) return null;
      const item = rows[0];
      item.run_version = runs[0].run_version;
      if (item.ai_status === 'running') {
        // 外发后崩溃无法证明 Provider 未执行，过期租约只交付失败，不自动重复收费。
        await finishItem(c, item, 'failed', null, 'ORGANIZE_WORKER_INTERRUPTED');
        return { recovered: true };
      }
      if (item.ai_status === 'preparing_content' && runs[0].status !== 'running') {
        await c.query(
          'UPDATE organize_suggestion_items SET ai_status=?,lease_token=NULL,lease_expires_at=NULL WHERE id=?',
          [runs[0].status === 'paused' ? 'waiting_content' : 'cancelled', item.id],
        );
        if (Number(item.run_version) === 3) {
          await markProcessingAi(c, item.id, runs[0].status === 'paused' ? 'waiting' : 'cancelled');
          await settleProcessingRun(c, item.run_id);
        }
        return { recovered: true };
      }
      if (Number(item.run_version) === 3) {
        const [jobs] = await c.query(
          "SELECT prepared_json FROM organize_processing_jobs WHERE item_id=? AND kind='analysis' AND lane='ai' AND status IN ('queued','waiting','running')",
          [item.id],
        );
        if (!jobs.length) return null;
        item.processingPrepared = json(jobs[0].prepared_json);
        if (item.resource_type === 'tag' && item.snapshot_json) {
          const snapshot = json(item.snapshot_json),
            route = prepareTagIconRoute(snapshot.title);
          if (!route.needsAi) {
            await c.query(
              "UPDATE organize_processing_jobs SET lane='direct',kind='tag_icon',status='queued',prepared_json=?,lease_token=NULL,lease_expires_at=NULL WHERE item_id=? AND kind='analysis'",
              [JSON.stringify({ keywords: route.keywords, version: snapshot.version }), item.id],
            );
            await c.query(
              "UPDATE organize_suggestion_items SET ai_status='not_needed',ai_kinds_json='[]',lease_token=NULL,lease_expires_at=NULL WHERE id=?",
              [item.id],
            );
            return { reclassified: true };
          }
        }
      }
      item.lease_token = crypto.randomUUID();
      await c.query(
        `UPDATE organize_suggestion_items SET ai_status='${item.resource_type === 'file' ? 'preparing_content' : 'running'}',lease_token=?,lease_expires_at=DATE_ADD(NOW(),INTERVAL 10 MINUTE) WHERE id=?`,
        [item.lease_token, item.id],
      );
      if (Number(item.run_version) === 3) await markProcessingAi(c, item.id, 'running', item.lease_token);
      await c.query(
        "UPDATE organize_suggestions SET status='running',payload_json=JSON_SET(payload_json,'$.reason','正在分析') WHERE item_id=? AND status='queued'",
        [item.id],
      );
      return item;
    });
  } catch (error) {
    if (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code)) return false;
    throw error;
  }
  if (!job) return false;
  if (job.recovered || job.reclassified) return true;
  const analysisStartedAt = Date.now();
  let executionRecord;
  let providerStarted = false;
  try {
    let current = await readCurrentSuggestionSource(db, job.user_id, job.resource_type, job.resource_id);
    if (job.processingPrepared?.version !== current?.version) job.processingPrepared = null;
    if (!current) throw suggestionError('ORGANIZE_RESOURCE_CHANGED', '资料已变化', 409);
    if (current.version !== job.version_hash) {
      if (!isRunV2(job)) throw suggestionError('ORGANIZE_RESOURCE_CHANGED', '资料已变化', 409);
      job.processingPrepared = null;
      job.ai_kinds_json = await refreshPendingSource(db, job, current);
      if (!job.ai_kinds_json.length) {
        await transaction(db, async (c) => {
          if (Number(job.run_version) === 3)
            await c.query(
              "UPDATE organize_processing_jobs SET lane='direct' WHERE item_id=? AND kind='analysis' AND lease_token=?",
              [job.id, job.lease_token],
            );
          return finishItem(c, job, 'completed', {});
        });
        return true;
      }
    }
    if (!isOrganizeAiSuggestionsEnabled()) throw suggestionError('ORGANIZE_AI_DISABLED', 'AI 建议暂不可用', 503);
    let filePrepared;
    if (current.type === 'file') {
      filePrepared = await (dependencies.prepareFile || prepareOrganizeFile)(
        db,
        job.user_id,
        current,
        json(job.snapshot_json)?.reading,
      );
      if (filePrepared.waiting) {
        current.reading = filePrepared.reading;
        await transaction(db, async (c) => {
          const run = await ownedRun(c, job.user_id, job.run_id, true);
          const [released] = await c.query(
            `UPDATE organize_suggestion_items SET ai_status=?,snapshot_json=?,next_check_at=DATE_ADD(NOW(),INTERVAL 3 SECOND),lease_token=NULL,lease_expires_at=NULL WHERE id=? AND lease_token=?`,
            [
              ['running', 'paused'].includes(run.status) ? 'waiting_content' : 'cancelled',
              JSON.stringify(current),
              job.id,
              job.lease_token,
            ],
          );
          if (Number(job.run_version) === 3 && released.affectedRows)
            await markProcessingAi(c, job.id, ['running', 'paused'].includes(run.status) ? 'waiting' : 'cancelled');
        });
        return true;
      }
      // Parsing can complete between queue passes; never reuse the rule-phase text snapshot.
      const refreshed = await readCurrentSuggestionSource(db, job.user_id, job.resource_type, job.resource_id);
      if (!refreshed || refreshed.version !== current.version)
        throw suggestionError('ORGANIZE_RESOURCE_CHANGED', '资料已变化', 409);
      current = applyVisualEvidence(refreshed, filePrepared);
      await transaction(db, async (c) => {
        const run = await ownedRun(c, job.user_id, job.run_id, true);
        if (!['running', 'paused'].includes(run.status)) throw suggestionError('ORGANIZE_RUN_ENDED', '整理已结束', 409);
        const [updated] = await c.query(
          "UPDATE organize_suggestion_items SET ai_status='running',snapshot_json=? WHERE id=? AND lease_token=? AND ai_status='preparing_content' AND lease_expires_at>NOW()",
          [JSON.stringify(current), job.id, job.lease_token],
        );
        if (!updated.affectedRows) throw suggestionError('ORGANIZE_LEASE_LOST', '执行租约已失效', 409);
      });
    }
    // 网页读取不持有外发用户锁；进入外发屏障后再次复核准备期间的变化。
    const prepared =
      current.type === 'bookmark'
        ? job.processingPrepared?.bookmark || (await (dependencies.prepare || prepareResourceMetadata)(current))
        : null;
    const dispatch = dependencies.dispatch || withActiveUserAiDispatch;
    await dispatch(db, job.user_id, async ({ connection, user }) => {
      const restrictions = await (dependencies.restrictions || getActiveSecurityRestrictions)(job.user_id);
      if (restrictions.some((r) => ['full_lock', 'login_lock', 'ai_lock'].includes(r.restriction_type)))
        throw suggestionError('AI_ACCESS_RESTRICTED', 'AI 权限暂不可用', 403);
      if (['bookmark', 'tag'].includes(current.type) || (Number(job.run_version) === 3 && current.type === 'note')) {
        const liveRun = await ownedRun(connection, job.user_id, job.run_id);
        const [leases] = await connection.query(
          "SELECT lease_token FROM organize_suggestion_items WHERE id=? AND ai_status='running' AND lease_expires_at>NOW()",
          [job.id],
        );
        if (leases[0]?.lease_token !== job.lease_token)
          throw suggestionError('ORGANIZE_LEASE_LOST', '执行租约已失效', 409);
        if (!['running', 'paused'].includes(liveRun.status))
          throw suggestionError('ORGANIZE_RUN_ENDED', '整理已结束', 409);
        const latest = await readCurrentSuggestionSource(connection, job.user_id, job.resource_type, job.resource_id);
        if (!latest || latest.version !== current.version)
          throw suggestionError('ORGANIZE_RESOURCE_CHANGED', '资料已变化，请重新整理', 409);
      }
      const [tags] =
        current.type === 'tag'
          ? [[]]
          : await connection.query('SELECT id,name FROM tag WHERE user_id=? AND del_flag=0', [job.user_id]);
      const request = {
        user,
        billingUser: user,
        resourceUser: user,
        securityRestrictions: restrictions,
        headers: {},
        body: {},
        path: '/organize/suggestions/worker',
        method: 'POST',
        ip: 'organize-worker',
      };
      const beforeCall = async () => {
        if (current.type !== 'file') return;
        if (!isOrganizeAiSuggestionsEnabled()) throw suggestionError('ORGANIZE_AI_DISABLED', 'AI 建议暂不可用', 503);
        const liveRun = await ownedRun(db, job.user_id, job.run_id);
        if (
          ![
            'running',
            'paused',
            ...(Number(job.run_version) === 3 && executionRecord?.providerCallCount > 0 ? ['ended'] : []),
          ].includes(liveRun.status)
        )
          throw suggestionError('ORGANIZE_RUN_ENDED', '整理已结束', 409);
        const latest = await readCurrentSuggestionSource(db, job.user_id, job.resource_type, job.resource_id);
        if (!latest || latest.version !== current.version)
          throw suggestionError('ORGANIZE_RESOURCE_CHANGED', '资料已变化', 409);
        const restrictions = await (dependencies.restrictions || getActiveSecurityRestrictions)(job.user_id);
        if (restrictions.some((r) => ['full_lock', 'login_lock', 'ai_lock'].includes(r.restriction_type)))
          throw suggestionError('AI_ACCESS_RESTRICTED', 'AI 权限暂不可用', 403);
        const [renewed] = await db.query(
          "UPDATE organize_suggestion_items SET lease_expires_at=DATE_ADD(NOW(),INTERVAL 10 MINUTE) WHERE id=? AND lease_token=? AND ai_status='running' AND lease_expires_at>NOW()",
          [job.id, job.lease_token],
        );
        if (!renewed.affectedRows) throw suggestionError('ORGANIZE_LEASE_LOST', '执行租约已失效', 409);
      };
      const filePlan =
        current.type === 'file' ? compileFileMetadataPlan(current, tags, filePrepared.visualPages.length) : null;
      await (dependencies.runExecution || runAiExecution)(
        createUserAiExecutionConfig(current.type === 'tag' ? 'tag.icon_keywords' : 'organize.metadata', {
          requestId: job.lease_token,
          organizeRunId: job.run_id,
          organizeItemId: job.id,
          request,
          identity: user,
          subjectIdentity: user,
          surface: 'organize_center',
          reservationTokens: estimateResourceMetadataTokens(current, json(job.ai_kinds_json), tags, prepared),
          maxUserProviderCalls: 1,
          ...(filePlan || {}),
          ...(filePlan
            ? {
                resolveResultOutcome: (result) =>
                  result.reading?.complete === false
                    ? {
                        status: result.tags?.length ? 'partial' : 'failed',
                        errorCode: result.reading.reasonCode || 'CONTENT_UNREADABLE',
                      }
                    : { status: 'success' },
              }
            : {}),
        }),
        async () => {
          executionRecord = getActiveAiExecution();
          if (filePrepared) {
            try {
              current = await (dependencies.understandFile || understandOrganizeFile)(
                db,
                job.user_id,
                current,
                filePrepared,
                beforeCall,
              );
            } catch (error) {
              // Deterministic capability/input failures may still leave useful native text or filename.
              if (
                ![
                  'VISION_UNAVAILABLE',
                  'OCR_PAGE_LIMIT',
                  'OCR_ENGINE_UNAVAILABLE',
                  'OCR_PDF_RENDER_FAILED',
                  'OCR_IMAGE_TOO_LARGE',
                  'FILE_CONTENT_INVALID',
                ].includes(error.code)
              )
                throw error;
              current.reading = {
                ...current.reading,
                complete: false,
                state: current.source.text ? 'partial' : 'metadata',
                reasonCode: error.code,
              };
            }
          }
          const result = await (dependencies.model || suggestResourceMetadata)(
            current,
            json(job.ai_kinds_json),
            tags,
            prepared,
            beforeCall,
          );
          await beforeCall();
          if (filePrepared) result.reading = current.reading;
          // Provider 成果在根 Execution 成功前入库，使用外发屏障事务保证注销互斥。
          const delivered = await transaction(db, async (c) => {
            if (filePrepared)
              await c.query('UPDATE organize_suggestion_items SET snapshot_json=? WHERE id=? AND lease_token=?', [
                JSON.stringify(current),
                job.id,
                job.lease_token,
              ]);
            if (Number(job.run_version) === 3 && !executionRecord?.providerCallCount)
              await c.query(
                "UPDATE organize_processing_jobs SET lane='direct' WHERE item_id=? AND kind='analysis' AND lease_token=?",
                [job.id, job.lease_token],
              );
            return finishItem(c, job, 'completed', result);
          });
          if (!delivered) throw suggestionError('ORGANIZE_LEASE_LOST', '执行租约已失效', 409);
          if (filePrepared)
            console.info(
              '[organize-file]',
              JSON.stringify({
                durationMs: Date.now() - analysisStartedAt,
                reading: current.reading?.state,
                complete: current.reading?.complete,
                outcome: result.tagOutcome,
                suggested: result.tags?.length || 0,
                providerCalls: executionRecord?.providerCallCount || 0,
              }),
            );
          return result;
        },
      );
    });
  } catch (error) {
    const pauseReason = isAiQuotaErrorCode(error.code)
      ? 'quota'
      : ['AI_ACCESS_RESTRICTED', 'AI_ACCOUNT_UNAVAILABLE'].includes(error.code)
        ? 'restricted'
        : [
              'ORGANIZE_AI_DISABLED',
              'AI_EXECUTION_STORE_UNAVAILABLE',
              'AI_DISPATCH_GUARD_UNAVAILABLE',
              'AI_GATEWAY_TIMEOUT',
              'AI_TIMEOUT',
              'AI_NETWORK_ERROR',
              'AI_RATE_LIMITED',
              'AI_PROVIDER_AUTH_FAILED',
              'AI_PROVIDER_ERROR',
              'ETIMEDOUT',
              'ECONNRESET',
              'ECONNREFUSED',
            ].includes(error.code) || [502, 503, 504].includes(Number(error.status || error.response?.status))
          ? 'unavailable'
          : null;
    providerStarted = Number(executionRecord?.providerCallCount || 0) > 0;
    if (isRunV2(job) && pauseReason && !providerStarted) {
      await transaction(db, async (c) => {
        const live = await ownedRun(c, job.user_id, job.run_id, true);
        const queue = !['ended', 'cancelled'].includes(live.status);
        const [released] = await c.query(
          'UPDATE organize_suggestion_items SET ai_status=?,lease_token=NULL,lease_expires_at=NULL,error_code=? WHERE id=? AND lease_token=?',
          [queue ? 'queued' : 'cancelled', error.code, job.id, job.lease_token],
        );
        if (!released.affectedRows) return;
        if (Number(job.run_version) === 3)
          await markProcessingAi(c, job.id, queue ? 'queued' : 'cancelled', null, error.code);
        await c.query("UPDATE organize_suggestions SET status=? WHERE item_id=? AND status='running'", [
          queue ? 'queued' : 'cancelled',
          job.id,
        ]);
        if (queue)
          await c.query("UPDATE organize_suggestion_runs SET status='paused',pause_reason=? WHERE id=?", [
            pauseReason,
            job.run_id,
          ]);
      });
      return true;
    }
    const settled = await transaction(db, (c) =>
      finishItem(
        c,
        job,
        error.code === 'ORGANIZE_RESOURCE_CHANGED' ? 'conflict' : 'failed',
        null,
        error.code || 'ORGANIZE_AI_FAILED',
      ),
    );
    if (pauseReason && settled) {
      if (isRunV2(job)) {
        const live = await ownedRun(db, job.user_id, job.run_id);
        if (['running', 'paused', 'preparing'].includes(live.status))
          await pauseV2(db, { userId: job.user_id, id: job.run_id, reason: pauseReason });
      } else await cancelSuggestionRun(db, { userId: job.user_id, id: job.run_id });
    }
  }
  return true;
}

export const pauseSuggestionRun = (db = pool, args) => pauseV2(db, args);
export const resumeSuggestionRun = (db = pool, args) => resumeV2(db, args);

export async function previewFileRetry(db = pool, { userId, id, requestId }) {
  if (!uuid(requestId) || !uuid(id)) throw suggestionError('ORGANIZE_REQUEST_INVALID', '请求标识无效');
  await assertOrganizeProcessingSchema(db);
  return previewV2(db, {
    userId,
    requestId,
    retryFrom: id,
    runVersion: 3,
    input: { resourceTypes: ['file'], checks: ['tags'], scope: 'untagged', items: [] },
  });
}

export async function applySuggestionBatch(db = pool, { userId, runId, items }) {
  if (
    !Array.isArray(items) ||
    !items.length ||
    items.length > 20 ||
    items.some((item) => !item || !uuid(item.suggestionId) || !uuid(item.requestId)) ||
    new Set(items.map((item) => item.suggestionId)).size !== items.length
  )
    throw suggestionError('ORGANIZE_BATCH_INVALID', '每批请选择 1 至 20 条不同建议');
  const results = [];
  for (const item of items) {
    try {
      const result = await actOnSuggestion(db, {
        userId,
        runId,
        suggestionId: item.suggestionId,
        requestId: item.requestId,
        action: 'apply',
        batchOnly: true,
      });
      results.push({ suggestionId: item.suggestionId, ...result });
    } catch (error) {
      const known = [400, 403, 404, 409].includes(error.status);
      results.push({
        suggestionId: item.suggestionId,
        status: ['ORGANIZE_RESOURCE_TRASHED', 'ORGANIZE_RESOURCE_UNAVAILABLE', 'ORGANIZE_RESOURCE_CHANGED'].includes(
          error.code,
        )
          ? 'expired'
          : 'failed',
        code: known ? error.code : 'ORGANIZE_FAILED',
        message: known ? error.message : '应用失败，请稍后重试',
      });
    }
  }
  return { results };
}
