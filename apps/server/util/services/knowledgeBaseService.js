import pool from '../../db/index.js';
import { generateUUID } from '../agent/data.js';
import { invalidateKnowledgeCache } from '../knowledgeService.js';
import { finishAdminAction } from '../adminActionExecution.js';
import { HELP_KNOWLEDGE_CATEGORY, normalizeKnowledgeHelpSection } from '../helpKnowledge.js';

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
  const helpSection = normalizeKnowledgeHelpSection(input.helpSection, category);
  const helpSectionProvided = input.helpSection !== undefined && input.helpSection !== null;
  return { title, content, category, helpSection, helpSectionProvided, status, type };
}

export async function findKnowledgeByTitle(title, connection = pool) {
  const normalizedTitle = String(title || '').trim();
  if (!normalizedTitle) return null;
  const [rows] = await connection.query(
    'SELECT id, title, category, help_section, status, type FROM knowledge_base WHERE title = ? AND COALESCE(admin_archived, 0) = 0 LIMIT 1',
    [normalizedTitle],
  );
  return rows[0] || null;
}

export async function upsertKnowledgeBase({
  userId,
  input,
  createOnly = false,
  maxContentLength = 1_000_000,
  actionContext = null,
} = {}) {
  if (!userId) throw new Error('USER_REQUIRED: 缺少操作用户');
  const value = normalizeInput(input, maxContentLength);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const existing = await findKnowledgeByTitle(value.title, connection);
    if (existing) {
      if (createOnly) throw new Error('DUPLICATE_TITLE: 已存在同名知识条目');
      const helpSection =
        value.category === HELP_KNOWLEDGE_CATEGORY && !value.helpSectionProvided
          ? existing.help_section || value.helpSection
          : value.helpSection;
      await connection.query(
        'UPDATE knowledge_base SET content = ?, category = ?, help_section = ?, status = ?, type = ?, updated_by = ? WHERE id = ?',
        [value.content, value.category, helpSection, value.status, value.type, userId, existing.id],
      );
      if (actionContext) actionContext.baseEntry.targetId = existing.id;
      const receipt = actionContext
        ? await finishAdminAction(actionContext, {
            outcome: 'succeeded',
            metadata: { operation: 'updated', resultingStatus: value.status },
            db: connection,
          })
        : {};
      await connection.commit();
      invalidateKnowledgeCache();
      return { id: existing.id, title: value.title, action: 'updated', ...receipt };
    }
    const id = generateUUID();
    const [[sortRow]] = await connection.query('SELECT COALESCE(MAX(sort), -1) + 1 AS next_sort FROM knowledge_base');
    await connection.query(
      `INSERT INTO knowledge_base
        (id, title, content, category, help_section, status, type, sort, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        value.title,
        value.content,
        value.category,
        value.helpSection,
        value.status,
        value.type,
        Number(sortRow?.next_sort || 0),
        userId,
        userId,
      ],
    );
    if (actionContext) actionContext.baseEntry.targetId = id;
    const receipt = actionContext
      ? await finishAdminAction(actionContext, {
          outcome: 'succeeded',
          metadata: { operation: 'created', resultingStatus: value.status },
          db: connection,
        })
      : {};
    await connection.commit();
    invalidateKnowledgeCache();
    return { id, title: value.title, action: 'created', ...receipt };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateKnowledgeBaseById({
  userId,
  id,
  patch = {},
  maxContentLength = 1_000_000,
  actionContext = null,
} = {}) {
  if (!userId) throw new Error('USER_REQUIRED: 缺少操作用户');
  if (!id) throw new Error('ID_REQUIRED: 缺少 ID');
  const fields = [];
  const params = [];
  if (patch.title !== undefined) {
    const title = String(patch.title || '').trim();
    if (!title) throw new Error('TITLE_REQUIRED: 标题不能为空');
    if (title.length > 255) throw new Error('TITLE_TOO_LONG: 标题不能超过 255 个字符');
    fields.push('title = ?');
    params.push(title);
  }
  if (patch.content !== undefined) {
    const content = normalizeContent(patch.content, maxContentLength);
    fields.push('content = ?');
    params.push(content);
  }
  if (patch.category !== undefined) {
    const category = String(patch.category || '')
      .trim()
      .slice(0, 50);
    fields.push('category = ?');
    params.push(category);
    if (patch.helpSection === undefined) {
      fields.push('help_section = ?');
      params.push(normalizeKnowledgeHelpSection(undefined, category));
    }
  }
  if (patch.helpSection !== undefined) {
    const category =
      patch.category === undefined
        ? HELP_KNOWLEDGE_CATEGORY
        : String(patch.category || '')
            .trim()
            .slice(0, 50);
    fields.push('help_section = ?');
    params.push(normalizeKnowledgeHelpSection(patch.helpSection, category));
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
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (patch.title !== undefined) {
      const [duplicates] = await connection.query(
        'SELECT id FROM knowledge_base WHERE title = ? AND id <> ? AND COALESCE(admin_archived, 0) = 0 LIMIT 1',
        [String(patch.title || '').trim(), id],
      );
      if (duplicates.length) throw new Error('DUPLICATE_TITLE: 已存在同名知识条目');
    }
    const [result] = await connection.query(
      `UPDATE knowledge_base SET ${fields.join(', ')} WHERE id = ? AND COALESCE(admin_archived, 0) = 0`,
      params,
    );
    if (!result.affectedRows) throw new Error('NOT_FOUND: 知识条目不存在');
    const receipt = actionContext
      ? await finishAdminAction(actionContext, {
          outcome: 'succeeded',
          metadata: {
            changedFields: Object.keys(patch).filter((key) =>
              ['title', 'content', 'category', 'helpSection', 'status', 'type'].includes(key),
            ),
            resultingStatus: patch.status || null,
          },
          db: connection,
        })
      : {};
    await connection.commit();
    invalidateKnowledgeCache();
    return { id, ...receipt };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
