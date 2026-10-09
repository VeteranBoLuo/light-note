import { getActiveSecurityRestrictions } from '../security/services/securityRestrictionService.js';
import { randomUUID } from 'node:crypto';
import pool from '../../db/index.js';
import { executeAiSkill } from '../aiSkill/runtime.js';
import { withActiveUserAiDispatch } from '../aiOutboundDispatchGuard.js';
import { notificationSchedulerEnabled } from '../notificationSchedulerPolicy.js';
import { access, first, outbox } from './core.js';
import { audit, publishRevision } from './posts.js';
import { reviewSchemaReady } from './reviewQueue.js';
import {
  pureTextReviewEligible,
  reviewDailyBudget,
  reviewEnabled,
  REVIEW_POLICY_VERSION,
  REVIEW_RESERVATION_TOKENS,
  REVIEW_SYSTEM_ACTOR,
} from './reviewPolicy.js';
import { validateReviewArguments } from '../aiSkill/skills/communityReviewScreenSkill.js';

async function restrictions(db, userId) {
  return getActiveSecurityRestrictions(userId, { database: db, useCache: false, failClosed: true });
}
const blocksReview = (rows) =>
  rows.some((row) => ['ai_lock', 'write_lock', 'full_lock', 'login_lock'].includes(row.restriction_type));

