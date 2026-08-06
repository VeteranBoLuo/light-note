import pool from '../db/index.js';
import { normalizeMarkdownBlockquoteEntities, normalizeNoteType } from '@lightnote/shared';
import { snakeCaseKeys, resultData, mergeExistingProperties, insertData, L } from '../util/common.js';
import { RESOURCE_TYPE, replaceResourceTagRelations, validateUserTags } from '../util/resourceTags.js';
import { ensureNotVisitor } from '../util/auth.js';
import { attachPendingStatus } from '../util/resourceInbox.js';
import { createNote } from '../util/services/noteService.js';
import {
  DEFAULT_RESOURCE_BACKLINK_LIMIT,
  MAX_RESOURCE_BACKLINK_LIMIT,
  extractOwnedResourceRefs,
  getResourceRefNavigation,
  listOwnedResourceBacklinks,
  normalizeResourceRef,
  normalizeResourceRefList,
  resolveOwnedResourceRefSummaries,
  syncNoteResourceRefs,
} from '../util/services/noteReferenceService.js';
import { createTag } from '../util/services/tagService.js';
import { cleanupOrphanNoteImages, extractNoteImageUrls, filterOwnedImageUrls } from '../util/noteImages.js';
import { promises as fsP } from 'node:fs';
import { invalidatePersonalKnowledgeCache } from '../util/personalKnowledgeSearch.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';
import { buildPagedResult, normalizeOptionalPagination } from '../util/pagination.js';
import { triggerResourceCreateEffects } from '../util/services/resourceCreateEffects.js';
import {
  deleteOwnedNoteSubtrees,
  moveOwnedNoteNode,
  moveOwnedNoteNodes,
  NoteTreeError,
  loadOwnedNoteTree,
  prepareOwnedNotePlacement,
  queryOwnedNoteTree,
  resolveNoteBreadcrumbFromSnapshot,
  resolveNoteDescendantIdsFromSnapshot,
  resolveOwnedNoteBreadcrumb,
} from '../util/services/noteTreeService.js';
import {
  EXPORT_FORMATS,
  MAX_EXPORT_BYTES,
  consumeExportTicket,
  createExportTicket,
} from '../util/noteExportTickets.js';
import {
  assertNoteTreeFeature,
  NOTE_TREE_FEATURE,
  NoteTreeFeatureError,
  noteTreeFeatureIdentity,
  resolveNoteTreeFeatures,
} from '../util/noteTreeFeatureFlags.js';

// multer 先落盘后进 handler:任何登记失败分支都必须丢弃已落盘文件,
// 否则登录用户反复提交无效 noteId 即可持续向磁盘写入孤儿文件
const discardUploadedFile = (file) => {
  if (file?.path) fsP.unlink(file.path).catch(() => {});
};

// 模板接口的 500 统一收口:原始错误只进服务端日志,不把 e.message(可能含 SQL/表名)回给前端
const sendTemplateServerError = (res, scene, error) => {
  console.error('[note-template] %s failed code=%s', scene, stableAgentErrorCode(error));
  return res.send(resultData(null, 500, '服务器暂时无法处理,请稍后重试'));
};

const sendNoteServerError = (res, scene, error) => {
  console.error('[note-library] %s failed code=%s', scene, stableAgentErrorCode(error));
  return res.send(resultData(null, 500, '服务器暂时无法处理,请稍后重试'));
};

const NOTE_TREE_ERROR_COPY = Object.freeze({
  NOTE_TREE_USER_REQUIRED: ['缺少用户身份', 'User identity is required'],
  NOTE_TREE_NODE_NOT_FOUND: ['笔记不存在', 'Note not found'],
  NOTE_TREE_PARENT_NOT_FOUND: ['目录不存在', 'Directory not found'],
  NOTE_TREE_PARENT_INVALID: ['目标目录结构异常，暂时不能移动到这里', 'The target directory structure is invalid'],
  NOTE_TREE_INVALID_DEPTH: ['目录展开层级无效', 'Invalid directory depth'],
  NOTE_TREE_CYCLE: ['笔记目录存在循环关系', 'The note tree contains a cycle'],
  NOTE_TREE_DEPTH_EXCEEDED: ['已超过目录最大层级', 'The maximum directory depth would be exceeded'],
  NOTE_TREE_NODE_ID_REQUIRED: ['缺少笔记 ID', 'Note ID is required'],
  INVALID_NOTE_TYPE: ['笔记类型无效', 'Invalid note type'],
  NOTE_TREE_MOVE_CONFLICT: ['页面状态已变化，请刷新后重试', 'The page changed; refresh and try again'],
  NOTE_TREE_DELETE_CONFLICT: [
    '页面数量已变化，请重新确认删除范围',
    'The page count changed; confirm the deletion scope again',
  ],
  NOTE_TREE_INVALID_DELETE_REQUEST: ['删除参数无效', 'Invalid deletion parameters'],
  NOTE_TREE_TOO_MANY_NODES: ['单次处理的页面过多', 'Too many pages in one operation'],
  NOTE_TREE_RESTORE_CONFLICT: ['页面状态已变化，请刷新后重试', 'The page changed; refresh and try again'],
  INVALID_SORT_ANCHOR: ['排序位置已变化，请刷新后重试', 'The sort position changed; refresh and try again'],
  NOTE_HAS_CHILDREN: [
    '页面包含子页面，请使用“移入回收站”删除整棵子树',
    'This page has subpages; delete the subtree instead',
  ],
});

const sendNoteTreeError = (req, res, scene, error) => {
  if (error instanceof NoteTreeFeatureError) {
    return res.send(
      resultData(
        { code: error.code, feature: error.feature },
        error.status,
        L(req, '该功能暂未对当前账号开放', 'This feature is not available for this account yet'),
      ),
    );
  }
  if (error instanceof NoteTreeError) {
    const [zh, en] = NOTE_TREE_ERROR_COPY[error.code] || [
      '笔记目录暂时无法处理该请求',
      'The note directory cannot process this request right now',
    ];
    return res.send(
      resultData(
        { code: error.code, ...(error.details ? { details: error.details } : {}) },
        error.status || 400,
        L(req, zh, en),
      ),
    );
  }
  return sendNoteServerError(res, scene, error);
};

// Markdown 正文的规范读模型：只对当前正式类型 `markdown` 生效。
// 早期 `md` 记录的正文实际可能是 HTML，不能把它当作 Markdown 源码改写。
const normalizeCanonicalMarkdownContent = (content, type) =>
  type === 'markdown' ? normalizeMarkdownBlockquoteEntities(content) : content;

const normalizeCanonicalMarkdownRecord = (record) => {
  if (!record || record.type !== 'markdown') return record;
  return {
    ...record,
    content: normalizeMarkdownBlockquoteEntities(record.content),
  };
};

