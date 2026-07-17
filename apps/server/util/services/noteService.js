import pool from '../../db/index.js';
import { insertData } from '../agent/data.js';
import { enqueueResources } from '../resourceInbox.js';
import { triggerResourceCreateEffects } from './resourceCreateEffects.js';
import { extractNoteImageUrls, filterOwnedImageUrls } from '../noteImages.js';
import { actionIdempotencyUuid } from '../agent/actionIdempotency.js';

const NOTE_TYPES = new Set(['html', 'markdown']);

function markCommitOutcomeUnknown(error) {
  if (error && (typeof error === 'object' || typeof error === 'function')) {
    try {
      error.commitOutcomeUnknown = true;
      if (error.commitOutcomeUnknown) return error;
    } catch {
      // 冻结对象或只读异常会在下方包装，避免标记动作本身覆盖原始故障。
    }
  }
  const wrapped = new Error(error instanceof Error ? error.message : '提交结果暂时无法核验');
  wrapped.cause = error;
  wrapped.commitOutcomeUnknown = true;
  return wrapped;
}

async function findOwnedNoteById({ userId, noteId }) {
  const [rows] = await pool.query(
    'SELECT id, title, type FROM note WHERE id = ? AND create_by = ? LIMIT 1',
    [noteId, userId],
  );
  return rows[0] || null;
}

export async function createNote({
  userId,
  userRole,
  note = {},
  addToInbox = false,
  inboxSource = 'quick_capture',
  request,
  suppressUserRewards = false,
  maxContentLength = 1_000_000,
  trustedImageUrls = [],
  idempotencyKey = null,
} = {}) {
  if (!userId) throw new Error('USER_REQUIRED: 缺少用户');
  const type = note.type === 'md' ? 'markdown' : String(note.type || 'html');
  if (!NOTE_TYPES.has(type)) throw new Error('INVALID_NOTE_TYPE: 笔记类型仅支持 html 或 markdown');
  const title = String(note.title || '').trim() || '未命名文档';
  if (title.length > 255) throw new Error('TITLE_TOO_LONG: 笔记标题不能超过 255 个字符');
  const content = String(note.content || '');
  if (content.length > maxContentLength) {
    throw new Error(`CONTENT_TOO_LONG: 笔记正文不能超过 ${maxContentLength} 个字符`);
  }
  const idempotentNoteId = actionIdempotencyUuid(idempotencyKey, 'note');
  if (idempotentNoteId) {
    const existing = await findOwnedNoteById({ userId, noteId: idempotentNoteId });
    if (existing) {
      return {
        id: existing.id,
        title: existing.title || title,
        type: existing.type || type,
        addedToInbox: false,
      };
    }
  }
  // 创建接口只接受业务字段，ID、归属、删除状态和排序均由服务端生成或使用数据库默认值。
  const data = insertData({
    ...(idempotentNoteId ? { id: idempotentNoteId } : {}),
    title,
    content,
    type,
    createBy: userId,
  });

  const connection = await pool.getConnection();
  let transactionStarted = false;
  let commitAttempted = false;
  let transactionError = null;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    await connection.query('INSERT INTO note SET ?', [data]);
    // 正文引用本站上传图片时登记引用(引用计数语义,见 util/noteImages.js):
    // 模板实例化/粘贴复用等路径创建的笔记也成为图片合法引用者,原笔记删除时不误删共享文件。
    // 只登记确属当前用户的图片,防止把他人图片锚定为自己的引用。
    const imageUrls = extractNoteImageUrls(content);
    if (imageUrls.length) {
      const ownedUrls = await filterOwnedImageUrls({ urls: imageUrls, userId, connection });
      // trustedImageUrls 仅供已经完成原文件归属校验、并刚写入本站图片目录的内部服务使用。
      // 仍与正文实际引用取交集，避免登记正文未使用的图片或任意外部 URL。
      const trusted = new Set((Array.isArray(trustedImageUrls) ? trustedImageUrls : []).map(String));
      const registeredUrls = [...new Set([...ownedUrls, ...imageUrls.filter((url) => trusted.has(url))])];
      for (const url of registeredUrls) {
        await connection.query('INSERT INTO note_images SET ?', [insertData({ noteId: data.id, url })]);
      }
    }
    if (addToInbox) {
      await enqueueResources(connection, {
        userId,
        items: [{ resourceType: 'note', resourceId: data.id }],
        source: inboxSource,
      });
    }
    commitAttempted = true;
    await connection.commit();
  } catch (error) {
    transactionError = error;
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch {
        // 保留最初的业务/提交异常；最终提交状态由事务外查询判定。
      }
    }
  } finally {
    connection.release();
  }

  let recoveredExisting = false;
  if (transactionError && idempotentNoteId) {
    try {
      const existing = await findOwnedNoteById({ userId, noteId: idempotentNoteId });
      if (existing) {
        // 提交回包不明时，或并发重复确认触发唯一键冲突时，均可由固定笔记 ID 恢复结果。
        recoveredExisting = !commitAttempted;
        transactionError = null;
      }
    } catch {
      if (commitAttempted) throw markCommitOutcomeUnknown(transactionError);
    }
  }

  if (transactionError) {
    if (!commitAttempted) throw transactionError;
    let committed = false;
    try {
      const [rows] = await pool.query('SELECT id FROM note WHERE id = ? AND create_by = ? LIMIT 1', [data.id, userId]);
      committed = rows.length > 0;
    } catch {
      // 无法核验时向上游标记提交结果不明；图片笔记调用方据此保留可能已被笔记引用的文件。
      throw markCommitOutcomeUnknown(transactionError);
    }
    if (!committed) throw transactionError;
  }

  if (!recoveredExisting) {
    try {
      triggerResourceCreateEffects({
        request,
        userId,
        userRole,
        resourceType: 'note',
        resourceId: data.id,
        suppressUserRewards,
      });
    } catch {
      // 资源已提交；成长与转化是旁路副作用，任何同步异常都不能反向伪装成创建失败。
    }
  }
  return { id: data.id, title, type, addedToInbox: Boolean(addToInbox) };
}
