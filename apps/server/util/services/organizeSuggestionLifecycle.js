import { prepareOrganizeArchive } from './organizeArchiveDraft.js';
import crypto from 'node:crypto';
import { transaction, json } from './organizeSuggestionStorage.js';
import { normalizeRunInput, buildRuleSuggestions, hash, suggestionError } from './organizeSuggestionRules.js';
import { readSuggestionCandidates, readSuggestionSources } from './organizeSuggestionSources.js';
import { lockActiveUserForUpdate } from '../aiOutboundDispatchGuard.js';
import { isOrganizeAiSuggestionsEnabled } from '../organizeAiSuggestionFeature.js';
import { getActiveSecurityRestrictions } from '../security/services/securityRestrictionService.js';
import { getStatusForUser } from '../aiQuota.js';
import { estimateResourceMetadataTokens, prepareResourceMetadata } from './organizeSuggestionModel.js';

const resumable = ['preparing', 'running', 'paused'];
export const isRunV2 = (run) => Number(run?.run_version) >= 2;
export async function insertBatches(db, sql, rows) {
  let batch = [],
    bytes = 0;
  for (const row of rows) {
    const size = Buffer.byteLength(JSON.stringify(row));
    if (batch.length && (batch.length >= 100 || bytes + size > 512 * 1024)) {
      await db.query(sql, [batch]);
      batch = [];
      bytes = 0;
    }
    batch.push(row);
    bytes += size;
  }
  if (batch.length) await db.query(sql, [batch]);
}
export async function previewV2(db, { userId, input, requestId, retryFrom, runVersion = 2 }) {
  const began = Date.now();
  let queryCount = 0,
    batchWrites = 0;
  const options = { ...normalizeRunInput(input), ...(retryFrom ? { retryFrom } : {}) };
  const result = await transaction(db, async (connection) => {
    const c = {
      query: (...args) => {
        queryCount++;
        if (args[0].startsWith('INSERT INTO organize_suggestion_items')) batchWrites++;
        return connection.query(...args);
      },
    };
    const [existing] = await c.query('SELECT * FROM organize_suggestion_runs WHERE user_id=? AND request_id=?', [
      userId,
      requestId,
    ]);
    const prior = (row) => {
      if (
        hash({
          ...normalizeRunInput(json(row.options_json)),
          ...(json(row.options_json).retryFrom ? { retryFrom: json(row.options_json).retryFrom } : {}),
        }) !== hash(options)
      )
        throw suggestionError('ORGANIZE_REQUEST_CONFLICT', '请求标识已用于其他范围', 409);
      return {
        id: row.id,
        status: row.status,
        options,
        summary: json(row.summary_json),
        runVersion: Number(row.run_version || 1),
      };
    };
    if (existing.length) return prior(existing[0]);
    const candidates = [];
    let customIconCount = 0;
    if (retryFrom) {
      const [owned] = await c.query('SELECT id FROM organize_suggestion_runs WHERE id=? AND user_id=?', [
        retryFrom,
        userId,
      ]);
      if (!owned.length) throw suggestionError('ORGANIZE_RUN_NOT_FOUND', '整理任务不存在', 404);
      const [retryFiles] = await c.query(
        `SELECT DISTINCT f.id,f.file_name AS title FROM organize_suggestion_items i
        JOIN organize_suggestions s ON s.item_id=i.id AND s.kind='tags'
        JOIN files f ON CONVERT(f.id USING utf8mb4) COLLATE utf8mb4_unicode_ci=CONVERT(i.resource_id USING utf8mb4) COLLATE utf8mb4_unicode_ci AND f.create_by=? AND f.del_flag=0
        WHERE i.run_id=? AND i.user_id=? AND i.resource_type='file' AND s.status IN ('failed','insufficient','no_suggestion')
        AND NOT EXISTS (SELECT 1 FROM resource_tag_relations tr JOIN tag t ON t.id=tr.tag_id AND t.user_id=? AND t.del_flag=0
          WHERE tr.user_id=? AND tr.resource_type='file' AND CONVERT(tr.resource_id USING utf8mb4) COLLATE utf8mb4_unicode_ci=CONVERT(f.id USING utf8mb4) COLLATE utf8mb4_unicode_ci) ORDER BY f.id`,
        [userId, retryFrom, userId, userId, userId],
      );
      candidates.push(
        ...retryFiles.map((row) => ({
          type: 'file',
          id: String(row.id),
          title: row.title,
          tags: [],
          source: { folder: '' },
          guards: {},
          evidenceLevel: 'pending',
        })),
      );
      if (!candidates.length) throw suggestionError('ORGANIZE_SCOPE_EMPTY', '没有需要重新分析的未推荐文件');
    }
    for (const type of retryFrom ? [] : options.resourceTypes) {
      if (options.scope === 'selected') {
        const ids = options.items.filter((item) => item.type === type).map((item) => item.id);
        for (let offset = 0; offset < ids.length; offset += 100) {
          const rows = await readSuggestionCandidates(c, userId, type, {
            ids: ids.slice(offset, offset + 100),
            ...(type === 'tag' ? { includeCustomIcons: true } : {}),
          });
          customIconCount += rows.filter((row) => row.hasCustomIcon).length;
          candidates.push(...rows.filter((row) => !row.hasCustomIcon));
        }
      } else {
        let after = '';
        while (true) {
          const page = await readSuggestionCandidates(c, userId, type, {
            after,
            recent: options.scope === 'recent',
            untagged: options.scope === 'untagged',
            limit: options.scope === 'recent' ? 20 : 100,
            ...(type === 'tag' && options.scope === 'all' ? { includeCustomIcons: true } : {}),
          });
          customIconCount += page.filter((row) => row.hasCustomIcon).length;
          candidates.push(...page.filter((row) => !row.hasCustomIcon));
          if (options.scope === 'recent' || page.length < 100) break;
          after = page.at(-1).id;
        }
      }
    }
    // 候选读取完成后才获取用户锁；并发相同请求在写入前再次检查。
    await lockActiveUserForUpdate(c, userId);
    const [raced] = await c.query(
      'SELECT * FROM organize_suggestion_runs WHERE user_id=? AND request_id=? FOR UPDATE',
      [userId, requestId],
    );
    if (raced.length) return prior(raced[0]);
    const id = crypto.randomUUID();
    const titleCounts = new Map();
    if (runVersion === 3)
      for (const item of candidates) {
        const key = hash([
          item.type,
          String(item.title || '')
            .normalize('NFKC')
            .trim()
            .toLowerCase(),
        ]);
        titleCounts.set(key, (titleCounts.get(key) || 0) + 1);
      }
    const summary = {
      ...(runVersion === 3
        ? { duplicateTitleHashes: [...titleCounts].filter(([, count]) => count > 1).map(([key]) => key) }
        : {}),
      total: candidates.length,
      types: Object.fromEntries(
        options.resourceTypes.map((type) => [type, candidates.filter((item) => item.type === type).length]),
      ),
      aiTotal:
        runVersion === 3 ? null : options.resourceTypes.every((type) => type === 'tag') ? candidates.length : null,
      ruleTotal: runVersion === 3 ? null : options.resourceTypes.every((type) => type === 'tag') ? 0 : null,
      files: { parsed: null, metadata: null },
      skipped: options.scope === 'selected' ? options.items.length - candidates.length : customIconCount,
      skippedReasons: {
        customIcon: customIconCount,
        unavailable: options.scope === 'selected' ? options.items.length - candidates.length - customIconCount : 0,
      },
      estimatedTokensLower: null,
      estimatedTokensUpper: null,
      aiEnabled: isOrganizeAiSuggestionsEnabled(),
    };
    await c.query(
      "INSERT INTO organize_suggestion_runs(id,user_id,request_id,options_json,summary_json,run_version,rule_phase) VALUES(?,?,?,?,?,?,'pending')",
      [id, userId, requestId, JSON.stringify(options), JSON.stringify(summary), runVersion],
    );
    await insertBatches(
      c,
      'INSERT INTO organize_suggestion_items(id,run_id,user_id,resource_type,resource_id,snapshot_json,version_hash,ai_kinds_json,ai_status,rule_status) VALUES ?',
      candidates.map((item) => [
        crypto.randomUUID(),
        id,
        userId,
        item.type,
        item.id,
        JSON.stringify(runVersion === 3 ? { ...item, frozenTitle: item.title } : item),
        '',
        '[]',
        'not_needed',
        'pending',
      ]),
    );
    return { id, status: 'preview', runVersion, options, summary };
  });
  console.info(
    '[organize-preview]',
    JSON.stringify({
      phase: 'freeze',
      count: result.summary.total,
      durationMs: Date.now() - began,
      queryCount,
      batchWrites,
    }),
  );
  return result;
}
async function lockedRun(c, userId, id) {
  const [rows] = await c.query('SELECT * FROM organize_suggestion_runs WHERE user_id=? AND id=? FOR UPDATE', [
    userId,
    id,
  ]);
  if (!rows.length) throw suggestionError('ORGANIZE_RUN_NOT_FOUND', '整理任务不存在', 404);
  return rows[0];
}
export async function endV2(c, run) {
  if (Number(run.run_version) === 3) {
    await c.query(
      "UPDATE organize_processing_jobs SET status='cancelled',lease_token=NULL,lease_expires_at=NULL WHERE run_id=? AND (status IN ('queued','waiting') OR (lane='direct' AND status='running'))",
      [run.id],
    );
    await c.query(
      "UPDATE organize_processing_jobs j JOIN organize_suggestion_items i ON i.id=j.item_id SET j.status='cancelled',j.lease_token=NULL,j.lease_expires_at=NULL WHERE j.run_id=? AND j.status='running' AND i.ai_status='preparing_content'",
      [run.id],
    );
    await c.query(
      "UPDATE organize_suggestions s JOIN organize_suggestion_items i ON i.id=s.item_id SET s.status='cancelled' WHERE i.run_id=? AND i.ai_status<>'running' AND s.status IN ('queued','running')",
      [run.id],
    );
  }
  await c.query(
    "UPDATE organize_suggestions s JOIN organize_suggestion_items i ON i.id=s.item_id SET s.status='cancelled' WHERE i.run_id=? AND i.ai_status IN ('queued','waiting_content','preparing_content') AND s.status IN ('queued','running')",
    [run.id],
  );
  if (Number(run.run_version) === 3) {
    // Keep inspection checkpoints: ending at 46/72 must not pretend the remaining 26 were checked.
    await c.query(
      "UPDATE organize_suggestion_items SET ai_status=IF(ai_status IN ('queued','waiting_content','preparing_content'),'cancelled',ai_status) WHERE run_id=?",
      [run.id],
    );
  } else {
    await c.query(
      "UPDATE organize_suggestion_items SET ai_status=IF(ai_status IN ('queued','waiting_content','preparing_content'),'cancelled',ai_status),rule_status=IF(rule_status IN ('pending','checked','loaded'),'cancelled',rule_status) WHERE run_id=?",
      [run.id],
    );
  }
  await c.query(
    "UPDATE organize_suggestion_runs SET status='ended',pause_reason=NULL,rule_lease_token=NULL,rule_lease_expires_at=NULL WHERE id=?",
    [run.id],
  );
}
export async function startV2(db, { userId, id, requestId, replaceRunId }) {
  return transaction(db, async (c) => {
    await lockActiveUserForUpdate(c, userId);
    const run = await lockedRun(c, userId, id);
    if (run.status !== 'preview')
      return {
        id,
        status: run.status,
        ...lifecycleState(run),
        options: json(run.options_json),
        summary: json(run.summary_json),
      };
    if (!json(run.summary_json).total) throw suggestionError('ORGANIZE_SCOPE_EMPTY', '没有可处理的资料');
    const [active] = await c.query(
      "SELECT * FROM organize_suggestion_runs WHERE user_id=? AND id<>? AND status IN ('preparing','running','paused') ORDER BY id FOR UPDATE",
      [userId, id],
    );
    if (active.some((row) => row.id !== replaceRunId))
      throw suggestionError('ORGANIZE_ACTIVE_RUN_EXISTS', '仍有未结束的整理，请确认结束后再开始', 409);
    for (const old of active) await endV2(c, old);
    await c.query(
      "UPDATE organize_suggestion_runs SET status='preparing',started_at=NOW(),summary_json=JSON_SET(summary_json,'$.completionNotification','pending'),start_request_id=? WHERE id=?",
      [requestId, id],
    );
    return {
      id,
      status: 'preparing',
      ...lifecycleState({ ...run, status: 'preparing' }),
      options: json(run.options_json),
      summary: json(run.summary_json),
    };
  });
}
export async function pauseV2(db, { userId, id, reason = 'user' }) {
  return transaction(db, async (c) => {
    const run = await lockedRun(c, userId, id);
    if (!isRunV2(run) || !resumable.includes(run.status))
      throw suggestionError('ORGANIZE_RUN_STATE', '此任务不能暂停', 409);
    await c.query("UPDATE organize_suggestion_runs SET status='paused',pause_reason=? WHERE id=?", [reason, id]);
    return { id, status: 'paused', pauseReason: reason };
  });
}
export async function resumeV2(db, { userId, id }, dependencies = {}) {
  const [users] = await db.query('SELECT id,role FROM user WHERE id=? AND del_flag=0', [userId]);
  if (!users.length) throw suggestionError('AI_ACCOUNT_UNAVAILABLE', '账号暂不可用', 403);
  if (!isOrganizeAiSuggestionsEnabled()) throw suggestionError('ORGANIZE_AI_DISABLED', 'AI 建议暂不可用', 503);
  const restrictions = await (dependencies.restrictions || getActiveSecurityRestrictions)(userId);
  if (restrictions.some((r) => ['full_lock', 'login_lock', 'ai_lock'].includes(r.restriction_type)))
    throw suggestionError('AI_ACCESS_RESTRICTED', 'AI 权限暂不可用', 403);
  const quota = await (dependencies.quota || getStatusForUser)(userId, users[0].role);
  if (quota.unavailable) throw suggestionError('AI_QUOTA_UNAVAILABLE', '暂时无法读取额度，请稍后再试', 503);
  if (!quota.exempt && quota.enforcing !== false && Number(quota.availableRemaining ?? quota.remaining ?? 0) <= 0)
    throw suggestionError('ORGANIZE_QUOTA_PAUSED', '额度仍不足，已有结果保留', 409);
  const [remaining] = await db.query(
    "SELECT * FROM organize_suggestion_items WHERE run_id=? AND user_id=? AND ai_status='queued' ORDER BY id LIMIT 1",
    [id, userId],
  );
  if (remaining.length && !quota.exempt && quota.enforcing !== false) {
    const next = remaining[0];
    const sources = await readSuggestionSources(db, userId, next.resource_type, { ids: [next.resource_id], limit: 1 });
    const prepared =
      sources[0]?.type === 'bookmark' ? await (dependencies.prepare || prepareResourceMetadata)(sources[0]) : null;
    const [tags] = await db.query('SELECT id,name FROM tag WHERE user_id=? AND del_flag=0', [userId]);
    if (
      sources.length &&
      Number(quota.availableRemaining ?? quota.remaining ?? 0) <
        estimateResourceMetadataTokens(sources[0], json(next.ai_kinds_json), tags, prepared)
    )
      throw suggestionError('ORGANIZE_QUOTA_PAUSED', '额度不足以继续下一项，已有结果保留', 409);
  }
  return transaction(db, async (c) => {
    await lockActiveUserForUpdate(c, userId);
    const run = await lockedRun(c, userId, id);
    if (!isRunV2(run) || !resumable.includes(run.status))
      throw suggestionError('ORGANIZE_RUN_STATE', '此任务不能继续', 409);
    if (run.status !== 'paused') return { id, status: run.status };
    const status = run.rule_phase === 'completed' ? 'running' : 'preparing';
    await c.query('UPDATE organize_suggestion_runs SET status=?,pause_reason=NULL WHERE id=?', [status, id]);
    return { id, status };
  });
}
export function lifecycleState(run, progress = [], rules = []) {
  if (!isRunV2(run)) return { runVersion: 1, canEnd: run.status === 'running', canPause: false, canResume: false };
  const sum = (state) =>
    progress.filter((p) => (p.ai_status || p.aiStatus) === state).reduce((n, p) => n + Number(p.total), 0);
  const queued = sum('queued') + sum('waiting_content') + sum('preparing_content'),
    inFlight = sum('running');
  const scanning = run.rule_phase !== 'completed' && !['ended', 'completed'].includes(run.status);
  return {
    runVersion: Number(run.run_version),
    rulePhase: run.rule_phase,
    pauseReason: run.pause_reason,
    queued,
    inFlight,
    ruleRetrying: run.rule_phase === 'retrying',
    skipped: rules.filter((r) => r.rule_status === 'skipped').reduce((n, r) => n + Number(r.total), 0),
    checked: rules
      .filter((r) => ['checked', 'loaded', 'completed', 'skipped', 'removed'].includes(r.rule_status))
      .reduce((n, r) => n + Number(r.total), 0),
    canPause: ['preparing', 'running'].includes(run.status) && (scanning || queued > 0 || inFlight > 0),
    canResume: run.status === 'paused' && (scanning || queued > 0),
    canEnd: resumable.includes(run.status),
  };
}
export async function writeSuggestions(c, run, entries, { independentOnly = false } = {}) {
  const rows = [];
  for (const entry of entries)
    for (const suggestion of entry.suggestions) {
      if (
        independentOnly &&
        (!['empty', 'archive'].includes(suggestion.kind) || !json(run.options_json).checks.includes(suggestion.kind))
      )
        continue;
      rows.push([
        crypto.randomUUID(),
        entry.itemId,
        run.id,
        run.user_id,
        suggestion.kind,
        suggestion.status,
        JSON.stringify(suggestion),
      ]);
    }
  await insertBatches(
    c,
    'INSERT IGNORE INTO organize_suggestions(id,item_id,run_id,user_id,kind,status,payload_json) VALUES ?',
    rows,
  );
}
export async function runRuleBatch(db) {
  const claim = await transaction(db, async (c) => {
    const [runs] = await c.query(
      "SELECT * FROM organize_suggestion_runs WHERE run_version=2 AND status IN ('preparing','running','paused') AND rule_phase IN ('pending','retrying') AND (rule_lease_token IS NULL OR rule_lease_expires_at<NOW()) ORDER BY created_at,id LIMIT 1 FOR UPDATE",
    );
    if (!runs.length) return null;
    const run = runs[0],
      token = crypto.randomUUID();
    await c.query(
      'UPDATE organize_suggestion_runs SET rule_lease_token=?,rule_lease_expires_at=DATE_ADD(NOW(),INTERVAL 10 MINUTE) WHERE id=?',
      [token, run.id],
    );
    return { ...run, token };
  });
  if (!claim) return false;
  try {
    // 网页读取逐项占用租约，避免一批外网请求累计超过租约期限。
    const [items] = await db.query(
      `SELECT * FROM organize_suggestion_items WHERE run_id=? AND rule_status='pending' ORDER BY id LIMIT ${json(claim.options_json).checks.includes('archive') ? 1 : json(claim.options_json).resourceTypes.includes('tag') ? 10 : 100}`,
      [claim.id],
    );
    let entries = [];
    if (items.length) {
      for (const type of ['bookmark', 'note', 'file', 'tag']) {
        const selected = items.filter((i) => i.resource_type === type);
        if (!selected.length) continue;
        const sources = await readSuggestionSources(db, claim.user_id, type, {
          ids: selected.map((i) => i.resource_id),
          limit: 100,
        });
        const archiveDrafts = new Map();
        if (type === 'bookmark' && json(claim.options_json).checks.includes('archive')) {
          for (const source of sources) {
            const draft = await prepareOrganizeArchive(claim.user_id, source);
            if (draft) {
              const { content, ...metadata } = draft;
              source.archivePreparation = metadata;
              archiveDrafts.set(source.id, draft);
            }
          }
        }
        for (const entry of buildRuleSuggestions(
          sources,
          type === 'tag'
            ? ['tag_icon']
            : ['empty', ...(json(claim.options_json).checks.includes('archive') ? ['archive'] : [])],
        )) {
          const draft = archiveDrafts.get(entry.snapshot.id);
          if (draft?.status === 'ready') entry.suggestions.find((s) => s.kind === 'archive').archiveDraft = draft;
          entry.itemId = selected.find((i) => i.resource_id === entry.snapshot.id).id;
          entries.push(entry);
        }
      }
    }
    await transaction(db, async (c) => {
      const live = await lockedRun(c, claim.user_id, claim.id);
      if (live.rule_lease_token !== claim.token || !resumable.includes(live.status)) return;
      if (items.length) {
        const found = new Set(entries.map((e) => e.itemId));
        // 快照按记录/字节双重上限批写；只更新仍等待规则检查的资源。
        await insertBatches(
          c,
          `INSERT INTO organize_suggestion_items(id,run_id,user_id,resource_type,resource_id,snapshot_json,version_hash,ai_kinds_json,ai_status,rule_status) VALUES ? ON DUPLICATE KEY UPDATE snapshot_json=VALUES(snapshot_json),version_hash=VALUES(version_hash),rule_status=VALUES(rule_status)`,
          entries.map((e) => [
            e.itemId,
            claim.id,
            claim.user_id,
            e.snapshot.type,
            e.snapshot.id,
            JSON.stringify(e.snapshot),
            e.snapshot.version,
            '[]',
            'not_needed',
            'loaded',
          ]),
        );
        const missing = items.filter((i) => !found.has(i.id)).map((i) => i.id);
        if (missing.length)
          await c.query(
            "UPDATE organize_suggestion_items SET rule_status='skipped',error_code='ORGANIZE_RESOURCE_UNAVAILABLE' WHERE id IN (?)",
            [missing],
          );
        if (json(claim.options_json).checks.some((kind) => ['empty', 'archive'].includes(kind)))
          await writeSuggestions(c, claim, entries, { independentOnly: true });
      } else {
        // 独立规则已可审核；在最终分组落库前重读快照，防止已清理资源重新生成建议。
        const [all] = await c.query(
          "SELECT * FROM organize_suggestion_items WHERE run_id=? AND rule_status IN ('loaded','completed') ORDER BY id FOR UPDATE",
          [claim.id],
        );
        entries = buildRuleSuggestions(
          all.map((i) => json(i.snapshot_json)),
          json(live.options_json).checks,
          json(live.options_json),
        ).map((entry, index) => ({ ...entry, itemId: all[index].id }));
        // 升级前规则阶段已交付的图标结果保持原样，不因新队列重复生成或消费额度。
        if (entries.some((entry) => entry.snapshot.type === 'tag')) {
          const [delivered] = await c.query(
            "SELECT item_id FROM organize_suggestions WHERE run_id=? AND kind='tag_icon' AND status NOT IN ('queued','running')",
            [claim.id],
          );
          const deliveredIds = new Set(delivered.map((row) => row.item_id));
          for (const entry of entries) if (deliveredIds.has(entry.itemId)) entry.aiKinds = [];
        }
        await writeSuggestions(c, claim, entries);
        await insertBatches(
          c,
          `INSERT INTO organize_suggestion_items(id,run_id,user_id,resource_type,resource_id,snapshot_json,version_hash,ai_kinds_json,ai_status,rule_status) VALUES ? ON DUPLICATE KEY UPDATE ai_kinds_json=VALUES(ai_kinds_json),ai_status=IF(rule_status='loaded',VALUES(ai_status),ai_status),rule_status='completed'`,
          entries.map((e) => [
            e.itemId,
            claim.id,
            claim.user_id,
            e.snapshot.type,
            e.snapshot.id,
            JSON.stringify(e.snapshot),
            e.snapshot.version,
            JSON.stringify(e.aiKinds),
            e.aiKinds.length ? 'queued' : 'not_needed',
            'completed',
          ]),
        );
        const summary = {
          ...json(live.summary_json),
          aiTotal: entries.filter((e) => e.aiKinds.length).length,
          ruleTotal: entries.filter((e) =>
            e.suggestions.some((s) => ['empty', 'duplicate', 'archive'].includes(s.kind)),
          ).length,
          files: {
            parsed: entries.filter((e) => e.snapshot.type === 'file' && e.snapshot.evidenceLevel === 'parsed').length,
            metadata: entries.filter((e) => e.snapshot.type === 'file' && e.snapshot.evidenceLevel === 'metadata')
              .length,
          },
        };
        const aiEnabled = isOrganizeAiSuggestionsEnabled();
        const status = !summary.aiTotal ? 'completed' : live.status === 'paused' || !aiEnabled ? 'paused' : 'running';
        await c.query(
          "UPDATE organize_suggestion_runs SET rule_phase='completed',summary_json=?,status=?,pause_reason=? WHERE id=?",
          [JSON.stringify(summary), status, status === 'paused' ? live.pause_reason || 'unavailable' : null, claim.id],
        );
      }
      await c.query('UPDATE organize_suggestion_runs SET rule_lease_token=NULL,rule_lease_expires_at=NULL WHERE id=?', [
        claim.id,
      ]);
    });
  } catch (error) {
    // 后台故障保留阶段与租约，过期后从已持久化批次恢复，避免紧循环。
    await db
      .query(
        "UPDATE organize_suggestion_runs SET rule_phase='retrying' WHERE id=? AND rule_lease_token=? AND status IN ('preparing','running','paused')",
        [claim.id, claim.token],
      )
      .catch(() => {});
    console.warn('[organize-rules]', JSON.stringify({ phase: 'rules', code: error.code || 'RULE_FAILED' }));
  }
  return true;
}

