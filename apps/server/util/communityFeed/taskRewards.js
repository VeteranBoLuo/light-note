import { fail } from './core.js';

export function normalizeTaskReward(input) {
  if (input == null) return null;
  if (typeof input !== 'object' || Array.isArray(input)) fail('COMMUNITY_INVALID_INPUT');
  const { startsAt, endsAt, exp, points } = input;
  if (
    Object.keys(input).some((key) => !['startsAt', 'endsAt', 'exp', 'points'].includes(key)) ||
    !Number.isInteger(exp) ||
    exp < 0 ||
    exp > 1000 ||
    !Number.isInteger(points) ||
    points < 0 ||
    points > 10000 ||
    !(exp + points > 0) ||
    typeof startsAt !== 'string' ||
    typeof endsAt !== 'string' ||
    !startsAt.endsWith('Z') ||
    !endsAt.endsWith('Z') ||
    !Number.isFinite(Date.parse(startsAt)) ||
    !Number.isFinite(Date.parse(endsAt)) ||
    Date.parse(endsAt) <= Date.parse(startsAt)
  )
    fail('COMMUNITY_INVALID_INPUT');
  return { startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), exp, points };
}
const sqlDate = (value) => Date.parse(value);
export async function saveTaskReward(db, topicId, input) {
  if (input === undefined) return;
  const reward = normalizeTaskReward(input);
  const [existing] = await db.query(
    'SELECT *, UNIX_TIMESTAMP(starts_at)*1000 AS starts_ms, UNIX_TIMESTAMP(ends_at)*1000 AS ends_ms FROM community_task_rewards WHERE topic_id=? FOR UPDATE',
    [topicId],
  );
  const [awards] = await db.query('SELECT topic_id FROM community_task_awards WHERE topic_id=? LIMIT 1 FOR UPDATE', [
    topicId,
  ]);
  const old = existing[0];
  if (
    awards.length &&
    (!reward ||
      !old ||
      old.reward_exp !== reward.exp ||
      old.reward_points !== reward.points ||
      Number(old.starts_ms) !== Date.parse(reward.startsAt) ||
      Number(old.ends_ms) !== Date.parse(reward.endsAt))
  )
    fail('COMMUNITY_REWARD_LOCKED', 409);
  if (!reward) {
    await db.query('DELETE FROM community_task_rewards WHERE topic_id=?', [topicId]);
    return;
  }
  await db.query(
    `INSERT INTO community_task_rewards(topic_id,starts_at,ends_at,reward_exp,reward_points) VALUES (?,FROM_UNIXTIME(?/1000),FROM_UNIXTIME(?/1000),?,?)
    ON DUPLICATE KEY UPDATE starts_at=VALUES(starts_at),ends_at=VALUES(ends_at),reward_exp=VALUES(reward_exp),reward_points=VALUES(reward_points)`,
    [topicId, sqlDate(reward.startsAt), sqlDate(reward.endsAt), reward.exp, reward.points],
  );
}

// Called in the publication transaction: approval time may follow the event end, submission time may not.
export async function recordTaskAwards(db, post, revisionId) {
  const [configs] = await db.query(
    `SELECT r.* FROM community_task_rewards r
    JOIN community_topics t ON t.id=r.topic_id AND t.enabled=1
    JOIN community_topic_details d ON d.topic_id=t.id AND d.post_task=1
    JOIN community_revision_topics rt ON rt.topic_id=t.id AND rt.revision_id=?
    JOIN community_post_revisions pr ON pr.id=rt.revision_id
    WHERE pr.created_at >= r.starts_at AND pr.created_at < r.ends_at ORDER BY r.topic_id FOR UPDATE`,
    [revisionId],
  );
  for (const config of configs)
    await db.query(
      `INSERT INTO community_task_awards(topic_id,user_id,post_id,reward_exp,reward_points)
    VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE post_id=IF(claimed_at IS NULL,VALUES(post_id),post_id)`,
      [config.topic_id, post.author_id, post.id, config.reward_exp, config.reward_points],
    );
}

