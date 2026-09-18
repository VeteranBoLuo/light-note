import { saveTaskReward, taskRewardStates } from './taskRewards.js';
import pool from '../../db/index.js';
import {
  access,
  fail,
  first,
  text,
  strictFields,
  expectedRevision,
  transaction,
  authorVisibleSql,
  unblockedSql,
} from './core.js';

const projection = `SELECT t.id,t.slug,t.name_zh,t.name_en,t.enabled,t.sort_order,
 COALESCE(d.description_zh,'') AS description_zh,COALESCE(d.description_en,'') AS description_en,
 COALESCE(d.official_pinned,0) AS official_pinned,COALESCE(d.post_task,0) AS post_task,
 COALESCE(d.row_revision,0) AS row_revision
 FROM community_topics t LEFT JOIN community_topic_details d ON d.topic_id=t.id`;
const slugOf = (value) => {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(value)) fail('COMMUNITY_INVALID_INPUT');
  return value;
};
const dto = (row) => ({
  slug: row.slug,
  nameZh: row.name_zh,
  nameEn: row.name_en,
  descriptionZh: row.description_zh,
  descriptionEn: row.description_en,
  enabled: Boolean(row.enabled),
  sortOrder: Number(row.sort_order),
  officialPinned: Boolean(row.official_pinned),
  postTask: Boolean(row.post_task),
  revision: Number(row.row_revision),
});
export async function listTopics({ user, moderation = false, env = process.env, db = pool }) {
  const account = await access(db, user, { env });
  if (moderation && account?.role !== 'root') fail('COMMUNITY_FORBIDDEN', 403);
  const [rows] = await db.query(
    `${projection} ${moderation ? '' : 'WHERE t.enabled=1'} ORDER BY t.sort_order,t.id LIMIT 100`,
  );
  const rewards = await taskRewardStates(db, account?.id);
  return rows.map((row) => ({ ...dto(row), reward: rewards.find((reward) => reward.key === row.slug) || null }));
}
export async function topicDetail({ user, slug, env = process.env, db = pool }) {
  const account = await access(db, user, { env });
  const row = await first(db, `${projection} WHERE t.slug=? AND t.enabled=1`, [slugOf(slug)]);
  if (!row) fail('COMMUNITY_TOPIC_UNAVAILABLE', 404);
  const viewer = account?.id || '';
  const count = await first(
    db,
    `SELECT COUNT(*) AS total FROM community_post_topics pt
    JOIN community_posts p ON p.id=pt.post_id
    WHERE pt.topic_id=? AND p.status='published' AND ${authorVisibleSql('p')} AND ${unblockedSql('p')}
    AND NOT EXISTS(SELECT 1 FROM community_post_user_states s WHERE s.post_id=p.id AND s.user_id=? AND s.hidden=1)`,
    [row.id, viewer, viewer, viewer],
  );
  let participation = 'not_started';
  let postId = null;
  if (viewer && row.post_task) {
    const published = await first(
      db,
      `SELECT p.public_id FROM community_posts p
      JOIN community_post_topics pt ON pt.post_id=p.id AND pt.topic_id=?
      WHERE p.author_id=? AND p.status='published' ORDER BY p.published_at DESC,p.id DESC LIMIT 1`,
      [row.id, viewer],
    );
    if (published) {
      participation = 'completed';
      postId = published.public_id;
    } else {
      const pending = await first(
        db,
        `SELECT p.public_id FROM community_posts p
        JOIN community_revision_topics rt ON rt.revision_id=p.pending_revision_id AND rt.topic_id=?
        JOIN community_post_revisions r ON r.id=p.pending_revision_id AND r.status='pending_review'
        WHERE p.author_id=? AND p.status IN ('pending_review','published') ORDER BY p.id DESC LIMIT 1`,
        [row.id, viewer],
      );
      if (pending) {
        participation = 'pending_review';
        postId = pending.public_id;
      }
    }
  }
  const rewards = await taskRewardStates(db, viewer);
  return {
    ...dto(row),
    reward: rewards.find((reward) => reward.key === row.slug) || null,
    postCount: Number(count.total),
    participation,
    participationPostId: postId,
  };
}
export async function saveTopic({ user, input, env = process.env, db = pool }) {
  strictFields(input, [
    'requestId',
    'expectedRevision',
    'slug',
    'nameZh',
    'nameEn',
    'descriptionZh',
    'descriptionEn',
    'enabled',
    'sortOrder',
    'officialPinned',
    'postTask',
    'reward',
  ]);
  const slug = slugOf(input.slug);
  const names = [text(input.nameZh, 80), text(input.nameEn, 80)];
  const descriptions = [text(input.descriptionZh, 600, false), text(input.descriptionEn, 600, false)];
  if (
    ['enabled', 'officialPinned', 'postTask'].some((key) => typeof input[key] !== 'boolean') ||
    !Number.isSafeInteger(input.sortOrder) ||
    Math.abs(input.sortOrder) > 10000
  )
    fail('COMMUNITY_INVALID_INPUT');
  return transaction({ user, requestId: input.requestId, action: 'saveTopic', input, env, db }, async (c, account) => {
    if (account.role !== 'root') fail('COMMUNITY_FORBIDDEN', 403);
    // Root-only bounded catalogue: serialize edits so the size limit and new slugs are atomic.
    const [catalogue] = await c.query('SELECT id FROM community_topics ORDER BY id FOR UPDATE');
    const previous = await first(c, 'SELECT id FROM community_topics WHERE slug=? FOR UPDATE', [slug]);
    const detail = previous
      ? await first(c, 'SELECT row_revision FROM community_topic_details WHERE topic_id=? FOR UPDATE', [previous.id])
      : null;
    expectedRevision(input.expectedRevision, detail?.row_revision || 0);
    if (!previous && catalogue.length >= 100) fail('COMMUNITY_TOPIC_LIMIT', 409);
    // Unique slug serializes new-topic races; never overwrite another writer's new topic.
    let id = previous?.id;
    if (!id) {
      try {
        const [inserted] = await c.query(
          'INSERT INTO community_topics(slug,name_zh,name_en,enabled,sort_order) VALUES (?,?,?,?,?)',
          [slug, ...names, input.enabled ? 1 : 0, input.sortOrder],
        );
        id = inserted.insertId;
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') fail('COMMUNITY_REVISION_CONFLICT', 409);
        throw error;
      }
    } else
      await c.query('UPDATE community_topics SET name_zh=?,name_en=?,enabled=?,sort_order=? WHERE id=?', [
        ...names,
        input.enabled ? 1 : 0,
        input.sortOrder,
        id,
      ]);
    const revision = Number(detail?.row_revision || 0) + 1;
    await c.query(
      `INSERT INTO community_topic_details(topic_id,description_zh,description_en,official_pinned,post_task,row_revision,updated_by)
      VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE description_zh=VALUES(description_zh),description_en=VALUES(description_en),official_pinned=VALUES(official_pinned),post_task=VALUES(post_task),row_revision=VALUES(row_revision),updated_by=VALUES(updated_by),updated_at=NOW(6)`,
      [id, ...descriptions, input.officialPinned ? 1 : 0, input.postTask ? 1 : 0, revision, account.id],
    );
    await saveTaskReward(c, id, input.reward);
    return { slug, revision };
  });
}
