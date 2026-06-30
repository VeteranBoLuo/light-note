import { resultData, generateUUID } from '../util/common.js';
import pool from '../db/index.js';
import { validateQueryParams } from '../util/request.js';

const ensureRootRole = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId || req.user?.role !== 'root') {
      res.send(resultData(null, 403, '无权限操作'));
      return null;
    }
    const [userResult] = await pool.query('SELECT role,del_flag FROM user WHERE id = ? LIMIT 1', [userId]);
    if (userResult.length === 0 || userResult[0].role !== 'root') {
      res.send(resultData(null, 403, '仅root用户可操作'));
      return null;
    }
    return userId;
  } catch (e) {
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
    return null;
  }
};

/** 查询知识库列表（带分类/状态筛选 + 分页） */
export const listKnowledgeBase = async (req, res) => {
  try {
    const userId = await ensureRootRole(req, res);
    if (!userId) return;
    const { filters, pageSize, currentPage, order } = validateQueryParams(req.body);

    const conditions = [];
    const params = [];
    if (filters?.category) {
      conditions.push('category = ?');
      params.push(filters.category);
    }
    if (filters?.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }
    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    const offset = pageSize * (currentPage - 1);

    const [rows] = await pool.query(
      `SELECT id, title, category, status, type, sort, created_at, updated_at FROM knowledge_base ${where} ORDER BY ${order || 'sort ASC, created_at DESC'} LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    const [countRes] = await pool.query(`SELECT COUNT(*) as total FROM knowledge_base ${where}`, params);
    res.send(resultData({ items: rows, total: countRes[0].total }));
  } catch (e) {
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
  }
};

/** 获取单条知识 */
export const getKnowledgeBaseItem = async (req, res) => {
  try {
    const userId = await ensureRootRole(req, res);
    if (!userId) return;
    const { id } = req.body;
    const [rows] = await pool.query('SELECT * FROM knowledge_base WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) return res.send(resultData(null, 404, '条目不存在'));
    res.send(resultData(rows[0]));
  } catch (e) {
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
  }
};

/** 搜索知识库（标题+正文） */
export const searchKnowledgeBase = async (req, res) => {
  try {
    const userId = await ensureRootRole(req, res);
    if (!userId) return;
    const { keyword, category, status } = req.body;
    if (!keyword?.trim()) return res.send(resultData({ items: [], total: 0 }));

    const conditions = [];
    const params = ['%' + keyword.trim() + '%', '%' + keyword.trim() + '%'];
    conditions.push('(title LIKE ? OR content LIKE ?)');
    if (category) { conditions.push('category = ?'); params.push(category); }
    if (status) { conditions.push('status = ?'); params.push(status); }
    const where = 'WHERE ' + conditions.join(' AND ');

    const [rows] = await pool.query(
      `SELECT id, title, content, status, category FROM knowledge_base ${where} ORDER BY CASE WHEN title LIKE ? THEN 0 ELSE 1 END, sort ASC LIMIT 50`,
      ['%' + keyword.trim() + '%', ...params]
    );

    // 在 JS 中提取关键字周围的上下文片段
    const kwLower = keyword.trim().toLowerCase();
    const items = rows.map(r => {
      const plainText = (r.content || '')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const lower = plainText.toLowerCase();
      const pos = lower.indexOf(kwLower);
      let snippet = '';
      if (pos >= 0) {
        const start = Math.max(0, pos - 60);
        const end = Math.min(plainText.length, pos + kwLower.length + 120);
        snippet = plainText.slice(start, end);
        if (start > 0) snippet = '…' + snippet;
        if (end < plainText.length) snippet = snippet + '…';
      } else {
        snippet = plainText.slice(0, 150);
        if (plainText.length > 150) snippet += '…';
      }
      return {
        id: r.id,
        title: r.title,
        contentPreview: snippet,
        status: r.status || 'internal',
        category: r.category || '',
      };
    });

    res.send(resultData({ items, total: items.length }));
  } catch (e) {
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
  }
};

/** 新建知识条目 */
export const createKnowledgeBase = async (req, res) => {
  try {
    const userId = await ensureRootRole(req, res);
    if (!userId) return;
    const { title, content, category, status, type } = req.body;
    if (!title?.trim()) return res.send(resultData(null, 400, '标题不能为空'));

    const id = generateUUID();
    await pool.query(
      'INSERT INTO knowledge_base (id, title, content, category, status, type, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, title.trim(), content || '', category || 'internal', status || 'internal', type || 'html', userId, userId]
    );
    // Get max sort for this category
    const [sortRes] = await pool.query('SELECT COALESCE(MAX(sort), -1) + 1 AS next_sort FROM knowledge_base');
    await pool.query('UPDATE knowledge_base SET sort = ? WHERE id = ?', [sortRes[0].next_sort, id]);

    res.send(resultData({ id }));
  } catch (e) {
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
  }
};

/** 更新知识条目 */
export const updateKnowledgeBase = async (req, res) => {
  try {
    const userId = await ensureRootRole(req, res);
    if (!userId) return;
    const { id, title, content, category, status, type } = req.body;
    if (!id) return res.send(resultData(null, 400, '缺少 ID'));
    if (title !== undefined && !title?.trim()) return res.send(resultData(null, 400, '标题不能为空'));

    const fields = [];
    const params = [];
    if (title !== undefined) { fields.push('title = ?'); params.push(title.trim()); }
    if (content !== undefined) { fields.push('content = ?'); params.push(content); }
    if (category !== undefined) { fields.push('category = ?'); params.push(category); }
    if (status !== undefined) { fields.push('status = ?'); params.push(status); }
    if (type !== undefined) { fields.push('type = ?'); params.push(type); }
    if (fields.length === 0) return res.send(resultData(null, 400, '没有需要更新的字段'));

    fields.push('updated_by = ?'); params.push(userId);
    params.push(id);

    await pool.query(`UPDATE knowledge_base SET ${fields.join(', ')} WHERE id = ?`, params);
    res.send(resultData(null));
  } catch (e) {
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
  }
};

/** 删除知识条目 */
export const deleteKnowledgeBase = async (req, res) => {
  try {
    const userId = await ensureRootRole(req, res);
    if (!userId) return;
    const { id } = req.body;
    if (!id) return res.send(resultData(null, 400, '缺少 ID'));
    await pool.query('DELETE FROM knowledge_base WHERE id = ?', [id]);
    res.send(resultData(null));
  } catch (e) {
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
  }
};

/** 批量更新状态 */
export const batchUpdateKnowledgeStatus = async (req, res) => {
  try {
    const userId = await ensureRootRole(req, res);
    if (!userId) return;
    const { ids, status } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.send(resultData(null, 400, '请选择条目'));
    if (!['public', 'internal'].includes(status)) return res.send(resultData(null, 400, '状态无效'));
    await pool.query('UPDATE knowledge_base SET status = ?, updated_by = ? WHERE id IN (?)', [status, userId, ids]);
    res.send(resultData({ updated: ids.length }));
  } catch (e) {
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
  }
};

/** 批量更新分类 */
export const batchUpdateKnowledgeCategory = async (req, res) => {
  try {
    const userId = await ensureRootRole(req, res);
    if (!userId) return;
    const { ids, category } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.send(resultData(null, 400, '请选择条目'));
    if (!category?.trim()) return res.send(resultData(null, 400, '分类不能为空'));
    await pool.query('UPDATE knowledge_base SET category = ?, updated_by = ? WHERE id IN (?)', [category.trim(), userId, ids]);
    res.send(resultData({ updated: ids.length }));
  } catch (e) {
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
  }
};

/** 批量删除 */
export const batchDeleteKnowledgeBase = async (req, res) => {
  try {
    const userId = await ensureRootRole(req, res);
    if (!userId) return;
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.send(resultData(null, 400, '请选择条目'));
    await pool.query('DELETE FROM knowledge_base WHERE id IN (?)', [ids]);
    res.send(resultData({ deleted: ids.length }));
  } catch (e) {
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
  }
};

/** 获取所有分类 */
export const getKnowledgeCategories = async (req, res) => {
  try {
    const userId = await ensureRootRole(req, res);
    if (!userId) return;
    const [rows] = await pool.query('SELECT DISTINCT category FROM knowledge_base ORDER BY category ASC');
    const categories = rows.map(r => r.category);
    // Always include 帮助中心 as default
    if (!categories.includes('帮助中心')) categories.unshift('帮助中心');
    res.send(resultData(categories));
  } catch (e) {
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
  }
};

/** 获取帮助中心文章（供 Help.vue 使用） */
export const getHelpCenterArticles = async (req, res) => {
  try {
    const [result] = await pool.query(
      "SELECT id, title, content, sort FROM knowledge_base WHERE category = '帮助中心' AND status = 'public' ORDER BY sort ASC, created_at ASC"
    );
    res.send(resultData(result, 200));
  } catch (e) {
    res.send(resultData(e.message, 200));
  }
};
