import { randomUUID } from 'node:crypto';
import pool from '../../db/index.js';
import {
  access,
  authorVisibleSql,
  unblockedSql,
  expectedRevision,
  fail,
  first,
  loadPost,
  outbox,
  publicId,
  strictFields,
  text,
  transaction,
} from './core.js';
import { pageOptions } from './posts.js';
export async function reportContent({ user, input, env = process.env, db = pool }) {
  strictFields(input, ['requestId', 'postId', 'commentId', 'reason', 'detail']);
  const reason = text(input.reason, 32),
    detail = text(input.detail || '', 500, false);
  if (!['spam', 'abuse', 'privacy', 'illegal', 'other'].includes(reason)) fail('COMMUNITY_INVALID_INPUT');
  return transaction(
    { user, requestId: input.requestId, action: 'reportContent', input, env, db, ownSafety: true },
    async (c) => {
      const post = await loadPost(c, input.postId, user, { lock: true });
      let commentId = 0;
      if (input.commentId) {
        const comment = await first(
          c,
          `SELECT c.id FROM community_comments c WHERE c.public_id=? AND c.post_id=? AND c.status='published' AND ${authorVisibleSql('c')} AND ${unblockedSql('c')}`,
          [publicId(input.commentId), post.id, user.id, user.id],
        );
        if (!comment) fail('COMMUNITY_CONTENT_UNAVAILABLE', 404);
        commentId = comment.id;
      }
      const old = await first(
        c,
        'SELECT public_id,status FROM community_content_reports WHERE reporter_id=? AND post_id=? AND comment_id=? FOR UPDATE',
        [user.id, post.id, commentId],
      );
      if (old) return { publicId: old.public_id, status: old.status };
      const id = randomUUID();
      await c.query(
        'INSERT INTO community_content_reports (public_id,reporter_id,post_id,comment_id,reason,detail) VALUES (?,?,?,?,?,?)',
        [id, user.id, post.id, commentId, reason, detail],
      );
      return { publicId: id, status: 'pending' };
    },
  );
}
export async function appeal({ user, input, env = process.env, db = pool }) {
  strictFields(input, ['requestId', 'actionId', 'body']);
  const body = text(input.body, 500);
  return transaction(
    { user, requestId: input.requestId, action: 'appeal', input, env, db, ownSafety: true },
    async (c) => {
      const action = await first(
        c,
        'SELECT * FROM community_moderation_actions WHERE public_id=? AND subject_id=? FOR UPDATE',
        [publicId(input.actionId), user.id],
      );
      if (!action || !['reject', 'remove', 'lock'].includes(action.action)) fail('COMMUNITY_CONTENT_UNAVAILABLE', 404);
      const existing = await first(
        c,
        'SELECT public_id,status FROM community_appeals WHERE action_id=? AND author_id=?',
        [action.id, user.id],
      );
      if (existing) return { publicId: existing.public_id, status: existing.status };
      const id = randomUUID();
      await c.query('INSERT INTO community_appeals (public_id,action_id,author_id,body) VALUES (?,?,?,?)', [
        id,
        action.id,
        user.id,
        body,
      ]);
      return { publicId: id, status: 'pending' };
    },
  );
}
export async function reviewAppeal({ user, input, env = process.env, db = pool }) {
  strictFields(input, ['requestId', 'appealId', 'expectedRevision', 'status', 'reason']);
  const reason = text(input.reason, 500);
  if (!['accepted', 'rejected'].includes(input.status)) fail('COMMUNITY_INVALID_INPUT');
  return transaction(
    { user, requestId: input.requestId, action: 'reviewAppeal', input, env, db, ownSafety: true },
    async (c, account) => {
      if (account.role !== 'root') fail('COMMUNITY_ACCESS_DENIED', 403);
      const row = await first(
        c,
        'SELECT a.*,m.post_id,m.comment_id FROM community_appeals a JOIN community_moderation_actions m ON m.id=a.action_id WHERE a.public_id=? FOR UPDATE',
        [publicId(input.appealId)],
      );
      if (!row || row.status !== 'pending') fail('COMMUNITY_CONTENT_UNAVAILABLE', 404);
      expectedRevision(input.expectedRevision, row.row_revision);
      await c.query(
        'UPDATE community_appeals SET status=?,result=?,reviewed_by=?,row_revision=row_revision+1 WHERE id=?',
        [input.status, reason, user.id, row.id],
      );
      // Acceptance records a review result. Restoration still requires a separate exact-version moderation action.
      const id = randomUUID();
      const [created] = await c.query(
        'INSERT INTO community_moderation_actions (public_id,actor_id,subject_id,post_id,comment_id,target_revision,action,reason) VALUES (?,?,?,?,?,?,?,?)',
        [id, user.id, row.author_id, row.post_id, row.comment_id, row.row_revision, `appeal_${input.status}`, reason],
      );
      await outbox(c, {
        key: `action:${id}`,
        kind: 'result',
        actorId: user.id,
        postId: row.post_id,
        actionId: created.insertId,
      });
      return { publicId: row.public_id, status: input.status, revision: Number(row.row_revision) + 1 };
    },
  );
}
export async function results({ user, input = {}, env = process.env, db = pool }) {
  await access(db, user, { env, ownSafety: true });
  const { limit, before } = pageOptions(input);
  const [rows] = await db.query(
    `SELECT a.id,a.public_id AS publicId,a.action,a.reason,a.created_at AS createdAt,p.public_id AS postId,(p.status='published' AND ${authorVisibleSql('p')} AND ${unblockedSql('p')}) AS canOpen,r.title,ap.public_id AS appealId,ap.status AS appealStatus,ap.result AS appealResult FROM community_moderation_actions a JOIN community_posts p ON p.id=a.post_id LEFT JOIN community_post_revisions r ON r.post_id=p.id AND r.revision_no=(SELECT MAX(r2.revision_no) FROM community_post_revisions r2 WHERE r2.post_id=p.id) LEFT JOIN community_appeals ap ON ap.action_id=a.id AND ap.author_id=? WHERE a.subject_id=? AND p.status<>'deleted' AND NOT (a.action='approve' AND a.actor_id=a.subject_id AND a.reason='Root self-publication') ${before ? 'AND a.id<?' : ''} ORDER BY a.id DESC LIMIT ?`,
    [user.id, user.id, user.id, user.id, ...(before ? [before] : []), limit + 1],
  );
  return {
    items: rows.slice(0, limit).map(({ id, ...r }) => r),
    nextCursor: rows.length > limit ? String(rows[limit - 1].id) : null,
  };
}
export async function moderationQueue({ user, input = {}, env = process.env, db = pool }) {
  const account = await access(db, user, { env, ownSafety: true });
  if (account.role !== 'root') fail('COMMUNITY_ACCESS_DENIED', 403);
  const { limit, before } = pageOptions(input);
  const type = input.type || 'reports';
  let sql;
  if (type === 'reports')
    sql = `SELECT x.id,x.public_id AS publicId,x.reason,x.detail,x.status,p.public_id AS postId,p.row_revision AS revision,c.public_id AS commentId,c.row_revision AS commentRevision FROM community_content_reports x JOIN community_posts p ON p.id=x.post_id LEFT JOIN community_comments c ON c.id=x.comment_id WHERE x.status='pending'`;
  else if (type === 'appeals')
    sql = `SELECT x.id,x.public_id AS publicId,x.body,x.status,x.row_revision AS revision,a.reason,a.action,p.public_id AS postId FROM community_appeals x JOIN community_moderation_actions a ON a.id=x.action_id JOIN community_posts p ON p.id=a.post_id WHERE x.status='pending'`;
  else if (type === 'comments')
    sql = `SELECT x.id,x.public_id AS publicId,x.body,x.status,x.row_revision AS revision,p.public_id AS postId FROM community_comments x JOIN community_posts p ON p.id=x.post_id WHERE x.status='pending_review'`;
  else fail('COMMUNITY_INVALID_INPUT');
  const [rows] = await db.query(sql + (before ? ' AND x.id<?' : '') + ' ORDER BY x.id DESC LIMIT ?', [
    ...(before ? [before] : []),
    limit + 1,
  ]);
  return {
    items: rows.slice(0, limit).map(({ id, ...row }) => row),
    nextCursor: rows.length > limit ? String(rows[limit - 1].id) : null,
  };
}
export async function dismissReport({ user, input, env = process.env, db = pool }) {
  strictFields(input, ['requestId', 'reportId', 'reason']);
  const reason = text(input.reason, 500);
  return transaction(
    { user, requestId: input.requestId, action: 'dismissReport', input, env, db, ownSafety: true },
    async (c, account) => {
      if (account.role !== 'root') fail('COMMUNITY_ACCESS_DENIED', 403);
      const report = await first(
        c,
        "SELECT * FROM community_content_reports WHERE public_id=? AND status='pending' FOR UPDATE",
        [publicId(input.reportId)],
      );
      if (!report) fail('COMMUNITY_REVISION_CONFLICT', 409);
      const id = randomUUID();
      const [created] = await c.query(
        'INSERT INTO community_moderation_actions(public_id,actor_id,subject_id,post_id,comment_id,target_revision,action,reason) VALUES(?,?,?,?,?,0,?,?)',
        [id, user.id, report.reporter_id, report.post_id, report.comment_id || null, 'report_dismissed', reason],
      );
      await c.query("UPDATE community_content_reports SET status='dismissed',action_id=? WHERE id=?", [
        created.insertId,
        report.id,
      ]);
      await outbox(c, {
        key: `action:${id}`,
        kind: 'result',
        actorId: user.id,
        postId: report.post_id,
        actionId: created.insertId,
      });
      return { publicId: report.public_id, status: 'dismissed' };
    },
  );
}
