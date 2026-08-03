import pool from '../db/index.js';
import { resultData } from '../util/common.js';
import { ensureNotVisitor } from '../util/auth.js';
import {
  createTodo as createTodoItem,
  batchDeleteTodos,
  batchRestoreTodos,
  batchSetTodoStatus,
  deleteTodo as deleteTodoItem,
  listTodos,
  queryTodoPendingCount,
  reorderTodos,
  restoreTodo as restoreTodoItem,
  setTodoStatus,
  snoozeTodo as snoozeTodoItem,
  updateTodo as updateTodoItem,
} from '../util/services/todoService.js';
import { completeGrowthTask } from '../util/growthTaskCompletion.js';

function sendTodoError(res, error) {
  const message = String(error?.message || '待办服务暂时不可用');
  const clientError =
    /不能为空|不能超过|无效|不存在|无权操作|提醒|截止时间|清单|邮箱|渠道|周期|间隔|游标|重复任务|请选择|顺序|发生变化/.test(
      message,
    );
  if (!clientError) console.error('[todo] 请求失败:', message);
  return res.send(resultData(null, clientError ? 400 : 500, clientError ? message : '待办服务暂时不可用，请稍后重试'));
}

async function withTransaction(res, callback, { afterCommit } = {}) {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const data = await callback(connection);
    await connection.commit();
    if (afterCommit) {
      Promise.resolve()
        .then(() => afterCommit(data))
        .catch((error) => console.warn('[todo] 成长任务状态同步失败 code=%s', error?.code || 'UNKNOWN'));
    }
    return res.send(resultData(data));
  } catch (error) {
    if (connection) await connection.rollback();
    return sendTodoError(res, error);
  } finally {
    connection?.release();
  }
}

export async function listTodo(req, res) {
  // 游客只读共享示例待办；写入接口仍统一由 ensureNotVisitor 拦截。
  if (!req.user?.id) {
    return res.send(resultData({ items: [], total: 0, pendingTotal: 0 }));
  }
  try {
    const status = String(req.body?.status || 'all');
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
    const pendingTotal = !req.user?.id ? 0 : await queryTodoPendingCount(pool, req.user.id);
    return res.send(resultData({ pendingTotal }));
  } catch (error) {
    return sendTodoError(res, error);
  }
}

export async function createTodo(req, res) {
  if (!ensureNotVisitor(req, res)) return;
  return withTransaction(res, (connection) => createTodoItem(connection, req.user.id, req.body || {}), {
    afterCommit: () => completeGrowthTask(req.user.id, 'first_todo', { userRole: req.user.role }),
  });
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

export async function restoreTodo(req, res) {
  if (!ensureNotVisitor(req, res)) return;
  const id = String(req.body?.id || '').trim();
  if (!id) return res.send(resultData(null, 400, '缺少待办 ID'));
  return withTransaction(res, async (connection) => ({
    affected: await restoreTodoItem(connection, req.user.id, id),
  }));
}

export async function batchStatusTodo(req, res) {
  if (!ensureNotVisitor(req, res)) return;
  const status = String(req.body?.status || '');
  return withTransaction(res, (connection) =>
    batchSetTodoStatus(connection, req.user.id, req.body?.ids, status, {
      undoCompletion: req.body?.undoCompletion === true,
    }),
  );
}

export async function batchDeleteTodo(req, res) {
  if (!ensureNotVisitor(req, res)) return;
  return withTransaction(res, (connection) => batchDeleteTodos(connection, req.user.id, req.body?.ids));
}

export async function batchRestoreTodo(req, res) {
  if (!ensureNotVisitor(req, res)) return;
  return withTransaction(res, (connection) => batchRestoreTodos(connection, req.user.id, req.body?.ids));
}

export async function reorderTodo(req, res) {
  if (!ensureNotVisitor(req, res)) return;
  return withTransaction(res, (connection) => reorderTodos(connection, req.user.id, req.body?.items));
}

export async function snoozeTodo(req, res) {
  if (!ensureNotVisitor(req, res)) return;
  const id = String(req.body?.id || '').trim();
  if (!id) return res.send(resultData(null, 400, '缺少待办 ID'));
  return withTransaction(res, (connection) => snoozeTodoItem(connection, req.user.id, id, req.body?.targetAt));
}
