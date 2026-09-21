import { randomUUID, createHash } from 'node:crypto';
import pool from '../../db/index.js';
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
  publicId,
  requirePair,
  strictFields,
  text,
  transaction,
  unblockedSql,
} from './core.js';
import { audit, pageOptions } from './posts.js';

export async function createComment({ user, input, env = process.env, db = pool }) {
  strictFields(input, ['requestId', 'postId', 'replyTo', 'body', 'mentions']);
  const body = text(input.body, 1200),
    targets = input.mentions || [];
  if (!Array.isArray(targets) || targets.length > 10) fail('COMMUNITY_INVALID_INPUT');
  targets.forEach(publicId);
  return transaction({ user, requestId: input.requestId, action: 'createComment', input, env, db }, async (c) => {
    const post = await loadPost(c, input.postId, user, { lock: true });
    if (Number(post.locked)) fail('COMMUNITY_THREAD_LOCKED', 423);
    await requirePair(c, user.id, post.author_id, { lock: true });
    await identity(c, user.id);
    await mentions(c, targets, user.id);
    let reply = null;
    if (input.replyTo) {
      publicId(input.replyTo);
      reply = await first(
        c,
        `SELECT reply.* FROM community_comments reply WHERE reply.public_id=? AND reply.post_id=? AND reply.status='published' AND ${authorVisibleSql('reply')} FOR UPDATE`,
        [input.replyTo, post.id],
      );
      if (!reply) fail('COMMUNITY_CONTENT_UNAVAILABLE', 404);
      await requirePair(c, user.id, reply.author_id, { lock: true });
    }
    const id = randomUUID(),
      status = feature(env).reviewAllWrites ? 'pending_review' : 'published';
    const [result] = await c.query(
      'INSERT INTO community_comments (public_id,post_id,author_id,root_comment_id,reply_to_comment_id,body,mentions,status) VALUES (?,?,?,?,?,?,?,?)',
      [
        id,
        post.id,
        user.id,
        reply ? reply.root_comment_id || reply.id : 0,
        reply?.id || null,
        body,
        JSON.stringify([...new Set(targets)]),
        status,
      ],
    );
    if (status === 'published')
      await outbox(c, {
        key: `comment:${id}`,
        kind: 'comment',
        actorId: user.id,
        postId: post.id,
        commentId: result.insertId,
      });
    return { publicId: id, status };
  });
}
export async function withdrawComment({ user, input, env = process.env, db = pool }) {
  strictFields(input, ['requestId', 'postId', 'commentId', 'expectedRevision']);
  return transaction(
    { user, requestId: input.requestId, action: 'withdrawComment', input, env, db, ownSafety: true },
    async (c) => {
      publicId(input.commentId);
      const comment = await first(
        c,
        'SELECT c.* FROM community_comments c JOIN community_posts p ON p.id=c.post_id WHERE c.public_id=? AND p.public_id=? AND c.author_id=? FOR UPDATE',
        [input.commentId, input.postId, user.id],
      );
      if (!comment) fail('COMMUNITY_CONTENT_UNAVAILABLE', 404);
      expectedRevision(input.expectedRevision, comment.row_revision);
      await c.query("UPDATE community_comments SET status='withdrawn',row_revision=row_revision+1 WHERE id=?", [
        comment.id,
      ]);
      await c.query('UPDATE community_posts SET solution_comment_id=NULL WHERE solution_comment_id=?', [comment.id]);
      return { publicId: comment.public_id, status: 'withdrawn', revision: Number(comment.row_revision) + 1 };
    },
  );
}
export async function moderateComment({ user, input, env = process.env, db = pool }) {
  strictFields(input, ['requestId', 'postId', 'commentId', 'expectedRevision', 'action', 'reason']);
  if (!['approve', 'reject', 'remove', 'restore'].includes(input.action)) fail('COMMUNITY_INVALID_INPUT');
  const reason = text(input.reason ?? '', 500, input.action !== 'approve') || '审批通过';
  return transaction(
    { user, requestId: input.requestId, action: 'moderateComment', input, env, db, ownSafety: true },
    async (c, account) => {
      if (account.role !== 'root') fail('COMMUNITY_ACCESS_DENIED', 403);
      const post = await loadPost(c, input.postId, user, { moderator: true, lock: true });
      const comment = await first(c, 'SELECT * FROM community_comments WHERE public_id=? AND post_id=? FOR UPDATE', [
        publicId(input.commentId),
        post.id,
      ]);
      if (!comment || comment.status === 'withdrawn') fail('COMMUNITY_CONTENT_UNAVAILABLE', 404);
      expectedRevision(input.expectedRevision, comment.row_revision);
      if (['approve', 'reject'].includes(input.action) && comment.status !== 'pending_review')
        fail('COMMUNITY_REVISION_CONFLICT', 409);
      if (input.action === 'restore' && comment.status !== 'removed') fail('COMMUNITY_REVISION_CONFLICT', 409);
      const status = { approve: 'published', reject: 'rejected', remove: 'removed', restore: 'published' }[
        input.action
      ];
      if (
        status === 'published' &&
        (post.status !== 'published' ||
          !(await first(
            c,
            `SELECT candidate.id FROM community_comments candidate WHERE candidate.id=? AND ${authorVisibleSql('candidate')}`,
            [comment.id],
          )))
      )
        fail('COMMUNITY_CONTENT_UNAVAILABLE', 404);
      await c.query('UPDATE community_comments SET status=?,row_revision=row_revision+1 WHERE id=?', [
        status,
        comment.id,
      ]);
      if (status !== 'published')
        await c.query('UPDATE community_posts SET solution_comment_id=NULL WHERE solution_comment_id=?', [comment.id]);
      if (input.action === 'approve')
        await outbox(c, {
          key: `comment:${comment.public_id}`,
          kind: 'comment',
          actorId: comment.author_id,
          postId: post.id,
          commentId: comment.id,
        });
      const action = await audit(c, {
        actor: user.id,
        post,
        comment,
        action: input.action,
        reason,
        revision: comment.row_revision,
      });
      await c.query(
        "UPDATE community_content_reports SET status='resolved',action_id=? WHERE comment_id=? AND status='pending'",
        [action.id, comment.id],
      );
      return {
        publicId: comment.public_id,
        status,
        actionId: action.publicId,
        revision: Number(comment.row_revision) + 1,
      };
    },
  );
}
export async function commentState({ user, input, env = process.env, db = pool }) {
  strictFields(input, ['requestId', 'postId', 'commentId', 'liked']);
  if (typeof input.liked !== 'boolean') fail('COMMUNITY_INVALID_INPUT');
  return transaction({ user, requestId: input.requestId, action: 'commentState', input, env, db }, async (c) => {
    const post = await loadPost(c, input.postId, user, { lock: true });
    const comment = await first(
      c,
      `SELECT c.id,c.author_id FROM community_comments c WHERE c.public_id=? AND c.post_id=? AND c.status='published' AND ${authorVisibleSql('c')} AND ${unblockedSql('c')} FOR UPDATE`,
      [publicId(input.commentId), post.id, user.id, user.id],
    );
    if (!comment) fail('COMMUNITY_CONTENT_UNAVAILABLE', 404);
    if (input.liked)
      await c.query('INSERT IGNORE INTO community_comment_likes (user_id,comment_id) VALUES (?,?)', [
        user.id,
        comment.id,
      ]);
    else await c.query('DELETE FROM community_comment_likes WHERE user_id=? AND comment_id=?', [user.id, comment.id]);
    if (input.liked && comment.author_id !== user.id) await queueLike(c, user.id, post.id, comment.id);
    const count = await first(c, 'SELECT COUNT(*) AS total FROM community_comment_likes WHERE comment_id=?', [
      comment.id,
    ]);
    return { publicId: input.commentId, liked: input.liked, likeCount: Number(count.total) };
  });
}
export async function postState({ user, input, env = process.env, db = pool }) {
  strictFields(input, ['requestId', 'postId', 'liked', 'subscription', 'hidden']);
  if (
    (input.liked !== undefined && typeof input.liked !== 'boolean') ||
    (input.hidden !== undefined && typeof input.hidden !== 'boolean') ||
    (input.subscription !== undefined && !['enabled', 'disabled'].includes(input.subscription))
  )
    fail('COMMUNITY_INVALID_INPUT');
  return transaction(
    {
      user,
      requestId: input.requestId,
      action: 'postState',
      input,
      env,
      db,
      ownSafety: input.liked !== true && input.subscription !== 'enabled',
    },
    async (c) => {
      const reducing = input.liked !== true && input.subscription !== 'enabled';
      const previous = reducing
        ? await first(
            c,
            'SELECT p.* FROM community_posts p JOIN community_post_user_states s ON s.post_id=p.id AND s.user_id=? WHERE p.public_id=? FOR UPDATE',
            [user.id, publicId(input.postId)],
          )
        : null;
      const post = previous || (await loadPost(c, input.postId, user, { lock: true }));
      if (!reducing) await requirePair(c, user.id, post.author_id, { lock: true });
      await c.query('INSERT IGNORE INTO community_post_user_states (user_id,post_id) VALUES (?,?)', [user.id, post.id]);
      const row = await first(c, 'SELECT * FROM community_post_user_states WHERE user_id=? AND post_id=? FOR UPDATE', [
        user.id,
        post.id,
      ]);
      const liked = input.liked === undefined ? Boolean(row.liked) : input.liked,
        subscription = input.subscription || row.subscription,
        hidden = input.hidden === undefined ? Boolean(row.hidden) : input.hidden;
      await c.query(
        'UPDATE community_post_user_states SET liked=?,subscription=?,hidden=? WHERE user_id=? AND post_id=?',
        [liked ? 1 : 0, subscription, hidden ? 1 : 0, user.id, post.id],
      );
      if (input.liked === true && !Number(row.liked) && post.author_id !== user.id)
        await queueLike(c, user.id, post.id);
      return { publicId: post.public_id, liked, subscription, hidden };
    },
  );
}
export async function resolveQuestion({ user, input, env = process.env, db = pool }) {
  strictFields(input, ['requestId', 'postId', 'expectedRevision', 'resolved', 'commentId']);
  if (typeof input.resolved !== 'boolean') fail('COMMUNITY_INVALID_INPUT');
  return transaction({ user, requestId: input.requestId, action: 'resolveQuestion', input, env, db }, async (c) => {
    const post = await loadPost(c, input.postId, user, { lock: true });
    if (post.author_id !== user.id) fail('COMMUNITY_ACCESS_DENIED', 403);
    expectedRevision(input.expectedRevision, post.row_revision);
    const helpTopic = await first(
      c,
      "SELECT t.id FROM community_post_topics pt JOIN community_topics t ON t.id=pt.topic_id WHERE pt.post_id=? AND t.slug='help'",
      [post.id],
    );
    if (!helpTopic) fail('COMMUNITY_INVALID_INPUT');
    let solution = null;
    if (input.resolved && input.commentId) {
      solution = await first(
        c,
        `SELECT c.id,c.author_id FROM community_comments c WHERE c.public_id=? AND c.post_id=? AND c.status='published' AND ${authorVisibleSql('c')} AND ${unblockedSql('c')} FOR UPDATE`,
        [publicId(input.commentId), post.id, user.id, user.id],
      );
      if (!solution) fail('COMMUNITY_CONTENT_UNAVAILABLE', 404);
    }
    await c.query(
      'UPDATE community_posts SET resolved=?,solution_comment_id=?,row_revision=row_revision+1 WHERE id=?',
      [input.resolved ? 1 : 0, solution?.id || null, post.id],
    );
    if (solution && solution.author_id !== user.id) {
      await c.query('INSERT IGNORE INTO community_accepted_answers(comment_id,user_id) VALUES (?,?)', [
        solution.id,
        solution.author_id,
      ]);
      await outbox(c, {
        key: `growth:answer:${solution.id}`,
        kind: 'growth',
        actorId: solution.author_id,
        postId: post.id,
        commentId: solution.id,
      });
    }
    return { publicId: post.public_id, resolved: input.resolved, revision: Number(post.row_revision) + 1 };
  });
}
export async function listComments({ user, input, env = process.env, db = pool }) {
  await access(db, user, { env });
  const post = await loadPost(db, input.postId, user),
    viewer = user?.id || '';
  const { limit, before } = pageOptions(input);
  let root = 0;
  if (input.root) {
    const r = await first(
      db,
      'SELECT id FROM community_comments WHERE public_id=? AND post_id=? AND root_comment_id=0',
      [publicId(input.root), post.id],
    );
    if (!r) fail('COMMUNITY_CONTENT_UNAVAILABLE', 404);
    root = r.id;
  }
  const params = [viewer, viewer, viewer, viewer, viewer, viewer, post.id, root, viewer, viewer, viewer, viewer];
  let range = '';
  if (before) {
    range = ' AND c.id>?';
    params.push(before);
  }
  const [rows] = await db.query(
    `SELECT c.*,EXISTS(SELECT 1 FROM community_comment_likes likes WHERE likes.comment_id=c.id AND likes.user_id=?) AS liked,(SELECT COUNT(*) FROM community_comment_likes likes WHERE likes.comment_id=c.id) AS like_count,(${authorVisibleSql('c')} AND ${unblockedSql('c')}) AS author_visible,(${authorVisibleSql('reply')} AND ${unblockedSql('reply')}) AS reply_visible,i.public_id AS user_public_id,i.community_id,COALESCE(NULLIF(u.alias,''),'成员') AS name,reply.public_id AS reply_public_id,COALESCE(NULLIF(ru.alias,''),'成员') AS reply_name,
    (SELECT COUNT(*) FROM community_comments children WHERE children.root_comment_id=c.id AND children.status='published' AND ${authorVisibleSql('children')} AND ${unblockedSql('children')}) AS reply_count
    FROM community_comments c LEFT JOIN user u ON u.id=c.author_id LEFT JOIN community_chat_user_identities i ON i.user_id=c.author_id LEFT JOIN community_comments reply ON reply.id=c.reply_to_comment_id LEFT JOIN user ru ON ru.id=reply.author_id
    WHERE c.post_id=? AND c.root_comment_id=? AND EXISTS(SELECT 1 FROM community_posts current_post WHERE current_post.id=c.post_id AND current_post.status='published' AND ${authorVisibleSql('current_post')} AND ${unblockedSql('current_post')}) AND c.status IN ('published','withdrawn','removed') AND (c.root_comment_id=0 OR (${authorVisibleSql('c')} AND ${unblockedSql('c')}))${range} HAVING c.status='published' OR (c.root_comment_id=0 AND reply_count>0) ORDER BY c.id LIMIT ?`,
    [viewer, ...params, limit + 1],
  );
  return {
    items: rows.slice(0, limit).map((c) => ({
      publicId: c.public_id,
      body: c.status === 'published' && Number(c.author_visible) ? c.body : '',
      status: Number(c.author_visible) ? c.status : 'unavailable',
      revision: Number(c.row_revision),
      createdAt: c.created_at,
      isOwn: c.author_id === user?.id,
      author: Number(c.author_visible)
        ? { name: c.name, userPublicId: c.user_public_id, communityId: c.community_id, avatar: '' }
        : null,
      replyTo:
        c.reply_public_id && Number(c.reply_visible) ? { publicId: c.reply_public_id, name: c.reply_name } : null,
      replyCount: Number(c.reply_count),
      liked: c.status === 'published' && Boolean(Number(c.author_visible)) && Boolean(Number(c.liked)),
      likeCount: c.status === 'published' && Number(c.author_visible) ? Number(c.like_count) : 0,
      isSolution:
        c.status === 'published' &&
        Boolean(Number(c.author_visible)) &&
        Number(post.solution_comment_id) === Number(c.id),
    })),
    nextCursor: rows.length > limit ? String(rows[limit - 1].id) : null,
  };
}
export async function commentContext({ user, input, env = process.env, db = pool }) {
  await access(db, user, { env });
  const post = await loadPost(db, input.postId, user),
    viewer = user?.id || '';
  const c = await first(
    db,
    `SELECT c.*,root.public_id AS root_public_id FROM community_comments c LEFT JOIN community_comments root ON root.id=c.root_comment_id WHERE c.public_id=? AND c.post_id=? AND c.status='published' AND ${authorVisibleSql('c')} AND ${unblockedSql('c')} AND EXISTS(SELECT 1 FROM community_posts current_post WHERE current_post.id=c.post_id AND current_post.status='published' AND ${authorVisibleSql('current_post')} AND ${unblockedSql('current_post')})`,
    [publicId(input.commentId), post.id, viewer, viewer, viewer, viewer],
  );
  if (!c) fail('COMMUNITY_CONTENT_UNAVAILABLE', 404);
  return {
    commentId: c.public_id,
    root: c.root_public_id || null,
    before: String(BigInt(c.root_comment_id || c.id) - 1n),
    replyBefore: String(BigInt(c.id) - 1n),
  };
}
export async function ownComments({ user, input = {}, env = process.env, db = pool }) {
  await access(db, user, { env, ownSafety: true });
  const { limit, before } = pageOptions(input);
  const [rows] = await db.query(
    `SELECT c.id,c.public_id AS publicId,p.public_id AS postId,c.body,c.status,c.row_revision AS revision,parent.public_id AS replyTo,(c.status='published' AND p.status='published' AND ${authorVisibleSql('p')} AND ${unblockedSql('p')}) AS canOpen FROM community_comments c JOIN community_posts p ON p.id=c.post_id LEFT JOIN community_comments parent ON parent.id=c.reply_to_comment_id WHERE c.author_id=? AND c.status<>'withdrawn' ${before ? 'AND c.id<?' : ''} ORDER BY c.id DESC LIMIT ?`,
    [user.id, user.id, user.id, ...(before ? [before] : []), limit + 1],
  );
  return {
    items: rows.slice(0, limit).map(({ id, ...row }) => row),
    nextCursor: rows.length > limit ? String(rows[limit - 1].id) : null,
  };
}

// Stable event identity survives unlike/re-like and worker retries.
async function queueLike(db, actorId, postId, commentId = null) {
  await identity(db, actorId);
  const actorKey = createHash('sha256').update(actorId).digest('hex');
  await outbox(db, {
    key: `like:${commentId ? 'comment' : 'post'}:${commentId || postId}:${actorKey}`,
    kind: 'like',
    actorId,
    postId,
    commentId,
  });
}
