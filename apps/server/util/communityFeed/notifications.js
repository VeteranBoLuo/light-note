import { randomUUID } from 'node:crypto';
import pool from '../../db/index.js';
import { communityGrowthMetrics } from './growthMetrics.js';
import { persistAchievementUnlocksForMetrics } from '../growthAchievementState.js';
import { createNotification } from '../notification.js';
import { first, feature, parseJson, pairAllowed, authorVisibleSql } from './core.js';

// No body snippets: unavailable sources must not leak through historical notifications.
export function feedNotificationVisibleSql(ready) {
  if (!ready) return "type <> 'community_feed'";
  return `(type<>'community_feed' OR (source_type='community_feed_review' AND EXISTS(SELECT 1 FROM user reviewer WHERE reviewer.id=notification.user_id AND reviewer.role='root' AND reviewer.del_flag='0') AND EXISTS(SELECT 1 FROM community_posts pending WHERE CONVERT(pending.public_id USING utf8mb4) COLLATE utf8mb4_bin=notification.source_id AND pending.pending_revision_id=CAST(JSON_UNQUOTE(JSON_EXTRACT(notification.meta,'$.revisionId')) AS UNSIGNED))) OR (source_type='community_feed_result' AND EXISTS (SELECT 1 FROM community_moderation_actions result_action WHERE result_action.public_id=notification.source_id AND result_action.subject_id=notification.user_id)) OR (source_type IN ('community_feed_comment','community_feed_post') AND EXISTS (
    SELECT 1 FROM community_posts fp WHERE CONVERT(fp.public_id USING utf8mb4) COLLATE utf8mb4_bin=JSON_UNQUOTE(JSON_EXTRACT(notification.meta,'$.postId')) AND fp.status='published' AND ${authorVisibleSql('fp')}
    AND NOT EXISTS (SELECT 1 FROM community_chat_blocks fb WHERE (fb.user_id=notification.user_id AND fb.blocked_user_id=fp.author_id) OR (fb.blocked_user_id=notification.user_id AND fb.user_id=fp.author_id))
    AND EXISTS (SELECT 1 FROM community_chat_user_identities actor JOIN user au ON au.id=actor.user_id AND au.del_flag='0' AND au.role<>'visitor' WHERE NOT EXISTS(SELECT 1 FROM community_chat_members am WHERE am.user_id=actor.user_id AND am.status='banned') AND CONVERT(actor.public_id USING utf8mb4) COLLATE utf8mb4_bin=JSON_UNQUOTE(JSON_EXTRACT(notification.meta,'$.actorId')) AND NOT EXISTS (SELECT 1 FROM community_chat_blocks ab WHERE (ab.user_id=notification.user_id AND ab.blocked_user_id=actor.user_id) OR (ab.blocked_user_id=notification.user_id AND ab.user_id=actor.user_id)))
    AND (source_type='community_feed_post' OR EXISTS (SELECT 1 FROM community_comments fc WHERE CONVERT(fc.public_id USING utf8mb4) COLLATE utf8mb4_bin=JSON_UNQUOTE(JSON_EXTRACT(notification.meta,'$.commentId')) AND fc.post_id=fp.id AND fc.status='published' AND ${authorVisibleSql('fc')})))))`;
}
async function deliver(db, event, userId) {
  const c = await db.getConnection();
  try {
    await c.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await c.beginTransaction();
    const recipient = await first(
      c,
      "SELECT id,role,preferences FROM user WHERE id=? AND del_flag='0' AND role<>'visitor' FOR UPDATE",
      [userId],
    );
    const post = await first(c, 'SELECT * FROM community_posts WHERE id=?', [event.post_id]);
    const comment = event.comment_id
      ? await first(c, 'SELECT * FROM community_comments WHERE id=?', [event.comment_id])
      : null;
    const action = event.action_id
      ? await first(c, 'SELECT * FROM community_moderation_actions WHERE id=?', [event.action_id])
      : null;
    const revision = event.revision_id
      ? await first(c, 'SELECT * FROM community_post_revisions WHERE id=?', [event.revision_id])
      : null;
    const ids = parseJson(comment?.mentions || revision?.mentions) || [];
    const identity = await first(c, 'SELECT public_id FROM community_chat_user_identities WHERE user_id=?', [userId]);
    const direct = comment?.reply_to_comment_id
      ? await first(c, 'SELECT author_id FROM community_comments WHERE id=?', [comment.reply_to_comment_id])
      : null;
    const subscription = await first(
      c,
      "SELECT 1 AS yes FROM community_post_user_states WHERE user_id=? AND post_id=? AND subscription='enabled'",
      [userId, event.post_id],
    );
    const review = event.kind === 'review';
    let kind = review
      ? 'review'
      : action
        ? 'result'
        : direct?.author_id === userId
          ? 'reply'
          : ids.includes(identity?.public_id)
            ? 'mention'
            : comment && !comment.reply_to_comment_id && post?.author_id === userId
              ? 'comment'
              : comment && subscription
                ? 'subscription'
                : '';
    if (!kind || (!action && event.actor_id === userId)) {
      await c.commit();
      return;
    }
    const key = event.kind === 'post' ? `post-mention:${event.post_id}` : event.event_key;
    if (
      await first(c, 'SELECT outcome FROM community_event_recipients WHERE dedupe_key=? AND user_id=?', [key, userId])
    ) {
      await c.commit();
      return;
    }
    let allowed = Boolean(recipient && post);
    const pref = await first(
      c,
      'SELECT comment_notifications_enabled,mention_notifications_enabled FROM community_profile_options WHERE user_id=?',
      [userId],
    );
    if (parseJson(recipient?.preferences)?.notificationsInApp === false) allowed = false;
    if (review)
      allowed =
        allowed &&
        recipient.role === 'root' &&
        Number(post.pending_revision_id) === Number(event.revision_id) &&
        revision?.status === 'pending_review';
    else if (action) allowed = allowed && action.subject_id === userId;
    else {
      allowed =
        allowed &&
        post.status === 'published' &&
        (!comment || comment.status === 'published') &&
        Boolean(
          await first(c, `SELECT p.id FROM community_posts p WHERE p.id=? AND ${authorVisibleSql('p')}`, [post.id]),
        );
      allowed =
        allowed &&
        Boolean(
          await first(
            c,
            "SELECT u.id FROM user u WHERE u.id=? AND u.del_flag='0' AND u.role<>'visitor' AND NOT EXISTS(SELECT 1 FROM community_chat_members m WHERE m.user_id=u.id AND m.status='banned')",
            [event.actor_id],
          ),
        );
      allowed =
        allowed &&
        !(await first(c, "SELECT user_id FROM community_chat_members WHERE user_id=? AND status='banned'", [userId]));
      allowed =
        allowed && (await pairAllowed(c, userId, event.actor_id)) && (await pairAllowed(c, userId, post.author_id));
      if (kind === 'mention' && pref && !Number(pref.mention_notifications_enabled)) allowed = false;
      if (['reply', 'comment'].includes(kind) && pref && !Number(pref.comment_notifications_enabled)) allowed = false;
      if (
        kind === 'subscription' &&
        (await first(c, 'SELECT 1 AS yes FROM community_user_mutes WHERE user_id=? AND target_user_id=?', [
          userId,
          event.actor_id,
        ]))
      )
        allowed = false;
    }
    const notificationId = allowed ? randomUUID() : null;
    if (allowed) {
      const actor = await first(c, 'SELECT public_id FROM community_chat_user_identities WHERE user_id=?', [
        event.actor_id,
      ]);
      await createNotification(
        userId,
        {
          id: notificationId,
          type: 'community_feed',
          title: review ? '有新帖子待审核' : action ? '社区处理结果' : '社区有新的回复或提及',
          content: action ? action.reason : review ? revision?.title || null : null,
          link: review
            ? '/community/moderation'
            : action
              ? '/community/manage?tab=results'
              : `/community/posts/${post.public_id}${comment ? '?comment=' + comment.public_id : ''}`,
          sourceType: review
            ? 'community_feed_review'
            : action
              ? 'community_feed_result'
              : comment
                ? 'community_feed_comment'
                : 'community_feed_post',
          sourceId: action ? action.public_id : comment ? comment.public_id : post.public_id,
          meta: {
            kind,
            ...(review ? { revisionId: Number(event.revision_id) } : {}),
            postId: post.public_id,
            ...(comment ? { commentId: comment.public_id } : {}),
            ...(action ? { actionId: action.public_id } : {}),
            actorId: actor?.public_id || '',
          },
        },
        c,
      );
    }
    await c.query(
      'INSERT INTO community_event_recipients (dedupe_key,user_id,outcome,notification_id) VALUES (?,?,?,?)',
      [key, userId, allowed ? 'delivered' : 'skipped', notificationId],
    );
    await c.commit();
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    c.release();
  }
}
export async function consumeCommunityEvent({ db = pool, env = process.env } = {}) {
  if (!feature(env).enabled || env.COMMUNITY_FEED_WORKER_ENABLED !== 'true') return false;
  const row = await first(
    db,
    "SELECT * FROM community_outbox WHERE (status='pending' AND next_attempt_at<=NOW(6)) OR (status='processing' AND lease_until<NOW(6)) ORDER BY id LIMIT 1",
  );
  if (!row) return false;
  const token = randomUUID();
  const [claim] = await db.query(
    "UPDATE community_outbox SET status='processing',lease_token=?,lease_until=DATE_ADD(NOW(6),INTERVAL 60 SECOND) WHERE id=? AND ((status='pending' AND next_attempt_at<=NOW(6)) OR (status='processing' AND lease_until<NOW(6)))",
    [token, row.id],
  );
  if (!claim.affectedRows) return true;
  try {
    if (row.kind === 'growth') {
      const actor = await first(db, "SELECT id FROM user WHERE id=? AND del_flag='0' AND role<>'visitor'", [
        row.actor_id,
      ]);
      if (actor)
        await persistAchievementUnlocksForMetrics(actor.id, await communityGrowthMetrics(actor.id, { db, env }), {
          db,
        });
      await db.query(
        "UPDATE community_outbox SET status='done',lease_until=NULL,lease_token=NULL WHERE id=? AND lease_token=?",
        [row.id, token],
      );
      return true;
    }
    // Bounded recipient walk. Subscription/mention membership is checked when dispatching, not inferred from cached counts.
    const candidates = [];
    if (row.action_id) {
      const action = await first(db, 'SELECT subject_id FROM community_moderation_actions WHERE id=?', [row.action_id]);
      if (action) candidates.push(action.subject_id);
    } else if (row.kind !== 'review') {
      const source = row.comment_id
        ? await first(db, 'SELECT author_id,mentions,reply_to_comment_id FROM community_comments WHERE id=?', [
            row.comment_id,
          ])
        : await first(db, 'SELECT mentions FROM community_post_revisions WHERE id=?', [row.revision_id]);
      if (row.comment_id) {
        const post = await first(db, 'SELECT author_id FROM community_posts WHERE id=?', [row.post_id]);
        if (post) candidates.push(post.author_id);
        if (source?.reply_to_comment_id) {
          const reply = await first(db, 'SELECT author_id FROM community_comments WHERE id=?', [
            source.reply_to_comment_id,
          ]);
          if (reply) candidates.push(reply.author_id);
        }
      }
      const ids = parseJson(source?.mentions) || [];
      if (ids.length) {
        const [targets] = await db.query(
          `SELECT user_id FROM community_chat_user_identities WHERE public_id IN (${ids.map(() => '?').join(',')})`,
          ids,
        );
        candidates.push(...targets.map((t) => t.user_id));
      }
    }
    const branches = candidates.map(() => 'SELECT CAST(? AS CHAR CHARACTER SET utf8) COLLATE utf8_general_ci AS id');
    if (row.kind === 'review') branches.push("SELECT id FROM user WHERE role='root' AND del_flag='0'");
    if (row.comment_id)
      branches.push("SELECT user_id AS id FROM community_post_user_states WHERE post_id=? AND subscription='enabled'");
    const [users] = branches.length
      ? await db.query(
          `SELECT u.id FROM user u JOIN (${branches.join(' UNION ')}) recipients ON recipients.id=u.id WHERE u.id>? AND u.del_flag='0' AND u.role<>'visitor' ORDER BY u.id LIMIT 50`,
          [...candidates, ...(row.comment_id ? [row.post_id] : []), row.recipient_cursor],
        )
      : [[]];
    for (const user of users) {
      await deliver(db, row, user.id);
      const [lease] = await db.query(
        'UPDATE community_outbox SET recipient_cursor=?,lease_until=DATE_ADD(NOW(6),INTERVAL 60 SECOND) WHERE id=? AND lease_token=?',
        [user.id, row.id, token],
      );
      if (!lease.affectedRows) return true;
    }
    await db.query(
      'UPDATE community_outbox SET status=?,lease_until=NULL,lease_token=NULL WHERE id=? AND lease_token=?',
      [users.length === 50 ? 'pending' : 'done', row.id, token],
    );
  } catch (e) {
    await db.query(
      'UPDATE community_outbox SET attempts=attempts+1,status=?,next_attempt_at=DATE_ADD(NOW(6),INTERVAL 30 SECOND),lease_until=NULL,lease_token=NULL WHERE id=? AND lease_token=?',
      [row.attempts >= 7 ? 'failed' : 'pending', row.id, token],
    );
    throw e;
  }
  return true;
}