// 笔记图片上传登记(multer 已将文件落盘,这里负责归属校验与建档)。
// note_images 的归属可信度是图片引用计数体系的地基:
// - 传入 noteId 必须校验属于当前用户,否则可向他人笔记挂图污染归属;
// - 未传 noteId 时服务端用 insertData 先生成笔记 id(禁止 ORDER BY LIMIT 1 全局取最新),
//   笔记与图片登记在同一事务内提交。
export const uploadNoteImage = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    if (!req.file) {
      return res.send(resultData(null, 400, '没有上传文件'));
    }
    const userId = req.user.id;
    const fileUrl = `https://boluo66.top/uploads/${req.file.filename}`;
    const noteId = String(req.body.noteId || '').trim();

    if (noteId) {
      const [own] = await pool.query('SELECT id FROM note WHERE id = ? AND create_by = ?', [noteId, userId]);
      if (own.length === 0) {
        discardUploadedFile(req.file);
        return res.send(resultData(null, 404, '笔记不存在'));
      }
      await pool.query('INSERT INTO note_images SET ?', [insertData({ noteId, url: fileUrl })]);
      return res.send(resultData({ url: fileUrl }));
    }

    const noteData = insertData({ title: '未命名文档', createBy: userId });
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const placement = await prepareOwnedNotePlacement(connection, { userId, parentId: null });
      noteData.parent_id = placement.parentId;
      noteData.sort = placement.sort;
      await connection.query('INSERT INTO note SET ?', [noteData]);
      await connection.query('INSERT INTO note_images SET ?', [insertData({ noteId: noteData.id, url: fileUrl })]);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    triggerResourceCreateEffects({
      request: req,
      userId,
      userRole: req.user.role,
      resourceType: 'note',
      resourceId: noteData.id,
      suppressUserRewards: req.suppressUserRewards || req.isVisitorWorkspace,
    });
    res.send(resultData({ url: fileUrl, noteId: noteData.id }));
  } catch (e) {
    // 登记失败(归属查询/写库/事务回滚)统一丢弃已落盘文件,不留孤儿
    discardUploadedFile(req.file);
    if (e instanceof NoteTreeError) return sendNoteTreeError(req, res, 'register-note-image', e);
    return sendNoteServerError(res, 'register-note-image', e);
  }
};

export const addNote = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const userId = req.user.id;
    const { addToInbox = false, inboxSource = 'quick_capture', ...noteBody } = req.body || {};
    if (String(noteBody.parentId || '').trim()) assertNoteTreeFeature(req, NOTE_TREE_FEATURE.WRITE);
    const result = await createNote({
      userId,
      userRole: req.user.role,
      note: noteBody,
      addToInbox: addToInbox === true,
      inboxSource,
      request: req,
      suppressUserRewards: req.suppressUserRewards || req.isVisitorWorkspace,
    });
    return res.send(
      resultData({ id: result.id, parentId: result.parentId ?? null, addedToInbox: result.addedToInbox }),
    );
  } catch (e) {
    if (e instanceof NoteTreeError || e instanceof NoteTreeFeatureError) {
      return sendNoteTreeError(req, res, 'add-note', e);
    }
    return sendNoteServerError(res, 'add-note', e);
  }
};

export const getNoteTreeFeatures = (req, res) =>
  res.send(resultData({ features: resolveNoteTreeFeatures(noteTreeFeatureIdentity(req)) }));

// 页面树只读元数据：不返回正文，服务端始终按 auth/admin context 中的 subject 用户建树。
export const queryNoteTree = async (req, res) => {
  try {
    assertNoteTreeFeature(req, NOTE_TREE_FEATURE.READ);
    const result = await queryOwnedNoteTree({
      userId: req.user?.id,
      parentId: req.body?.parentId ?? null,
      depth: req.body?.depth ?? 1,
      keyword: req.body?.keyword ?? '',
    });
    return res.send(resultData(result));
  } catch (error) {
    return sendNoteTreeError(req, res, 'query-note-tree', error);
  }
};

export const queryNoteBreadcrumb = async (req, res) => {
  try {
    assertNoteTreeFeature(req, NOTE_TREE_FEATURE.READ);
    const noteId = String(req.body?.noteId || '').trim();
    if (!noteId) {
      return res.send(
        resultData({ code: 'NOTE_TREE_NOTE_ID_REQUIRED' }, 400, L(req, '缺少笔记 ID', 'Note ID is required')),
      );
    }
    const result = await resolveOwnedNoteBreadcrumb({ userId: req.user?.id, noteId });
    return res.send(resultData(result));
  } catch (error) {
    return sendNoteTreeError(req, res, 'query-note-breadcrumb', error);
  }
};

export const moveNoteNode = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  let connection;
  let transactionStarted = false;
  try {
    assertNoteTreeFeature(req, NOTE_TREE_FEATURE.WRITE);
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const result = await moveOwnedNoteNode(connection, {
      userId: req.user.id,
      id: req.body?.id,
      parentId: Object.prototype.hasOwnProperty.call(req.body || {}, 'parentId') ? req.body.parentId : undefined,
      previousId: req.body?.previousId ?? null,
      nextId: req.body?.nextId ?? null,
    });
    await connection.commit();
    await invalidatePersonalKnowledgeCache(req.user.id);
    return res.send(resultData(result));
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch {
        // 保留原始业务错误；移动操作可由客户端刷新权威树后安全重试。
      }
    }
    if (error instanceof NoteTreeError || error instanceof NoteTreeFeatureError) {
      return sendNoteTreeError(req, res, 'move-note-node', error);
    }
    return sendNoteServerError(res, 'move-note-node', error);
  } finally {
    connection?.release();
  }
};

export const moveNoteNodes = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  let connection;
  let transactionStarted = false;
  try {
    assertNoteTreeFeature(req, NOTE_TREE_FEATURE.WRITE);
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const result = await moveOwnedNoteNodes(connection, {
      userId: req.user.id,
      ids: req.body?.ids,
      parentId: req.body?.parentId ?? null,
    });
    await connection.commit();
    await invalidatePersonalKnowledgeCache(req.user.id);
    return res.send(resultData(result));
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch {
        // 保留最初的目录业务错误，避免回滚异常覆盖稳定错误码。
      }
    }
    if (error instanceof NoteTreeError || error instanceof NoteTreeFeatureError) {
      return sendNoteTreeError(req, res, 'move-note-nodes', error);
    }
    return sendNoteServerError(res, 'move-note-nodes', error);
  } finally {
    connection?.release();
  }
};

// —— 笔记历史版本快照配置 ——
// 正文自动保存是高频操作(停敲 500ms 即存),无脑存快照会撑爆版本表,故加三重闸门:
// 1) 内容去重:正文无变化不存 2) 时间合并:距上一条版本不足窗口则并入 3) 每篇保留上限,超出删最旧
const NOTE_VERSION_MERGE_WINDOW_MS = 3 * 60 * 1000; // 连续编辑每 3 分钟落一个还原点
const NOTE_VERSION_KEEP = 20; // 每篇笔记最多保留的历史版本数
const NOTE_UPDATE_TYPES = new Set(['html', 'markdown']);
const NOTE_TITLE_MAX_LENGTH = 255;
const NOTE_CONTENT_MAX_LENGTH = 1_000_000;

// 历史版本字数改由前端按"渲染后展示文本"计算(html: DOM textContent; md: marked 渲染后取 textContent),
// 后端只回传 content + type,不再在 SQL/JS 层估算(见前端 utils/common.ts 的 noteDisplayText)。

// 删除超出保留上限的最旧版本(须在事务连接上执行)
async function pruneNoteVersions(connection, noteId) {
  const [cntRows] = await connection.query('SELECT COUNT(*) AS n FROM note_versions WHERE note_id=?', [noteId]);
  const overflow = cntRows[0].n - NOTE_VERSION_KEEP;
  if (overflow <= 0) return;
  const [oldRows] = await connection.query(
    'SELECT id FROM note_versions WHERE note_id=? ORDER BY create_time ASC, id ASC LIMIT ?',
    [noteId, overflow],
  );
  if (oldRows.length === 0) return;
  const ids = oldRows.map((r) => r.id);
  const placeholders = ids.map(() => '?').join(',');
  await connection.query(`DELETE FROM note_versions WHERE id IN (${placeholders})`, ids);
}

