import pool from '../db/index.js';
import { generateUUID } from './common.js';
import { stableAgentErrorCode } from './agent/logSafety.js';
import { ensureAiEvaluationSchema } from './aiEvaluationSchema.js';
import { getLiveSmokeSuite, LIVE_SMOKE_SUITES } from '../evaluation/ai-assistant/liveSmokeCases.js';
import { runLiveSmokeSuite } from '../evaluation/ai-assistant/liveSmokeRunner.js';

const RUN_LOCK = 'light_note_deepseek_planner_smoke';
const STORAGE_SUITES = Object.values(LIVE_SMOKE_SUITES).map((suite) => suite.storageId);
let startPending = false;
let activeRunPromise = null;

function compactReport(report) {
  return {
    passed: report.passed,
    provider: report.provider,
    usage: report.usage,
    execution: report.execution,
    results: report.results.map((result) => ({
      id: result.id,
      safetyCritical: result.safetyCritical,
      passedAttempts: result.passedAttempts,
      totalAttempts: result.totalAttempts,
      passRate: result.passRate,
      attempts: result.attempts.map((attempt) => ({
        passed: attempt.passed,
        capabilities: attempt.capabilities,
        tools: attempt.tools,
        errors: attempt.errors,
        durationMs: attempt.durationMs,
        usage: attempt.usage,
      })),
    })),
  };
}

async function cleanupExpiredRuns() {
  await pool.query(
    `DELETE FROM ai_evaluation_runs
     WHERE suite IN (?, ?) AND status IN ('passed', 'failed', 'error')
       AND create_time < DATE_SUB(NOW(), INTERVAL 90 DAY)`,
    STORAGE_SUITES,
  );
}

async function releaseRunLock(connection) {
  try {
    await connection.query('SELECT RELEASE_LOCK(?)', [RUN_LOCK]);
  } catch (error) {
    console.error('[ai-evaluation] 释放运行锁失败 code=%s', stableAgentErrorCode(error));
  } finally {
    connection.release();
  }
}

async function executeRun(id, suiteId, repeat, lockConnection) {
  const startedAt = Date.now();
  try {
    await pool.query("UPDATE ai_evaluation_runs SET status = 'running', started_at = NOW() WHERE id = ?", [id]);
    const report = await runLiveSmokeSuite({ live: true, suite: suiteId, repeat, format: 'json' });
    const compact = compactReport(report);
    const passedCaseCount = report.results.filter((result) =>
      result.safetyCritical ? result.passRate === 1 : result.passRate >= 0.5,
    ).length;
    await pool.query(
      `UPDATE ai_evaluation_runs SET provider = ?, model = ?, status = ?, passed_case_count = ?,
       prompt_tokens = ?, completion_tokens = ?, total_tokens = ?, duration_ms = ?, result_json = ?,
       finished_at = NOW() WHERE id = ?`,
      [
        report.provider?.provider || 'deepseek',
        report.provider?.model || null,
        report.passed ? 'passed' : 'failed',
        passedCaseCount,
        report.usage?.promptTokens || 0,
        report.usage?.completionTokens || 0,
        report.usage?.totalTokens || 0,
        Math.max(0, Date.now() - startedAt),
        JSON.stringify(compact),
        id,
      ],
    );
  } catch (error) {
    const code = stableAgentErrorCode(error);
    try {
      await pool.query(
        `UPDATE ai_evaluation_runs SET status = 'error', error_code = ?, duration_ms = ?, finished_at = NOW()
         WHERE id = ?`,
        [code, Math.max(0, Date.now() - startedAt), id],
      );
    } catch (writeError) {
      console.error('[ai-evaluation] 失败状态写入失败 code=%s', stableAgentErrorCode(writeError));
    }
  } finally {
    await releaseRunLock(lockConnection);
  }
}

export async function startAiLiveSmokeRun({ triggeredBy, suite: suiteId = 'quick', repeat = 1 }) {
  const suite = getLiveSmokeSuite(suiteId);
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 5) {
    const error = new Error('REPEAT_OUT_OF_RANGE');
    error.code = 'REPEAT_OUT_OF_RANGE';
    throw error;
  }
  if (startPending || activeRunPromise) {
    const error = new Error('RUN_ALREADY_ACTIVE');
    error.code = 'RUN_ALREADY_ACTIVE';
    throw error;
  }
  startPending = true;
  let lockConnection = null;
  try {
    await ensureAiEvaluationSchema();
    await cleanupExpiredRuns();
    lockConnection = await pool.getConnection();
    const [lockRows] = await lockConnection.query('SELECT GET_LOCK(?, 0) AS acquired', [RUN_LOCK]);
    if (Number(lockRows[0]?.acquired || 0) !== 1) {
      const error = new Error('RUN_ALREADY_ACTIVE');
      error.code = 'RUN_ALREADY_ACTIVE';
      throw error;
    }
    // 能取得全局锁说明没有任何实例仍在执行；遗留的 active 行来自已断开的旧进程。
    await lockConnection.query(
      `UPDATE ai_evaluation_runs
       SET status = 'error', error_code = 'PROCESS_INTERRUPTED', finished_at = NOW()
       WHERE suite IN (?, ?) AND status IN ('queued', 'running')`,
      STORAGE_SUITES,
    );
    const id = generateUUID();
    await lockConnection.query(
      `INSERT INTO ai_evaluation_runs
       (id, suite, provider, status, repeat_count, case_count, triggered_by)
       VALUES (?, ?, 'deepseek', 'queued', ?, ?, ?)`,
      [id, suite.storageId, repeat, suite.cases.length, triggeredBy],
    );
    const heldConnection = lockConnection;
    lockConnection = null;
    activeRunPromise = executeRun(id, suite.id, repeat, heldConnection)
      .catch((error) => console.error('[ai-evaluation] 异步任务失败 code=%s', stableAgentErrorCode(error)))
      .finally(() => {
        activeRunPromise = null;
      });
    return { id, suite: suite.id, status: 'queued', repeatCount: repeat, caseCount: suite.cases.length };
  } finally {
    if (lockConnection) await releaseRunLock(lockConnection);
    startPending = false;
  }
}

export async function listAiLiveSmokeRuns({ limit = 20 } = {}) {
  await ensureAiEvaluationSchema();
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
  const [rows] = await pool.query(
    `SELECT id, suite, provider, model, status, repeat_count, case_count, passed_case_count,
      prompt_tokens, completion_tokens, total_tokens, duration_ms, result_json, error_code,
      triggered_by, started_at, finished_at, create_time, update_time
     FROM ai_evaluation_runs WHERE suite IN (?, ?) ORDER BY create_time DESC LIMIT ?`,
    [...STORAGE_SUITES, safeLimit],
  );
  return rows.map((row) => ({
    ...row,
    suite: Object.values(LIVE_SMOKE_SUITES).find((suite) => suite.storageId === row.suite)?.id || row.suite,
    result_json:
      typeof row.result_json === 'string'
        ? (() => {
            try {
              return JSON.parse(row.result_json);
            } catch {
              return null;
            }
          })()
        : row.result_json,
  }));
}
