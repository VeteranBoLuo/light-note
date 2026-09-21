import { pendingReviewSql, visibleOrganizeRunOrderSql } from './organizeSuggestionAvailability.js';

export async function summarizePendingOrganizeReview(database, userId) {
  const [runs] = await database.query(
    `SELECT id FROM organize_suggestion_runs WHERE user_id=? AND status<>'preview' ORDER BY ${visibleOrganizeRunOrderSql} LIMIT 1`,
    [userId],
  );
  const runId = runs[0]?.id;
  if (!runId) return { total: 0, revision: 'current:none' };
  const from = `FROM organize_suggestions s
    JOIN organize_suggestion_items i ON i.id=s.item_id AND i.user_id=s.user_id AND i.run_id=s.run_id
    JOIN organize_suggestion_runs r ON r.id=s.run_id AND r.user_id=s.user_id
    WHERE s.user_id=? AND s.run_id=? AND r.status<>'preview' AND ${pendingReviewSql()}`;
  const [rows] = await database.query(
    `SELECT COUNT(*) total,
    CONCAT(COALESCE(SUM(CRC32(JSON_ARRAY(s.id,s.status))),0),':',BIT_XOR(CRC32(JSON_ARRAY(s.id,s.status)))) revision ${from}`,
    [userId, runId],
  );
  const summary = { total: Number(rows[0]?.total || 0), revision: `current:${runId}:${rows[0]?.revision || '0:0'}` };
  if (!Number(summary.total)) return summary;
  const [targets] = await database.query(
    `SELECT r.id runId,i.resource_type resourceType ${from}
    ORDER BY COALESCE(r.started_at,r.created_at) DESC,r.id DESC,i.id,s.id LIMIT 1`,
    [userId, runId],
  );
  const target = targets[0];
  return {
    ...summary,
    ...(target
      ? {
          route: `/organize?issue=ai_suggestions&review=pending&runId=${encodeURIComponent(target.runId)}&resourceType=${encodeURIComponent(target.resourceType)}`,
        }
      : {}),
  };
}
