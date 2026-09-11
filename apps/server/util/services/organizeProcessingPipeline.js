import crypto from 'node:crypto';
import pool from '../../db/index.js';
import {
  summarizeOrganizeLane,
  summarizeOrganizeOutcomes,
  organizeObjectOutcome,
} from '@lightnote/shared/organize-progress';
import { supportsOrganizeCheck } from '@lightnote/shared/organize-capabilities';
import { json, transaction } from './organizeSuggestionStorage.js';
import { readSuggestionCandidates, readCurrentSuggestionSource } from './organizeSuggestionSources.js';
import { buildRuleSuggestions, normalizeName, hash, suggestionError } from './organizeSuggestionRules.js';
import { writeSuggestions } from './organizeSuggestionLifecycle.js';
import { prepareTagIconRoute, recommendTagIcons } from '../tagIconService.js';
import { prepareResourceMetadata } from './organizeSuggestionModel.js';
import { prepareOrganizeFile } from './organizeFileEvidence.js';
import { prepareOrganizeArchive } from './organizeArchiveDraft.js';
import { availableResourceSql, effectiveStatusSql } from './organizeSuggestionAvailability.js';

const open = "'queued','waiting','running'";
const active = "'preparing','running','paused'";
const id = () => crypto.randomUUID();
export async function assertOrganizeProcessingSchema(db) {
  try {
    await db.query('SELECT id FROM organize_processing_jobs LIMIT 0');
  } catch (error) {
    if (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code))
      throw suggestionError('ORGANIZE_SCHEMA_NOT_READY', '整理功能升级尚未就绪，请稍后重试', 503);
    throw error;
  }
}
async function lockRun(c, runId) {
  const [rows] = await c.query('SELECT * FROM organize_suggestion_runs WHERE id=? FOR UPDATE', [runId]);
  return rows[0];
}
async function addJob(c, run, itemId, kind, lane = 'direct', status = 'queued', prepared = null) {
  await c.query(
    `INSERT IGNORE INTO organize_processing_jobs(id,run_id,item_id,user_id,work_key,kind,lane,status,prepared_json)
    VALUES(?,?,?,?,?,?,?,?,?)`,
    [id(), run.id, itemId, run.user_id, `${itemId || 'run'}:${kind}`, kind, lane, status, JSON.stringify(prepared)],
  );
}

// Only IDs, names, ownership and icon presence are read here. Processing waits for rule_phase=completed.
export async function runOrganizeInspection(_workerId, db = pool, dependencies = {}) {
  return transaction(db, async (c) => {
    const [runs] = await c.query(`SELECT * FROM organize_suggestion_runs WHERE run_version=3 AND status IN (${active})
      AND rule_phase='pending' ORDER BY created_at,id LIMIT 1 FOR UPDATE`);
    if (!runs.length) return false;
    const run = runs[0];
    const [items] = await c.query(
      "SELECT * FROM organize_suggestion_items WHERE run_id=? AND rule_status='pending' ORDER BY id LIMIT 100",
      [run.id],
    );
    for (const type of ['bookmark', 'note', 'file', 'tag']) {
      const selected = items.filter((i) => i.resource_type === type);
      if (!selected.length) continue;
      const sources = await (dependencies.candidates || readSuggestionCandidates)(c, run.user_id, type, {
        ids: selected.map((i) => i.resource_id),
        includeCustomIcons: true,
        limit: 100,
      });
      for (const item of selected) {
        const source = sources.find((s) => s.id === item.resource_id);
        const skipped = !source || source.hasCustomIcon;
        await c.query('UPDATE organize_suggestion_items SET rule_status=? WHERE id=?', [
          skipped ? 'skipped' : 'checked',
          item.id,
        ]);
        if (!skipped) await addJob(c, run, item.id, 'prepare');
      }
    }
    const [remaining] = await c.query(
      "SELECT COUNT(*) total FROM organize_suggestion_items WHERE run_id=? AND rule_status='pending'",
      [run.id],
    );
    if (!Number(remaining[0].total)) {
      await c.query(
        "UPDATE organize_suggestion_runs SET rule_phase='completed',status=IF(status='paused','paused','running') WHERE id=?",
        [run.id],
      );
      await settleProcessingRun(c, run.id);
    }
    return true;
  });
}