// 覆盖笔记前,把"改动前"的旧内容存为一个历史版本(按闸门策略决定是否真正落库)
async function snapshotNoteVersion(connection, { noteId, userId, newContent }) {
  // 本次未提交正文(仅改标题/标签等)则不快照
  if (newContent === undefined || newContent === null) return;
  const [rows] = await connection.query('SELECT title, content, type FROM note WHERE id=? AND create_by=?', [
    noteId,
    userId,
  ]);
  if (rows.length === 0) return; // 笔记不存在或非本人,交由后续 update 的 where 兜底
  const oldContent = normalizeCanonicalMarkdownContent(rows[0].content ?? '', rows[0].type);
  if (oldContent === newContent) return; // 正文无变化,去重
  // 时间合并:距该笔记上一条版本不足窗口则并入,不新增
  const [lastRows] = await connection.query(
    'SELECT create_time FROM note_versions WHERE note_id=? ORDER BY create_time DESC, id DESC LIMIT 1',
    [noteId],
  );
  if (lastRows.length > 0 && Date.now() - new Date(lastRows[0].create_time).getTime() < NOTE_VERSION_MERGE_WINDOW_MS) {
    return;
  }
  const versionData = insertData({
    noteId,
    title: rows[0].title,
    content: oldContent,
    type: rows[0].type,
    createBy: userId,
  });
  await connection.query('INSERT INTO note_versions SET ?', [versionData]);
  await pruneNoteVersions(connection, noteId);
}

export const updateNote = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const requestBody = req.body && typeof req.body === 'object' ? req.body : {};
  const noteId = String(requestBody.id || '').trim();
  if (!noteId || noteId.length > 255) {
    return res.send(resultData(null, 400, L(req, '笔记 ID 无效', 'Invalid note ID')));
  }

  const hasSubmittedTitle = Object.prototype.hasOwnProperty.call(requestBody, 'title');
  const hasSubmittedContent = Object.prototype.hasOwnProperty.call(requestBody, 'content');
  const hasSubmittedType = Object.prototype.hasOwnProperty.call(requestBody, 'type');
  const hasSubmittedTags = Object.prototype.hasOwnProperty.call(requestBody, 'tags');
  if (
    hasSubmittedTitle &&
    (typeof requestBody.title !== 'string' ||
      !requestBody.title.trim() ||
      requestBody.title.length > NOTE_TITLE_MAX_LENGTH)
  ) {
    return res.send(resultData(null, 400, L(req, '笔记标题无效', 'Invalid note title')));
  }
  if (
    hasSubmittedContent &&
    requestBody.content !== null &&
    typeof requestBody.content !== 'string'
  ) {
    return res.send(resultData(null, 400, L(req, '笔记正文无效', 'Invalid note content')));
  }
  const rawContent = hasSubmittedContent ? String(requestBody.content ?? '') : undefined;
  if (rawContent !== undefined && rawContent.length > NOTE_CONTENT_MAX_LENGTH) {
    return res.send(resultData(null, 400, L(req, '笔记正文过长', 'Note content is too long')));
  }
  const submittedType = hasSubmittedType ? normalizeNoteType(requestBody.type) : null;
  if (hasSubmittedType && !NOTE_UPDATE_TYPES.has(submittedType)) {
    return res.send(resultData(null, 400, L(req, '笔记类型无效', 'Invalid note type')));
  }
  if (hasSubmittedTags && !Array.isArray(requestBody.tags)) {
    return res.send(resultData(null, 400, L(req, '标签参数无效', 'Invalid tag list')));
  }

  let connection;
  let transactionStarted = false;
  try {
    const userId = req.user.id;
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    // 先锁定 owner 的有效笔记。后续标签与引用同步都以这条权威记录为边界，
    // 避免“主表更新 0 行、关系表却写入”的越权旁路。
    const [ownedRows] = await connection.query(
      'SELECT id, title, content, type FROM note WHERE id = ? AND create_by = ? AND del_flag = 0 FOR UPDATE',
      [noteId, userId],
    );
    if (!ownedRows.length) {
      throw new NoteTreeError('NOTE_TREE_NODE_NOT_FOUND', '笔记不存在', 404);
    }
    const ownedNote = ownedRows[0];
    const currentType = normalizeNoteType(ownedNote.type);
    const finalType = submittedType || currentType;
    if (!NOTE_UPDATE_TYPES.has(finalType)) {
      throw new NoteTreeError('INVALID_NOTE_TYPE', '笔记类型无效', 400);
    }
    const finalContent = hasSubmittedContent
      ? finalType === 'markdown'
        ? normalizeMarkdownBlockquoteEntities(rawContent)
        : rawContent
      : String(ownedNote.content ?? '');

    // 主表只允许正文编辑域字段。parent_id/sort/is_top/del_flag/owner 等字段必须走各自
    // 的服务端领域接口，不能由客户端请求体透传，从根源封住 mass assignment。
    const updateParams = {};
    if (hasSubmittedTitle) updateParams.title = requestBody.title;
    if (hasSubmittedContent) updateParams.content = finalContent;
    if (hasSubmittedType) updateParams.type = finalType;
    if (Object.keys(updateParams).length) {
      updateParams.updateBy = userId;
      // 覆盖前先存历史版本快照(改动前旧内容;含去重/时间合并/保留上限)
      await snapshotNoteVersion(connection, { noteId, userId, newContent: updateParams.content });
      await connection.query('update note set ? where id=? and create_by=? and del_flag=0', [
        snakeCaseKeys(updateParams),
        noteId,
        userId,
      ]);
    }
    if (hasSubmittedTags) {
      const tagIds = await validateUserTags(connection, { tagIds: requestBody.tags, userId });
      await replaceResourceTagRelations(connection, {
        tagIds,
        resourceType: RESOURCE_TYPE.NOTE,
        resourceId: noteId,
        userId,
      });
    }
    // 笔记内联提及(N0):只有正文或正文类型发生提交时才同步。仅改标题/标签/排序时跳过,
    // 避免用空正文误删已有引用；但「只切换 type」也会改变同一正文的解析语义，不能漏掉。
    if (hasSubmittedContent || hasSubmittedType) {
      const refs = extractOwnedResourceRefs({ content: finalContent, type: finalType });
      await syncNoteResourceRefs(connection, { userId, noteId, refs });
    }
    await connection.commit();
    transactionStarted = false;
    if (Object.keys(updateParams).length || hasSubmittedTags) await invalidatePersonalKnowledgeCache(userId);
    return res.send(resultData('更新笔记成功'));
  } catch (e) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch {
        // 保留最初的业务错误，避免回滚异常覆盖稳定响应。
      }
    }
    if (e instanceof NoteTreeError) return sendNoteTreeError(req, res, 'update-note', e);
    return sendNoteServerError(res, 'update-note', e);
  } finally {
    connection?.release();
  }
};

