import { randomUUID } from 'node:crypto';
import pool from '../../db/index.js';
import { EXTRACTION_LIMITS } from '@lightnote/shared/extraction';
import { extractionSchemaReady } from './schema.js';
import { executeAiSkill } from '../aiSkill/runtime.js';
import { acquireAccountAiLifecycleConnection } from '../accountAiLifecycleLock.js';
import { toolboxWorkerEnabled } from '../toolbox/workerPolicy.js';
import { resolveExtractionSourceVersions } from './sourceVersions.js';
import { readMaterial, planWindows } from './material.js';
import { json, fail, digest, mergeBoundaryRecord } from './domain.js';
import { extractionEnabled, transaction, activeAccount } from './service.js';

export async function claimExtraction(database, phase = 'all') {
  return transaction(database, async (connection) => {
    // A dispatched call is never automatically repeated after a crash.
    await connection.query(`UPDATE toolbox_extractions SET status=IF(status='paused' OR dispatched=1,'paused',IF(phase='prepare','preparing','queued')),
      error_code=IF(dispatched=1,'EXTRACTION_OUTCOME_UNKNOWN',NULL),lease_token=NULL,lease_until=NULL,version=version+1
      WHERE lease_token IS NOT NULL AND lease_until<NOW() AND status<>'ended'`);
    const phaseFilter = phase === 'prepare' ? " AND phase='prepare'" : phase === 'ai' ? " AND phase<>'prepare'" : '';
    const [[row]] = await connection.query(
      "SELECT * FROM toolbox_extractions WHERE status IN ('preparing','queued') AND lease_token IS NULL AND available_at<=NOW()" +
        phaseFilter +
        ' ORDER BY available_at,id LIMIT 1 FOR UPDATE',
    );
    if (!row) return null;
    const token = randomUUID();
    await connection.query(
      "UPDATE toolbox_extractions SET lease_token=?,lease_until=DATE_ADD(NOW(),INTERVAL 180 SECOND),dispatched=0,status=IF(phase='prepare','preparing',IF(phase='extract','processing','analyzing')),version=version+1 WHERE id=?",
      [token, row.id],
    );
    return { ...row, lease_token: token };
  });
}
async function fence(connection, job) {
  const [[row]] = await connection.query(
    'SELECT * FROM toolbox_extractions WHERE id=? AND user_id=? AND lease_token=? AND lease_until>NOW() FOR UPDATE',
    [job.id, job.user_id, job.lease_token],
  );
  if (!row) fail('LEASE_LOST', '任务租约已失效', 409);
  return row;
}
async function release(connection, job, { status, phase, errorCode = null }) {
  await connection.query(
    `UPDATE toolbox_extractions SET status=IF(status='paused','paused',?),phase=?,error_code=?,lease_token=NULL,lease_until=NULL,dispatched=0,version=version+1,available_at=NOW() WHERE id=? AND user_id=? AND lease_token=?`,
    [status, phase, errorCode, job.id, job.user_id, job.lease_token],
  );
}
async function prepareOne(job, database, dependencies, signal) {
  const [[source]] = await database.query(
    "SELECT * FROM toolbox_extraction_sources WHERE extraction_id=? AND user_id=? AND status='preparing' ORDER BY position LIMIT 1",
    [job.id, job.user_id],
  );
  if (!source)
    return transaction(database, async (connection) => {
      await fence(connection, job);
      await release(connection, job, { status: 'ready', phase: 'prepare' });
    });
  try {
    const read = () =>
      (dependencies.readMaterial || readMaterial)({
        userId: job.user_id,
        id: source.id,
        ref: { type: source.resource_type, id: source.resource_id, version: source.resource_version },
        database,
        signal,
      });
    const material = await (dependencies.runLocalProcessing ? dependencies.runLocalProcessing(read) : read());
    const windows = planWindows(material);
    await transaction(database, async (connection) => {
      await fence(connection, job);
      const [[size]] = await connection.query(
        'SELECT COALESCE(SUM(OCTET_LENGTH(source_json)),0) AS bytes FROM toolbox_extraction_sources WHERE extraction_id=? AND user_id=?',
        [job.id, job.user_id],
      );
      const body = JSON.stringify(material);
      if (Number(size.bytes) + Buffer.byteLength(body) > EXTRACTION_LIMITS.totalBytes)
        fail('MATERIAL_LIMIT', '本次资料超过总处理预算');
      await connection.query(
        "UPDATE toolbox_extraction_sources SET title=?,source_json=?,coverage_json=?,window_count=?,status='ready',expires_at=DATE_ADD(NOW(),INTERVAL 24 HOUR) WHERE id=? AND extraction_id=? AND user_id=?",
        [
          material.title,
          body,
          JSON.stringify({ ...material.coverage, complete: material.complete }),
          windows.length,
          source.id,
          job.id,
          job.user_id,
        ],
      );
      await release(connection, job, { status: 'preparing', phase: 'prepare' });
    });
  } catch (error) {
    await transaction(database, async (connection) => {
      await fence(connection, job);
      await connection.query(
        "UPDATE toolbox_extraction_sources SET status='failed',error_code=? WHERE id=? AND extraction_id=? AND user_id=?",
        [String(error.code || 'EXTRACTION_PREPARE_FAILED').slice(0, 64), source.id, job.id, job.user_id],
      );
      await release(connection, job, { status: 'preparing', phase: 'prepare' });
    });
  }
}
export async function commitExtractionResult(job, source, window, response, database) {
  return transaction(database, async (connection) => {
    const current = await fence(connection, job);
    if (job.phase === 'suggest') {
      await connection.query('UPDATE toolbox_extractions SET plan_json=? WHERE id=? AND user_id=?', [
        JSON.stringify(response.result.plan),
        job.id,
        job.user_id,
      ]);
      await release(connection, job, { status: 'queued', phase: 'sample' });
    } else {
      const [[fresh]] = await connection.query(
        'SELECT processed_windows FROM toolbox_extraction_sources WHERE id=? AND extraction_id=? AND user_id=? FOR UPDATE',
        [source.id, job.id, job.user_id],
      );
      if (!fresh || Number(fresh.processed_windows) !== Number(source.processed_windows))
        fail('CHECKPOINT_CONFLICT', '处理检查点已变化', 409);
      const [[totals]] = await connection.query(
        'SELECT COUNT(*) AS total,COALESCE(SUM(OCTET_LENGTH(payload_json)),0) AS bytes FROM toolbox_extraction_records WHERE extraction_id=? AND user_id=?',
        [job.id, job.user_id],
      );
      let count = Number(totals.total),
        bytes = Number(totals.bytes);
      for (const record of response.result.records) {
        const [[existing]] = await connection.query(
          'SELECT id,payload_json,reviews_json FROM toolbox_extraction_records WHERE extraction_id=? AND user_id=? AND id=?',
          [job.id, job.user_id, record.id],
        );
        if (existing) {
          const original = json(existing.payload_json);
          const merged = mergeBoundaryRecord(original, record, json(existing.reviews_json, {}));
          const payload = JSON.stringify(merged.payload);
          if (payload !== JSON.stringify(original)) {
            bytes += Buffer.byteLength(payload) - Buffer.byteLength(JSON.stringify(original));
            if (bytes > 32 * 1024 * 1024) fail('RESULT_LIMIT', '结果超过存储处理上限');
            await connection.query(
              'UPDATE toolbox_extraction_records SET payload_json=?,reviews_json=?,pending_cells=?,version=version+1 WHERE extraction_id=? AND user_id=? AND id=?',
              [
                payload,
                JSON.stringify(merged.reviews),
                merged.payload.cells.filter((c) => !merged.reviews[c.fieldId]?.checked).length,
                job.id,
                job.user_id,
                record.id,
              ],
            );
          }
          continue;
        }
        const payload = JSON.stringify({ ...record, executionRequestId: job.lease_token });
        if (++count > EXTRACTION_LIMITS.records || (bytes += Buffer.byteLength(payload)) > 32 * 1024 * 1024)
          fail('RESULT_LIMIT', '结果超过记录数量或存储处理上限');
        await connection.query(
          "INSERT INTO toolbox_extraction_records (id,extraction_id,user_id,source_id,payload_json,reviews_json,published,pending_cells) VALUES (?,?,?,?,?,'{}',1,?)",
          [record.id, job.id, job.user_id, source.id, payload, record.cells.length],
        );
      }
      const processed_windows = Number(source.processed_windows) + 1,
        complete = processed_windows >= Number(source.window_count);
      await connection.query(
        'UPDATE toolbox_extraction_sources SET processed_windows=?,status=? WHERE id=? AND extraction_id=? AND user_id=?',
        [processed_windows, complete ? 'completed' : 'ready', source.id, job.id, job.user_id],
      );
      await connection.query('UPDATE toolbox_extractions SET data_version=data_version+1 WHERE id=? AND user_id=?', [
        job.id,
        job.user_id,
      ]);
      await release(connection, job, { status: job.phase === 'sample' ? 'preview' : 'queued', phase: job.phase });
    }
    await connection.query(
      'INSERT INTO toolbox_extraction_receipts (extraction_id,user_id,request_id,digest,response_json) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE response_json=VALUES(response_json)',
      [
        job.id,
        job.user_id,
        job.lease_token,
        digest({ phase: job.phase, source: source.id, window: window.window.index }),
        JSON.stringify({
          kind: 'execution',
          phase: job.phase,
          sourceId: source.id,
          window: window.window.index,
          dataVersion: Number(current.data_version) + 1,
        }),
      ],
    );
  });
}
async function processOne(job, database, dependencies, signal) {
  const [sources] = await database.query(
    'SELECT * FROM toolbox_extraction_sources WHERE extraction_id=? AND user_id=? ORDER BY position',
    [job.id, job.user_id],
  );
  const source =
    job.phase === 'suggest' || job.phase === 'sample'
      ? sources[0]
      : sources.find((s) => s.status === 'ready' && Number(s.processed_windows) < Number(s.window_count));
  if (!source)
    return transaction(database, async (connection) => {
      await fence(connection, job);
      await release(connection, job, {
        status: sources.some((s) => s.status === 'failed') ? 'partial' : 'completed',
        phase: job.phase,
      });
    });
  if (job.phase === 'sample' && Number(source.processed_windows) > 0)
    return transaction(database, async (connection) => {
      await fence(connection, job);
      await release(connection, job, { status: 'preview', phase: 'sample' });
    });
  job.activeSourceId = source.id;
  if (!source.source_json || new Date(source.expires_at).getTime() <= Date.now())
    fail('MATERIAL_EXPIRED', '准备材料已过期，已有结果仍保留', 409);
  const ref = { type: source.resource_type, id: source.resource_id, version: source.resource_version };
  const versions = await (dependencies.resolveVersions || resolveExtractionSourceVersions)({
    userId: job.user_id,
    resourceRefs: [ref],
    database,
  });
  if (versions.length !== 1 || versions[0].version !== ref.version)
    fail('SOURCE_CHANGED', '资料已变化，已有结果仍保留', 409);
  const material = json(source.source_json),
    window = planWindows(material)[job.phase === 'suggest' ? 0 : Number(source.processed_windows)];
  const user = await activeAccount(database, job.user_id);
  await (dependencies.executeSkill || executeAiSkill)(
    {
      protocolVersion: 1,
      requestId: job.lease_token,
      skillId: `toolbox.extraction_${job.phase === 'suggest' ? 'suggest' : 'extract'}`,
      skillVersion: 1,
      input: { source: window, goal: job.goal, ...(job.phase === 'suggest' ? {} : { plan: json(job.plan_json) }) },
      scope: { resourceRefs: [] },
      client: { surface: 'toolbox', locale: 'zh-CN', timezone: 'Asia/Shanghai' },
    },
    { user },
    {
      database,
      internalCaller: 'extraction_worker',
      signal,
      skillDependencies: {
        beforeRequest: async () => {
          if (!extractionEnabled()) fail('DISABLED', '新执行已暂停', 503);
          await transaction(database, async (connection) => {
            await fence(connection, job);
            await connection.query(
              'UPDATE toolbox_extractions SET dispatched=1 WHERE id=? AND user_id=? AND lease_token=?',
              [job.id, job.user_id, job.lease_token],
            );
            await connection.query(
              'INSERT INTO toolbox_extraction_receipts (extraction_id,user_id,request_id,digest,response_json) VALUES (?,?,?,?,?)',
              [
                job.id,
                job.user_id,
                job.lease_token,
                digest({ phase: job.phase, source: source.id, window: window.window.index }),
                JSON.stringify({
                  kind: 'execution',
                  phase: job.phase,
                  sourceId: source.id,
                  window: window.window.index,
                  state: 'dispatched',
                }),
              ],
            );
          });
        },
      },
      commitValidatedResult: ({ response }) => commitExtractionResult(job, source, window, response, database),
    },
  );
}
export async function runSingleExtractionJob(_workerId, database = pool, dependencies = {}) {
  if (!extractionEnabled() || !toolboxWorkerEnabled()) return false;
  if (!(await extractionSchemaReady(database))) return false;
  const job = await claimExtraction(database, dependencies.phase);
  if (!job) return false;
  const controller = new AbortController();
  let lifecycle;
  const heartbeat = setInterval(() => {
    void database
      .query(
        'UPDATE toolbox_extractions SET lease_until=DATE_ADD(NOW(),INTERVAL 180 SECOND) WHERE id=? AND lease_token=? AND lease_until>NOW()',
        [job.id, job.lease_token],
      )
      .then(([r]) => {
        if (r.affectedRows !== 1) controller.abort();
      })
      .catch(() => controller.abort());
  }, 30000);
  heartbeat.unref?.();
  const timeout = setTimeout(() => controller.abort(), 150000);
  timeout.unref?.();
  try {
    lifecycle = await acquireAccountAiLifecycleConnection(database, job.user_id, { timeoutMs: 1000 });
    await activeAccount(database, job.user_id);
    if (job.phase === 'prepare') await prepareOne(job, database, dependencies, controller.signal);
    else await processOne(job, database, dependencies, controller.signal);
  } catch (error) {
    const code = String(
      error.code || (controller.signal.aborted ? 'EXTRACTION_OUTCOME_UNKNOWN' : 'EXTRACTION_FAILED'),
    ).slice(0, 64);
    await transaction(database, async (connection) => {
      const [[current]] = await connection.query(
        'SELECT * FROM toolbox_extractions WHERE id=? AND user_id=? AND lease_token=? FOR UPDATE',
        [job.id, job.user_id, job.lease_token],
      );
      if (!current) return; // Delivery already committed, or another lease owns recovery.
      const uncertain =
        Boolean(current.dispatched) &&
        !/^(?:AI_QUOTA_|AI_SKILL_STRUCTURED_|EXTRACTION_(?:CONTRACT|OUTPUT|RESULT)_)/.test(code);
      const quota = /QUOTA|BUDGET|ACCOUNT_LIFECYCLE/.test(code);
      if (job.phase === 'extract' && job.activeSourceId && !uncertain && !quota) {
        await connection.query(
          "UPDATE toolbox_extraction_sources SET status='failed',error_code=? WHERE id=? AND extraction_id=? AND user_id=?",
          [code, job.activeSourceId, job.id, job.user_id],
        );
        await release(connection, job, { status: 'queued', phase: job.phase, errorCode: code });
      } else
        await release(connection, job, {
          status: 'paused',
          phase: job.phase,
          errorCode: uncertain ? 'EXTRACTION_OUTCOME_UNKNOWN' : code,
        });
    });
  } finally {
    clearInterval(heartbeat);
    clearTimeout(timeout);
    controller.abort();
    if (lifecycle) {
      await lifecycle.releaseLifecycle();
      lifecycle.connection.release();
    }
  }
  return true;
}
export async function cleanupExtractionMaterials(database = pool) {
  if (!(await extractionSchemaReady(database))) return;
  await database.query(`UPDATE toolbox_extraction_sources s JOIN toolbox_extractions t ON t.id=s.extraction_id AND t.user_id=s.user_id
    SET s.source_json=NULL WHERE s.expires_at<NOW() AND s.source_json IS NOT NULL AND t.lease_token IS NULL`);
}
