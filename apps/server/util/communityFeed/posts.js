import { recordTaskAwards } from './taskRewards.js';
import { bindResources, revisionResources, resourceDto } from './resources.js';
import { bindImages, revisionImages, imageDto } from './images.js';
import { publicGrowthProfile } from '../services/communityChatProfileService.js';
import { randomUUID } from 'node:crypto';
import pool from '../../db/index.js';
import { normalizeCommunityPost } from '@lightnote/shared/community-feed';
import {
  access,
  authorVisibleSql,
  expectedRevision,
  fail,
  feature,
  first,
  identity,
  loadPost,
  mentions,
  outbox,
  parseJson,
  strictFields,
  text,
  transaction,
  unblockedSql,
  publicId,
  ensureProfile,
} from './core.js';

async function validateTopics(db, slugs) {
  if (!slugs.length) return [];
  const [rows] = await db.query(
    `SELECT id,slug FROM community_topics WHERE enabled=1 AND slug IN (${slugs.map(() => '?').join(',')})`,
    slugs,
  );
  if (rows.length !== slugs.length) fail('COMMUNITY_TOPIC_UNAVAILABLE', 409);
  return rows;
}
async function insertRevision(c, post, content) {
  const topicRows = await validateTopics(c, content.topics);
  await mentions(c, content.mentions, post.author_id);
  const [insert] = await c.query(
    'INSERT INTO community_post_revisions (post_id,revision_no,kind,title,body,mentions) VALUES (?,?,?,?,?,?)',
    [post.id, post.row_revision, content.kind, content.title, content.body, JSON.stringify(content.mentions)],
  );
  for (const topic of topicRows)
    await c.query('INSERT INTO community_revision_topics (revision_id,topic_id) VALUES (?,?)', [
      insert.insertId,
      topic.id,
    ]);
  await bindResources(c, post, insert.insertId, content.resources || []);
  await bindImages(c, post, insert.insertId, content.images || []);
  return insert.insertId;
}
export async function audit(
  c,
  { actor, post, action, reason, comment = null, revision = post.row_revision, notify = true },
) {
  const id = randomUUID();
  const [result] = await c.query(
    'INSERT INTO community_moderation_actions (public_id,actor_id,subject_id,post_id,comment_id,target_revision,action,reason) VALUES (?,?,?,?,?,?,?,?)',
    [id, actor, comment?.author_id || post.author_id, post.id, comment?.id || null, revision, action, reason],
  );
  if (notify)
    await outbox(c, {
      key: `action:${id}`,
      kind: 'result',
      actorId: actor,
      postId: post.id,
      actionId: result.insertId,
    });
  return { publicId: id, id: result.insertId };
}
export async function publishRevision(c, post, revisionId, actor) {
  const revision = await first(
    c,
    "SELECT * FROM community_post_revisions WHERE id=? AND post_id=? AND status='pending_review' FOR UPDATE",
    [revisionId, post.id],
  );
  if (
    !revision ||
    Number(post.pending_revision_id) !== Number(revisionId) ||
    ['withdrawn', 'removed', 'deleted'].includes(post.status)
  )
    fail('COMMUNITY_REVISION_CONFLICT', 409);
  const author = await first(c, `SELECT p.id FROM community_posts p WHERE p.id=? AND ${authorVisibleSql('p')}`, [
    post.id,
  ]);
  if (!author) fail('COMMUNITY_CONTENT_UNAVAILABLE', 404);
  await c.query("UPDATE community_post_revisions SET status='published' WHERE id=?", [revisionId]);
  await c.query(
    "UPDATE community_posts SET published_revision_id=?, pending_revision_id=NULL, status='published', published_at=COALESCE(published_at,NOW(6)), updated_at=NOW(6), row_revision=row_revision+1 WHERE id=?",
    [revisionId, post.id],
  );
  await c.query('DELETE FROM community_post_topics WHERE post_id=?', [post.id]);
  await c.query(
    'INSERT INTO community_post_topics (post_id,topic_id) SELECT ?,topic_id FROM community_revision_topics WHERE revision_id=?',
    [post.id, revisionId],
  );
  await recordTaskAwards(c, post, revisionId);
  await outbox(c, { key: `growth:post:${post.public_id}`, kind: 'growth', actorId: post.author_id, postId: post.id });
  await outbox(c, {
    key: `post:${post.public_id}:${revisionId}`,
    kind: 'post',
    actorId: post.author_id,
    postId: post.id,
    revisionId,
  });
}
export async function submitPost({ user, input, env = process.env, db = pool }) {
  strictFields(input, [
    'requestId',
    'postId',
    'expectedRevision',
    'kind',
    'title',
    'body',
    'topics',
    'mentions',
    'profileConsentVersion',
    'images',
    'resources',
  ]);
  let content;
  try {
    content = normalizeCommunityPost(input);
  } catch {
    fail('COMMUNITY_INVALID_INPUT');
  }
  return transaction({ user, requestId: input.requestId, action: 'submitPost', input, env, db }, async (c, account) => {
    await identity(c, user.id);
    await ensureProfile(c, user.id);
    let post;
    if (input.postId) {
      post = await loadPost(c, input.postId, user, { owner: true, lock: true });
      if (post.author_id !== user.id) fail('COMMUNITY_CONTENT_UNAVAILABLE', 404);
      expectedRevision(input.expectedRevision, post.row_revision);
      if (['removed', 'deleted'].includes(post.status) || Number(post.locked)) fail('COMMUNITY_THREAD_LOCKED', 423);
      if (post.pending_revision_id)
        await c.query(
          "UPDATE community_post_revisions SET status='superseded' WHERE id=? AND status='pending_review'",
          [post.pending_revision_id],
        );
      post.row_revision = Number(post.row_revision) + 1;
      if (post.status === 'withdrawn') {
        // Republish through a new review; the withdrawn public version must stay private.
        post.status = 'pending_review';
        post.published_revision_id = null;
      }
      await c.query(
        'UPDATE community_posts SET row_revision=?,status=?,published_revision_id=?,updated_at=NOW(6) WHERE id=?',
        [post.row_revision, post.status, post.published_revision_id, post.id],
      );
    } else {
      const id = randomUUID();
      const [insert] = await c.query('INSERT INTO community_posts (public_id,author_id) VALUES (?,?)', [id, user.id]);
      post = { id: insert.insertId, public_id: id, author_id: user.id, row_revision: 1, status: 'pending_review' };
    }
    const revisionId = await insertRevision(c, post, content);
    await c.query(
      "UPDATE community_posts SET pending_revision_id=?,status=IF(published_revision_id IS NULL,'pending_review',status) WHERE id=?",
      [revisionId, post.id],
    );
    post.pending_revision_id = revisionId;
    if (account.role === 'root') {
      await publishRevision(c, post, revisionId, user.id);
      await audit(c, {
        actor: user.id,
        post,
        action: 'approve',
        reason: 'Root self-publication',
        notify: false,
        revision: post.row_revision,
      });
    }
    if (account.role !== 'root')
      await outbox(c, {
        key: `review:${post.id}:${revisionId}`,
        kind: 'review',
        actorId: user.id,
        postId: post.id,
        revisionId,
      });
    return {
      publicId: post.public_id,
      status: account.role === 'root' ? 'published' : 'pending_review',
      revision: Number(post.row_revision) + (account.role === 'root' ? 1 : 0),
    };
  });
}
export async function withdrawPost({ user, input, env = process.env, db = pool }) {
  strictFields(input, ['requestId', 'postId', 'expectedRevision']);
  return transaction(
    { user, requestId: input.requestId, action: 'withdrawPost', input, env, db, ownSafety: true },
    async (c) => {
      const post = await loadPost(c, input.postId, user, { owner: true, lock: true });
      if (post.author_id !== user.id) fail('COMMUNITY_CONTENT_UNAVAILABLE', 404);
      expectedRevision(input.expectedRevision, post.row_revision);
      await c.query(
        "UPDATE community_posts SET status='withdrawn',pending_revision_id=NULL,row_revision=row_revision+1,updated_at=NOW(6) WHERE id=?",
        [post.id],
      );
      await c.query(
        "UPDATE community_post_revisions SET status='withdrawn' WHERE post_id=? AND status='pending_review'",
        [post.id],
      );
      return { publicId: post.public_id, status: 'withdrawn', revision: Number(post.row_revision) + 1 };
    },
  );
}
export async function deletePost({ user, input, env = process.env, db = pool }) {
  strictFields(input, ['requestId', 'postId', 'expectedRevision']);
  return transaction(
    { user, requestId: input.requestId, action: 'deletePost', input, env, db, ownSafety: true },
    async (c) => {
      const post = await loadPost(c, input.postId, user, { owner: true, lock: true });
      if (post.author_id !== user.id) fail('COMMUNITY_CONTENT_UNAVAILABLE', 404);
      expectedRevision(input.expectedRevision, post.row_revision);
      await c.query(
        "UPDATE community_posts SET status='deleted',pending_revision_id=NULL,solution_comment_id=NULL,row_revision=row_revision+1,updated_at=NOW(6) WHERE id=?",
        [post.id],
      );
      await c.query(
        "UPDATE community_post_revisions SET status='withdrawn' WHERE post_id=? AND status='pending_review'",
        [post.id],
      );
      return { publicId: post.public_id, status: 'deleted', revision: Number(post.row_revision) + 1 };
    },
  );
}
export async function moderatePost({ user, input, env = process.env, db = pool }) {
  strictFields(input, ['requestId', 'postId', 'expectedRevision', 'action', 'reason']);
  if (!['approve', 'reject', 'lock', 'unlock', 'remove', 'restore'].includes(input.action))
    fail('COMMUNITY_INVALID_INPUT');
  const reason = text(input.reason, 500);
  return transaction(
    { user, requestId: input.requestId, action: 'moderatePost', input, env, db, ownSafety: true },
    async (c, account) => {
      if (account.role !== 'root') fail('COMMUNITY_ACCESS_DENIED', 403);
      const post = await loadPost(c, input.postId, user, { moderator: true, lock: true });
      expectedRevision(input.expectedRevision, post.row_revision);
      if (['withdrawn', 'deleted'].includes(post.status)) fail('COMMUNITY_CONTENT_UNAVAILABLE', 404);
      if (input.action === 'approve') await publishRevision(c, post, post.pending_revision_id, user.id);
      else if (input.action === 'reject') {
        if (!post.pending_revision_id) fail('COMMUNITY_REVISION_CONFLICT', 409);
        await c.query("UPDATE community_post_revisions SET status='rejected' WHERE id=?", [post.pending_revision_id]);
        await c.query(
          "UPDATE community_posts SET status=IF(published_revision_id IS NULL,'rejected',status),pending_revision_id=NULL,row_revision=row_revision+1 WHERE id=?",
          [post.id],
        );
      } else {
        if (input.action === 'restore' && (post.status !== 'removed' || !post.published_revision_id))
          fail('COMMUNITY_REVISION_CONFLICT', 409);
        const status = input.action === 'remove' ? 'removed' : input.action === 'restore' ? 'published' : post.status;
        const locked = input.action === 'lock' ? 1 : input.action === 'unlock' ? 0 : post.locked;
        await c.query(
          'UPDATE community_posts SET status=?,locked=?,row_revision=row_revision+1,updated_at=NOW(6) WHERE id=?',
          [status, locked, post.id],
        );
      }
      const action = await audit(c, { actor: user.id, post, action: input.action, reason });
      await c.query(
        "UPDATE community_content_reports SET status='resolved',action_id=? WHERE post_id=? AND comment_id=0 AND status='pending'",
        [action.id, post.id],
      );
      return { publicId: post.public_id, revision: Number(post.row_revision) + 1, actionId: action.publicId };
    },
  );
}
export { listTopics as topics } from './topics.js';
export function pageOptions(input = {}) {
  const limit = Math.min(50, Math.max(1, Number(input.limit) || 20));
  const before = input.before === undefined ? '' : String(input.before);
  if (before && !/^\d{1,20}$/.test(before)) fail('COMMUNITY_INVALID_INPUT');
  return { limit: Math.floor(limit), before };
}
export async function postDtos(db, rows, user) {
  if (!rows.length) return [];
  const ids = rows.map((p) => p.id),
    marks = ids.map(() => '?').join(',');
  const [topicRows] = await db.query(
    `SELECT pt.post_id,t.slug,t.name_zh AS nameZh,t.name_en AS nameEn FROM community_post_topics pt JOIN community_topics t ON t.id=pt.topic_id WHERE pt.post_id IN (${marks}) ORDER BY t.sort_order,t.id`,
    ids,
  );
  const viewer = user?.id || '';
  const [counts] = await db.query(
    `SELECT s.post_id,COUNT(*) AS count FROM community_post_user_states s JOIN user u ON u.id=s.user_id AND u.del_flag='0' AND u.role<>'visitor' WHERE s.liked=1 AND NOT EXISTS(SELECT 1 FROM community_chat_members m WHERE m.user_id=s.user_id AND m.status='banned') AND NOT EXISTS(SELECT 1 FROM community_chat_blocks b WHERE (b.user_id=? AND b.blocked_user_id=s.user_id) OR (b.blocked_user_id=? AND b.user_id=s.user_id)) AND s.post_id IN (${marks}) GROUP BY s.post_id`,
    [viewer, viewer, ...ids],
  );
  const [commentCounts] = await db.query(
    `SELECT c.post_id,COUNT(*) AS count FROM community_comments c WHERE c.status='published' AND ${authorVisibleSql('c')} AND ${unblockedSql('c')} AND c.post_id IN (${marks}) GROUP BY c.post_id`,
    [viewer, viewer, ...ids],
  );
  const imageRows = await revisionImages(
    db,
    rows.map((p) => p.published_revision_id),
  );
  const resourceRows = await revisionResources(
    db,
    rows.map((p) => p.published_revision_id),
  );
  return rows.map((p) => ({
    resources: resourceRows
      .filter((r) => Number(r.revision_id) === Number(p.published_revision_id))
      .map((r) => resourceDto(r, p.public_id, p.content_revision)),
    images: imageRows
      .filter((i) => Number(i.revision_id) === Number(p.published_revision_id))
      .map((i) => imageDto(i, p.public_id, p.content_revision)),
    publicId: p.public_id,
    kind: p.kind,
    title: p.title,
    body: p.body,
    mentions: parseJson(p.mentions) || [],
    revision: Number(p.row_revision),
    status: p.status,
    pending: p.author_id === user?.id && Boolean(p.pending_revision_id),
    locked: Boolean(p.locked),
    resolved: Boolean(p.resolved),
    publishedAt: p.published_at,
    createdAt: p.created_at,
    topics: topicRows.filter((t) => Number(t.post_id) === Number(p.id)).map(({ post_id, ...t }) => t),
    commentCount: Number(commentCounts.find((c) => Number(c.post_id) === Number(p.id))?.count || 0),
    likeCount: Number(counts.find((c) => Number(c.post_id) === Number(p.id))?.count || 0),
    liked: Boolean(p.liked),
    subscription: p.subscription || 'unset',
    isOwn: p.author_id === user?.id,
    author: {
      ...publicGrowthProfile({ authorExp: p.author_exp, authorTitleId: p.author_title }),
      userPublicId: p.user_public_id,
      communityId: p.community_id,
      name: p.author_name || '成员',
      avatar: p.has_avatar ? `/api/community/posts/${p.public_id}/avatar` : '',
      role: p.author_role === 'root' ? 'official' : 'member',
    },
  }));
}
const POST_PROJECTION = `SELECT p.*,r.revision_no AS content_revision,r.kind,r.title,r.body,r.mentions,COALESCE(NULLIF(u.alias,''),'成员') AS author_name,u.role AS author_role,(u.head_picture IS NOT NULL AND u.head_picture<>'') AS has_avatar,g.exp AS author_exp,g.equipped_title AS author_title,i.public_id AS user_public_id,i.community_id,s.liked,s.subscription FROM community_posts p JOIN community_post_revisions r ON r.id=p.published_revision_id JOIN user u ON u.id=p.author_id LEFT JOIN user_growth g ON g.user_id=u.id LEFT JOIN community_chat_user_identities i ON i.user_id=p.author_id LEFT JOIN community_post_user_states s ON s.post_id=p.id AND s.user_id=?`;
export async function listPosts({ user, input = {}, env = process.env, db = pool }) {
  await access(db, user, { env });
  const { limit, before } = pageOptions(input),
    viewer = user?.id || '';
  const params = [viewer, viewer, viewer];
  let where = `p.status='published' AND ${authorVisibleSql('p')} AND ${unblockedSql('p')} AND COALESCE(s.hidden,0)=0`;
  if (before) {
    const cursor = await first(
      db,
      "SELECT DATE_FORMAT(published_at,'%Y-%m-%d %H:%i:%s.%f') AS published_at,id FROM community_posts WHERE id=?",
      [before],
    );
    if (!cursor) fail('COMMUNITY_INVALID_INPUT');
    where += ' AND (p.published_at<? OR (p.published_at=? AND p.id<?))';
    params.push(cursor.published_at, cursor.published_at, cursor.id);
  }
  if (!before && input.anchor) {
    const cursor = await first(
      db,
      "SELECT DATE_FORMAT(published_at,'%Y-%m-%d %H:%i:%s.%f') AS published_at,id FROM community_posts WHERE public_id=?",
      [publicId(input.anchor)],
    );
    if (cursor?.published_at) {
      where += ' AND (p.published_at<? OR (p.published_at=? AND p.id<=?))';
      params.push(cursor.published_at, cursor.published_at, cursor.id);
    }
  }
  if (input.kind) {
    if (!['share', 'question', 'thought'].includes(input.kind)) fail('COMMUNITY_INVALID_INPUT');
    where += ' AND r.kind=?';
    params.push(input.kind);
  }
  if (input.topic) {
    where +=
      ' AND EXISTS (SELECT 1 FROM community_post_topics pt JOIN community_topics t ON t.id=pt.topic_id WHERE pt.post_id=p.id AND t.slug=?)';
    params.push(text(input.topic, 40));
  }
  if (input.author) {
    where += ' AND i.public_id=?';
    params.push(input.author);
  }
  if (input.stream === 'following') {
    where +=
      ' AND EXISTS (SELECT 1 FROM community_follows f WHERE f.follower_user_id=? AND f.followee_user_id=p.author_id)';
    params.push(viewer);
  }
  if (input.stream === 'following' || !input.author) {
    where +=
      ' AND NOT EXISTS (SELECT 1 FROM community_user_mutes m WHERE m.user_id=? AND m.target_user_id=p.author_id)';
    params.push(viewer);
  }
  if (input.unanswered === 'true' || input.unanswered === true) {
    where += ` AND p.resolved=0 AND p.locked=0 AND NOT EXISTS (SELECT 1 FROM community_comments c WHERE c.post_id=p.id AND c.status='published' AND c.author_id<>p.author_id AND ${authorVisibleSql('c')} AND ${unblockedSql('c')})`;
    params.push(viewer, viewer);
  }
  if (input.q) {
    const query = text(input.q, 100);
    where += " AND (r.title LIKE ? ESCAPE '=' OR r.body LIKE ? ESCAPE '=')";
    const pattern = '%' + query.replace(/[=%_]/g, (c) => '=' + c) + '%';
    params.push(pattern, pattern);
  }
  const [rows] = await db.query(`${POST_PROJECTION} WHERE ${where} ORDER BY p.published_at DESC,p.id DESC LIMIT ?`, [
    ...params,
    limit + 1,
  ]);
  const items = rows.slice(0, limit);
  return { items: await postDtos(db, items, user), nextCursor: rows.length > limit ? String(items.at(-1).id) : null };
}
export async function postDetail({ user, id, env = process.env, db = pool }) {
  await access(db, user, { env });
  const post = await loadPost(db, id, user);
  const viewer = user?.id || '';
  const [rows] = await db.query(
    `${POST_PROJECTION} WHERE p.id=? AND p.status='published' AND ${authorVisibleSql('p')} AND ${unblockedSql('p')}`,
    [viewer, post.id, viewer, viewer],
  );
  if (!rows.length) fail('COMMUNITY_CONTENT_UNAVAILABLE', 404);
  return (await postDtos(db, rows, user))[0];
}
export async function ownPosts({ user, input = {}, env = process.env, db = pool, moderation = false }) {
  const account = await access(db, user, { env, ownSafety: true });
  if (moderation && account.role !== 'root') fail('COMMUNITY_ACCESS_DENIED', 403);
  const { limit, before } = pageOptions(input),
    params = [];
  let where = moderation ? (input.scope === 'all' ? '1=1' : 'p.pending_revision_id IS NOT NULL') : 'p.author_id=?';
  where += " AND p.status<>'deleted'";
  if (!moderation) params.push(user.id);
  if (input.postId) {
    where += ' AND p.public_id=?';
    params.push(publicId(input.postId));
  }
  if (before) {
    where += ' AND p.id<?';
    params.push(before);
  }
  const [rows] = await db.query(
    `SELECT p.id,r.id AS revisionId,r.revision_no AS contentRevision,p.public_id AS publicId,p.row_revision AS revision,p.locked,p.status,p.pending_revision_id AS pendingRevision,p.published_revision_id AS publishedRevision,r.kind,r.title,r.body,r.mentions,r.status AS revisionStatus FROM community_posts p JOIN community_post_revisions r ON r.post_id=p.id AND r.revision_no=(SELECT MAX(r2.revision_no) FROM community_post_revisions r2 WHERE r2.post_id=p.id) WHERE ${where} ORDER BY p.id DESC LIMIT ?`,
    [...params, limit + 1],
  );
  const items = [],
    selected = rows.slice(0, limit),
    revisionIds = selected.map((row) => row.revisionId);
  const [topicRows] = revisionIds.length
    ? await db.query(
        `SELECT rt.revision_id,t.slug FROM community_revision_topics rt JOIN community_topics t ON t.id=rt.topic_id WHERE rt.revision_id IN (${revisionIds.map(() => '?').join(',')})`,
        revisionIds,
      )
    : [[]];
  const resourceRows = await revisionResources(db, revisionIds);
  const imageRows = await revisionImages(db, revisionIds);
  for (const { id, revisionId, contentRevision, pendingRevision, publishedRevision, ...row } of selected) {
    const topics = topicRows.filter((topic) => Number(topic.revision_id) === Number(revisionId));
    items.push({
      ...row,
      displayStatus: ['withdrawn', 'removed'].includes(row.status) ? row.status : row.revisionStatus || row.status,
      resources: resourceRows
        .filter((r) => Number(r.revision_id) === Number(revisionId))
        .map((r) => resourceDto(r, row.publicId, contentRevision)),
      images: imageRows
        .filter((i) => Number(i.revision_id) === Number(revisionId))
        .map((i) => imageDto(i, row.publicId, contentRevision)),
      mentions: parseJson(row.mentions) || [],
      topics: topics.map((t) => t.slug),
      pending: Boolean(pendingRevision),
      hasPublishedVersion: row.status === 'published' && Boolean(publishedRevision),
    });
  }
  return { items, nextCursor: rows.length > limit ? String(rows[limit - 1].id) : null, hasMore: rows.length > limit };
}