const LOCK_NAME = 'lightnote:community-review:v1';
async function transaction(db, fn) {
  const c = await db.getConnection();
  try {
    await c.beginTransaction();
    const value = await fn(c);
    await c.commit();
    return value;
  } catch (error) {
    await c.rollback();
    throw error;
  } finally {
    c.release();
  }
}
async function loadMaterial(db, job) {
  return first(
    db,
    `SELECT p.*, r.title, r.body, r.status AS revision_status,
    EXISTS(SELECT 1 FROM community_revision_images i WHERE i.revision_id=r.id) AS has_images,
    EXISTS(SELECT 1 FROM community_revision_resources s WHERE s.revision_id=r.id) AS has_resources
    FROM community_posts p JOIN community_post_revisions r ON r.post_id=p.id AND r.id=? WHERE p.id=?`,
    [job.revision_id, job.post_id],
  );
}
export function currentReviewTarget(post, job) {
  return Boolean(
    post &&
    post.revision_status === 'pending_review' &&
    String(post.pending_revision_id) === String(job.revision_id) &&
    !['withdrawn', 'removed', 'deleted'].includes(post.status),
  );
}
async function reserveBudget(db, job, env) {
  return transaction(db, async (c) => {
    const day = await first(c, "SELECT DATE_FORMAT(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR), '%Y-%m-%d') AS day");
    await c.query('INSERT IGNORE INTO community_review_daily_budget (budget_day) VALUES (?)', [day.day]);
    const [reserved] = await c.query(
      `UPDATE community_review_daily_budget SET consumed_tokens=consumed_tokens+?
      WHERE budget_day=? AND consumed_tokens+?<=?`,
      [REVIEW_RESERVATION_TOKENS, day.day, REVIEW_RESERVATION_TOKENS, reviewDailyBudget(env)],
    );
    if (!reserved.affectedRows) return false;
    await c.query('UPDATE community_post_review_jobs SET budget_day=?,reserved_tokens=? WHERE id=? AND lease_token=?', [
      day.day,
      REVIEW_RESERVATION_TOKENS,
      job.id,
      job.lease_token,
    ]);
    job.budget_day = day.day;
    job.reserved_tokens = REVIEW_RESERVATION_TOKENS;
    return true;
  });
}
async function settleBudget(db, job) {
  if (!job.reserved_tokens) return;
  // Only release a reservation after the authoritative execution reached a terminal state with complete usage.
  // Crashes, missing usage and ambiguous Provider failures retain the conservative reservation for this day.
  const usage = await first(
    db,
    `SELECT e.status,e.provider_tokens,e.provider_call_count,
    (SELECT COUNT(*) FROM ai_provider_spans s WHERE s.execution_id=e.id) AS span_count,
    (SELECT COUNT(*) FROM ai_provider_spans s WHERE s.execution_id=e.id AND s.usage_status<>'reported') AS missing_usage
    FROM ai_executions e WHERE e.request_id=? AND e.skill_id='community.review_screen' LIMIT 1`,
    [job.request_id],
  );
  if (
    !usage ||
    !['completed', 'success', 'failed', 'partial', 'quota_blocked', 'aborted'].includes(usage.status) ||
    Number(usage.missing_usage) ||
    Number(usage.span_count) !== Number(usage.provider_call_count)
  )
    return;
  const actual = Number(usage.provider_tokens);
  if (!Number.isSafeInteger(actual) || actual < 0) return;
  await transaction(db, async (c) => {
    const row = await first(c, 'SELECT reserved_tokens FROM community_post_review_jobs WHERE id=? FOR UPDATE', [
      job.id,
    ]);
    if (!Number(row?.reserved_tokens)) return;
    await c.query(
      'UPDATE community_review_daily_budget SET consumed_tokens=GREATEST(consumed_tokens,?)-?+? WHERE budget_day=?',
      [row.reserved_tokens, row.reserved_tokens, actual, job.budget_day],
    );
    await c.query('UPDATE community_post_review_jobs SET reserved_tokens=0 WHERE id=?', [job.id]);
  });
}
async function finishReview(db, job, { postSnapshot, result, reason = 'ai_unavailable' } = {}, env) {
  await transaction(db, async (c) => {
    // Same account -> post order as submit/moderate; do not carry row locks over the model call.
    let permitted = false;
    if (postSnapshot) {
      try {
        await access(c, { id: postSnapshot.author_id, role: 'user' }, { env, write: true, lock: true });
        permitted = !blocksReview(await restrictions(c, postSnapshot.author_id));
      } catch (error) {
        if (!error?.code?.startsWith('COMMUNITY_')) throw error;
      }
    }
    const post = await first(c, 'SELECT * FROM community_posts WHERE id=? FOR UPDATE', [job.post_id]);
    const task = await first(
      c,
      "SELECT * FROM community_post_review_jobs WHERE id=? AND status='processing' AND lease_token=? FOR UPDATE",
      [job.id, job.lease_token],
    );
    if (!task) return;
    const revision = await first(c, 'SELECT status FROM community_post_revisions WHERE id=?', [job.revision_id]);
    const current = currentReviewTarget({ ...post, revision_status: revision?.status }, job);
    let status = current ? 'hold' : 'obsolete';
    if (
      current &&
      result?.decision === 'pass' &&
      result.categories.length === 0 &&
      permitted &&
      !Number(post.locked) &&
      reviewEnabled(env) &&
      Number(task.policy_version) === REVIEW_POLICY_VERSION &&
      Number(post.row_revision) === Number(postSnapshot.row_revision) &&
      Number(
        (await first(c, 'SELECT lease_until > NOW(6) AS valid FROM community_post_review_jobs WHERE id=?', [job.id]))
          ?.valid,
      )
    ) {
      await publishRevision(c, post, job.revision_id, REVIEW_SYSTEM_ACTOR);
      await audit(c, {
        actor: REVIEW_SYSTEM_ACTOR,
        post,
        action: 'approve',
        reason: 'ai_pass',
        revision: post.row_revision,
      });
      status = 'passed';
      reason = 'ai_pass';
    } else if (current) {
      await outbox(c, {
        key: `review:${job.post_id}:${job.revision_id}`,
        kind: 'review',
        actorId: post.author_id,
        postId: job.post_id,
        revisionId: job.revision_id,
      });
    }
    await c.query(
      `UPDATE community_post_review_jobs SET status=?,result_json=?,reason_code=?,finished_at=NOW(6),
      lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?`,
      [status, result ? JSON.stringify(result) : null, reason, job.id, job.lease_token],
    );
  });
}