// 仅刷新尚未交付的元信息建议；已审核结果不重写。关联重复建议失效后必须重新核验。
export async function refreshPendingSource(db, job, current) {
  return transaction(db, async (c) => {
    const live = await lockedRun(c, job.user_id, job.run_id);
    const [items] = await c.query('SELECT * FROM organize_suggestion_items WHERE run_id=? ORDER BY id FOR UPDATE', [
      job.run_id,
    ]);
    const item = items.find((i) => i.id === job.id);
    if (!item || item.lease_token !== job.lease_token)
      throw suggestionError('ORGANIZE_LEASE_LOST', '执行租约失效', 409);
    const previousSource = json(item.snapshot_json);
    const related = items.filter((i) => {
      if (i.id === job.id || i.rule_status !== 'completed' || i.resource_type !== current.type) return false;
      const source = json(i.snapshot_json);
      return [previousSource, current].some(
        (reference) =>
          (reference.duplicateKey && source.duplicateKey === reference.duplicateKey) ||
          source.title.normalize('NFKC').trim().toLowerCase() ===
            reference.title.normalize('NFKC').trim().toLowerCase(),
      );
    });
    const refreshedSources = new Map();
    for (let offset = 0; offset < related.length; offset += 100) {
      const rows = await readSuggestionSources(c, job.user_id, current.type, {
        ids: related.slice(offset, offset + 100).map((i) => i.resource_id),
        limit: 100,
      });
      for (const source of rows) refreshedSources.set(source.id, source);
    }
    const relatedIds = new Set(related.map((i) => i.id));
    const snapshots = items
      .filter((i) => i.rule_status === 'completed')
      .map((i) =>
        i.id === job.id ? current : relatedIds.has(i.id) ? refreshedSources.get(i.resource_id) : json(i.snapshot_json),
      )
      .filter(Boolean);
    const entry = buildRuleSuggestions(snapshots, json(live.options_json).checks, json(live.options_json)).find(
      (e) => e.snapshot.type === current.type && e.snapshot.id === current.id,
    );
    if (!entry) throw suggestionError('ORGANIZE_RESOURCE_CHANGED', '资料已变化', 409);
    const [suggestions] = await c.query('SELECT * FROM organize_suggestions WHERE item_id=? FOR UPDATE', [job.id]);
    const kinds = [];
    for (const suggestion of entry.suggestions) {
      const previous = suggestions.find((s) => s.kind === suggestion.kind);
      if (!previous || !['queued', 'running'].includes(previous.status)) continue;
      if (entry.aiKinds.includes(suggestion.kind)) kinds.push(suggestion.kind);
      await c.query('UPDATE organize_suggestions SET status=?,payload_json=? WHERE id=?', [
        suggestion.status === 'queued' ? 'running' : suggestion.status,
        JSON.stringify(suggestion),
        previous.id,
      ]);
    }
    const refreshed = buildRuleSuggestions(snapshots, json(live.options_json).checks, json(live.options_json));
    for (const resource of refreshed) {
      const owner = items.find(
        (i) => i.resource_type === resource.snapshot.type && i.resource_id === resource.snapshot.id,
      );
      // 网页草稿已独立交付；元信息刷新不得丢弃正文或改回未生成状态。应用时另行复核草稿 URL。
      for (const suggestion of resource.suggestions.filter((s) => ['empty', 'duplicate'].includes(s.kind))) {
        await c.query(
          "UPDATE organize_suggestions SET status=?,payload_json=? WHERE item_id=? AND kind=? AND status IN ('pending','info','conflict')",
          [suggestion.status, JSON.stringify(suggestion), owner.id, suggestion.kind],
        );
      }
    }
    await c.query('UPDATE organize_suggestion_items SET snapshot_json=?,version_hash=?,ai_kinds_json=? WHERE id=?', [
      JSON.stringify(current),
      current.version,
      JSON.stringify(kinds),
      job.id,
    ]);
    return kinds;
  });
}
