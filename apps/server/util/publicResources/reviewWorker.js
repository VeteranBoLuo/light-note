import { randomUUID } from 'node:crypto';
import pool from '../../db/index.js';
import skill, { validatePublicReviewArguments } from '../aiSkill/skills/publicResourceReviewSkill.js';
import { estimateStructuredSkillModelTokens } from '../aiSkill/structuredModel.js';
import { executeAiSkill } from '../aiSkill/runtime.js';
import { withActiveUserAiDispatch } from '../aiOutboundDispatchGuard.js';
import { getActiveSecurityRestrictions } from '../security/services/securityRestrictionService.js';
import { notificationSchedulerEnabled } from '../notificationSchedulerPolicy.js';
import { access, first, flags, transaction } from './core.js';
import { publicResourceSchemaReady } from './schema.js';

export const REVIEW_POLICY_VERSION = 1;
export const reviewEnabled = (env = process.env) => {
  const f = flags(env);
  return f.enabled && f.submissionsEnabled && f.aiEnabled;
};
export function reviewDailyBudget(env = process.env) {
  const value = Number(env.PUBLIC_RESOURCES_AI_DAILY_BUDGET_TOKENS ?? 300000);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
const materialOf = (row) => ({
  kind: row.kind,
  title: row.title,
  body: row.body,
  url: row.url,
  description: row.description,
});
async function target(db, job) {
  return first(
    db,
    'SELECT p.*,r.title,r.body,r.url,r.description,r.status AS revision_status FROM public_resource_publications p JOIN public_resource_revisions r ON r.id=? AND r.publication_id=p.id WHERE p.id=?',
    [job.revision_id, job.publication_id],
  );
}
export function currentTarget(p, job) {
  return Boolean(
    p &&
    !Number(p.removed) &&
    !Number(p.withdrawn) &&
    String(p.pending_revision_id) === String(job.revision_id) &&
    p.revision_status === 'pending_review',
  );
}
async function reserve(db, job, tokens, env) {
  return transaction(db, async (c) => {
    const day = (await first(c, "SELECT DATE_FORMAT(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR),'%Y-%m-%d') AS day"))
      .day;
    await c.query('INSERT IGNORE INTO public_resource_review_budget(budget_day) VALUES(?)', [day]);
    const [result] = await c.query(
      'UPDATE public_resource_review_budget SET consumed_tokens=consumed_tokens+? WHERE budget_day=? AND consumed_tokens+?<=?',
      [tokens, day, tokens, reviewDailyBudget(env)],
    );
    if (!result.affectedRows) return false;
    const [claim] = await c.query(
      "UPDATE public_resource_review_jobs SET budget_day=?,reserved_tokens=? WHERE id=? AND lease_token=? AND status='processing'",
      [day, tokens, job.id, job.lease_token],
    );
    if (!claim.affectedRows) {
      await c.query('UPDATE public_resource_review_budget SET consumed_tokens=consumed_tokens-? WHERE budget_day=?', [
        tokens,
        day,
      ]);
      return false;
    }
    job.budget_day = day;
    job.reserved_tokens = tokens;
    return true;
  });
}
async function settle(db, job) {
  if (!job.reserved_tokens) return;
  const usage = await first(
    db,
    "SELECT e.status,e.provider_tokens,e.provider_call_count,(SELECT COUNT(*) FROM ai_provider_spans s WHERE s.execution_id=e.id) AS span_count,(SELECT COUNT(*) FROM ai_provider_spans s WHERE s.execution_id=e.id AND s.usage_status<>'reported') AS missing_usage FROM ai_executions e WHERE e.request_id=? AND e.skill_id='public_resource.review_screen' LIMIT 1",
    [job.request_id],
  );
  if (
    !usage ||
    !['completed', 'success', 'failed', 'partial', 'quota_blocked', 'aborted'].includes(usage.status) ||
    Number(usage.missing_usage) ||
    Number(usage.span_count) !== Number(usage.provider_call_count) ||
    !Number.isSafeInteger(Number(usage.provider_tokens)) ||
    Number(usage.provider_tokens) < 0
  )
    return;
  await transaction(db, async (c) => {
    const row = await first(c, 'SELECT reserved_tokens FROM public_resource_review_jobs WHERE id=? FOR UPDATE', [
      job.id,
    ]);
    if (!Number(row?.reserved_tokens)) return;
    await c.query(
      'UPDATE public_resource_review_budget SET consumed_tokens=GREATEST(consumed_tokens,?)-?+? WHERE budget_day=?',
      [row.reserved_tokens, row.reserved_tokens, Number(usage.provider_tokens), job.budget_day],
    );
    await c.query('UPDATE public_resource_review_jobs SET reserved_tokens=0 WHERE id=?', [job.id]);
  });
}
export async function finishReview(
  db,
  job,
  { result = null, reason = 'ai_unavailable', snapshot = null } = {},
  env = process.env,
) {
  await transaction(db, async (c) => {
    // Only audit advice can be written here; no code path publishes or rejects content.
    let active = true;
    if (snapshot)
      try {
        await access(c, { id: snapshot.owner_id, role: 'user' }, { lock: true });
      } catch (error) {
        if (!error.code?.startsWith('PUBLIC_RESOURCE_')) throw error;
        active = false;
      }
    const p = await first(c, 'SELECT * FROM public_resource_publications WHERE id=? FOR UPDATE', [job.publication_id]);
    const task = await first(
      c,
      "SELECT *,lease_until>NOW(6) AS valid FROM public_resource_review_jobs WHERE id=? AND lease_token=? AND status='processing' FOR UPDATE",
      [job.id, job.lease_token],
    );
    if (!task) return;
    const r = await first(c, 'SELECT status FROM public_resource_revisions WHERE id=?', [job.revision_id]);
    const current = currentTarget({ ...p, revision_status: r?.status }, job);
    const accepted =
      current &&
      active &&
      Number(task.valid) &&
      reviewEnabled(env) &&
      Number(task.policy_version) === REVIEW_POLICY_VERSION &&
      (!snapshot || Number(snapshot.version) === Number(p.version));
    await c.query(
      'UPDATE public_resource_review_jobs SET status=?,result_json=?,reason_code=?,finished_at=NOW(6),lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?',
      [
        current ? 'hold' : 'obsolete',
        accepted && result ? JSON.stringify(result) : null,
        accepted && result ? 'ai_completed' : result ? 'result_invalidated' : reason,
        job.id,
        job.lease_token,
      ],
    );
  });
}
export async function consumePublicResourceReview({
  db = pool,
  env = process.env,
  runSkill = executeAiSkill,
  withDispatch = withActiveUserAiDispatch,
} = {}) {
  if (!(await publicResourceSchemaReady(db))) return false;
  const connection = await db.getConnection(),
    lockName = 'lightnote:public-resource-review:v1';
  let locked = false;
  try {
    locked = Number((await first(connection, 'SELECT GET_LOCK(?,0) AS acquired', [lockName]))?.acquired) === 1;
    if (!locked) return false;
    const job = await first(
      db,
      "SELECT * FROM public_resource_review_jobs WHERE status='pending' OR (status='processing' AND lease_until<NOW(6)) ORDER BY id LIMIT 1",
    );
    if (!job) return false;
    const expired = job.status === 'processing';
    job.lease_token = randomUUID();
    job.request_id = job.request_id || randomUUID();
    const [claimed] = await db.query(
      "UPDATE public_resource_review_jobs SET status='processing',lease_token=?,request_id=?,lease_until=DATE_ADD(NOW(6),INTERVAL 5 MINUTE) WHERE id=? AND (status='pending' OR (status='processing' AND lease_until<NOW(6)))",
      [job.lease_token, job.request_id, job.id],
    );
    if (!claimed.affectedRows) return true;
    try {
      if (expired || !reviewEnabled(env) || Number(job.policy_version) !== REVIEW_POLICY_VERSION) {
        await finishReview(db, job, { reason: expired ? 'attempt_expired' : 'review_disabled' }, env);
        return true;
      }
      const snapshot = await target(db, job);
      if (!currentTarget(snapshot, job)) {
        await finishReview(db, job, { reason: 'target_changed' }, env);
        return true;
      }
      await withDispatch(db, snapshot.owner_id, async ({ user }) => {
        await access(db, user);
        const restrictions = await getActiveSecurityRestrictions(user.id, {
          database: db,
          useCache: false,
          failClosed: true,
        });
        if (
          restrictions.some((r) => ['ai_lock', 'write_lock', 'full_lock', 'login_lock'].includes(r.restriction_type))
        ) {
          await finishReview(db, job, { snapshot, reason: 'account_restricted' }, env);
          return;
        }
        const fresh = await target(db, job);
        if (!currentTarget(fresh, job) || Number(fresh.version) !== Number(snapshot.version)) {
          await finishReview(db, job, { reason: 'target_changed' }, env);
          return;
        }
        // Check source existence independently of the pending pointer; published visibility is intentionally stricter.
        const table = fresh.kind === 'note' ? 'note' : 'bookmark',
          owner = fresh.kind === 'note' ? 'create_by' : 'user_id';
        if (
          !(await first(db, `SELECT id FROM ${table} WHERE id=? AND ${owner}=? AND del_flag=0`, [
            fresh.source_id,
            user.id,
          ]))
        ) {
          await finishReview(db, job, { reason: 'source_unavailable' }, env);
          return;
        }
        const input = materialOf(fresh),
          prepared = await skill.prepare({ input });
        // Full input and one bounded protocol repair; no truncation and no replay after uncertain outcomes.
        const tokens = 2 * (estimateStructuredSkillModelTokens({ ...prepared, modelPolicy: skill.modelPolicy }) + 1024);
        if (!reviewEnabled(env) || !(await reserve(db, job, tokens, env))) {
          await finishReview(db, job, { snapshot, reason: 'budget_or_switch' }, env);
          return;
        }
        let committed = false;
        await runSkill(
          {
            protocolVersion: 1,
            requestId: job.request_id,
            skillId: skill.id,
            skillVersion: 1,
            threadId: null,
            input,
            scope: { resourceRefs: [] },
            client: { locale: 'zh-CN', timezone: 'Asia/Shanghai', surface: 'public_resource_review' },
          },
          {
            user,
            billingUser: user,
            resourceUser: user,
            securityRestrictions: restrictions,
            headers: {},
            body: {},
            method: 'POST',
            path: '/public-resources/review-worker',
          },
          {
            database: db,
            internalCaller: 'public_resource_review_worker',
            signal: AbortSignal.timeout(75000),
            executionConfigOverrides: { billingPolicy: 'system', systemId: 'public_resource_review' },
            commitValidatedResult: async ({ response }) => {
              const r = response.result,
                result = validatePublicReviewArguments(
                  { decision: r.decision, categories: r.categories, reason: r.reason, evidence: r.evidence },
                  input,
                );
              await finishReview(db, job, { snapshot, result, reason: 'ai_completed' }, env);
              committed = true;
            },
          },
        );
        if (!committed) await finishReview(db, job, { snapshot, reason: 'result_missing' }, env);
      });
    } catch {
      await finishReview(db, job, { reason: 'ai_unavailable' }, env);
    } finally {
      await settle(db, job);
    }
    return true;
  } finally {
    try {
      if (locked) await connection.query('SELECT RELEASE_LOCK(?)', [lockName]);
    } catch {
      connection.destroy();
    } finally {
      connection.release();
    }
  }
}
export function startPublicResourceReviewScheduler({
  db = pool,
  env = process.env,
  onError = () => console.error('[public-resource-review] processing failed'),
} = {}) {
  if (!notificationSchedulerEnabled(env)) return () => {};
  let running = false,
    stopped = false;
  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try {
      await consumePublicResourceReview({ db, env });
    } catch {
      onError();
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, 5000);
  timer.unref?.();
  void tick();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