export async function consumePostReview({
  db = pool,
  env = process.env,
  runSkill = executeAiSkill,
  withDispatch = withActiveUserAiDispatch,
} = {}) {
  if (!(await reviewSchemaReady(db))) return false;
  const lock = await db.getConnection();
  let acquired = false;
  try {
    acquired = Number((await first(lock, 'SELECT GET_LOCK(?,0) AS acquired', [LOCK_NAME]))?.acquired) === 1;
    if (!acquired) return false;
    const job = await first(
      db,
      `SELECT * FROM community_post_review_jobs
      WHERE status='pending' OR (status='processing' AND lease_until<NOW(6)) ORDER BY id LIMIT 1`,
    );
    if (!job) return false;
    const expired = job.status === 'processing';
    job.lease_token = randomUUID();
    job.request_id = job.request_id || randomUUID();
    const [claim] = await db.query(
      `UPDATE community_post_review_jobs SET status='processing',lease_token=?,request_id=?,
      lease_until=DATE_ADD(NOW(6),INTERVAL 5 MINUTE) WHERE id=? AND (status='pending' OR (status='processing' AND lease_until<NOW(6)))`,
      [job.lease_token, job.request_id, job.id],
    );
    if (!claim.affectedRows) return true;
    try {
      if (expired || !reviewEnabled(env) || Number(job.policy_version) !== REVIEW_POLICY_VERSION) {
        await finishReview(db, job, { reason: expired ? 'attempt_expired' : 'review_disabled' }, env);
        return true;
      }
      const post = await loadMaterial(db, job);
      if (
        !currentReviewTarget(post, job) ||
        Number(post.locked) ||
        !pureTextReviewEligible({
          ...post,
          images: Number(post?.has_images) ? [true] : [],
          resources: Number(post?.has_resources) ? [true] : [],
        })
      ) {
        await finishReview(db, job, { reason: 'not_eligible' }, env);
        return true;
      }
      await withDispatch(db, post.author_id, async ({ user }) => {
        await access(db, user, { env, write: true });
        const activeRestrictions = await restrictions(db, user.id);
        if (blocksReview(activeRestrictions)) {
          await finishReview(db, job, { reason: 'account_restricted' }, env);
          return;
        }
        const fresh = await loadMaterial(db, job);
        if (
          !currentReviewTarget(fresh, job) ||
          Number(fresh.locked) ||
          Number(fresh.row_revision) !== Number(post.row_revision)
        ) {
          await finishReview(db, job, { reason: 'target_changed' }, env);
          return;
        }
        if (!reviewEnabled(env) || !(await reserveBudget(db, job, env))) {
          await finishReview(db, job, { reason: 'budget_or_switch' }, env);
          return;
        }
        let committed = false;
        await runSkill(
          {
            protocolVersion: 1,
            requestId: job.request_id,
            skillId: 'community.review_screen',
            skillVersion: 1,
            threadId: null,
            input: { title: post.title, body: post.body },
            scope: { resourceRefs: [] },
            client: { locale: 'zh-CN', timezone: 'Asia/Shanghai', surface: 'community_review' },
          },
          {
            user,
            securityRestrictions: activeRestrictions,
            billingUser: user,
            resourceUser: user,
            headers: {},
            body: {},
            method: 'POST',
            path: '/community/review-worker',
          },
          {
            database: db,
            internalCaller: 'community_review_worker',
            signal: AbortSignal.timeout(75000),
            executionConfigOverrides: { billingPolicy: 'system', systemId: 'community_review' },
            commitValidatedResult: async ({ response }) => {
              const result = validateReviewArguments({
                decision: response.result.decision,
                categories: response.result.categories,
                reason: response.result.reason,
              });
              await finishReview(db, job, { postSnapshot: post, result, reason: 'ai_hold' }, env);
              committed = true;
            },
          },
        );
        if (!committed) await finishReview(db, job, { reason: 'result_missing' }, env);
      });
    } catch {
      await finishReview(db, job, { reason: 'ai_unavailable' }, env);
    } finally {
      await settleBudget(db, job);
    }
    return true;
  } finally {
    try {
      if (acquired) await lock.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]);
    } catch (error) {
      lock.destroy();
      throw error;
    } finally {
      lock.release();
    }
  }
}
export function startCommunityReviewScheduler({
  db = pool,
  env = process.env,
  onError = () => console.error('[community-review] processing failed'),
} = {}) {
  if (!notificationSchedulerEnabled(env)) return () => {};
  let stopped = false,
    running = false;
  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      await consumePostReview({ db, env });
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
