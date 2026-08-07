import pool from '../db/index.js';
import { resultData } from '../util/common.js';
import { ensureNotVisitor } from '../util/auth.js';
import {
  completeResources,
  enqueueResources,
  listInboxResources,
  normalizeInboxItems,
  normalizeInboxSource,
  queryPendingCount,
} from '../util/resourceInbox.js';
import { queryTodoAttentionCounts, queryTodoPendingCount } from '../util/services/todoService.js';

/**
 * 待处理计数的唯一汇聚点：countInbox 与 listInbox 共用，避免两个接口口径分叉。
 *
 * `todoPendingTotal` / `actionTotal` 是「库存」口径（全部未完成），供工作台总览使用；
 * `todoAttentionTotal` 等三个字段是「注意力」口径（逾期 + 今天），供导航角标使用。
 * 两套口径都保留：角标需要能清零的数字，仪表盘需要看全量。
 */
async function withActionCounts(counts, userId) {
  const [todoPendingTotal, attentionCounts] = await Promise.all([
    queryTodoPendingCount(pool, userId),
    queryTodoAttentionCounts(pool, userId),
  ]);
  return {
    ...counts,
    todoPendingTotal,
    actionTotal: Number(counts.pendingTotal || 0) + todoPendingTotal,
    ...attentionCounts,
  };
}

function sendInboxError(res, error) {
  const status =
    error?.code === 'INBOX_RESOURCE_FORBIDDEN'
      ? 403
      : error?.code === 'INBOX_LIST_PARAMS_INVALID' || error?.code === 'PAGE_CURSOR_INVALID'
        ? 400
        : 500;
  if (status === 500) console.error('[inbox] 请求失败:', error?.message || error);
  return res
    .status(status)
    .send(resultData(null, status, status < 500 ? error.message : '待整理服务暂时不可用，请稍后重试'));
}

export async function countInbox(req, res) {
  try {
    res.send(resultData(await withActionCounts(await queryPendingCount(pool, req.user.id), req.user.id)));
  } catch (error) {
    return sendInboxError(res, error);
  }
}

export async function listInbox(req, res) {
  try {
    const list = await listInboxResources(pool, {
      userId: req.user.id,
      type: req.body?.type,
      sort: req.body?.sort,
      keyword: req.body?.keyword,
      includeTotal: false,
    });
    const counts = await withActionCounts(
      { pendingTotal: list.pendingTotal, typeTotals: list.typeTotals },
      req.user.id,
    );
    res.send(
      resultData({
        ...list,
        ...counts,
      }),
    );
  } catch (error) {
    return sendInboxError(res, error);
  }
}

export async function enqueueInbox(req, res) {
  if (!ensureNotVisitor(req, res)) return;
  const items = normalizeInboxItems(req.body?.items);
  const source = normalizeInboxSource(req.body?.source, 'manual');
  if (!items || !source) return res.send(resultData(null, 400, '无效的资源列表或来源'));
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const result = await enqueueResources(connection, { userId: req.user.id, items, source });
    await connection.commit();
    res.send(resultData(result));
  } catch (error) {
    if (connection) await connection.rollback();
    return sendInboxError(res, error);
  } finally {
    connection?.release();
  }
}

export async function completeInbox(req, res) {
  if (!ensureNotVisitor(req, res)) return;
  const items = normalizeInboxItems(req.body?.items);
  if (!items) return res.send(resultData(null, 400, '无效的资源列表'));
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const result = await completeResources(connection, { userId: req.user.id, items });
    await connection.commit();
    res.send(resultData(result));
  } catch (error) {
    if (connection) await connection.rollback();
    return sendInboxError(res, error);
  } finally {
    connection?.release();
  }
}