export const queryNoteList = async (req, res) => {
  try {
    const userId = req.user.id;
    const tagId = req.body?.tagId;
    const keyword = String(req.body?.keyword || '')
      .trim()
      .slice(0, 200);
    const pagination = normalizeOptionalPagination(req.body);
    const where = ['n.create_by = ?', 'n.del_flag = 0'];
    const params = [userId];
    const treeMode = Object.prototype.hasOwnProperty.call(req.body || {}, 'parentId');
    if (treeMode) assertNoteTreeFeature(req, NOTE_TREE_FEATURE.READ);
    const parentId = String(req.body?.parentId ?? '').trim() || null;
    const hasTreeFilter = Boolean(keyword) || tagId === 'null' || Boolean(tagId);
    let treeSnapshot = null;

    if (treeMode) {
      treeSnapshot = await loadOwnedNoteTree(userId);
      if (parentId && !treeSnapshot.nodesById.has(parentId)) {
        throw new NoteTreeError('NOTE_TREE_PARENT_NOT_FOUND', '目录不存在', 404);
      }
      if (hasTreeFilter && parentId) {
        // 搜索/标签筛选始终由服务端扩展当前页面的全部后代；不信任客户端上传的 includeDescendants。
        const descendantIds = resolveNoteDescendantIdsFromSnapshot(treeSnapshot, parentId);
        if (descendantIds.length) {
          where.push(`n.id IN (${descendantIds.map(() => '?').join(',')})`);
          params.push(...descendantIds);
        } else {
          where.push('1 = 0');
        }
      } else if (!hasTreeFilter) {
        if (parentId) {
          where.push('n.parent_id = ?');
          params.push(parentId);
        } else {
          where.push('n.parent_id IS NULL');
        }
      }
    }

    if (keyword) {
      const like = `%${keyword}%`;
      where.push('(n.title LIKE ? OR n.content LIKE ?)');
      params.push(like, like);
    }
    if (tagId === 'null') {
      where.push(`
        NOT EXISTS (
          SELECT 1
          FROM resource_tag_relations nr
          INNER JOIN tag nt ON nt.id = nr.tag_id AND nt.del_flag = 0
          WHERE nr.resource_type = 'note' AND nr.resource_id = n.id
        )
      `);
    } else if (tagId) {
      where.push(`
        EXISTS (
          SELECT 1
          FROM resource_tag_relations nr
          WHERE nr.resource_type = 'note'
            AND nr.resource_id = n.id
            AND nr.tag_id = ?
        )
      `);
      params.push(tagId);
    }

    const whereSql = where.join(' AND ');
    let listSql = `
      SELECT n.*,
        (
          SELECT JSON_ARRAYAGG(JSON_OBJECT('id', t.id, 'name', t.name))
          FROM resource_tag_relations r
          INNER JOIN tag t ON r.tag_id = t.id
          WHERE r.resource_type = 'note'
            AND r.resource_id = n.id
            AND t.del_flag = 0
        ) AS tags,
        (
          SELECT COUNT(*)
          FROM note child
          WHERE child.create_by = n.create_by
            AND child.parent_id = n.id
            AND child.del_flag = 0
        ) AS child_count
      FROM note n
      WHERE ${whereSql}
      GROUP BY n.id
      ORDER BY n.is_top DESC, n.sort, n.update_time DESC, n.id DESC
    `;
    const listParams = [...params];
    if (pagination.enabled) {
      listSql += ' LIMIT ? OFFSET ?';
      listParams.push(pagination.pageSize, pagination.offset);
    }

    const [listQueryResult, totalQueryResult] = await Promise.all([
      pool.query(listSql, listParams),
      pagination.enabled
        ? pool.query(`SELECT COUNT(*) AS total FROM note n WHERE ${whereSql}`, params)
        : Promise.resolve([[]]),
    ]);
    const [result] = listQueryResult;
    const total = pagination.enabled ? Number(totalQueryResult?.[0]?.[0]?.total || 0) : result.length;

    // 处理 tags 为数组，如果 NULL 或包含无效标签则为空数组。
    result.forEach((note) => {
      note.tags =
        note.tags && Array.isArray(note.tags) && note.tags.every((tag) => tag && tag.id !== null) ? note.tags : [];
      if (treeSnapshot && hasTreeFilter) {
        const path = resolveNoteBreadcrumbFromSnapshot(treeSnapshot, String(note.id));
        note.path = path;
        note.path_text = path
          .slice(0, -1)
          .map((item) => item.title)
          .join(' / ');
      }
    });
    try {
      await attachPendingStatus(pool, { userId, resourceType: 'note', items: result });
    } catch (error) {
      console.warn('[待整理角标] 笔记状态回填失败(忽略) code=%s', String(error?.code || 'INBOX_STATUS_FAILED'));
    }

    return res.send(resultData(pagination.enabled ? buildPagedResult(result, total, pagination) : result));
  } catch (error) {
    if (error instanceof NoteTreeError || error instanceof NoteTreeFeatureError) {
      return sendNoteTreeError(req, res, 'query-note-list', error);
    }
    console.error('[note-library] list failed code=%s', String(error?.code || 'NOTE_LIBRARY_LIST_FAILED'));
    return res.send(
      resultData(null, 500, L(req, '服务器暂时无法处理，请稍后重试', 'The server is temporarily unavailable')),
    );
  }
};

export const getNoteDetail = (req, res) => {
  try {
    const userId = req.user.id;
    // 归属校验:只能读自己的笔记(游客=共享 visitor 账号),防止传他人 note id 越权读取;越权/不存在统一 404 不泄露存在性
    pool
      .query('select * from note where id=? and create_by=? and del_flag=?', [req.body.id, userId, '0'])
      .then(([result]) => {
        if (result.length === 0) {
          return res.send(resultData(null, 404, '笔记不存在'));
        }
        res.send(resultData(normalizeCanonicalMarkdownRecord(result[0])));
      })
      .catch((err) => {
        return sendNoteServerError(res, 'get-note-detail', err);
      });
  } catch (e) {
    console.warn('[note-library] get detail rejected code=%s', stableAgentErrorCode(e));
    return res.send(resultData(null, 400, '客户端请求参数无效'));
  }
};

// N1 阅读态批量解析：正文里的 canonical 链接只有在当前主体仍拥有、且未删除时才返回可用名称和跳转语义。
// 不接收 userId，永远使用 auth/admin context 已解析好的 req.user（管理员预览时即目标 subject）。
export const resolveResourceRefs = async (req, res) => {
  try {
    const normalized = normalizeResourceRefList(req.body?.refs);
    if (normalized.tooMany) {
      return res.send(resultData(null, 400, '一次最多解析 100 个引用'));
    }
    if (normalized.invalid) {
      return res.send(resultData(null, 400, '引用参数无效'));
    }
    const summaries = await resolveOwnedResourceRefSummaries(pool, {
      userId: req.user.id,
      refs: normalized.refs,
    });
    return res.send(
      resultData({
        refs: summaries.map((item) => ({
          type: item.type,
          id: item.id,
          title: item.title,
          available: item.available,
          ...(item.type === 'bookmark' && item.available && item.url ? { url: item.url } : {}),
          navigation: item.available ? getResourceRefNavigation(item) : null,
        })),
      }),
    );
  } catch (error) {
    return sendNoteServerError(res, 'resolve-resource-refs', error);
  }
};

// N2 反链：目标与每一条源笔记都在 service 内重新按当前主体校验；目标不可用统一返回空，避免资源探测。
export const resourceBacklinks = async (req, res) => {
  try {
    const target = normalizeResourceRef({
      type: req.body?.targetType,
      id: req.body?.targetId,
    });
    if (!target) {
      return res.send(resultData(null, 400, '引用目标参数无效'));
    }
    const rawLimit = req.body?.limit ?? DEFAULT_RESOURCE_BACKLINK_LIMIT;
    const limit = Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RESOURCE_BACKLINK_LIMIT) {
      return res.send(resultData(null, 400, `limit 必须在 1 到 ${MAX_RESOURCE_BACKLINK_LIMIT} 之间`));
    }
    const result = await listOwnedResourceBacklinks(pool, {
      userId: req.user.id,
      targetType: target.type,
      targetId: target.id,
      limit,
    });
    return res.send(resultData(result));
  } catch (error) {
    return sendNoteServerError(res, 'resource-backlinks', error);
  }
};