export async function taskRewardStates(db, userId) {
  // MySQL 5.7 resolves outer aliases in correlated WHERE clauses, not JOIN ON clauses.
  const [rows] = await db.query(
    `SELECT t.id,t.slug,t.name_zh,t.name_en,t.enabled,d.post_task,r.*,UNIX_TIMESTAMP(r.starts_at)*1000 AS starts_ms,UNIX_TIMESTAMP(r.ends_at)*1000 AS ends_ms,a.claimed_at,a.earned_at,
    a.reward_exp AS award_exp,a.reward_points AS award_points,
    EXISTS(SELECT 1 FROM community_posts p JOIN community_post_topics pt ON pt.post_id=p.id
      WHERE pt.topic_id=t.id AND p.id=a.post_id AND p.author_id=? AND p.status='published') AS eligible,
    EXISTS(SELECT 1 FROM community_posts pending JOIN community_post_revisions pr ON pr.id=pending.pending_revision_id JOIN community_revision_topics rt ON rt.revision_id=pr.id WHERE rt.topic_id=t.id AND pending.author_id=? AND pr.status='pending_review' AND pr.created_at>=r.starts_at AND pr.created_at<r.ends_at) AS pending_review,
    EXISTS(SELECT 1 FROM community_task_awards x WHERE x.topic_id=t.id) AS config_locked,
    NOW(6) < r.starts_at AS upcoming,NOW(6) >= r.ends_at AS ended
    FROM community_task_rewards r JOIN community_topics t ON t.id=r.topic_id
    JOIN community_topic_details d ON d.topic_id=t.id
    LEFT JOIN community_task_awards a ON a.topic_id=t.id AND a.user_id=? ORDER BY t.sort_order,t.id LIMIT 100`,
    [userId || '', userId || '', userId || ''],
  );
  return rows.map((r) => ({
    key: r.slug,
    topicId: r.topic_id,
    nameZh: r.name_zh,
    nameEn: r.name_en,
    startsAt: new Date(Number(r.starts_ms)).toISOString(),
    endsAt: new Date(Number(r.ends_ms)).toISOString(),
    exp: Number(r.earned_at ? r.award_exp : r.reward_exp),
    points: Number(r.earned_at ? r.award_points : r.reward_points),
    configuredExp: Number(r.reward_exp),
    configuredPoints: Number(r.reward_points),
    locked: Boolean(r.config_locked),
    state: r.claimed_at
      ? 'claimed'
      : r.earned_at && r.eligible
        ? 'claimable'
        : r.earned_at
          ? 'unavailable'
          : !r.enabled || !r.post_task
            ? 'paused'
            : r.pending_review
              ? 'pending'
              : r.upcoming
                ? 'upcoming'
                : r.ended
                  ? 'ended'
                  : 'active',
  }));
}

export async function claimTaskRewards(db, userId, keys, { grantExp, earnPoints, userRole, calendar }) {
  const receipts = [];
  const [awards] = await db.query(
    `SELECT a.*,t.slug FROM community_task_awards a JOIN community_topics t ON t.id=a.topic_id WHERE a.user_id=? ORDER BY a.topic_id`,
    [userId],
  );
  for (const award of awards) {
    if (keys && !keys.has(award.slug)) continue;
    await db.query('SELECT id FROM community_posts WHERE id=? FOR UPDATE', [award.post_id]);
    const [current] = await db.query(
      'SELECT claimed_at,post_id FROM community_task_awards WHERE topic_id=? AND user_id=? FOR UPDATE',
      [award.topic_id, userId],
    );
    if (!current[0] || String(current[0].post_id) !== String(award.post_id)) fail('COMMUNITY_REVISION_CONFLICT', 409);
    award.claimed_at = current[0].claimed_at;
    const receipt = { type: 'community', key: award.slug, status: 'already', reward: {} };
    if (!award.claimed_at) {
      const [posts] = await db.query(
        `SELECT p.id FROM community_posts p JOIN community_post_topics pt ON pt.post_id=p.id AND pt.topic_id=? WHERE p.id=? AND p.author_id=? AND p.status='published' FOR UPDATE`,
        [award.topic_id, award.post_id, userId],
      );
      if (!posts.length) {
        receipts.push({ ...receipt, status: 'incomplete' });
        continue;
      }
      const ref = `community-task:${award.topic_id}`;
      const exp = award.reward_exp
        ? await grantExp(userId, 'community_task', { refId: ref, amount: award.reward_exp, userRole, calendar }, db)
        : { granted: 0 };
      const points = award.reward_points
        ? await earnPoints(userId, award.reward_points, 'campaign', ref, db, {
            policyVersion: 'community-task-v1',
            meta: { topicId: award.topic_id },
          })
        : false;
      await db.query('UPDATE community_task_awards SET claimed_at=NOW(6) WHERE topic_id=? AND user_id=?', [
        award.topic_id,
        userId,
      ]);
      receipt.status = 'claimed';
      receipt.reward = { exp: Number(exp.granted || 0), points: points ? Number(award.reward_points) : 0 };
    }
    receipts.push(receipt);
  }
  return receipts;
}
