import pool from '../db/index.js';
import { resultData } from '../util/common.js';
import { ensureNotVisitor } from '../util/auth.js';
import {
  getHealthSummary,
  listBookmarkHealthIssues,
  markLinkNormal,
  recheckBookmarkHealth,
  startFullCheck,
  unmarkLinkNormal,
} from '../util/linkHealth.js';
import {
  getDuplicateBookmarkPreview,
  ignoreDuplicateBookmarkGroup,
  listDuplicateBookmarkGroups,
  resolveDuplicateBookmarkGroup,
  unignoreDuplicateBookmarkGroup,
} from '../util/services/bookmarkDuplicateService.js';
import { getOrganizeSummary } from '../util/services/organizeSummaryService.js';
import {
  isOwnedUntaggedResource,
  listUntaggedResources,
  normalizeOrganizableResourceType,
} from '../util/services/resourceInventoryService.js';
import {
  deleteOrganizeSuppression,
  ORGANIZE_SUPPRESSION_TYPES,
  upsertOrganizeSuppression,
} from '../util/services/organizeSuppressionService.js';

function subject(req) {
  return req.resourceUser || req.user || null;
}

function requirePrivateSubject(req, res) {
  const current = subject(req);
  if (!current?.id) {
    res.status(401).send(resultData({ code: 'ORGANIZE_AUTH_REQUIRED' }, 401, '登录后才能查看整理中心'));
    return null;
  }
  return current;
}

function sendError(res, error) {
  const knownStatus = Number(error?.status || 0);
  const status = [400, 401, 403, 404, 409].includes(knownStatus)
    ? knownStatus
    : error?.code === 'ORGANIZE_CURSOR_INVALID'
      ? 400
      : 500;
  const code = String(error?.code || 'ORGANIZE_SERVICE_FAILED');
  if (status >= 500) console.error('[organize] request failed code=%s', code);
  const message = status >= 500 ? '整理中心暂时不可用，请稍后重试' : error.message;
  const details = status < 500 && error?.details ? error.details : {};
  return res.status(status).send(resultData({ code, ...details }, status, message));
}

function requireWrite(req, res) {
  if (!ensureNotVisitor(req, res)) return null;
  return subject(req);
}