export const delNote = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const ids = [
      ...new Set(
        (Array.isArray(req.body?.ids) ? req.body.ids : []).map((id) => String(id ?? '').trim()).filter(Boolean),
      ),
    ];
    if (ids.length === 0 || ids.length > 100) {
      return res.send(resultData(null, 400, '无效的请求参数'));
    }

    const userId = req.user.id;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await deleteOwnedNoteSubtrees(connection, {
        userId,
        items: ids.map((id) => ({ id, expectedDescendantCount: 0 })),
      });
      await connection.commit();
      await invalidatePersonalKnowledgeCache(userId);
      return res.send(resultData(result));
    } catch (error) {
      await connection.rollback();
      if (
        error instanceof NoteTreeError &&
        error.code === 'NOTE_TREE_DELETE_CONFLICT' &&
        Number(error.details?.actualDescendantCount || 0) > 0
      ) {
        throw new NoteTreeError('NOTE_HAS_CHILDREN', '页面包含子页面', 409, error.details);
      }
      throw error;
    } finally {
      connection.release();
    }
  } catch (e) {
    console.warn('[note-library] batch delete rejected code=%s', stableAgentErrorCode(e));
    if (e instanceof NoteTreeError) return sendNoteTreeError(req, res, 'delete-note', e);
    return res.send(resultData(null, 400, '客户端请求异常'));
  }
};

export const deleteNoteSubtree = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  let connection;
  let transactionStarted = false;
  try {
    assertNoteTreeFeature(req, NOTE_TREE_FEATURE.SUBTREE_TRASH);
    const requestItems = Array.isArray(req.body?.items)
      ? req.body.items
      : [{ id: req.body?.id, expectedDescendantCount: req.body?.expectedDescendantCount }];
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const result = await deleteOwnedNoteSubtrees(connection, {
      userId: req.user.id,
      items: requestItems,
    });
    await connection.commit();
    await invalidatePersonalKnowledgeCache(req.user.id);
    return res.send(resultData(result));
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch {
        // 保留原始目录冲突；客户端会重新读取权威数量后再次确认。
      }
    }
    return sendNoteTreeError(req, res, 'delete-note-subtree', error);
  } finally {
    connection?.release();
  }
};

export const updateNoteSort = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const userId = req.user.id;
  let connection;
  try {
    if (req.body?.move) assertNoteTreeFeature(req, NOTE_TREE_FEATURE.WRITE);
    connection = await pool.getConnection();
    await connection.beginTransaction(); // 开始事务
    if (req.body?.move) {
      const result = await moveOwnedNoteNode(connection, {
        ...req.body.move,
        userId,
      });
      await connection.commit();
      return res.send(resultData(result, 200, 'Sort updated successfully'));
    }

    const notes = Array.isArray(req.body?.notes) ? req.body.notes : [];
    const normalizedNotes = notes.map((note) => ({
      id: String(note?.id ?? '').trim(),
      sort: Number(note?.sort),
    }));
    if (
      normalizedNotes.length === 0 ||
      normalizedNotes.length > 500 ||
      normalizedNotes.some((note) => !note.id || !Number.isInteger(note.sort) || note.sort < 0)
    ) {
      await connection.rollback();
      return res.send(resultData(null, 400, '排序参数无效'));
    }
    const uniqueIds = [...new Set(normalizedNotes.map((note) => note.id))];
    if (uniqueIds.length !== normalizedNotes.length) {
      await connection.rollback();
      return res.send(resultData(null, 400, '排序参数无效'));
    }
    const placeholders = uniqueIds.map(() => '?').join(',');
    const [ownedRows] = await connection.query(
      `SELECT id, parent_id
         FROM note
        WHERE id IN (${placeholders}) AND create_by = ? AND del_flag = 0
        FOR UPDATE`,
      [...uniqueIds, userId],
    );
    if (ownedRows.length !== uniqueIds.length) {
      throw new NoteTreeError('NOTE_TREE_NODE_NOT_FOUND', '笔记不存在', 404);
    }
    const authoritativeParentId =
      ownedRows[0]?.parent_id == null ? null : String(ownedRows[0].parent_id).trim() || null;
    if (
      ownedRows.some(
        (row) => (row.parent_id == null ? null : String(row.parent_id).trim() || null) !== authoritativeParentId,
      )
    ) {
      throw new NoteTreeError('INVALID_SORT_ANCHOR', '只能调整同一目录中的页面顺序', 409);
    }
    if (
      Object.prototype.hasOwnProperty.call(req.body || {}, 'parentId') &&
      (String(req.body.parentId ?? '').trim() || null) !== authoritativeParentId
    ) {
      throw new NoteTreeError('INVALID_SORT_ANCHOR', '目录状态已变化，请刷新后重试', 409);
    }
    for (const note of normalizedNotes) {
      const { id, sort } = note;
      const sql = `UPDATE note
                      SET sort = ?, update_time = update_time
                    WHERE id = ? AND create_by = ? AND del_flag = 0 AND parent_id <=> ?`;
      await connection.query(sql, [sort, id, userId, authoritativeParentId]);
    }
    await connection.commit(); // 提交事务
    res.send(resultData(null, 200, 'Sort updated successfully'));
  } catch (e) {
    if (connection) {
      try {
        await connection.rollback(); // 如果发生错误，回滚事务
      } catch {
        // 保留最初的排序错误，避免回滚异常覆盖稳定业务错误。
      }
    }
    if (e instanceof NoteTreeError || e instanceof NoteTreeFeatureError) {
      return sendNoteTreeError(req, res, 'update-note-sort', e);
    }
    return sendNoteServerError(res, 'update-note-sort', e);
  } finally {
    connection?.release(); // 释放连接回连接池
  }
};

export const toggleNoteTop = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const noteId = String(req.body?.id || '').trim();
  if (!noteId) {
    return res.send(resultData(null, 400, '参数错误'));
  }

  const userId = req.user.id;
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.query(
      'SELECT is_top FROM note WHERE id = ? AND create_by = ? AND del_flag = 0 FOR UPDATE',
      [noteId, userId],
    );
    if (rows.length === 0) {
      await connection.rollback();
      return res.send(resultData(null, 404, '笔记不存在'));
    }

    const isTop = rows[0].is_top ? 0 : 1;
    // 置顶属于整理行为，不应把笔记伪装成刚编辑过；显式保留 update_time。
    await connection.query(
      'UPDATE note SET is_top = ?, update_time = update_time WHERE id = ? AND create_by = ? AND del_flag = 0',
      [isTop, noteId, userId],
    );
    await connection.commit();
    res.send(resultData({ id: noteId, isTop }));
  } catch (e) {
    if (connection) {
      try {
        await connection.rollback();
      } catch {}
    }
    return sendNoteServerError(res, 'toggle-note-top', e);
  } finally {
    connection?.release();
  }
};

