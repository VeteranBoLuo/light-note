import pool from '../db/index.js';
import { resultData, generateUUID } from '../util/common.js';
import { ensureNotVisitor } from '../util/auth.js';

// 待办事项:全部操作仅针对当前登录用户(req.user.id),无越权面。

// POST /todo/list —— 当前用户全部待办(未完成在前、重要在前、有截止的按截止升序、再按创建倒序)
export const getTodos = async (req, res) => {
  const userId = req.user?.id;
  if (!userId || req.user?.role === 'visitor') return res.send(resultData([]));
  try {
    const [rows] = await pool.query(
      `SELECT id, content, done, priority, due_date, done_time, create_time
       FROM todo WHERE user_id = ? AND del_flag = 0
       ORDER BY done ASC, priority DESC, (due_date IS NULL) ASC, due_date ASC, create_time DESC`,
      [userId],
    );
    res.send(resultData(rows));
  } catch (e) {
    res.send(resultData(null, 500, '获取待办失败: ' + e.message));
  }
};

// POST /todo/add —— 新增待办 {content, priority?, dueDate?}
export const addTodo = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const content = String(req.body?.content || '').trim();
    if (!content) return res.send(resultData(null, 400, '待办内容不能为空'));
    const priority = Number(req.body?.priority) === 1 ? 1 : 0;
    const dueDate = req.body?.dueDate ? new Date(req.body.dueDate) : null;
    const id = generateUUID();
    await pool.query('INSERT INTO todo (id, user_id, content, priority, due_date) VALUES (?, ?, ?, ?, ?)', [
      id,
      req.user.id,
      content.slice(0, 500),
      priority,
      dueDate && !isNaN(dueDate.getTime()) ? dueDate : null,
    ]);
    const [[row]] = await pool.query(
      'SELECT id, content, done, priority, due_date, done_time, create_time FROM todo WHERE id = ?',
      [id],
    );
    res.send(resultData(row));
  } catch (e) {
    res.send(resultData(null, 500, '新增待办失败: ' + e.message));
  }
};

// POST /todo/update —— 编辑 {id, content?, priority?, dueDate?}(dueDate 传 null 可清除)
export const updateTodo = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const { id } = req.body || {};
    if (!id) return res.send(resultData(null, 400, '缺少 id'));
    const [own] = await pool.query('SELECT id FROM todo WHERE id = ? AND user_id = ? AND del_flag = 0', [id, req.user.id]);
    if (!own.length) return res.send(resultData(null, 404, '待办不存在'));
    const sets = [];
    const params = [];
    if (req.body.content !== undefined) {
      const c = String(req.body.content || '').trim();
      if (!c) return res.send(resultData(null, 400, '待办内容不能为空'));
      sets.push('content = ?');
      params.push(c.slice(0, 500));
    }
    if (req.body.priority !== undefined) {
      sets.push('priority = ?');
      params.push(Number(req.body.priority) === 1 ? 1 : 0);
    }
    if (req.body.dueDate !== undefined) {
      const d = req.body.dueDate ? new Date(req.body.dueDate) : null;
      sets.push('due_date = ?');
      params.push(d && !isNaN(d.getTime()) ? d : null);
    }
    if (!sets.length) return res.send(resultData({ ok: true }));
    params.push(id, req.user.id);
    await pool.query(`UPDATE todo SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, params);
    res.send(resultData({ ok: true }));
  } catch (e) {
    res.send(resultData(null, 500, '更新待办失败: ' + e.message));
  }
};

// POST /todo/toggle —— 勾选/取消完成 {id, done}
export const toggleTodo = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const { id } = req.body || {};
    if (!id) return res.send(resultData(null, 400, '缺少 id'));
    const done = req.body?.done ? 1 : 0;
    const [r] = await pool.query(
      'UPDATE todo SET done = ?, done_time = ? WHERE id = ? AND user_id = ? AND del_flag = 0',
      [done, done ? new Date() : null, id, req.user.id],
    );
    if (!r.affectedRows) return res.send(resultData(null, 404, '待办不存在'));
    res.send(resultData({ ok: true, done }));
  } catch (e) {
    res.send(resultData(null, 500, '更新待办失败: ' + e.message));
  }
};

// POST /todo/delete —— 删除(硬删,待办为轻量数据不入回收站)
export const removeTodo = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const { id } = req.body || {};
    if (!id) return res.send(resultData(null, 400, '缺少 id'));
    await pool.query('DELETE FROM todo WHERE id = ? AND user_id = ?', [id, req.user.id]);
    res.send(resultData({ ok: true }));
  } catch (e) {
    res.send(resultData(null, 500, '删除待办失败: ' + e.message));
  }
};

// POST /todo/clearDone —— 清除全部已完成
export const clearDone = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const [r] = await pool.query('DELETE FROM todo WHERE user_id = ? AND done = 1', [req.user.id]);
    res.send(resultData({ ok: true, cleared: r.affectedRows || 0 }));
  } catch (e) {
    res.send(resultData(null, 500, '清除失败: ' + e.message));
  }
};
