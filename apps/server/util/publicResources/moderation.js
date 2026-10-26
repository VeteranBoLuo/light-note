import { persistPublicResourceAchievements } from './growthMetrics.js';
import { randomUUID } from 'node:crypto';
import pool from '../../db/index.js';
import { access, audit, date, fail, fields, first, json, ready, text, uuid, version, write } from './core.js';
import { cancelPending } from './publications.js';
import { lockLiveSource } from './material.js';
import { loadVisible, legacyKey } from './read.js';
import { PUBLIC_RESOURCE_LIMITS } from '@lightnote/shared/public-resources';

export async function queue({ user, input = {}, db = pool, env = process.env }) {
  await access(db, user, { root: true });
  await ready(db, env, 'safety');
  fields(input, ['page', 'pageSize', 'status', 'q', 'kind']);
  const page = Math.max(1, Math.min(10000, Math.trunc(Number(input.page) || 1))),
    status = input.status || 'pending';
  if (!['pending', 'published', 'removed', 'reports'].includes(status)) fail('INVALID_INPUT');
  const pageSize = Math.max(1, Math.min(PUBLIC_RESOURCE_LIMITS.workspace, Math.trunc(Number(input.pageSize) || 20)));
  const q = text(input.q || '', 200, false),
    kind = input.kind || 'all';
  if (!['all', 'note', 'bookmark'].includes(kind)) fail('INVALID_INPUT');
  if (status === 'reports') {
    const total = Number(
      (await first(db, "SELECT COUNT(*) AS count FROM public_resource_reports WHERE status='pending'")).count,
    );
    const [rows] = await db.query(
      `SELECT g.public_id,g.reason,g.version,g.created_at,p.public_id AS publication_id,r.title,p.kind,r.revision,COALESCE(NULLIF(u.alias,''),'成员') AS author_name FROM public_resource_reports g JOIN public_resource_publications p ON p.id=g.publication_id JOIN public_resource_revisions r ON r.id=g.revision_id JOIN user u ON u.id=${legacyKey('p.owner_id')} WHERE g.status='pending' ORDER BY g.id LIMIT 20 OFFSET ?`,
      [(page - 1) * 20],
    );
    return {
      items: rows.map((r) => ({
        reportId: r.public_id,
        publicId: r.publication_id,
        title: r.title,
        authorName: r.author_name,
        kind: r.kind,
        revision: Number(r.revision),
        reason: r.reason,
        version: Number(r.version),
        createdAt: date(r.created_at),
      })),
      total,
      page,
      pageSize: 20,
      hasMore: page * 20 < total,
    };
  }
  let where =
    status === 'pending'
      ? 'p.pending_revision_id IS NOT NULL AND p.removed=0 AND p.withdrawn=0'
      : status === 'removed'
        ? 'p.removed=1'
        : 'p.published_revision_id IS NOT NULL AND p.removed=0 AND p.withdrawn=0';
  const pointer = status === 'published' ? 'published_revision_id' : 'latest_revision_id';
  const params = [];
  if (q) {
    where += ' AND (LOCATE(?,r.title)>0 OR LOCATE(?,u.alias)>0)';
    params.push(q, q);
  }
  if (kind !== 'all') {
    where += ' AND p.kind=?';
    params.push(kind);
  }
  const joins = `FROM public_resource_publications p JOIN public_resource_revisions r ON r.id=p.${pointer} JOIN user u ON u.id=${legacyKey('p.owner_id')} LEFT JOIN public_resource_review_jobs j ON j.revision_id=r.id`;
  const total = Number((await first(db, `SELECT COUNT(*) AS count ${joins} WHERE ${where}`, params)).count);
  const [rows] = await db.query(
    `SELECT p.public_id,p.kind,p.version,p.published_revision_id,r.title,r.revision,r.created_at,COALESCE(NULLIF(u.alias,''),'成员') AS author_name,j.status AS ai_status,j.result_json ${joins} WHERE ${where} ORDER BY r.id LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  return {
    items: rows.map((r) => ({
      publicId: r.public_id,
      kind: r.kind,
      title: r.title,
      version: Number(r.version),
      revision: Number(r.revision),
      authorName: r.author_name,
      createdAt: date(r.created_at),
      isUpdate: Boolean(r.published_revision_id),
      aiStatus: r.ai_status,
      ai: json(r.result_json),
    })),
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  };
}
export async function moderationDetail({ user, id, db = pool, env = process.env }) {
  await access(db, user, { root: true });
  await ready(db, env, 'safety');
  uuid(id);
  const p = await first(db, 'SELECT * FROM public_resource_publications WHERE public_id=?', [id]);
  if (!p) fail('UNAVAILABLE', 404);
  const [revisions] = await db.query(
    'SELECT r.revision,r.title,r.body,r.url,r.description,r.status,r.reason,r.created_at,j.status AS ai_status,j.result_json,j.reason_code,j.policy_version,j.request_id,j.created_at AS ai_created_at,j.finished_at FROM public_resource_revisions r LEFT JOIN public_resource_review_jobs j ON j.revision_id=r.id WHERE r.id IN (?,?)',
    [p.latest_revision_id, p.published_revision_id],
  );
  const latest = await first(db, 'SELECT revision FROM public_resource_revisions WHERE id=?', [p.latest_revision_id]);
  const published = p.published_revision_id
    ? await first(db, 'SELECT revision FROM public_resource_revisions WHERE id=?', [p.published_revision_id])
    : null;
  const author = await first(db, "SELECT COALESCE(NULLIF(alias,''),'成员') AS name FROM user WHERE id=?", [p.owner_id]);
  const [actions] = await db.query(
    `SELECT a.public_id,a.action,a.reason,a.version,a.created_at,r.revision,COALESCE(NULLIF(u.alias,''),'成员') AS actor_name FROM public_resource_actions a LEFT JOIN public_resource_revisions r ON r.id=a.revision_id LEFT JOIN user u ON u.id=${legacyKey('a.actor_id')} WHERE a.publication_id=? ORDER BY a.id DESC LIMIT 100`,
    [p.id],
  );
  const [reports] = await db.query(
    'SELECT g.public_id,g.reason,g.status,g.version,g.handled_reason,g.created_at,r.revision,r.title,r.body,r.url,r.description FROM public_resource_reports g JOIN public_resource_revisions r ON r.id=g.revision_id WHERE g.publication_id=? ORDER BY g.id DESC LIMIT 50',
    [p.id],
  );
  return {
    publicId: p.public_id,
    kind: p.kind,
    version: Number(p.version),
    removed: Boolean(p.removed),
    withdrawn: Boolean(p.withdrawn),
    hasPending: Boolean(p.pending_revision_id),
    authorName: author?.name || '',
    reason: p.reason,
    latestRevision: Number(latest?.revision) || null,
    publishedRevision: Number(published?.revision) || null,
    revisions: revisions.map((r) => ({
      revision: Number(r.revision),
      title: r.title,
      body: r.body,
      url: r.url,
      description: r.description,
      status: r.status,
      reason: r.reason,
      createdAt: date(r.created_at),
      aiStatus: r.ai_status,
      ai: json(r.result_json),
      aiReason: r.reason_code,
      aiPolicy: r.policy_version,
      aiRequestId: r.request_id,
      aiCreatedAt: date(r.ai_created_at),
      aiFinishedAt: date(r.finished_at),
    })),
    actions: actions.map((a) => ({
      publicId: a.public_id,
      action: a.action,
      actorName: a.actor_name,
      reason: a.reason,
      version: Number(a.version),
      revision: Number(a.revision) || null,
      createdAt: date(a.created_at),
    })),
    reports: reports.map((g) => ({
      reportId: g.public_id,
      reason: g.reason,
      status: g.status,
      version: Number(g.version),
      handledReason: g.handled_reason,
      createdAt: date(g.created_at),
      evidence: { revision: Number(g.revision), title: g.title, body: g.body, url: g.url, description: g.description },
    })),
  };
}
export async function decide({ user, id, input, db = pool, env = process.env, batchId = null }) {
  fields(input, ['requestId', 'expectedVersion', 'action', 'reason']);
  uuid(id);
  if (!['approve', 'reject', 'remove', 'unlock'].includes(input.action)) fail('INVALID_INPUT');
  const reason = text(input.reason || '', 500, ['reject', 'remove'].includes(input.action));
  return write(
    { user, input: { ...input, id }, db, env, action: 'moderate', root: true, mode: 'safety', batchId },
    async (c) => {
      let p = await first(c, 'SELECT * FROM public_resource_publications WHERE public_id=?', [id]);
      if (!p) fail('UNAVAILABLE', 404);
      // Author lifecycle -> source -> publication matches submit/delete/save lock order.
      if (input.action === 'approve') {
        await access(c, { id: p.owner_id, role: 'user' }, { lock: true });
        await lockLiveSource(c, p);
      }
      p = await first(c, 'SELECT * FROM public_resource_publications WHERE public_id=? FOR UPDATE', [id]);
      version(input.expectedVersion, p.version);
      if (p.published_revision_id) await persistPublicResourceAchievements(p.owner_id, { db: c, env });
      const revisionId = p.pending_revision_id;
      if (['approve', 'reject'].includes(input.action)) {
        if (!revisionId || Number(p.removed) || Number(p.withdrawn)) fail('VERSION_CONFLICT', 409);
        const revision = await first(
          c,
          'SELECT status FROM public_resource_revisions WHERE id=? AND publication_id=? FOR UPDATE',
          [revisionId, p.id],
        );
        if (revision?.status !== 'pending_review') fail('VERSION_CONFLICT', 409);
        await c.query('UPDATE public_resource_revisions SET status=?,reason=?,reviewed_at=NOW(6) WHERE id=?', [
          input.action === 'approve' ? 'approved' : 'rejected',
          reason,
          revisionId,
        ]);
        await c.query(
          "UPDATE public_resource_review_jobs SET status='obsolete',lease_token=NULL,lease_until=NULL,finished_at=NOW(6) WHERE revision_id=? AND status IN ('pending','processing')",
          [revisionId],
        );
        await c.query(
          `UPDATE public_resource_publications SET pending_revision_id=NULL,${input.action === 'approve' ? 'published_revision_id=?,published_at=NOW(6),' : ''}reason=?,version=version+1,updated_at=NOW(6) WHERE id=?`,
          [...(input.action === 'approve' ? [revisionId] : []), reason, p.id],
        );
      } else {
        if (input.action === 'unlock' && !Number(p.removed)) fail('VERSION_CONFLICT', 409);
        await cancelPending(c, p);
        await c.query(
          'UPDATE public_resource_publications SET removed=?,withdrawn=1,published_revision_id=NULL,pending_revision_id=NULL,reason=?,version=version+1,updated_at=NOW(6) WHERE id=?',
          [input.action === 'remove' ? 1 : 0, reason, p.id],
        );
      }
      if (input.action === 'approve') await persistPublicResourceAchievements(p.owner_id, { db: c, env });
      await audit(c, {
        publication: p,
        revision: revisionId || p.published_revision_id || p.latest_revision_id,
        actor: user.id,
        action: input.action,
        reason,
        notify: true,
        notificationBatchId: batchId,
      });
      return { publicId: p.public_id, version: Number(p.version) + 1 };
    },
  );
}
export async function report({ user, id, input, db = pool, env = process.env }) {
  fields(input, ['requestId', 'revision', 'reason']);
  uuid(id);
  const reason = text(input.reason, 500);
  return write({ user, input: { ...input, id }, db, env, action: 'report', mode: 'read' }, async (c) => {
    const p = await loadVisible(c, id, user, { lock: true });
    version(input.revision, p.revision);
    const old = await first(c, 'SELECT public_id FROM public_resource_reports WHERE reporter_id=? AND revision_id=?', [
      user.id,
      p.published_revision_id,
    ]);
    if (old) return { reportId: old.public_id };
    const reportId = randomUUID();
    await c.query(
      'INSERT INTO public_resource_reports(public_id,reporter_id,publication_id,revision_id,reason) VALUES(?,?,?,?,?)',
      [reportId, user.id, p.id, p.published_revision_id, reason],
    );
    return { reportId };
  });
}
export async function handleReport({ user, id, input, db = pool, env = process.env }) {
  fields(input, ['requestId', 'expectedVersion', 'publicationVersion', 'action', 'reason']);
  uuid(id);
  if (!['dismiss', 'remove'].includes(input.action)) fail('INVALID_INPUT');
  const reason = text(input.reason || '', 500, input.action === 'remove');
  return write(
    { user, input: { ...input, id }, db, env, action: 'report-handle', root: true, mode: 'safety' },
    async (c) => {
      const g = await first(c, 'SELECT * FROM public_resource_reports WHERE public_id=?', [id]);
      if (!g) fail('UNAVAILABLE', 404);
      const p = await first(c, 'SELECT * FROM public_resource_publications WHERE id=? FOR UPDATE', [g.publication_id]);
      const current = await first(c, 'SELECT * FROM public_resource_reports WHERE id=? FOR UPDATE', [g.id]);
      version(input.expectedVersion, current.version);
      if (current.status !== 'pending') fail('VERSION_CONFLICT', 409);
      if (input.action === 'remove') {
        version(input.publicationVersion, p.version);
        if (p.published_revision_id) await persistPublicResourceAchievements(p.owner_id, { db: c, env });
        await cancelPending(c, p);
        await c.query(
          'UPDATE public_resource_publications SET removed=1,withdrawn=1,published_revision_id=NULL,pending_revision_id=NULL,reason=?,version=version+1,updated_at=NOW(6) WHERE id=?',
          [reason, p.id],
        );
        await audit(c, {
          publication: p,
          revision: g.revision_id,
          actor: user.id,
          action: 'remove',
          reason,
          notify: true,
        });
      }
      await c.query(
        'UPDATE public_resource_reports SET status=?,handled_by=?,handled_reason=?,version=version+1 WHERE id=?',
        [input.action === 'remove' ? 'removed' : 'dismissed', user.id, reason, g.id],
      );
      if (input.action === 'dismiss')
        await audit(c, {
          publication: p,
          revision: g.revision_id,
          actor: user.id,
          action: 'report_dismiss',
          reason,
          resultVersion: Number(p.version),
        });
      return { reportId: id, version: Number(current.version) + 1 };
    },
  );
}
export async function reportDetail({ user, id, db = pool, env = process.env }) {
  await access(db, user, { root: true });
  await ready(db, env, 'safety');
  uuid(id);
  const g = await first(
    db,
    'SELECT g.*,p.public_id AS publication_public_id,p.version AS publication_version,p.kind,r.revision,r.title,r.body,r.url,r.description,j.status AS ai_status,j.result_json,j.reason_code,j.policy_version,j.request_id,j.created_at AS ai_created_at,j.finished_at FROM public_resource_reports g JOIN public_resource_publications p ON p.id=g.publication_id JOIN public_resource_revisions r ON r.id=g.revision_id LEFT JOIN public_resource_review_jobs j ON j.revision_id=r.id WHERE g.public_id=?',
    [id],
  );
  if (!g) fail('UNAVAILABLE', 404);
  return {
    reportId: g.public_id,
    publicId: g.publication_public_id,
    publicationVersion: Number(g.publication_version),
    reason: g.reason,
    status: g.status,
    version: Number(g.version),
    handledReason: g.handled_reason,
    createdAt: date(g.created_at),
    evidence: {
      kind: g.kind,
      revision: Number(g.revision),
      title: g.title,
      body: g.body,
      url: g.url,
      description: g.description,
      aiStatus: g.ai_status,
      ai: json(g.result_json),
      aiReason: g.reason_code,
      aiPolicy: g.policy_version,
      aiRequestId: g.request_id,
      aiCreatedAt: date(g.ai_created_at),
      aiFinishedAt: date(g.finished_at),
    },
  };
}
export async function history({ user, id, input = {}, db = pool, env = process.env }) {
  await access(db, user, { root: true });
  await ready(db, env, 'safety');
  uuid(id);
  fields(input, ['page']);
  const p = await first(db, 'SELECT id FROM public_resource_publications WHERE public_id=?', [id]);
  if (!p) fail('UNAVAILABLE', 404);
  const page = Math.max(1, Math.min(10000, Math.trunc(Number(input.page) || 1)));
  const total = Number(
    (await first(db, 'SELECT COUNT(*) AS count FROM public_resource_actions WHERE publication_id=?', [p.id])).count,
  );
  const [rows] = await db.query(
    `SELECT a.public_id,a.action,a.reason,a.version,a.created_at,r.revision,COALESCE(NULLIF(u.alias,''),'成员') AS actor_name FROM public_resource_actions a LEFT JOIN public_resource_revisions r ON r.id=a.revision_id LEFT JOIN user u ON u.id=${legacyKey('a.actor_id')} WHERE a.publication_id=? ORDER BY a.id DESC LIMIT 20 OFFSET ?`,
    [p.id, (page - 1) * 20],
  );
  return {
    items: rows.map((a) => ({
      publicId: a.public_id,
      action: a.action,
      actorName: a.actor_name,
      reason: a.reason,
      version: Number(a.version),
      revision: Number(a.revision) || null,
      createdAt: date(a.created_at),
    })),
    total,
    page,
    pageSize: 20,
    hasMore: page * 20 < total,
  };
}