export const addNoteTag = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const userId = req.user.id;
    const name = String(req.body.name || '').trim();
    if (!name) {
      return res.send(resultData(null, 400, '标签名称不能为空'));
    }
    try {
      const createdTag = await createTag({ userId, name });
      res.send(resultData({ id: createdTag.id, name: createdTag.name }));
    } catch (err) {
      if (String(err?.message || '').startsWith('TAG_DUPLICATE:')) {
        return res.send(resultData(null, 409, '标签已存在'));
      }
      return sendNoteServerError(res, 'add-note-tag', err);
    }
  } catch (e) {
    console.warn('[note-library] add tag rejected code=%s', stableAgentErrorCode(e));
    return res.send(resultData(null, 400, '客户端请求参数无效'));
  }
};

export const editNoteTag = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const userId = req.user.id;
    const name = String(req.body.name || '').trim();
    if (!name) {
      return res.send(resultData(null, 400, '标签名称不能为空'));
    }
    const params = {
      name,
    };
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [checkRes] = await connection.query('SELECT id FROM tag WHERE user_id = ? AND name = ? AND del_flag = 0', [
        userId,
        name,
      ]);
      if (checkRes.length > 0 && checkRes[0].id !== req.body.id) {
        throw new Error('标签已存在');
      }
      const [result] = await connection.query('update tag set ? where id=? and user_id=?', [
        snakeCaseKeys(mergeExistingProperties(params, [], ['id'])),
        req.body.id,
        userId,
      ]);
      await connection.commit();
      res.send(resultData(result));
    } catch (err) {
      await connection.rollback();
      if (String(err?.message || '') === '标签已存在') {
        return res.send(resultData(null, 409, '标签已存在'));
      }
      return sendNoteServerError(res, 'edit-note-tag', err);
    } finally {
      connection.release();
    }
  } catch (e) {
    console.warn('[note-library] edit tag rejected code=%s', stableAgentErrorCode(e));
    return res.send(resultData(null, 400, '客户端请求参数无效'));
  }
};

export const queryNoteTagList = async (req, res) => {
  try {
    const userId = req.user.id;
    // 标签计数与「全部 / 无标签」汇总取同一次查询,笔记库左侧目录的三类数字才不会互相对不上
    const [tags] = await pool.query(
      `
          SELECT
            t.*,
            (
              SELECT COUNT(*)
              FROM resource_tag_relations r
              INNER JOIN note n ON n.id = r.resource_id AND n.del_flag = 0
              WHERE r.tag_id = t.id AND r.resource_type = 'note'
            ) AS noteCount
          FROM tag t
          WHERE t.user_id = ? AND t.del_flag = 0
          ORDER BY t.sort, t.create_time DESC
        `,
      [userId],
    );
    const [summary] = await pool.query(
      `
          SELECT
            COUNT(*) AS totalCount,
            SUM(
              CASE
                WHEN NOT EXISTS (
                  SELECT 1
                  FROM resource_tag_relations r
                  WHERE r.resource_id = n.id AND r.resource_type = 'note'
                ) THEN 1
                ELSE 0
              END
            ) AS untaggedCount
          FROM note n
          WHERE n.create_by = ? AND n.del_flag = 0
        `,
      [userId],
    );
    res.send(
      resultData({
        items: tags,
        totalCount: Number(summary?.[0]?.totalCount || 0),
        untaggedCount: Number(summary?.[0]?.untaggedCount || 0),
      }),
    );
  } catch (e) {
    return sendNoteServerError(res, 'query-note-tag-list', e);
  }
};

export const getNoteTags = async (req, res) => {
  try {
    const userId = req.user.id;
    const noteId = req.body.id;
    // 归属校验:先确认该笔记属于当前用户,防止传他人 note id 枚举其标签
    const [own] = await pool.query('SELECT id FROM note WHERE id=? AND create_by=? AND del_flag=?', [
      noteId,
      userId,
      '0',
    ]);
    if (own.length === 0) {
      return res.send(resultData(null, 404, '笔记不存在'));
    }
    const [result] = await pool.query(
      `SELECT t.*
       FROM tag t
       JOIN resource_tag_relations r ON t.id = r.tag_id
       WHERE r.resource_type = 'note' AND r.resource_id = ? AND t.del_flag = 0
       ORDER BY t.sort, t.create_time DESC`,
      [noteId],
    );
    res.send(resultData(result));
  } catch (e) {
    return sendNoteServerError(res, 'query-note-tags', e);
  }
};

export const delNoteTag = (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const userId = req.user.id;
    const tagId = req.body.id;
    pool
      .query('DELETE FROM tag WHERE id = ? AND user_id = ?', [tagId, userId])
      .then(() => {
        res.send(resultData('删除标签成功'));
      })
      .catch((err) => {
        return sendNoteServerError(res, 'delete-note-tag', err);
      });
  } catch (e) {
    console.warn('[note-library] delete tag rejected code=%s', stableAgentErrorCode(e));
    return res.send(resultData(null, 400, '客户端请求参数无效'));
  }
};

export const updateNoteTags = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const userId = req.user.id;
    const { noteId, tags } = req.body;
    if (!noteId || !Array.isArray(tags)) {
      return res.send(resultData(null, 400, '参数错误'));
    }
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      // 验证笔记属于用户
      const [noteResult] = await connection.query('SELECT id FROM note WHERE id = ? AND create_by = ?', [
        noteId,
        userId,
      ]);
      if (noteResult.length === 0) {
        await connection.rollback();
        return res.send(resultData(null, 403, '无权限操作此笔记'));
      }
      // 验证所有标签属于用户
      if (tags.length > 0) {
        await validateUserTags(connection, { tagIds: tags, userId });
      }
      await replaceResourceTagRelations(connection, {
        tagIds: tags,
        resourceType: RESOURCE_TYPE.NOTE,
        resourceId: noteId,
        userId,
      });
      await connection.commit();
      res.send(resultData('更新标签成功'));
    } catch (error) {
      await connection.rollback();
      return sendNoteServerError(res, 'update-note-tags', error);
    } finally {
      connection.release();
    }
  } catch (e) {
    console.warn('[note-library] update tags rejected code=%s', stableAgentErrorCode(e));
    return res.send(resultData(null, 400, '客户端请求参数无效'));
  }
};

// 历史版本列表(轻量:不含 content,只回标题/时间/字数,避免一次拉回大字段)
export const getNoteVersions = async (req, res) => {
  try {
    const userId = req.user.id;
    const noteId = req.body.id;
    if (!noteId) {
      return res.send(resultData(null, 400, '参数错误'));
    }
    // 归属校验:只能看自己笔记的版本
    const [own] = await pool.query('SELECT id FROM note WHERE id=? AND create_by=? AND del_flag=?', [
      noteId,
      userId,
      '0',
    ]);
    if (own.length === 0) {
      return res.send(resultData(null, 404, '笔记不存在'));
    }
    const [rows] = await pool.query(
      `SELECT id, title, type, content, create_by, create_time
       FROM note_versions
       WHERE note_id = ?
       ORDER BY create_time DESC, id DESC`,
      [noteId],
    );
    // 回传 content + type,字数与预览渲染都交给前端(按渲染后展示文本计,html/md 口径一致)。
    // 历史的错误实体在读取时也立即还原，用户无需先手动编辑一次才能看到正确 Markdown。
    res.send(resultData(rows.map(normalizeCanonicalMarkdownRecord)));
  } catch (e) {
    return sendNoteServerError(res, 'list-note-versions', e);
  }
};