export async function summary(req, res) {
  const current = requirePrivateSubject(req, res);
  if (!current) return;
  try {
    return res.send(resultData(await getOrganizeSummary(current.id)));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function listIssues(req, res) {
  const current = requirePrivateSubject(req, res);
  if (!current) return;
  try {
    const issueType = String(req.params.issueType || '');
    if (issueType === 'untagged') {
      return res.send(
        resultData(
          await listUntaggedResources(pool, {
            userId: current.id,
            cursor: req.query.cursor,
            limit: req.query.limit,
            keyword: req.query.keyword,
            resourceType: req.query.resourceType,
          }),
        ),
      );
    }
    if (issueType === 'duplicate_bookmark') {
      return res.send(
        resultData(
          await listDuplicateBookmarkGroups(pool, {
            userId: current.id,
            cursor: req.query.cursor,
            limit: req.query.limit,
          }),
        ),
      );
    }
    if (issueType === 'bookmark_health') {
      return res.send(
        resultData(
          await listBookmarkHealthIssues(current.id, {
            cursor: req.query.cursor,
            limit: req.query.limit,
          }),
        ),
      );
    }
    throw Object.assign(new Error('不支持的问题类型'), { code: 'ORGANIZE_ISSUE_TYPE_INVALID', status: 400 });
  } catch (error) {
    return sendError(res, error);
  }
}

function normalizeUntaggedItems(body = {}) {
  const source = Array.isArray(body.items) ? body.items : [body];
  const unique = new Map();
  source.forEach((item) => {
    const resourceType = normalizeOrganizableResourceType(item?.resourceType, { allowAll: false });
    const resourceId = String(item?.resourceId || '').trim();
    if (resourceType && resourceId) unique.set(`${resourceType}:${resourceId}`, { resourceType, resourceId });
  });
  return [...unique.values()].slice(0, 50);
}

export async function ignoreUntagged(req, res) {
  const current = requireWrite(req, res);
  if (!current) return;
  const items = normalizeUntaggedItems(req.body);
  if (!items.length) return sendError(res, Object.assign(new Error('请选择要忽略的资源'), { status: 400 }));
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const ignored = [];
    for (const item of items) {
      if (!(await isOwnedUntaggedResource(connection, { userId: current.id, ...item }))) continue;
      await upsertOrganizeSuppression(connection, {
        userId: current.id,
        issueType: ORGANIZE_SUPPRESSION_TYPES.UNTAGGED,
        subjectKey: `${item.resourceType}:${item.resourceId}`,
      });
      ignored.push(item);
    }
    await connection.commit();
    return res.send(resultData({ ignored, ignoredCount: ignored.length }));
  } catch (error) {
    if (connection) await connection.rollback();
    return sendError(res, error);
  } finally {
    connection?.release();
  }
}

export async function unignoreUntagged(req, res) {
  const current = requireWrite(req, res);
  if (!current) return;
  const items = normalizeUntaggedItems(req.body);
  if (!items.length) return sendError(res, Object.assign(new Error('请选择要撤销忽略的资源'), { status: 400 }));
  try {
    let removedCount = 0;
    for (const item of items) {
      const result = await deleteOrganizeSuppression(pool, {
        userId: current.id,
        issueType: ORGANIZE_SUPPRESSION_TYPES.UNTAGGED,
        subjectKey: `${item.resourceType}:${item.resourceId}`,
      });
      if (result.removed) removedCount += 1;
    }
    return res.send(resultData({ removedCount }));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function duplicatePreview(req, res) {
  const current = requirePrivateSubject(req, res);
  if (!current) return;
  try {
    return res.send(
      resultData(await getDuplicateBookmarkPreview(pool, { userId: current.id, groupKey: req.params.groupKey })),
    );
  } catch (error) {
    return sendError(res, error);
  }
}

export async function resolveDuplicate(req, res) {
  const current = requireWrite(req, res);
  if (!current) return;
  try {
    return res.send(
      resultData(
        await resolveDuplicateBookmarkGroup({
          userId: current.id,
          groupKey: req.params.groupKey,
          payload: req.body,
        }),
      ),
    );
  } catch (error) {
    return sendError(res, error);
  }
}

export async function ignoreDuplicate(req, res) {
  const current = requireWrite(req, res);
  if (!current) return;
  try {
    return res.send(
      resultData(await ignoreDuplicateBookmarkGroup(pool, { userId: current.id, groupKey: req.params.groupKey })),
    );
  } catch (error) {
    return sendError(res, error);
  }
}

export async function unignoreDuplicate(req, res) {
  const current = requireWrite(req, res);
  if (!current) return;
  try {
    return res.send(
      resultData(await unignoreDuplicateBookmarkGroup(pool, { userId: current.id, groupKey: req.params.groupKey })),
    );
  } catch (error) {
    return sendError(res, error);
  }
}

export async function bookmarkHealth(req, res) {
  const current = requirePrivateSubject(req, res);
  if (!current) return;
  try {
    return res.send(
      resultData(
        await getHealthSummary(current.id, { includeSuspect: String(req.query?.includeSuspect || '') !== '0' }),
      ),
    );
  } catch (error) {
    return sendError(res, error);
  }
}

export async function startHealthScan(req, res) {
  const current = requireWrite(req, res);
  if (!current) return;
  try {
    return res.send(resultData(await startFullCheck(current.id)));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function recheckHealth(req, res) {
  const current = requireWrite(req, res);
  if (!current) return;
  try {
    const result = await recheckBookmarkHealth(current.id, req.params.bookmarkId);
    if (!result.ok && result.reason === 'not_found') {
      throw Object.assign(new Error('书签不存在'), { code: 'BOOKMARK_NOT_FOUND', status: 404 });
    }
    return res.send(resultData(result));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function markHealthNormal(req, res) {
  const current = requireWrite(req, res);
  if (!current) return;
  try {
    return res.send(resultData(await markLinkNormal(current.id, req.params.bookmarkId)));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function unmarkHealthNormal(req, res) {
  const current = requireWrite(req, res);
  if (!current) return;
  try {
    return res.send(resultData(await unmarkLinkNormal(current.id, req.params.bookmarkId)));
  } catch (error) {
    return sendError(res, error);
  }
}