// Called inside the same short run-locked transaction as every queue transition.
export async function settleProcessingRun(c, runId) {
  await c.query(
    `UPDATE organize_suggestion_runs r SET r.status='completed'
    WHERE r.id=? AND r.run_version=3 AND r.rule_phase='completed' AND r.status IN ('running','paused')
    AND NOT EXISTS(SELECT 1 FROM organize_processing_jobs j WHERE j.run_id=r.id AND j.status IN (${open}))`,
    [runId],
  );
}
export async function markProcessingAi(c, itemId, status, token = null, errorCode = null) {
  await c.query(
    `UPDATE organize_processing_jobs SET status=?,lease_token=?,lease_expires_at=IF(? IS NULL,NULL,DATE_ADD(NOW(),INTERVAL 10 MINUTE)),error_code=?
    WHERE item_id=? AND kind='analysis' AND status IN (${open})`,
    [status, token, token, errorCode, itemId],
  );
}

export const manualSuggestionSql = () =>
  `s.status IN ('insufficient','no_suggestion') AND s.kind IN ('tags','title','tag_icon')`;
export async function readOrganizeOutcomes(c, run, itemOutcomes) {
  const v3 = Number(run.run_version) === 3;
  const [rows] = await c.query(
    `SELECT i.id,i.resource_type,i.rule_status,i.ai_status,
    MAX(JSON_UNQUOTE(JSON_EXTRACT(i.snapshot_json,'$.unsupported'))='true') unsupported,
    (${availableResourceSql()}) resource_available,
    MAX(s.status='pending' OR (s.status='info' AND JSON_UNQUOTE(JSON_EXTRACT(s.payload_json,'$.action')) IN ('trash','duplicate_bookmarks'))) pending,
    MAX(s.status IN ('queued','running')) pending_work,
    MAX(s.status IN ('failed','conflict','cancelled')) failed,
    MAX(s.status='expired') expired,
    MAX((${manualSuggestionSql()}) OR (s.status='info' AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(s.payload_json,'$.action')),'') NOT IN ('trash','duplicate_bookmarks'))) manual,
    MAX(s.status IN ('applied','ignored','closed')) reviewed,
    ${v3 ? `EXISTS(SELECT 1 FROM organize_processing_jobs j WHERE j.item_id=i.id AND j.status IN (${open}))` : '0'} work_open,
    ${v3 ? "EXISTS(SELECT 1 FROM organize_processing_jobs j WHERE j.item_id=i.id AND j.status IN ('failed','conflict','partial','cancelled'))" : '0'} work_failed
    FROM organize_suggestion_items i LEFT JOIN organize_suggestions s ON s.item_id=i.id AND s.user_id=i.user_id
    WHERE i.run_id=? AND i.user_id=? GROUP BY i.id,i.rule_status,i.ai_status,i.resource_type,i.resource_id,i.user_id`,
    [run.id, run.user_id],
  );
  if (itemOutcomes)
    for (const row of rows)
      itemOutcomes.set(row.id, {
        type: row.resource_type,
        outcome: organizeObjectOutcome(row, run.status, Number(run.run_version || 1)),
      });
  return summarizeOrganizeOutcomes(rows, run.status, Number(run.run_version || 1));
}
export async function readOrganizeReview(c, run, itemOutcomes) {
  const [rows] = await c.query(
    `SELECT
    SUM((${effectiveStatusSql()})='pending' OR ((${effectiveStatusSql()})='info' AND JSON_UNQUOTE(JSON_EXTRACT(s.payload_json,'$.action')) IN ('trash','duplicate_bookmarks'))) pending,
    COUNT(DISTINCT IF((${manualSuggestionSql()}) AND (${availableResourceSql()}) AND i.rule_status<>'removed',i.id,NULL)) manual_objects,
    COUNT(DISTINCT IF(i.resource_type='file' AND s.kind='tags' AND s.status IN ('failed','insufficient','no_suggestion')
      AND (${availableResourceSql()}) AND NOT EXISTS(SELECT 1 FROM resource_tag_relations tr JOIN tag t ON t.id=tr.tag_id AND t.del_flag=0
      WHERE t.user_id=i.user_id AND tr.user_id=i.user_id AND tr.resource_type='file' AND tr.resource_id=i.resource_id),i.id,NULL)) retry_files
    FROM organize_suggestion_items i JOIN organize_suggestions s ON s.item_id=i.id AND s.user_id=i.user_id
    WHERE i.run_id=? AND i.user_id=?`,
    [run.id, run.user_id],
  );
  const outcomes = await readOrganizeOutcomes(c, run, itemOutcomes);
  return {
    pending: Number(rows[0]?.pending || 0),
    manualObjects: outcomes.manual,
    retryFiles: Number(rows[0]?.retry_files || 0),
    outcomes,
  };
}
export async function readOrganizeOverview(c, run, ruleProgress, itemOutcomes) {
  const [jobs] = await c.query(
    'SELECT item_id,kind,lane,status FROM organize_processing_jobs WHERE run_id=? AND user_id=?',
    [run.id, run.user_id],
  );
  const inspectionSettled = run.rule_phase === 'completed';
  const preparationSettled =
    inspectionSettled && !jobs.some((j) => j.kind === 'prepare' && ['queued', 'waiting', 'running'].includes(j.status));
  // A claimed job can still finish with zero model calls. Do not freeze a denominator while routing may change.
  const directSettled =
    preparationSettled && !jobs.some((j) => j.lane === 'ai' && ['queued', 'waiting', 'running'].includes(j.status));
  const lane = (name, settled) =>
    summarizeOrganizeLane(
      jobs.filter((j) => j.lane === name).map((j) => ({ itemId: j.item_id, status: j.status })),
      settled,
    );
  return {
    inspection: {
      total: Number(json(run.summary_json).total),
      checked: ruleProgress
        .filter((r) => ['checked', 'loaded', 'completed', 'skipped', 'removed'].includes(r.rule_status))
        .reduce((n, r) => n + Number(r.total), 0),
      skipped: ruleProgress.filter((r) => r.rule_status === 'skipped').reduce((n, r) => n + Number(r.total), 0),
      settled: inspectionSettled,
    },
    direct: lane('direct', directSettled),
    ai: lane('ai', directSettled),
    review: await readOrganizeReview(c, run, itemOutcomes),
  };
}