// 单个版本内容(预览用)
export const getNoteVersionDetail = async (req, res) => {
  try {
    const userId = req.user.id;
    const versionId = req.body.id;
    if (!versionId) {
      return res.send(resultData(null, 400, '参数错误'));
    }
    const [rows] = await pool.query(
      'SELECT id, note_id, title, content, type, create_time FROM note_versions WHERE id=?',
      [versionId],
    );
    if (rows.length === 0) {
      return res.send(resultData(null, 404, '版本不存在'));
    }
    // 归属校验:该版本所属笔记须属于当前用户(两步查询,规避跨表字符集比较)
    const [own] = await pool.query('SELECT id FROM note WHERE id=? AND create_by=?', [rows[0].note_id, userId]);
    if (own.length === 0) {
      return res.send(resultData(null, 404, '版本不存在'));
    }
    res.send(resultData(normalizeCanonicalMarkdownRecord(rows[0])));
  } catch (e) {
    return sendNoteServerError(res, 'get-note-version', e);
  }
};

// 恢复到指定版本:先把当前内容存为一版(后悔药),再覆盖为目标版本
export const restoreNoteVersion = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const userId = req.user.id;
    const versionId = req.body.id;
    if (!versionId) {
      return res.send(resultData(null, 400, '参数错误'));
    }
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [verRows] = await connection.query('SELECT note_id, title, content, type FROM note_versions WHERE id=?', [
        versionId,
      ]);
      if (verRows.length === 0) {
        await connection.rollback();
        return res.send(resultData(null, 404, '版本不存在'));
      }
      const noteId = verRows[0].note_id;
      const verTitle = verRows[0].title;
      const rawVerContent = verRows[0].content ?? '';
      const verType = verRows[0].type || 'html';
      const verContent = normalizeCanonicalMarkdownContent(rawVerContent, verType);
      // 归属校验 + 取当前值(未删除的、属于自己的笔记)
      const [curRows] = await connection.query(
        'SELECT title, content, type FROM note WHERE id=? AND create_by=? AND del_flag=?',
        [noteId, userId, '0'],
      );
      if (curRows.length === 0) {
        await connection.rollback();
        return res.send(resultData(null, 404, '笔记不存在'));
      }
      // 后悔药:恢复前把当前内容强制存为一版(不受时间合并限制),恢复错了还能回来
      const curSnap = insertData({
        noteId,
        title: curRows[0].title,
        content: normalizeCanonicalMarkdownContent(curRows[0].content ?? '', curRows[0].type),
        type: curRows[0].type,
        createBy: userId,
      });
      await connection.query('INSERT INTO note_versions SET ?', [curSnap]);
      // 覆盖为目标版本(含 type:恢复时 md/html 模式一并回到该版本)
      await connection.query('UPDATE note SET title=?, content=?, type=?, update_by=? WHERE id=? AND create_by=?', [
        verTitle,
        verContent,
        verType,
        userId,
        noteId,
        userId,
      ]);
      await pruneNoteVersions(connection, noteId);
      // 笔记内联提及(N0):恢复版本会用目标版本正文覆盖当前正文,必须同步引用(§4.6 恢复不能漏)。
      const restoredRefs = extractOwnedResourceRefs({ content: String(verContent), type: verType });
      await syncNoteResourceRefs(connection, { userId, noteId, refs: restoredRefs });
      await connection.commit();
      await invalidatePersonalKnowledgeCache(userId);
      res.send(resultData({ id: noteId, title: verTitle, content: verContent, type: verType }));
    } catch (error) {
      await connection.rollback();
      return sendNoteServerError(res, 'restore-note-version', error);
    } finally {
      connection.release();
    }
  } catch (e) {
    console.warn('[note-library] restore version rejected code=%s', stableAgentErrorCode(e));
    return res.send(resultData(null, 400, '客户端请求参数无效'));
  }
};

// —— 笔记模板(用户自存;内置模板由前端常量提供,不进库) ——
const NOTE_TEMPLATE_LIMIT = 20; // 每人最多保存的模板数
const NOTE_TEMPLATE_CONTENT_MAX = 1_000_000; // 与笔记正文同一上限
const NOTE_TEMPLATE_TYPES = new Set(['html', 'markdown']);

// 模板列表(轻量:不含 content,选择器只需要元信息;实例化时再按 id 取正文)
export const queryNoteTemplates = async (req, res) => {
  try {
    const userId = req.user.id;
    const [rows] = await pool.query(
      `SELECT id, name, title_template, description, type, update_time
       FROM note_template
       WHERE create_by = ?
       ORDER BY update_time DESC, id DESC`,
      [userId],
    );
    res.send(resultData(rows));
  } catch (e) {
    sendTemplateServerError(res, '查询模板列表', e);
  }
};

// 单个模板内容(实例化用;归属校验防枚举他人模板)
export const getNoteTemplateDetail = async (req, res) => {
  try {
    const userId = req.user.id;
    const templateId = req.body.id;
    if (!templateId) {
      return res.send(resultData(null, 400, '参数错误'));
    }
    const [rows] = await pool.query(
      'SELECT id, name, title_template, description, type, content FROM note_template WHERE id = ? AND create_by = ?',
      [templateId, userId],
    );
    if (rows.length === 0) {
      return res.send(resultData(null, 404, '模板不存在'));
    }
    res.send(resultData(normalizeCanonicalMarkdownRecord(rows[0])));
  } catch (e) {
    sendTemplateServerError(res, '查询模板详情', e);
  }
};

// 存为模板(来自当前笔记的标题/正文/类型)
export const addNoteTemplate = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const userId = req.user.id;
    const name = String(req.body.name || '').trim();
    const titleTemplate = String(req.body.titleTemplate || '').trim();
    const description = String(req.body.description || '').trim();
    const type = req.body.type === 'md' ? 'markdown' : String(req.body.type || 'html');
    const rawContent = String(req.body.content || '');
    const content =
      normalizeNoteType(type) === 'markdown' ? normalizeMarkdownBlockquoteEntities(rawContent) : rawContent;
    if (!name) {
      return res.send(resultData(null, 400, '模板名称不能为空'));
    }
    if (name.length > 60) {
      return res.send(resultData(null, 400, '模板名称不能超过 60 个字符'));
    }
    if (titleTemplate.length > 255) {
      return res.send(resultData(null, 400, '默认标题不能超过 255 个字符'));
    }
    if (description.length > 255) {
      return res.send(resultData(null, 400, '模板描述不能超过 255 个字符'));
    }
    if (!NOTE_TEMPLATE_TYPES.has(type)) {
      return res.send(resultData(null, 400, '模板类型仅支持 html 或 markdown'));
    }
    if (content.length > NOTE_TEMPLATE_CONTENT_MAX) {
      return res.send(resultData(null, 400, '模板内容过长'));
    }
    // 正文引用本站上传图片时,校验全部属于当前用户(经其笔记登记于 note_images),
    // 防止把他人图片 URL 写进模板绕过归属;外链图片不校验、不追踪。
    const imageUrls = extractNoteImageUrls(content);
    if (imageUrls.length) {
      const ownedUrls = await filterOwnedImageUrls({ urls: imageUrls, userId });
      if (ownedUrls.length !== imageUrls.length) {
        return res.send(resultData(null, 400, '模板包含无权使用的图片,请先移除后重试'));
      }
    }
    const [cntRows] = await pool.query('SELECT COUNT(*) AS n FROM note_template WHERE create_by = ?', [userId]);
    if (cntRows[0].n >= NOTE_TEMPLATE_LIMIT) {
      return res.send(resultData(null, 400, `最多保存 ${NOTE_TEMPLATE_LIMIT} 个模板,请先删除不用的模板`));
    }
    const data = insertData({
      name,
      titleTemplate: titleTemplate || null,
      description: description || null,
      type,
      content,
      createBy: userId,
    });
    await pool.query('INSERT INTO note_template SET ?', [data]);
    res.send(resultData({ id: data.id, name }));
  } catch (e) {
    sendTemplateServerError(res, '保存模板', e);
  }
};

