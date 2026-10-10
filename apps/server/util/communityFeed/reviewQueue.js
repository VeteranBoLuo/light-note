import { communityFeedSchemaReady } from './schema.js';
import { pureTextReviewEligible, reviewEnabled, REVIEW_POLICY_VERSION } from './reviewPolicy.js';

export const REVIEW_SCHEMA = Object.freeze({
  community_post_review_jobs: {
    columns: [
      'id',
      'post_id',
      'revision_id',
      'status',
      'policy_version',
      'request_id',
      'lease_token',
      'lease_until',
      'budget_day',
      'reserved_tokens',
      'result_json',
      'reason_code',
      'created_at',
      'finished_at',
    ],
    indexes: [
      ['PRIMARY', 'id', 0],
      ['uk_revision', 'revision_id', 0],
      ['idx_pending', 'status,id', 1],
      ['idx_post', 'post_id', 1],
    ],
  },
  community_review_daily_budget: {
    columns: ['budget_day', 'consumed_tokens'],
    indexes: [['PRIMARY', 'budget_day', 0]],
  },
});
export const reviewSchemaReady = (db) => communityFeedSchemaReady(db, REVIEW_SCHEMA);
export async function enqueuePostReview(db, post, revisionId, content, env = process.env) {
  if (!reviewEnabled(env) || !pureTextReviewEligible(content) || !(await reviewSchemaReady(db))) return false;
  await db.query('INSERT INTO community_post_review_jobs (post_id,revision_id,policy_version) VALUES (?,?,?)', [
    post.id,
    revisionId,
    REVIEW_POLICY_VERSION,
  ]);
  return true;
}
