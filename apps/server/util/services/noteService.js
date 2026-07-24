import pool from '../../db/index.js';
import { insertData } from '../agent/data.js';
import { normalizeMarkdownBlockquoteEntities, normalizeNoteType } from '@lightnote/shared';
import { enqueueResources } from '../resourceInbox.js';
import { triggerResourceCreateEffects } from './resourceCreateEffects.js';
import { extractNoteImageUrls, filterOwnedImageUrls } from '../noteImages.js';
import { actionIdempotencyUuid } from '../agent/actionIdempotency.js';
import { extractOwnedResourceRefs, syncNoteResourceRefs } from './noteReferenceService.js';

const NOTE_TYPES = new Set(['html', 'markdown']);
const NOTE_VERSION_KEEP = 20;

function noteServiceError(code, message, status = 400) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  error.status = status;
  return error;
}

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
  const [rows] = await pool.query('SELECT id, title, type FROM note WHERE id = ? AND create_by = ? LIMIT 1', [
    noteId,
    userId,
  ]);
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
  const type = normalizeNoteType(note.type || 'html');
  if (!NOTE_TYPES.has(type)) throw new Error('INVALID_NOTE_TYPE: 笔记类型仅支持 html 或 markdown');
  const title = String(note.title || '').trim() || '未命名文档';
  if (title.length > 255) throw new Error('TITLE_TOO_LONG: 笔记标题不能超过 255 个字符');
  const rawContent = String(note.content || '');
  // 无论请求来自当前页面、旧版缓存页面还是内部调用，Markdown 源码均在持久化边界收口，
  // 防止旧客户端把引用语法 `>` 经 DOM 序列化成 `&gt;` 后永久写入数据库。
  const content = type === 'markdown' ? normalizeMarkdownBlockquoteEntities(rawContent) : rawContent;
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
    // 笔记内联提及(N0):在同一事务内把正文的站内引用同步到 note_resource_refs。
    // 新建笔记旧集合为空,等价于为正文中的有效站内链接建立引用;解析/校验/同步失败则整个创建回滚(§4.4)。
    const createdRefs = extractOwnedResourceRefs({ content, type });
    if (createdRefs.length) {
      await syncNoteResourceRefs(connection, { userId, noteId: data.id, refs: createdRefs });
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

/**
 * 在调用方已经开启的事务内更新一篇归属明确的笔记正文。
 *
 * AI Change Set 使用它把“版本校验后的补偿式写入”落到普通笔记领域服务：
 * - 再次校验 owner 与当前正文，避免未来调用方遗漏归属或拿陈旧快照写入；
 * - 写入前强制保存历史版本，保留笔记库自己的恢复入口；
 * - 新增的本站图片只登记当前用户确实拥有的引用。
 */
export async function applyOwnedNoteContentChange(
  connection,
  { userId, actorUserId, noteId, before, after, maxContentLength = 1_000_000 } = {},
) {
  if (!connection?.query) throw noteServiceError('CONNECTION_REQUIRED', '缺少事务连接', 500);
  if (!userId || !noteId) throw noteServiceError('NOTE_OWNER_REQUIRED', '缺少笔记归属信息');

  const nextType = normalizeNoteType(after?.type || '');
  const rawNextContent = String(after?.content ?? '');
  const nextContent = nextType === 'markdown' ? normalizeMarkdownBlockquoteEntities(rawNextContent) : rawNextContent;
  if (!NOTE_TYPES.has(nextType)) throw noteServiceError('INVALID_NOTE_TYPE', '笔记类型仅支持 html 或 markdown');
  if (nextContent.length > maxContentLength) {
    throw noteServiceError('CONTENT_TOO_LONG', `笔记正文不能超过 ${maxContentLength} 个字符`);
  }

  const [rows] = await connection.query(
    'SELECT title, content, type FROM note WHERE id = ? AND create_by = ? AND del_flag = 0 FOR UPDATE',
    [String(noteId), String(userId)],
  );
  if (!rows.length) throw noteServiceError('RESOURCE_NOT_FOUND', '笔记不存在或无权操作', 404);

  const currentType = normalizeNoteType(rows[0].type || 'html');
  const current = {
    title: rows[0].title || '',
    content:
      currentType === 'markdown' ? normalizeMarkdownBlockquoteEntities(rows[0].content || '') : rows[0].content || '',
    type: currentType,
  };
  const expectedType = normalizeNoteType(before?.type || 'html');
  const expected = {
    title: String(before?.title || ''),
    content:
      expectedType === 'markdown'
        ? normalizeMarkdownBlockquoteEntities(before?.content ?? '')
        : String(before?.content ?? ''),
    type: expectedType,
  };
  if (current.title !== expected.title || current.content !== expected.content || current.type !== expected.type) {
    throw noteServiceError('NOTE_VERSION_CONFLICT', '笔记在预览后已发生变化，请重新生成差异', 409);
  }

  await connection.query('INSERT INTO note_versions SET ?', [
    insertData({
      noteId: String(noteId),
      title: current.title,
      content: current.content,
      type: current.type,
      createBy: String(userId),
    }),
  ]);

  const [versionRows] = await connection.query(
    'SELECT id FROM note_versions WHERE note_id = ? ORDER BY create_time DESC, id DESC',
    [String(noteId)],
  );
  const staleVersionIds = versionRows.slice(NOTE_VERSION_KEEP).map((row) => row.id);
  if (staleVersionIds.length) {
    const placeholders = staleVersionIds.map(() => '?').join(',');
    await connection.query(`DELETE FROM note_versions WHERE id IN (${placeholders})`, staleVersionIds);
  }

  const [updateResult] = await connection.query(
    'UPDATE note SET content = ?, type = ?, update_by = ? WHERE id = ? AND create_by = ? AND del_flag = 0',
    [nextContent, nextType, String(actorUserId || userId), String(noteId), String(userId)],
  );
  if (Number(updateResult?.affectedRows || 0) !== 1) {
    throw noteServiceError('NOTE_UPDATE_FAILED', '笔记更新失败，请重新加载后再试', 409);
  }

  const imageUrls = extractNoteImageUrls(nextContent);
  if (imageUrls.length) {
    // 单个 mysql2 connection 上串行执行，避免同一事务连接的并发查询互相排队时产生不确定顺序。
    const [registeredRows] = await connection.query('SELECT url FROM note_images WHERE note_id = ?', [String(noteId)]);
    const ownedUrls = await filterOwnedImageUrls({ urls: imageUrls, userId: String(userId), connection });
    const registered = new Set(registeredRows.map((row) => String(row.url)));
    for (const url of ownedUrls) {
      if (!registered.has(url)) {
        await connection.query('INSERT INTO note_images SET ?', [insertData({ noteId: String(noteId), url })]);
        registered.add(url);
      }
    }
  }

  // 笔记内联提及(N0):UPDATE 落库后、调用方 commit 前,把正文站内引用差异同步到 note_resource_refs。
  // apply 是更新语义,正文可能从"有链接"变为"无链接",故无条件 sync(差异同步会正确删除旧引用)。
  const nextRefs = extractOwnedResourceRefs({ content: nextContent, type: nextType });
  await syncNoteResourceRefs(connection, { userId: String(userId), noteId: String(noteId), refs: nextRefs });

  return { title: current.title, content: nextContent, type: nextType };
}