// 删除模板(硬删除:模板是轻量可再生数据,不接回收站)
export const delNoteTemplate = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const userId = req.user.id;
    const templateId = req.body.id;
    if (!templateId) {
      return res.send(resultData(null, 400, '参数错误'));
    }
    // 先取正文提取图片 URL:模板可能是这些文件的最后一个引用,删除成功后需触发孤儿清理
    const [rows] = await pool.query('SELECT content FROM note_template WHERE id = ? AND create_by = ?', [
      templateId,
      userId,
    ]);
    if (rows.length === 0) {
      return res.send(resultData(null, 404, '模板不存在'));
    }
    const imageUrls = extractNoteImageUrls(rows[0].content);
    const [result] = await pool.query('DELETE FROM note_template WHERE id = ? AND create_by = ?', [templateId, userId]);
    if (result.affectedRows === 0) {
      return res.send(resultData(null, 404, '模板不存在'));
    }
    cleanupOrphanNoteImages(imageUrls);
    res.send(resultData('删除模板成功'));
  } catch (e) {
    sendTemplateServerError(res, '删除模板', e);
  }
};

/**
 * 导出文件名清洗。前端 buildExportFileName 已经清过一遍,后端不能因此信任它:
 * 这个值会进 Content-Disposition 响应头,残留 CR/LF 就是响应头注入,
 * 残留路径分隔符还会被安全规则当成 PATH_TRAVERSAL 特征。
 */
function sanitizeExportFileName(value, format) {
  // 三种导出格式的扩展名与 format 同名(md/html/pdf),format 已在调用前过白名单
  const extension = format;
  const withoutControls = Array.from(String(value ?? ''))
    .filter((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)
    .join('');
  const base = withoutControls
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(new RegExp(`\\.${extension}$`, 'i'), '')
    .trim();
  const limited = Array.from(base).slice(0, 60).join('').trim();
  return `${limited || '未命名文档'}.${extension}`;
}

// POST /note/exportFile —— 把前端生成好的导出件换成一次性 http 下载地址。
// 只为 Android App 而存在:App 的 WebView 落不了 blob 文件,拿到 http 地址后由原生
// DownloadManager 存进系统下载目录(细节见 util/noteExportTickets.js 顶部说明)。
// 导出件内容由前端生成并上传,这样 PDF/mermaid 这类必须在浏览器里渲染的格式与桌面端同口径。
export const createNoteExportTicket = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const userId = req.user.id;
    const noteId = req.body?.id;
    const format = String(req.body?.format || '').toLowerCase();
    const contentBase64 = req.body?.contentBase64;

    if (!noteId || typeof contentBase64 !== 'string' || !contentBase64) {
      return res.send(resultData(null, 400, L(req, '参数错误', 'Invalid parameters')));
    }
    if (!Object.prototype.hasOwnProperty.call(EXPORT_FORMATS, format)) {
      return res.send(resultData(null, 400, L(req, '不支持的导出格式', 'Unsupported export format')));
    }
    // 先按 base64 长度估算原始体积再解码:超限内容不该先被解成大 Buffer 才拒绝
    if (Math.floor((contentBase64.length * 3) / 4) > MAX_EXPORT_BYTES) {
      return res.send(
        resultData(null, 413, L(req, '笔记内容过大,无法在 App 内导出', 'The note is too large to export in the app')),
      );
    }

    // 归属校验:只能导出自己的笔记
    const [own] = await pool.query('SELECT id FROM note WHERE id=? AND create_by=? AND del_flag=?', [
      noteId,
      userId,
      '0',
    ]);
    if (own.length === 0) {
      return res.send(resultData(null, 404, L(req, '笔记不存在', 'Note not found')));
    }

    const content = Buffer.from(contentBase64, 'base64');
    if (!content.length) {
      return res.send(resultData(null, 400, L(req, '导出内容为空', 'Export content is empty')));
    }
    if (content.length > MAX_EXPORT_BYTES) {
      return res.send(
        resultData(null, 413, L(req, '笔记内容过大,无法在 App 内导出', 'The note is too large to export in the app')),
      );
    }

    const fileName = sanitizeExportFileName(req.body?.fileName, format);
    const { token, expiresIn } = await createExportTicket({
      userId,
      resourceId: noteId,
      format,
      fileName,
      content,
    });

    // token 放 query 而不是路径段:路径里带随机值会让每次导出都变成一个「新路径」,
    // 触发安全中间件的接口枚举检测(1 分钟内不同路径数),正常使用也可能被误判封 IP。
    res.send(
      resultData({
        downloadUrl: `/api/note/exportFile?token=${encodeURIComponent(token)}`,
        fileName,
        expiresIn,
      }),
    );
  } catch (e) {
    console.error('创建笔记导出票据失败 code=%s', stableAgentErrorCode(e));
    res.send(resultData(null, 500, L(req, '导出失败,请稍后重试', 'Export failed, please try again later')));
  }
};

// GET /note/exportFile?token=xxx —— 消费票据并直出文件。
// 这个端点由系统 DownloadManager(而非页面 fetch)请求,所以必须用真实 HTTP 状态码表达结果,
// 不能沿用「HTTP 200 + body.status」的接口惯例——那样失败时会把一段 JSON 存成用户的笔记文件。
export const downloadNoteExportFile = async (req, res) => {
  // 不能复用 ensureNotVisitor:它按接口惯例回「HTTP 200 + body.status」,DownloadManager 会把
  // 那段 JSON 原样存成用户的笔记文件。身份不足必须是真的 403。
  if (!req.user?.id || req.user.role === 'visitor') {
    return res
      .status(403)
      .type('text/plain')
      .send(L(req, '请登录后再导出笔记', 'Please sign in before exporting notes'));
  }
  try {
    const ticket = await consumeExportTicket(req.query?.token, req.user.id);
    if (!ticket) {
      // 故意不用 404:安全中间件按 5 分钟内 404 次数判「扫描器」并累积 IP 信誉分,
      // 用户重复点导出踩到过期票据不该把自己的 IP 送进封禁名单。410 语义也更准确。
      return res
        .status(410)
        .type('text/plain')
        .send(L(req, '下载链接已失效,请重新导出', 'This download link has expired, please export again'));
    }

    // 一律 octet-stream + nosniff:导出的 HTML 是用户可控内容,若带着 text/html 在主站域名下
    // 被浏览器渲染,就等于把导出接口变成站内 XSS 入口。attachment 只是第一道,不能只靠它。
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Length', String(ticket.content.length));
    res.setHeader(
      'Content-Disposition',
      // filename* 走 RFC 5987 让中文名在浏览器直连时也正确;App 内的文件名由原生桥另行指定
      `attachment; filename="export.${ticket.format}"; filename*=UTF-8''${encodeURIComponent(ticket.fileName)}`,
    );
    res.end(ticket.content);
  } catch (e) {
    console.error('笔记导出文件下载失败 code=%s', stableAgentErrorCode(e));
    res
      .status(500)
      .type('text/plain')
      .send(L(req, '下载失败,请重新导出', 'Download failed, please export again'));
  }
};
