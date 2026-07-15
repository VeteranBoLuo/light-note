import pool from '../db/index.js';
import { resultData } from '../util/common.js';
import { ensureNotVisitor } from '../util/auth.js';
import {
  createTodo as createTodoItem,
  deleteTodo as deleteTodoItem,
  listTodos,
  queryTodoPendingCount,
  setTodoStatus,
  updateTodo as updateTodoItem,
} from '../util/services/todoService.js';

function sendTodoError(res, error) {
  const message = String(error?.message || '待办服务暂时不可用');
  const clientError = /不能为空|不能超过|无效|不存在|无权操作|提醒|截止时间|清单|邮箱|渠道|周期|间隔/.test(message);
  if (!clientError) console.error('[todo] 请求失败:', message);
  return res.send(resultData(null, clientError ? 400 : 500, clientError ? message : '待办服务暂时不可用，请稍后重试'));
}

async function withTransaction(res, callback) {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const data = await callback(connection);
    await connection.commit();
    return res.send(resultData(data));
  } catch (error) {
    if (connection) await connection.rollback();
    return sendTodoError(res, error);
  } finally {
    connection?.release();
  }
}

export async function listTodo(req, res) {
  if (!req.user?.id || req.user.role === 'visitor') {
    return res.send(resultData({ items: [], total: 0, pendingTotal: 0 }));
  }
  try {
    const status = String(req.body?.status || 'pending');
    const sort = String(req.body?.sort || 'smart');
    const keyword = String(req.body?.keyword || '')
      .trim()
      .slice(0, 100);
    const [items, pendingTotal] = await Promise.all([
      listTodos(pool, req.user.id, { status, sort, keyword }),
      queryTodoPendingCount(pool, req.user.id),
    ]);
    return res.send(resultData({ items, total: items.length, pendingTotal }));
  } catch (error) {
    return sendTodoError(res, error);
  }
}

export async function countTodo(req, res) {
  try {
    const pendingTotal =
      !req.user?.id || req.user.role === 'visitor' ? 0 : await queryTodoPendingCount(pool, req.user.id);
    return res.send(resultData({ pendingTotal }));
  } catch (error) {
    return sendTodoError(res, error);
  }
}

export async function createTodo(req, res) {
  if (!ensureNotVisitor(req, res)) return;
  return withTransaction(res, (connection) => createTodoItem(connection, req.user.id, req.body || {}));
}

export async function updateTodo(req, res) {
  if (!ensureNotVisitor(req, res)) return;
  const id = String(req.body?.id || '').trim();
  if (!id) return res.send(resultData(null, 400, '缺少待办 ID'));
  return withTransaction(res, async (connection) => {
    const result = await updateTodoItem(connection, req.user.id, id, req.body || {});
    if (!result) throw new Error('待办不存在或无权操作');
    return result;
  });
}

export async function completeTodo(req, res) {
  if (!ensureNotVisitor(req, res)) return;
  const id = String(req.body?.id || '').trim();
  if (!id) return res.send(resultData(null, 400, '缺少待办 ID'));
  return withTransaction(res, async (connection) => ({
    affected: await setTodoStatus(connection, req.user.id, id, 'completed'),
  }));
}

export async function reopenTodo(req, res) {
  if (!ensureNotVisitor(req, res)) return;
  const id = String(req.body?.id || '').trim();
  if (!id) return res.send(resultData(null, 400, '缺少待办 ID'));
  return withTransaction(res, async (connection) => ({
    affected: await setTodoStatus(connection, req.user.id, id, 'pending'),
  }));
}

export async function deleteTodo(req, res) {
  if (!ensureNotVisitor(req, res)) return;
  const id = String(req.body?.id || '').trim();
  if (!id) return res.send(resultData(null, 400, '缺少待办 ID'));
  return withTransaction(res, async (connection) => ({
    affected: await deleteTodoItem(connection, req.user.id, id),
  }));
}
