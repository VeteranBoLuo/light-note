import pool from '../../db/index.js';
import { generateUUID } from '../agent/data.js';
import { invalidateKnowledgeCache } from '../knowledgeService.js';

const STATUSES = new Set(['public', 'internal']);
const TYPES = new Set(['html', 'markdown']);

function normalizeContent(value, maxContentLength) {
  const content = String(value || '');
  if (content.length > maxContentLength) {
    throw new Error(`CONTENT_TOO_LONG: 正文不能超过 ${maxContentLength} 个字符`);
  }
  return content;
}

function normalizeInput(input = {}, maxContentLength = 1_000_000) {
  const title = String(input.title || '').trim();
  if (!title) throw new Error('TITLE_REQUIRED: 标题不能为空');
  if (title.length > 255) throw new Error('TITLE_TOO_LONG: 标题不能超过 255 个字符');
  const content = normalizeContent(input.content, maxContentLength);
  const category =
    String(input.category || '内部知识')
      .trim()
      .slice(0, 50) || '内部知识';
  const status = String(input.status || 'internal');
  const type = String(input.type || 'markdown');
  if (!STATUSES.has(status)) throw new Error('INVALID_STATUS: 状态仅支持 public 或 internal');
  if (!TYPES.has(type)) throw new Error('INVALID_TYPE: 内容类型仅支持 html 或 markdown');
  return { title, content, category, status, type };
}

export async function findKnowledgeByTitle(title, connection = pool) {
  const normalizedTitle = String(title || '').trim();
  if (!normalizedTitle) return null;
  const [rows] = await connection.query(
    'SELECT id, title, category, status, type FROM knowledge_base WHERE title = ? LIMIT 1',
    [normalizedTitle],
  );
  return rows[0] || null;
}

export async function upsertKnowledgeBase({ userId, input, createOnly = false, maxContentLength = 1_000_000 } = {}) {
  if (!userId) throw new Error('USER_REQUIRED: 缺少操作用户');
  const value = normalizeInput(input, maxContentLength);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const existing = await findKnowledgeByTitle(value.title, connection);
    if (existing) {
      if (createOnly) throw new Error('DUPLICATE_TITLE: 已存在同名知识条目');
      await connection.query(
        'UPDATE knowledge_base SET content = ?, category = ?, status = ?, type = ?, updated_by = ? WHERE id = ?',
        [value.content, value.category, value.status, value.type, userId, existing.id],
      );
      await connection.commit();
      invalidateKnowledgeCache();
      return { id: existing.id, title: value.title, action: 'updated' };
    }
    const id = generateUUID();
    const [[sortRow]] = await connection.query('SELECT COALESCE(MAX(sort), -1) + 1 AS next_sort FROM knowledge_base');
    await connection.query(
      `INSERT INTO knowledge_base
        (id, title, content, category, status, type, sort, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        value.title,
        value.content,
        value.category,
        value.status,
        value.type,
        Number(sortRow?.next_sort || 0),
        userId,
        userId,
      ],
    );
    await connection.commit();
    invalidateKnowledgeCache();
    return { id, title: value.title, action: 'created' };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateKnowledgeBaseById({ userId, id, patch = {}, maxContentLength = 1_000_000 } = {}) {
  if (!userId) throw new Error('USER_REQUIRED: 缺少操作用户');
  if (!id) throw new Error('ID_REQUIRED: 缺少 ID');
  const fields = [];
  const params = [];
  if (patch.title !== undefined) {
    const title = String(patch.title || '').trim();
    if (!title) throw new Error('TITLE_REQUIRED: 标题不能为空');
    if (title.length > 255) throw new Error('TITLE_TOO_LONG: 标题不能超过 255 个字符');
    const [duplicates] = await pool.query('SELECT id FROM knowledge_base WHERE title = ? AND id <> ? LIMIT 1', [
      title,
      id,
    ]);
    if (duplicates.length) throw new Error('DUPLICATE_TITLE: 已存在同名知识条目');
    fields.push('title = ?');
    params.push(title);
  }
  if (patch.content !== undefined) {
    const content = normalizeContent(patch.content, maxContentLength);
    fields.push('content = ?');
    params.push(content);
  }
  if (patch.category !== undefined) {
    fields.push('category = ?');
    params.push(
      String(patch.category || '')
        .trim()
        .slice(0, 50),
    );
  }
  if (patch.status !== undefined) {
    const status = String(patch.status);
    if (!STATUSES.has(status)) throw new Error('INVALID_STATUS: 状态仅支持 public 或 internal');
    fields.push('status = ?');
    params.push(status);
  }
  if (patch.type !== undefined) {
    const type = String(patch.type);
    if (!TYPES.has(type)) throw new Error('INVALID_TYPE: 内容类型仅支持 html 或 markdown');
    fields.push('type = ?');
    params.push(type);
  }
  if (!fields.length) throw new Error('EMPTY_PATCH: 没有需要更新的字段');
  fields.push('updated_by = ?');
  params.push(userId, id);
  const [result] = await pool.query(`UPDATE knowledge_base SET ${fields.join(', ')} WHERE id = ?`, params);
  if (!result.affectedRows) throw new Error('NOT_FOUND: 知识条目不存在');
  invalidateKnowledgeCache();
  return { id };
}