async function claimDirect(db) {
  return transaction(db, async (c) => {
    const [runs] =
      await c.query(`SELECT * FROM organize_suggestion_runs r WHERE run_version=3 AND rule_phase='completed' AND status IN (${active})
      AND EXISTS(SELECT 1 FROM organize_processing_jobs j WHERE j.run_id=r.id AND j.lane='direct' AND j.kind<>'duplicate'
        AND (j.status IN ('queued','waiting') OR (j.status='running' AND j.lease_expires_at<NOW()))
        AND (j.next_check_at IS NULL OR j.next_check_at<=NOW())) ORDER BY r.created_at,r.id LIMIT 1 FOR UPDATE`);
    if (!runs.length) return null;
    const run = runs[0];
    const [jobs] = await c.query(
      `SELECT * FROM organize_processing_jobs WHERE run_id=? AND lane='direct' AND kind<>'duplicate'
      AND (status IN ('queued','waiting') OR (status='running' AND lease_expires_at<NOW()))
      AND (next_check_at IS NULL OR next_check_at<=NOW()) ORDER BY created_at,id LIMIT 1 FOR UPDATE`,
      [run.id],
    );
    if (!jobs.length) return null;
    const job = jobs[0],
      token = id();
    await c.query(
      "UPDATE organize_processing_jobs SET status='running',lease_token=?,lease_expires_at=DATE_ADD(NOW(),INTERVAL 10 MINUTE) WHERE id=?",
      [token, job.id],
    );
    const [items] = await c.query('SELECT * FROM organize_suggestion_items WHERE id=?', [job.item_id]);
    return { ...job, token, run, item: items[0], attempts: Number(job.attempts) };
  });
}
async function finishDirect(db, job, work, status = 'completed', error = null) {
  return transaction(db, async (c) => {
    const run = await lockRun(c, job.run_id);
    if (!run || !['running', 'paused'].includes(run.status)) return false;
    const [leases] = await c.query(
      "SELECT id FROM organize_processing_jobs WHERE id=? AND lease_token=? AND status='running' AND lease_expires_at>NOW() FOR UPDATE",
      [job.id, job.token],
    );
    if (!leases.length) return false;
    await work(c, run);
    await c.query(
      `UPDATE organize_processing_jobs SET status=?,lease_token=NULL,lease_expires_at=NULL,error_code=?,
      next_check_at=IF(?='waiting',DATE_ADD(NOW(),INTERVAL 3 SECOND),NULL),attempts=attempts+IF(? IS NULL,0,1) WHERE id=?`,
      [status, error, status, error, job.id],
    );
    await settleProcessingRun(c, job.run_id);
    return true;
  });
}
async function storeSource(c, job, source) {
  const [items] = await c.query('SELECT * FROM organize_suggestion_items WHERE id=? FOR UPDATE', [job.item_id]);
  const item = items[0];
  if (!item || item.rule_status === 'removed') throw suggestionError('ORGANIZE_RESOURCE_CHANGED', '资料已变化', 409);
  // Do not overwrite a baseline advanced by applying another result during network preparation.
  if (item.version_hash && item.version_hash !== source.version)
    throw suggestionError('ORGANIZE_RESOURCE_CHANGED', '资料已变化', 409);
  await c.query(
    "UPDATE organize_suggestion_items SET snapshot_json=?,version_hash=?,rule_status='completed' WHERE id=?",
    [
      JSON.stringify({ ...source, frozenTitle: json(item.snapshot_json).frozenTitle ?? source.title }),
      source.version,
      job.item_id,
    ],
  );
}
async function queueAnalysis(c, run, item, entry, prepared) {
  if (!entry.aiKinds.length) return;
  await addJob(c, run, item.id, 'analysis', 'ai', 'queued', prepared);
  await c.query(
    "UPDATE organize_suggestion_items SET ai_kinds_json=?,ai_status='queued' WHERE id=? AND ai_status='not_needed'",
    [JSON.stringify(entry.aiKinds), item.id],
  );
}
async function prepareItem(db, job, dependencies) {
  const source = await (dependencies.source || readCurrentSuggestionSource)(
    db,
    job.user_id,
    job.item.resource_type,
    job.item.resource_id,
  );
  if (!source)
    return finishDirect(
      db,
      job,
      async (c) => {
        await c.query("UPDATE organize_suggestion_items SET rule_status='skipped' WHERE id=?", [job.item_id]);
      },
      'skipped',
    );
  const options = json(job.run.options_json);
  const checks = options.checks.filter((k) => !['duplicate', 'archive'].includes(k));
  // Frozen names are enough for title ambiguity; no global body-read barrier.
  const frozenTitle = json(job.item.snapshot_json).frozenTitle ?? source.title;
  const repeated = (json(job.run.summary_json).duplicateTitleHashes || []).includes(
    hash([source.type, normalizeName(frozenTitle).toLowerCase()]),
  );
  const peers = repeated ? [{ ...source, id: `peer:${source.id}` }] : [];
  const entry = buildRuleSuggestions([source, ...peers], checks, options)[0];
  entry.itemId = job.item_id;
  let prepared = null;
  if (entry.aiKinds.length && source.type === 'tag') {
    const route = (dependencies.route || prepareTagIconRoute)(source.title);
    if (!route.needsAi) {
      return finishDirect(db, job, async (c, run) => {
        await storeSource(c, job, source);
        await writeSuggestions(c, run, [entry]);
        await addJob(c, run, job.item_id, 'tag_icon', 'direct', 'queued', {
          keywords: route.keywords,
          version: source.version,
        });
      });
    }
  }
  if (entry.aiKinds.length && source.type === 'bookmark')
    prepared = {
      version: source.version,
      bookmark: await (dependencies.prepareBookmark || prepareResourceMetadata)(source),
    };
  if (entry.aiKinds.length && source.type === 'file') {
    const file = await (dependencies.prepareFile || prepareOrganizeFile)(
      db,
      job.user_id,
      source,
      json(job.item.snapshot_json)?.reading,
    );
    if (file.waiting)
      return finishDirect(
        db,
        job,
        async (c) => {
          await storeSource(c, job, { ...source, reading: file.reading });
        },
        'waiting',
      );
    prepared = { version: source.version, file };
  }
  const latest = await (dependencies.source || readCurrentSuggestionSource)(
    db,
    job.user_id,
    job.item.resource_type,
    job.item.resource_id,
  );
  if (!latest || latest.version !== source.version)
    throw suggestionError('ORGANIZE_RESOURCE_CHANGED', '资料已变化', 409);
  await finishDirect(db, job, async (c, run) => {
    await storeSource(c, job, latest);
    await writeSuggestions(c, run, [entry]);
    if (options.checks.includes('archive') && source.type === 'bookmark') await addJob(c, run, job.item_id, 'archive');
    if (options.checks.includes('duplicate') && supportsOrganizeCheck(source.type, 'duplicate')) {
      await addJob(c, run, job.item_id, 'duplicate', 'direct', 'waiting');
      await addJob(c, run, null, 'compare', 'direct', 'waiting');
    }
    await queueAnalysis(c, run, job.item, entry, prepared);
  });
}
async function duplicateItem(db, job) {
  const [waiting] = await db.query(
    `SELECT COUNT(*) total FROM organize_processing_jobs WHERE run_id=? AND kind='prepare' AND status IN (${open})`,
    [job.run_id],
  );
  if (Number(waiting[0].total)) return finishDirect(db, job, async () => {}, 'waiting');
  const [failed] = await db.query(
    "SELECT COUNT(*) total FROM organize_processing_jobs WHERE run_id=? AND kind='prepare' AND status IN ('failed','conflict','cancelled')",
    [job.run_id],
  );
  if (Number(failed[0].total))
    throw suggestionError('ORGANIZE_EVIDENCE_INCOMPLETE', '部分资料读取失败，无法完成重复判断', 409);
  const [items] = await db.query(
    "SELECT * FROM organize_suggestion_items WHERE run_id=? AND rule_status='completed' AND version_hash<>'' ORDER BY id",
    [job.run_id],
  );
  const entries = buildRuleSuggestions(
    items.map((i) => json(i.snapshot_json)),
    ['duplicate'],
  );
  entries.forEach((entry, index) => {
    entry.itemId = items[index].id;
  });
  await finishDirect(db, job, async (c, run) => {
    const [live] = await c.query(
      'SELECT id,version_hash,rule_status FROM organize_suggestion_items WHERE run_id=? ORDER BY id FOR UPDATE',
      [job.run_id],
    );
    const baselines = new Map(live.map((item) => [item.id, item]));
    if (
      items.some(
        (item) =>
          baselines.get(item.id)?.version_hash !== item.version_hash ||
          baselines.get(item.id)?.rule_status !== item.rule_status,
      )
    )
      throw suggestionError('ORGANIZE_RESOURCE_CHANGED', '资料已变化', 409);
    await writeSuggestions(c, run, entries);
    await c.query(
      "UPDATE organize_processing_jobs SET status='completed' WHERE run_id=? AND kind='duplicate' AND status='waiting'",
      [job.run_id],
    );
  });
}
async function processDirectResult(db, job, dependencies) {
  const source = await (dependencies.source || readCurrentSuggestionSource)(
    db,
    job.user_id,
    job.item.resource_type,
    job.item.resource_id,
  );
  if (!source || source.version !== job.item.version_hash)
    throw suggestionError('ORGANIZE_RESOURCE_CHANGED', '资料已变化', 409);
  let suggestion;
  if (job.kind === 'tag_icon') {
    const candidates = await (dependencies.icons || recommendTagIcons)(source.title, json(job.prepared_json).keywords);
    suggestion = {
      kind: 'tag_icon',
      status: candidates.length ? 'pending' : 'no_suggestion',
      before: source.iconUrl,
      after: candidates[0] || null,
      candidates,
      reason: candidates.length ? '根据标签名称匹配图标' : '暂无合适推荐，可手动选择',
    };
  } else {
    const draft = await (dependencies.archive || prepareOrganizeArchive)(job.user_id, source);
    if (draft) {
      const { content, ...metadata } = draft;
      source.archivePreparation = metadata;
    }
    suggestion = buildRuleSuggestions([source], ['archive'])[0].suggestions[0];
    if (draft?.status === 'ready') suggestion.archiveDraft = draft;
  }
  await finishDirect(
    db,
    job,
    async (c, run) => {
      const current = await (dependencies.source || readCurrentSuggestionSource)(
        c,
        job.user_id,
        job.item.resource_type,
        job.item.resource_id,
      );
      if (!current || current.version !== source.version)
        throw suggestionError('ORGANIZE_RESOURCE_CHANGED', '资料已变化', 409);
      await writeSuggestions(c, run, [{ itemId: job.item_id, suggestions: [suggestion] }]);
      await c.query(
        "UPDATE organize_suggestions SET status=?,payload_json=? WHERE item_id=? AND kind=? AND status IN ('queued','running')",
        [suggestion.status, JSON.stringify(suggestion), job.item_id, job.kind],
      );
    },
    suggestion.status === 'failed' ? 'failed' : 'completed',
  );
}
export async function runOrganizeDirect(_workerId, db = pool, dependencies = {}) {
  const job = await claimDirect(db);
  if (!job) return false;
  try {
    if (job.kind === 'compare') await duplicateItem(db, job);
    else if (!job.item) await finishDirect(db, job, async () => {}, 'skipped');
    else if (job.kind === 'prepare') await prepareItem(db, job, dependencies);
    else await processDirectResult(db, job, dependencies);
  } catch (error) {
    const conflict = error.code === 'ORGANIZE_RESOURCE_CHANGED';
    const retry = !conflict && error.code !== 'ORGANIZE_EVIDENCE_INCOMPLETE' && job.attempts < 2;
    await finishDirect(
      db,
      job,
      async (c, run) => {
        if (!retry) {
          if (job.kind === 'compare') {
            const [members] = await c.query(
              "SELECT item_id FROM organize_processing_jobs WHERE run_id=? AND kind='duplicate' AND status='waiting'",
              [job.run_id],
            );
            await writeSuggestions(
              c,
              run,
              members.map((member) => ({
                itemId: member.item_id,
                suggestions: [
                  {
                    kind: 'duplicate',
                    status: 'failed',
                    before: null,
                    after: null,
                    reason: '部分资料读取失败或已变化，无法完成重复判断',
                  },
                ],
              })),
            );
            await c.query(
              "UPDATE organize_processing_jobs SET status='failed',error_code=? WHERE run_id=? AND kind='duplicate' AND status='waiting'",
              [error.code, job.run_id],
            );
          }
          if (job.kind === 'prepare')
            await writeSuggestions(c, run, [
              {
                itemId: job.item_id,
                suggestions: json(run.options_json)
                  .checks.filter((kind) => supportsOrganizeCheck(job.item.resource_type, kind))
                  .map((kind) => ({
                    kind,
                    status: conflict ? 'conflict' : 'failed',
                    before: null,
                    after: null,
                    reason: '资料准备未完成，请重新整理',
                  })),
              },
            ]);
          await c.query(
            "UPDATE organize_suggestion_items SET rule_status='completed',error_code=? WHERE id=? AND rule_status IN ('checked','loaded')",
            [error.code || 'ORGANIZE_DIRECT_FAILED', job.item_id],
          );
          await c.query(
            "UPDATE organize_suggestions SET status=?,payload_json=JSON_SET(payload_json,'$.reason','处理未完成，可重新整理') WHERE item_id=? AND kind=? AND status IN ('queued','running')",
            [conflict ? 'conflict' : 'failed', job.item_id, job.kind],
          );
        }
      },
      retry ? 'waiting' : conflict ? 'conflict' : 'failed',
      error.code || 'ORGANIZE_DIRECT_FAILED',
    );
  }
  return true;
}

// Run before claiming a paid item, including during AI pause: a new cache hit is free work.
export async function reclassifyCachedIcons(_workerId, db = pool) {
  return transaction(db, async (c) => {
    const [runs] =
      await c.query(`SELECT * FROM organize_suggestion_runs r WHERE r.run_version=3 AND r.rule_phase='completed' AND r.status IN ('running','paused')
      AND EXISTS(SELECT 1 FROM organize_processing_jobs j JOIN organize_suggestion_items i ON i.id=j.item_id WHERE j.run_id=r.id AND j.lane='ai' AND j.status='queued' AND (j.next_check_at IS NULL OR j.next_check_at<=NOW()) AND i.resource_type='tag') ORDER BY r.created_at,r.id LIMIT 1 FOR UPDATE`);
    if (!runs.length) return false;
    const run = runs[0];
    const [items] = await c.query(
      "SELECT i.* FROM organize_suggestion_items i JOIN organize_processing_jobs j ON j.item_id=i.id AND j.kind='analysis' WHERE i.run_id=? AND i.resource_type='tag' AND i.ai_status='queued' AND j.status='queued' AND (j.next_check_at IS NULL OR j.next_check_at<=NOW()) ORDER BY i.id LIMIT 100",
      [run.id],
    );
    let changed = false;
    for (const item of items) {
      const source = json(item.snapshot_json),
        route = prepareTagIconRoute(source.title);
      if (route.needsAi) {
        await c.query(
          "UPDATE organize_processing_jobs SET next_check_at=DATE_ADD(NOW(),INTERVAL 30 SECOND) WHERE item_id=? AND kind='analysis' AND status='queued'",
          [item.id],
        );
        continue;
      }
      await c.query(
        "UPDATE organize_processing_jobs SET lane='direct',kind='tag_icon',next_check_at=NULL,prepared_json=? WHERE item_id=? AND kind='analysis' AND status='queued'",
        [JSON.stringify({ keywords: route.keywords, version: source.version }), item.id],
      );
      await c.query("UPDATE organize_suggestion_items SET ai_status='not_needed',ai_kinds_json='[]' WHERE id=?", [
        item.id,
      ]);
      changed = true;
    }
    return changed;
  });
}
