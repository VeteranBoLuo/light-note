import pool from '../db/index.js';
import { normalizeMarkdownBlockquoteEntities, normalizeNoteType } from '@lightnote/shared';
import {
  DRAWING_SCENE_VERSION,
  DRAWING_THUMBNAIL_RENDERER_VERSION,
  DrawingSceneValidationError,
  serializeDrawingScene,
} from '@lightnote/shared/drawing-note';
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
import { buildNoteCardPreview } from '../util/noteCardPreview.js';
import { buildDrawingScenePreview } from '../util/drawingPreview.js';
import {
  cleanupOtherDrawingThumbnailRevisions,
  decodeDrawingThumbnailDataUrl,
  getExistingDrawingThumbnailPath,
  removeDrawingThumbnailFile,
  saveDrawingThumbnail,
} from '../util/drawingThumbnailImage.js';
import {
  ensureNoteImageThumbnail,
  getExistingNoteImageThumbnailPath,
  noteImageThumbnailPathname,
  resolveOwnedNoteThumbnailSource,
} from '../util/noteImageThumbnail.js';
import { promises as fsP } from 'node:fs';
import { invalidatePersonalKnowledgeCache } from '../util/personalKnowledgeSearch.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';
import { validateNoteImageUpload } from '../util/noteImageUpload.js';
import { sanitizePersistedNoteContent } from '../util/noteHtmlSanitizer.js';
import { buildPagedResult, normalizeOptionalPagination } from '../util/pagination.js';
import { triggerResourceCreateEffects } from '../util/services/resourceCreateEffects.js';
import {
  normalizeCanonicalNoteContent as normalizeCanonicalMarkdownContent,
  normalizeCanonicalNoteRecord as normalizeCanonicalMarkdownRecord,
} from '../util/noteReadModel.js';
import {
  isValidNoteFormatConversionAnalysisHash,
  verifyNoteFormatConversionAnalysisHash,
} from '../util/noteFormatConversion.js';
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
  resolveOwnedNoteCreateTarget,
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
import { NOTE_CONTENT_MAX_LENGTH } from '../util/contentLimits.js';

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
  INVALID_DRAWING_SCENE: ['手绘正文无效或超出限制', 'The drawing content is invalid or exceeds its limits'],
  NOTE_VERSION_CONFLICT: [
    '这篇笔记已在其他页面或设备更新，请先处理版本冲突',
    'This note changed in another tab or device. Resolve the version conflict first',
  ],
  NOTE_VERSION_NOT_FOUND: ['历史版本不存在', 'Note version not found'],
  NOTE_CONVERSION_STALE: [
    '转换预览已经失效，请重新检查后再转换',
    'The conversion preview is stale. Review it again before converting',
  ],
  NOTE_CONVERSION_TARGET_UNCHANGED: ['笔记已经是目标格式', 'The note is already in the target format'],
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
  NOTE_SHARE_EXPOSURE_CONFIRMATION_REQUIRED: [
    '目标目录正在公开分享，确认后其中的页面将可被链接访问',
    'The target directory is publicly shared. Confirm to make these pages accessible from the link',
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

// 列表卡片只展示几行摘要。此前 SELECT n.* 会把每篇最高 1MB 的完整正文随 48 张卡片一起传输，
// 弱网 App 不仅下载慢，还要在主线程解析一大块 JSON。保留 4000 字符足够生成卡片/列表摘要，
// 打开正文仍由 getNoteDetail 返回完整内容；搜索条件也继续在数据库完整正文上执行。
const NOTE_LIST_CONTENT_PREVIEW_LENGTH = 4000;
const DRAWING_PREVIEW_BATCH_LIMIT = 12;
const NOTE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/u;

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
    try {
      await validateNoteImageUpload(req.file);
    } catch (error) {
      discardUploadedFile(req.file);
      return res.send(
        resultData(null, Number(error?.status || 400), L(req, error?.zh || '图片无效', error?.en || 'Invalid image')),
      );
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
      void ensureNoteImageThumbnail(fileUrl).catch(() => {});
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
    void ensureNoteImageThumbnail(fileUrl).catch(() => {});
    await triggerResourceCreateEffects({
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
    const {
      addToInbox = false,
      inboxSource = 'quick_capture',
      idempotencyKey: rawIdempotencyKey = null,
      ...noteBody
    } = req.body || {};
    const idempotencyKey =
      typeof rawIdempotencyKey === 'string' ? rawIdempotencyKey.trim().slice(0, 512) || null : null;
    if (String(noteBody.parentId || '').trim()) assertNoteTreeFeature(req, NOTE_TREE_FEATURE.WRITE);
    const result = await createNote({
      userId,
      userRole: req.user.role,
      note: noteBody,
      addToInbox: addToInbox === true,
      inboxSource,
      request: req,
      suppressUserRewards: req.suppressUserRewards || req.isVisitorWorkspace,
      shareExposureAcknowledged: req.body?.shareExposureAcknowledged === true,
      idempotencyKey,
    });
    return res.send(
      resultData({
        id: result.id,
        parentId: result.parentId ?? null,
        revision: Math.max(1, Number(result.revision || 1)),
        addedToInbox: result.addedToInbox,
      }),
    );
  } catch (e) {
    if (e instanceof NoteTreeError || e instanceof NoteTreeFeatureError) {
      return sendNoteTreeError(req, res, 'add-note', e);
    }
    if (e instanceof DrawingSceneValidationError) {
      return res.send(resultData(null, 400, L(req, '手绘正文无效或超出限制', 'Invalid drawing content')));
    }
    return sendNoteServerError(res, 'add-note', e);
  }
};

export const getNoteTreeFeatures = (req, res) =>
  res.send(resultData({ features: resolveNoteTreeFeatures(noteTreeFeatureIdentity(req)) }));

// 新建子页面进入编辑器前的只读预检：与真正 addNote 的事务写入复用同一套
// 父级归属、深度和公开分享祖先校验，避免先进入新建页、自动保存时才补弹确认。
export const previewNoteCreateTarget = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    assertNoteTreeFeature(req, NOTE_TREE_FEATURE.WRITE);
    const parentId = String(req.body?.parentId || '').trim();
    if (!parentId) {
      return res.send(
        resultData({ code: 'NOTE_TREE_PARENT_REQUIRED' }, 400, L(req, '缺少父页面 ID', 'Parent page ID is required')),
      );
    }
    const target = await resolveOwnedNoteCreateTarget({ userId: req.user.id, parentId });
    return res.send(resultData({ parentId: target.parentId, depth: target.depth }));
  } catch (error) {
    return sendNoteTreeError(req, res, 'preview-note-create-target', error);
  }
};

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
      shareExposureAcknowledged: req.body?.shareExposureAcknowledged === true,
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
      shareExposureAcknowledged: req.body?.shareExposureAcknowledged === true,
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
const DRAWING_VERSION_MERGE_WINDOW_MS = 10 * 60 * 1000;
const DRAWING_VERSION_KEEP = 10;
const NOTE_UPDATE_TYPES = new Set(['html', 'markdown']);
const NOTE_TITLE_MAX_LENGTH = 255;

// 历史版本字数改由前端按"渲染后展示文本"计算(html: DOM textContent; md: marked 渲染后取 textContent),
// 后端只回传 content + type,不再在 SQL/JS 层估算(见前端 utils/common.ts 的 noteDisplayText)。

// 删除超出保留上限的最旧版本(须在事务连接上执行)
async function pruneNoteVersions(connection, noteId, keep = NOTE_VERSION_KEEP) {
  const [cntRows] = await connection.query('SELECT COUNT(*) AS n FROM note_versions WHERE note_id=?', [noteId]);
  const overflow = cntRows[0].n - keep;
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

async function insertCurrentNoteVersion(connection, { noteId, userId, currentNote, reason, keep }) {
  const type = normalizeNoteType(currentNote.type);
  const canonicalContent = normalizeCanonicalMarkdownContent(currentNote.content ?? '', type);
  const versionData = insertData({
    noteId,
    title: currentNote.title,
    content:
      type === 'drawing' || type === 'markdown'
        ? canonicalContent
        : sanitizePersistedNoteContent(canonicalContent, 'html', 'snapshot-note-version'),
    type: currentNote.type,
    sourceRevision: Math.max(1, Number(currentNote.revision || 1)),
    reason,
    createBy: userId,
  });
  const [result] = await connection.query('INSERT INTO note_versions SET ?', [versionData]);
  await pruneNoteVersions(connection, noteId, keep);
  return result.insertId;
}

// 覆盖笔记前,把"改动前"的旧内容存为一个历史版本(按闸门策略决定是否真正落库)
async function snapshotNoteVersion(
  connection,
  {
    noteId,
    userId,
    currentNote,
    nextState,
    reason = 'autosave',
    force = false,
    mergeWindowMs = NOTE_VERSION_MERGE_WINDOW_MS,
    keep = NOTE_VERSION_KEEP,
  },
) {
  let current = currentNote;
  if (!current) {
    const [rows] = await connection.query(
      'SELECT title, content, type, revision FROM note WHERE id=? AND create_by=?',
      [noteId, userId],
    );
    current = rows[0] || null;
  }
  if (!current) return;
  const oldContent = normalizeCanonicalMarkdownContent(current.content ?? '', current.type);
  const changed =
    String(current.title || '') !== String(nextState?.title ?? current.title ?? '') ||
    oldContent !== String(nextState?.content ?? oldContent) ||
    normalizeNoteType(current.type) !== normalizeNoteType(nextState?.type ?? current.type);
  if (!changed) return;
  // 时间合并:距该笔记上一条版本不足窗口则并入,不新增
  if (!force) {
    const [lastRows] = await connection.query(
      'SELECT create_time FROM note_versions WHERE note_id=? ORDER BY create_time DESC, id DESC LIMIT 1',
      [noteId],
    );
    if (lastRows.length > 0 && Date.now() - new Date(lastRows[0].create_time).getTime() < mergeWindowMs) {
      return;
    }
  }
  await insertCurrentNoteVersion(connection, { noteId, userId, currentNote: current, reason, keep });
}

// 用户明确点击“保存版本”时，强制把当前已落库内容存成还原点。
// 这条链路与高频自动保存解耦，不受时间合并窗口影响。
export const createNoteVersion = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const noteId = String(req.body?.id || '').trim();
  const expectedRevision = Number(req.body?.revision);
  if (!noteId || noteId.length > 255 || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
    return res.send(resultData(null, 400, L(req, '笔记参数无效', 'Invalid note parameters')));
  }
  let connection;
  let transactionStarted = false;
  try {
    const userId = req.user.id;
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [rows] = await connection.query(
      'SELECT id, title, content, type, revision, update_time FROM note WHERE id=? AND create_by=? AND del_flag=0 FOR UPDATE',
      [noteId, userId],
    );
    if (!rows.length) throw new NoteTreeError('NOTE_TREE_NODE_NOT_FOUND', '笔记不存在', 404);
    const current = rows[0];
    const currentRevision = Math.max(1, Number(current.revision || 1));
    if (currentRevision !== expectedRevision) {
      const safeCurrent = normalizeCanonicalMarkdownRecord(current);
      throw new NoteTreeError('NOTE_VERSION_CONFLICT', '笔记版本冲突', 409, {
        current: {
          id: noteId,
          title: String(current.title || ''),
          content: String(safeCurrent.content || ''),
          type: normalizeNoteType(current.type),
          revision: currentRevision,
          updateTime: current.update_time || null,
        },
      });
    }
    const keep = normalizeNoteType(current.type) === 'drawing' ? DRAWING_VERSION_KEEP : NOTE_VERSION_KEEP;
    const versionId = await insertCurrentNoteVersion(connection, {
      noteId,
      userId,
      currentNote: current,
      reason: 'manual',
      keep,
    });
    await connection.commit();
    transactionStarted = false;
    return res.send(resultData({ id: versionId, noteId, revision: currentRevision }));
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch {
        // 保留原始业务错误。
      }
    }
    if (error instanceof NoteTreeError) return sendNoteTreeError(req, res, 'create-note-version', error);
    return sendNoteServerError(res, 'create-note-version', error);
  } finally {
    connection?.release();
  }
};

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
  const hasSubmittedRevision = Object.prototype.hasOwnProperty.call(requestBody, 'revision');
  const expectedRevision = hasSubmittedRevision ? Number(requestBody.revision) : null;
  if (hasSubmittedRevision && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)) {
    return res.send(resultData(null, 400, L(req, '笔记版本号无效', 'Invalid note revision')));
  }
  if (
    hasSubmittedTitle &&
    (typeof requestBody.title !== 'string' ||
      !requestBody.title.trim() ||
      requestBody.title.length > NOTE_TITLE_MAX_LENGTH)
  ) {
    return res.send(resultData(null, 400, L(req, '笔记标题无效', 'Invalid note title')));
  }
  if (hasSubmittedContent && requestBody.content !== null && typeof requestBody.content !== 'string') {
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
      'SELECT id, title, content, type, revision, update_time FROM note WHERE id = ? AND create_by = ? AND del_flag = 0 FOR UPDATE',
      [noteId, userId],
    );
    if (!ownedRows.length) {
      throw new NoteTreeError('NOTE_TREE_NODE_NOT_FOUND', '笔记不存在', 404);
    }
    const ownedNote = ownedRows[0];
    const currentRevision = Math.max(1, Number(ownedNote.revision || 1));
    if (expectedRevision !== null && expectedRevision !== currentRevision) {
      const safeCurrent = normalizeCanonicalMarkdownRecord(ownedNote);
      throw new NoteTreeError('NOTE_VERSION_CONFLICT', '笔记版本冲突', 409, {
        current: {
          id: noteId,
          title: String(ownedNote.title || ''),
          content: String(safeCurrent.content || ''),
          type: normalizeNoteType(ownedNote.type),
          revision: currentRevision,
          updateTime: ownedNote.update_time || null,
        },
      });
    }
    const currentType = normalizeNoteType(ownedNote.type);
    const finalType = submittedType || currentType;
    if (currentType === 'drawing' && (hasSubmittedContent || hasSubmittedType)) {
      // 旧客户端不知道 scene 协议，可能把空白 TinyMCE 正文覆盖到手绘笔记。
      // 手绘正文只允许走 updateDrawingNote；此处仅保留标题/标签等非正文编辑能力。
      throw new NoteTreeError('INVALID_DRAWING_SCENE', '手绘正文必须使用专用保存接口', 400);
    }
    if (currentType !== 'drawing' && !NOTE_UPDATE_TYPES.has(finalType)) {
      throw new NoteTreeError('INVALID_NOTE_TYPE', '笔记类型无效', 400);
    }
    const submittedOrCurrentContent = hasSubmittedContent ? rawContent : String(ownedNote.content ?? '');
    const finalContent =
      finalType === 'drawing'
        ? submittedOrCurrentContent
        : finalType === 'markdown'
          ? normalizeMarkdownBlockquoteEntities(submittedOrCurrentContent)
          : sanitizePersistedNoteContent(submittedOrCurrentContent, finalType, 'update-note');
    const finalTitle = hasSubmittedTitle ? requestBody.title : String(ownedNote.title || '');

    // 主表只允许正文编辑域字段。parent_id/sort/is_top/del_flag/owner 等字段必须走各自
    // 的服务端领域接口，不能由客户端请求体透传，从根源封住 mass assignment。
    const updateParams = {};
    if (hasSubmittedTitle && finalTitle !== String(ownedNote.title || '')) updateParams.title = finalTitle;
    if (
      (hasSubmittedContent || (hasSubmittedType && finalType !== currentType)) &&
      finalContent !== normalizeCanonicalMarkdownContent(String(ownedNote.content ?? ''), ownedNote.type)
    ) {
      updateParams.content = finalContent;
    }
    if (hasSubmittedType && finalType !== currentType) updateParams.type = finalType;
    let nextRevision = currentRevision;
    if (Object.keys(updateParams).length) {
      nextRevision = currentRevision + 1;
      updateParams.updateBy = userId;
      updateParams.revision = nextRevision;
      // 覆盖前先存历史版本快照(改动前旧内容;含去重/时间合并/保留上限)
      await snapshotNoteVersion(connection, {
        noteId,
        userId,
        currentNote: ownedNote,
        nextState: { title: finalTitle, content: finalContent, type: finalType },
        reason: finalType !== currentType ? 'format_conversion' : 'autosave',
        force: finalType !== currentType,
        ...(finalType === 'drawing'
          ? { mergeWindowMs: DRAWING_VERSION_MERGE_WINDOW_MS, keep: DRAWING_VERSION_KEEP }
          : {}),
      });
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
    return res.send(resultData({ id: noteId, revision: nextRevision }));
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

function drawingSceneOrTreeError(value) {
  try {
    return serializeDrawingScene(value);
  } catch (error) {
    if (error instanceof DrawingSceneValidationError) {
      throw new NoteTreeError('INVALID_DRAWING_SCENE', error.message, 400);
    }
    throw error;
  }
}

// 手绘保存是独立低频提交链路：客户端只在一次笔画/擦除/文本操作完成后序列化，
// 服务端再次按共享 scene 协议校验。它不触碰 HTML 净化、图片扫描或正文引用解析。
export const updateDrawingNote = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const noteId = String(body.id || '').trim();
  const title = body.title;
  const expectedRevision = Number(body.revision);
  if (!noteId || noteId.length > 255) {
    return res.send(resultData(null, 400, L(req, '笔记 ID 无效', 'Invalid note ID')));
  }
  if (typeof title !== 'string' || !title.trim() || title.length > NOTE_TITLE_MAX_LENGTH) {
    return res.send(resultData(null, 400, L(req, '笔记标题无效', 'Invalid note title')));
  }
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
    return res.send(resultData(null, 400, L(req, '笔记版本号无效', 'Invalid note revision')));
  }

  let content;
  try {
    content = drawingSceneOrTreeError(body.scene);
  } catch (error) {
    if (error instanceof NoteTreeError) return sendNoteTreeError(req, res, 'update-drawing-note', error);
    return sendNoteServerError(res, 'update-drawing-note', error);
  }

  let connection;
  let transactionStarted = false;
  try {
    const userId = req.user.id;
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [rows] = await connection.query(
      'SELECT id, title, content, type, revision, update_time FROM note WHERE id=? AND create_by=? AND del_flag=0 FOR UPDATE',
      [noteId, userId],
    );
    if (!rows.length) throw new NoteTreeError('NOTE_TREE_NODE_NOT_FOUND', '笔记不存在', 404);
    const current = rows[0];
    if (normalizeNoteType(current.type) !== 'drawing') {
      throw new NoteTreeError('INVALID_NOTE_TYPE', '当前笔记不是手绘类型', 400);
    }
    const currentRevision = Math.max(1, Number(current.revision || 1));
    const canonicalCurrentContent = drawingSceneOrTreeError(current.content);
    if (currentRevision !== expectedRevision) {
      throw new NoteTreeError('NOTE_VERSION_CONFLICT', '笔记版本冲突', 409, {
        current: {
          id: noteId,
          title: String(current.title || ''),
          content: canonicalCurrentContent,
          type: 'drawing',
          revision: currentRevision,
          updateTime: current.update_time || null,
        },
      });
    }

    const changed = String(current.title || '') !== title || canonicalCurrentContent !== content;
    let nextRevision = currentRevision;
    if (changed) {
      nextRevision += 1;
      await snapshotNoteVersion(connection, {
        noteId,
        userId,
        currentNote: { ...current, content: canonicalCurrentContent, type: 'drawing' },
        nextState: { title, content, type: 'drawing' },
        reason: 'drawing_autosave',
        mergeWindowMs: DRAWING_VERSION_MERGE_WINDOW_MS,
        keep: DRAWING_VERSION_KEEP,
      });
      await connection.query(
        'UPDATE note SET title=?, content=?, update_by=?, revision=? WHERE id=? AND create_by=? AND del_flag=0',
        [title, content, userId, nextRevision, noteId, userId],
      );
    }
    await connection.commit();
    transactionStarted = false;
    if (changed) await invalidatePersonalKnowledgeCache(userId);
    return res.send(resultData({ id: noteId, revision: nextRevision }));
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch {
        // 保留原始业务错误。
      }
    }
    if (error instanceof NoteTreeError) return sendNoteTreeError(req, res, 'update-drawing-note', error);
    return sendNoteServerError(res, 'update-drawing-note', error);
  } finally {
    connection?.release();
  }
};

// HTML / Markdown 正式格式转换必须在一笔事务内完成：校验用户刚确认的预览指纹、
// 锁定 baseRevision、强制创建转换前还原点、覆盖正文与类型并同步站内引用。
// 普通自动保存仍走 updateNote；这里不接受标题、标签或目录字段，避免转换请求扩大写入域。
export const convertNoteMode = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const requestBody = req.body && typeof req.body === 'object' ? req.body : {};
  const noteId = String(requestBody.id || '').trim();
  const targetType = String(requestBody.targetType || '').trim();
  const convertedContent = requestBody.convertedContent;
  const baseRevision = Number(requestBody.baseRevision);
  const analysisHash = String(requestBody.analysisHash || '')
    .trim()
    .toLowerCase();

  if (!noteId || noteId.length > 255) {
    return res.send(resultData(null, 400, L(req, '笔记 ID 无效', 'Invalid note ID')));
  }
  if (!NOTE_UPDATE_TYPES.has(targetType)) {
    return res.send(resultData(null, 400, L(req, '笔记类型无效', 'Invalid note type')));
  }
  if (typeof convertedContent !== 'string') {
    return res.send(resultData(null, 400, L(req, '转换后的正文无效', 'Invalid converted content')));
  }
  if (convertedContent.length > NOTE_CONTENT_MAX_LENGTH) {
    return res.send(resultData(null, 400, L(req, '笔记正文过长', 'Note content is too long')));
  }
  if (!Number.isSafeInteger(baseRevision) || baseRevision < 1) {
    return res.send(resultData(null, 400, L(req, '笔记版本号无效', 'Invalid note revision')));
  }
  if (!isValidNoteFormatConversionAnalysisHash(analysisHash)) {
    return res.send(resultData(null, 400, L(req, '转换预览校验值无效', 'Invalid conversion preview hash')));
  }

  let connection;
  let transactionStarted = false;
  try {
    const userId = req.user.id;
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const [ownedRows] = await connection.query(
      'SELECT id, title, content, type, revision, update_time FROM note WHERE id = ? AND create_by = ? AND del_flag = 0 FOR UPDATE',
      [noteId, userId],
    );
    if (!ownedRows.length) {
      throw new NoteTreeError('NOTE_TREE_NODE_NOT_FOUND', '笔记不存在', 404);
    }
    const ownedNote = ownedRows[0];
    const currentRevision = Math.max(1, Number(ownedNote.revision || 1));
    if (baseRevision !== currentRevision) {
      const safeCurrent = normalizeCanonicalMarkdownRecord(ownedNote);
      throw new NoteTreeError('NOTE_VERSION_CONFLICT', '笔记版本冲突', 409, {
        current: {
          id: noteId,
          title: String(ownedNote.title || ''),
          content: String(safeCurrent.content || ''),
          type: normalizeNoteType(ownedNote.type),
          revision: currentRevision,
          updateTime: ownedNote.update_time || null,
        },
      });
    }
    const currentType = normalizeNoteType(ownedNote.type);
    if (targetType === currentType) {
      throw new NoteTreeError('NOTE_CONVERSION_TARGET_UNCHANGED', '笔记已经是目标格式', 409);
    }
    if (
      !verifyNoteFormatConversionAnalysisHash(analysisHash, {
        targetType,
        convertedContent,
        baseRevision,
      })
    ) {
      throw new NoteTreeError('NOTE_CONVERSION_STALE', '转换预览已经失效', 409);
    }

    const finalContent =
      targetType === 'markdown'
        ? normalizeMarkdownBlockquoteEntities(convertedContent)
        : sanitizePersistedNoteContent(convertedContent, targetType, 'convert-note-mode');
    const nextRevision = currentRevision + 1;
    await snapshotNoteVersion(connection, {
      noteId,
      userId,
      currentNote: ownedNote,
      nextState: { title: ownedNote.title, content: finalContent, type: targetType },
      reason: 'format_conversion',
      force: true,
    });
    await connection.query(
      'UPDATE note SET content=?, type=?, update_by=?, revision=? WHERE id=? AND create_by=? AND del_flag=0',
      [finalContent, targetType, userId, nextRevision, noteId, userId],
    );
    const refs = extractOwnedResourceRefs({ content: finalContent, type: targetType });
    await syncNoteResourceRefs(connection, { userId, noteId, refs });
    const [updatedRows] = await connection.query('SELECT update_time FROM note WHERE id=? AND create_by=?', [
      noteId,
      userId,
    ]);
    await connection.commit();
    transactionStarted = false;
    await invalidatePersonalKnowledgeCache(userId);
    return res.send(
      resultData({
        id: noteId,
        title: String(ownedNote.title || ''),
        content: finalContent,
        type: targetType,
        revision: nextRevision,
        updateTime: updatedRows[0]?.update_time || null,
      }),
    );
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch {
        // 保留最初的业务错误。
      }
    }
    if (error instanceof NoteTreeError) return sendNoteTreeError(req, res, 'convert-note-mode', error);
    return sendNoteServerError(res, 'convert-note-mode', error);
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
    const requestedPreviewVersion = Number(req.body?.previewVersion || 0);
    const lightweightCardPreview =
      pagination.enabled && Number.isFinite(requestedPreviewVersion) && requestedPreviewVersion >= 2;
    const where = ['n.create_by = ?', 'n.del_flag = 0'];
    const params = [userId];
    const treeMode = Object.prototype.hasOwnProperty.call(req.body || {}, 'parentId');
    if (treeMode) assertNoteTreeFeature(req, NOTE_TREE_FEATURE.READ);
    const parentId = String(req.body?.parentId ?? '').trim() || null;
    const hasTreeFilter = Boolean(keyword) || tagId === 'null' || Boolean(tagId);
    const rootTreeScope = treeMode && parentId === null;
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
      } else if (!hasTreeFilter && parentId) {
        // 根“笔记库”代表完整内容范围；只有进入具体目录后才限制为直属子页面。
        where.push('n.parent_id = ?');
        params.push(parentId);
      }
    }

    if (keyword) {
      const like = `%${keyword}%`;
      // 手绘 scene JSON 中的坐标、元素 ID 与协议字段不是用户可搜索正文；第一版只检索标题，
      // 避免 JSON 噪声命中，也避免未来场景增大后让通用内容搜索承担无意义扫描。
      where.push("(n.title LIKE ? OR (COALESCE(n.type, 'html') <> 'drawing' AND n.content LIKE ?))");
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
      SELECT
        n.id,
        n.title,
        IF(n.type = 'drawing', '', LEFT(COALESCE(n.content, ''), ${NOTE_LIST_CONTENT_PREVIEW_LENGTH})) AS content,
        ${
          lightweightCardPreview
            ? `CHAR_LENGTH(COALESCE(n.content, '')) AS content_length,
        CASE
          WHEN COALESCE(n.type, 'html') <> 'drawing' THEN NULL
          WHEN COALESCE(n.content, '') = '' THEN 0
          WHEN JSON_VALID(n.content) = 0 THEN 1
          ELSE COALESCE(JSON_LENGTH(JSON_EXTRACT(n.content, '$.elements')), 0) > 0
        END AS drawing_has_content,`
            : ''
        }
        n.create_by,
        n.update_by,
        n.del_flag,
        n.sort,
        n.is_top,
        n.create_time,
        n.update_time,
        n.deleted_at,
        n.type,
        n.revision,
        n.parent_id,
        n.tree_delete_batch_id,
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
      ORDER BY n.is_top DESC, ${rootTreeScope ? 'n.update_time DESC' : 'n.sort, n.update_time DESC'}, n.id DESC
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
      const drawing = note.type === 'drawing';
      const cardPreview = pagination.enabled && !drawing ? buildNoteCardPreview(note.content, note.type) : null;
      if (lightweightCardPreview) {
        note.hasContent = drawing
          ? note.drawing_has_content == null || Number(note.drawing_has_content) > 0
          : Number(note.content_length || 0) > NOTE_LIST_CONTENT_PREVIEW_LENGTH || Boolean(cardPreview?.hasContent);
      }
      delete note.content_length;
      delete note.drawing_has_content;
      if (!pagination.enabled && note.type === 'drawing') note.content = '';
      if (pagination.enabled) {
        const previewSource = drawing ? '' : cardPreview?.imageUrl || '';
        note.previewImageUrl = previewSource ? noteImageThumbnailPathname(previewSource) : '';
        if (drawing) {
          note.previewSummary = '';
          note.previewTextBeforeImage = '';
          note.previewTextAfterImage = '';
          note.previewImageLocated = false;
        }
        if (lightweightCardPreview && cardPreview) {
          note.previewSummary = cardPreview.summary;
          note.previewTextBeforeImage = cardPreview.beforeImage;
          note.previewTextAfterImage = cardPreview.afterImage;
          note.previewImageLocated = cardPreview.imageLocated;
          // v2 客户端只消费上面的纯文本字段；不再把 48 份正文前缀传给 WebView 重复净化和解析。
        }
        if (lightweightCardPreview) delete note.content;
        else if (drawing) note.content = '';
      }
      if (treeSnapshot && (hasTreeFilter || rootTreeScope)) {
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

// 手绘完整场景继续与通用列表隔离，仅在卡片进入可视区后按小批次读取。
// 响应经过元素、轨迹点和文本三重压缩，避免为了几百像素的缩略图传输编辑级数据。
export const queryDrawingPreviews = async (req, res) => {
  try {
    const rawIds = req.body?.ids;
    if (!Array.isArray(rawIds) || rawIds.length === 0 || rawIds.length > DRAWING_PREVIEW_BATCH_LIMIT) {
      return res.send(
        resultData(
          null,
          400,
          L(
            req,
            `单次最多预览 ${DRAWING_PREVIEW_BATCH_LIMIT} 篇手绘笔记`,
            `Up to ${DRAWING_PREVIEW_BATCH_LIMIT} previews`,
          ),
        ),
      );
    }
    const ids = [...new Set(rawIds.map((id) => String(id || '').trim()))];
    if (ids.length === 0 || ids.some((id) => !NOTE_ID_PATTERN.test(id))) {
      return res.send(resultData(null, 400, L(req, '笔记 ID 无效', 'Invalid note ID')));
    }
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await pool.query(
      `SELECT id, content, revision
       FROM note
       WHERE create_by = ? AND del_flag = 0 AND type = 'drawing' AND id IN (${placeholders})`,
      [req.user.id, ...ids],
    );
    const rowsById = new Map(rows.map((row) => [String(row.id), row]));
    const items = ids.flatMap((id) => {
      const row = rowsById.get(id);
      if (!row) return [];
      try {
        return [{ id, revision: Number(row.revision || 0), preview: buildDrawingScenePreview(row.content) }];
      } catch (error) {
        console.warn('[note-library] drawing preview skipped id=%s code=%s', id, stableAgentErrorCode(error));
        return [];
      }
    });
    return res.send(resultData({ items }));
  } catch (error) {
    return sendNoteServerError(res, 'query-drawing-previews', error);
  }
};

// 手绘正文保存成功后由客户端提交一张固定尺寸的派生 WebP。缩略图不是正文事实源：
// 生成、上传或读取失败时卡片会回退到受限 scene 预览，绝不能反向影响笔记保存。
export const uploadDrawingThumbnail = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const noteId = String(req.body?.id || '').trim();
  const revision = Number(req.body?.revision);
  const rendererVersion = Number(req.body?.rendererVersion);
  const image = decodeDrawingThumbnailDataUrl(req.body?.thumbnail);
  if (!NOTE_ID_PATTERN.test(noteId)) {
    return res.send(resultData(null, 400, L(req, '笔记 ID 无效', 'Invalid note ID')));
  }
  if (!Number.isSafeInteger(revision) || revision < 1) {
    return res.send(resultData(null, 400, L(req, '笔记版本号无效', 'Invalid note revision')));
  }
  if (rendererVersion !== DRAWING_THUMBNAIL_RENDERER_VERSION) {
    return res.send(
      resultData(
        { code: 'DRAWING_THUMBNAIL_RENDERER_STALE', rendererVersion: DRAWING_THUMBNAIL_RENDERER_VERSION },
        409,
        L(req, '缩略图渲染器已更新，请刷新页面', 'Thumbnail renderer changed; refresh the page'),
      ),
    );
  }
  if (!image) {
    return res.send(resultData(null, 400, L(req, '手绘缩略图无效', 'Invalid drawing thumbnail')));
  }

  let filePath = '';
  try {
    const userId = req.user.id;
    const [rows] = await pool.query(
      "SELECT revision FROM note WHERE id=? AND create_by=? AND del_flag=0 AND type='drawing' LIMIT 1",
      [noteId, userId],
    );
    if (!rows.length) return res.send(resultData(null, 404, L(req, '笔记不存在', 'Note not found')));
    if (Math.max(1, Number(rows[0].revision || 1)) !== revision) {
      return res.send(
        resultData({ code: 'DRAWING_THUMBNAIL_REVISION_STALE' }, 409, L(req, '笔记版本已变化', 'Note changed')),
      );
    }
    filePath = await saveDrawingThumbnail({ userId, noteId, revision, rendererVersion, image });

    // 保存文件后再次确认版本，关闭“校验后另一笔正文先提交”的竞态；旧请求只删除自己的文件。
    const [latestRows] = await pool.query(
      "SELECT revision FROM note WHERE id=? AND create_by=? AND del_flag=0 AND type='drawing' LIMIT 1",
      [noteId, userId],
    );
    if (!latestRows.length || Math.max(1, Number(latestRows[0].revision || 1)) !== revision) {
      await removeDrawingThumbnailFile(filePath);
      return res.send(
        resultData({ code: 'DRAWING_THUMBNAIL_REVISION_STALE' }, 409, L(req, '笔记版本已变化', 'Note changed')),
      );
    }
    await cleanupOtherDrawingThumbnailRevisions({
      userId,
      noteId,
      keepRevision: revision,
      keepRendererVersion: rendererVersion,
    });
    return res.send(resultData({ id: noteId, revision, rendererVersion }));
  } catch (error) {
    if (filePath) await removeDrawingThumbnailFile(filePath).catch(() => {});
    console.warn('[drawing-thumbnail] upload failed code=%s', stableAgentErrorCode(error));
    return res.send(resultData(null, 500, L(req, '缩略图暂时无法保存', 'Could not save thumbnail')));
  }
};

function sendDrawingThumbnailNotFound(res) {
  // 缺图稍后可能由详情页静默补齐，404 不能被浏览器或中间缓存固化。
  res.set('Cache-Control', 'private, no-store');
  return res.status(404).end();
}

function redirectToCurrentDrawingThumbnail(res, noteId, revision) {
  // 旧位图是可丢弃派生缓存。只把旧地址引向当前缓存键，绝不能用新算法继续写入旧版本 URL。
  res.set('Cache-Control', 'private, no-store');
  res.set(
    'Location',
    `/api/note/drawing-thumbnail/${encodeURIComponent(noteId)}/v${DRAWING_THUMBNAIL_RENDERER_VERSION}-${revision}.webp`,
  );
  return res.status(307).end();
}

export const getDrawingThumbnail = async (req, res) => {
  const noteId = String(req.params?.noteId || '').trim();
  const fileName = String(req.params?.fileName || '');
  const versionedMatch = /^v(\d+)-(\d+)\.webp$/u.exec(fileName);
  const legacyMatch = /^(\d+)\.webp$/u.exec(fileName);
  const rendererVersion = versionedMatch ? Number(versionedMatch[1]) : legacyMatch ? 1 : 0;
  const revision = Number(versionedMatch?.[2] || legacyMatch?.[1]);
  if (
    !NOTE_ID_PATTERN.test(noteId) ||
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    rendererVersion < 1 ||
    rendererVersion > DRAWING_THUMBNAIL_RENDERER_VERSION
  ) {
    return sendDrawingThumbnailNotFound(res);
  }
  try {
    const userId = req.user.id;
    const [rows] = await pool.query(
      "SELECT revision FROM note WHERE id=? AND create_by=? AND del_flag=0 AND type='drawing' LIMIT 1",
      [noteId, userId],
    );
    if (!rows.length || Math.max(1, Number(rows[0].revision || 1)) !== revision) {
      return sendDrawingThumbnailNotFound(res);
    }
    if (rendererVersion !== DRAWING_THUMBNAIL_RENDERER_VERSION) {
      return redirectToCurrentDrawingThumbnail(res, noteId, revision);
    }
    const filePath = await getExistingDrawingThumbnailPath({ userId, noteId, revision, rendererVersion });
    if (!filePath) return sendDrawingThumbnailNotFound(res);
    const image = await fsP.readFile(filePath);
    res.set('Cache-Control', 'private, max-age=31536000, immutable');
    res.set('X-Content-Type-Options', 'nosniff');
    return res.type('image/webp').send(image);
  } catch (error) {
    console.warn('[drawing-thumbnail] read failed code=%s', stableAgentErrorCode(error));
    return sendDrawingThumbnailNotFound(res);
  }
};

// 卡片缩略图与正文图片彻底分离：已生成文件直接命中长期缓存；历史图片只在图片请求的冷路径
// 校验归属并单并发生成，不阻塞笔记列表 JSON 和文字卡片首屏。
export const getNoteImageThumbnail = async (req, res) => {
  const fileName = String(req.params?.fileName || '').toLowerCase();
  const match = /^([a-f0-9]{64})\.webp$/u.exec(fileName);
  if (!match) return res.status(404).end();
  const key = match[1];
  try {
    let filePath = await getExistingNoteImageThumbnailPath(key);
    if (!filePath) {
      const sourceUrl = await resolveOwnedNoteThumbnailSource({
        key,
        sourceUrl: req.query?.source,
        userId: req.user?.id,
        db: pool,
      });
      if (!sourceUrl) return res.status(404).end();
      filePath = await ensureNoteImageThumbnail(sourceUrl);
    }
    if (!filePath) return res.status(404).end();
    const image = await fsP.readFile(filePath);
    res.set('Cache-Control', 'private, max-age=31536000, immutable');
    res.set('X-Content-Type-Options', 'nosniff');
    return res.type('image/webp').send(image);
  } catch (error) {
    console.warn('[note-thumbnail] read failed code=%s', stableAgentErrorCode(error));
    return res.status(404).end();
  }
};

export const getNoteDetail = async (req, res) => {
  try {
    const userId = req.user.id;
    const noteTreeFeatures = resolveNoteTreeFeatures(noteTreeFeatureIdentity(req));
    // 先登记正文查询，再并行沿当前笔记的父链读取面包屑，避免测试与观测日志中的请求顺序漂移。
    const detailPromise = pool.query(
      `SELECT n.*,
              EXISTS (
                SELECT 1
                FROM resource_inbox i
                WHERE i.user_id = n.create_by
                  AND i.resource_type = 'note'
                  AND i.resource_id = n.id
                  AND i.status = 'pending'
              ) AS isPending
       FROM note n
       WHERE n.id = ? AND n.create_by = ? AND n.del_flag = ?`,
      [req.body.id, userId, '0'],
    );
    const breadcrumbPromise = noteTreeFeatures[NOTE_TREE_FEATURE.READ]
      ? resolveOwnedNoteBreadcrumb({ userId, noteId: req.body.id })
          .then((resolved) => (Array.isArray(resolved?.items) ? resolved.items : []))
          .catch((error) => {
            // 面包屑是辅助导航。历史异常父链或临时目录查询失败不能阻断正文读取；
            // 独立 breadcrumb 接口仍保留为重命名、移动后的刷新兜底。
            console.warn('[note-library] detail breadcrumb unavailable code=%s', stableAgentErrorCode(error));
            return [];
          })
      : Promise.resolve([]);
    // 归属校验:只能读自己的笔记(游客=共享 visitor 账号),防止传他人 note id 越权读取;越权/不存在统一 404 不泄露存在性
    // 正文与定向父链并行读取；父链查询最多 8 层，不再让单篇详情耗时随账号笔记总量增长。
    const [[result], breadcrumb] = await Promise.all([detailPromise, breadcrumbPromise]);
    if (result.length === 0) {
      return res.send(resultData(null, 404, '笔记不存在'));
    }

    const normalized = normalizeCanonicalMarkdownRecord(result[0]);
    let contentDrawingVersion = DRAWING_SCENE_VERSION;
    if (normalized.type === 'drawing') {
      try {
        contentDrawingVersion = Number(JSON.parse(String(normalized.content || '{}')).v || DRAWING_SCENE_VERSION);
      } catch {
        contentDrawingVersion = DRAWING_SCENE_VERSION;
      }
    }
    // 客户端上报的是“最高支持版本”：高版本客户仍可读低版本，低版本客户不会误读新 scene。
    const drawingSupported = Number(req.body?.drawingSceneVersion || 0) >= contentDrawingVersion;
    if (normalized.type === 'drawing' && !drawingSupported) {
      // 老客户端会把未知类型回退为 TinyMCE。不给 scene 正文，并由通用更新接口拒绝 drawing 正文提交，
      // 可以确保它最多看到空白只读内容，不能把 JSON 或空 HTML 覆盖回数据库。
      normalized.content = '';
      normalized.drawingUnsupported = true;
    }
    return res.send(
      resultData({
        ...normalized,
        isPending: Number(result[0].isPending) === 1,
        breadcrumb,
        noteTreeFeatures,
      }),
    );
  } catch (e) {
    return sendNoteServerError(res, 'get-note-detail', e);
  }
};

const BATCH_NOTE_EXPORT_LIMIT = 100;

// 批量导出只读取转换所需的最小字段，一次请求替代逐篇 getNoteDetail，避免列表选择较多时产生请求风暴。
export const getNotesForExport = async (req, res) => {
  try {
    const rawIds = req.body?.ids;
    if (!Array.isArray(rawIds)) {
      return res.send(resultData(null, 400, L(req, '笔记 ID 列表无效', 'Invalid note ID list')));
    }

    const hasInvalidId = rawIds.some((id) => typeof id !== 'string' || !id.trim() || id.trim().length > 128);
    const ids = [...new Set(rawIds.map((id) => String(id || '').trim()).filter(Boolean))];
    if (hasInvalidId || !ids.length || ids.length > BATCH_NOTE_EXPORT_LIMIT || ids.length !== rawIds.length) {
      return res.send(
        resultData(
          null,
          400,
          L(
            req,
            `一次可导出 1～${BATCH_NOTE_EXPORT_LIMIT} 篇笔记`,
            `Export 1–${BATCH_NOTE_EXPORT_LIMIT} notes at a time`,
          ),
        ),
      );
    }

    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await pool.query(
      `SELECT id, title, content, type
       FROM note
       WHERE create_by=? AND del_flag=? AND id IN (${placeholders})`,
      [req.user.id, '0', ...ids],
    );
    const notesById = new Map(
      rows.map((note) => {
        const normalized = normalizeCanonicalMarkdownRecord(note);
        return [String(normalized.id), normalized];
      }),
    );
    const notes = ids.map((id) => notesById.get(id)).filter(Boolean);

    return res.send(
      resultData({
        notes,
        requestedCount: ids.length,
        missingCount: ids.length - notes.length,
      }),
    );
  } catch (e) {
    return sendNoteServerError(res, 'batch-export-notes', e);
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
      `SELECT id, title, type,
              IF(type = 'drawing', '', content) AS content,
              CASE
                WHEN type = 'drawing' AND JSON_VALID(content) THEN JSON_LENGTH(content, '$.elements')
                ELSE NULL
              END AS element_count,
              source_revision, reason, create_by, create_time
       FROM note_versions
       WHERE note_id = ?
       ORDER BY create_time DESC, id DESC`,
      [noteId],
    );
    // HTML / Markdown 沿用 content + type；drawing 只回元素数，避免历史面板一次下载最多 10 份大 scene。
    // 恢复操作按 version id 在事务内读取完整内容，不依赖列表正文。
    // 历史的错误实体在读取时也立即还原，用户无需先手动编辑一次才能看到正确 Markdown。
    res.send(
      resultData(
        rows.map((row) => (normalizeNoteType(row.type) === 'drawing' ? row : normalizeCanonicalMarkdownRecord(row))),
      ),
    );
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
      'SELECT id, note_id, title, content, type, source_revision, reason, create_time FROM note_versions WHERE id=?',
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
  const versionId = req.body?.id;
  const hasExpectedRevision = Object.prototype.hasOwnProperty.call(req.body || {}, 'revision');
  const expectedRevision = hasExpectedRevision ? Number(req.body.revision) : null;
  if (!versionId) return res.send(resultData(null, 400, L(req, '参数错误', 'Invalid request')));
  if (hasExpectedRevision && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)) {
    return res.send(resultData(null, 400, L(req, '笔记版本号无效', 'Invalid note revision')));
  }
  let connection;
  let transactionStarted = false;
  try {
    const userId = req.user.id;
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [verRows] = await connection.query('SELECT note_id, title, content, type FROM note_versions WHERE id=?', [
      versionId,
    ]);
    if (verRows.length === 0) {
      throw new NoteTreeError('NOTE_VERSION_NOT_FOUND', '版本不存在', 404);
    }
    const noteId = verRows[0].note_id;
    const verTitle = verRows[0].title;
    const rawVerContent = verRows[0].content ?? '';
    const verType = normalizeNoteType(verRows[0].type || 'html');
    const verContent =
      verType === 'drawing'
        ? drawingSceneOrTreeError(rawVerContent)
        : verType === 'markdown'
          ? normalizeCanonicalMarkdownContent(rawVerContent, verType)
          : sanitizePersistedNoteContent(rawVerContent, verType, 'restore-note-version');
    // 归属校验 + 锁定当前值，恢复也必须遵守与普通保存相同的 revision 边界。
    const [curRows] = await connection.query(
      'SELECT title, content, type, revision, update_time FROM note WHERE id=? AND create_by=? AND del_flag=? FOR UPDATE',
      [noteId, userId, '0'],
    );
    if (curRows.length === 0) throw new NoteTreeError('NOTE_TREE_NODE_NOT_FOUND', '笔记不存在', 404);
    const currentRevision = Math.max(1, Number(curRows[0].revision || 1));
    if (expectedRevision !== null && currentRevision !== expectedRevision) {
      const safeCurrent = normalizeCanonicalMarkdownRecord(curRows[0]);
      throw new NoteTreeError('NOTE_VERSION_CONFLICT', '笔记版本冲突', 409, {
        current: {
          id: noteId,
          title: String(curRows[0].title || ''),
          content: String(safeCurrent.content || ''),
          type: normalizeNoteType(curRows[0].type),
          revision: currentRevision,
          updateTime: curRows[0].update_time || null,
        },
      });
    }
    const nextRevision = currentRevision + 1;
    // 后悔药:恢复前把当前内容强制存为一版(不受时间合并限制),恢复错了还能回来。
    const curSnap = insertData({
      noteId,
      title: curRows[0].title,
      content:
        normalizeNoteType(curRows[0].type) === 'drawing'
          ? drawingSceneOrTreeError(curRows[0].content ?? '')
          : normalizeNoteType(curRows[0].type) === 'markdown'
            ? normalizeCanonicalMarkdownContent(curRows[0].content ?? '', curRows[0].type)
            : sanitizePersistedNoteContent(curRows[0].content ?? '', 'html', 'snapshot-before-restore'),
      type: curRows[0].type,
      sourceRevision: currentRevision,
      reason: 'restore',
      createBy: userId,
    });
    await connection.query('INSERT INTO note_versions SET ?', [curSnap]);
    // 覆盖为目标版本(含 type:恢复时 md/html 模式一并回到该版本)。
    await connection.query(
      'UPDATE note SET title=?, content=?, type=?, update_by=?, revision=? WHERE id=? AND create_by=?',
      [verTitle, verContent, verType, userId, nextRevision, noteId, userId],
    );
    await pruneNoteVersions(
      connection,
      noteId,
      verType === 'drawing' || normalizeNoteType(curRows[0].type) === 'drawing'
        ? DRAWING_VERSION_KEEP
        : NOTE_VERSION_KEEP,
    );
    // 笔记内联提及(N0):恢复版本会用目标版本正文覆盖当前正文,必须同步引用(§4.6 恢复不能漏)。
    const restoredRefs = extractOwnedResourceRefs({ content: String(verContent), type: verType });
    await syncNoteResourceRefs(connection, { userId, noteId, refs: restoredRefs });
    await connection.commit();
    transactionStarted = false;
    await invalidatePersonalKnowledgeCache(userId);
    return res.send(
      resultData({ id: noteId, title: verTitle, content: verContent, type: verType, revision: nextRevision }),
    );
  } catch (e) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch {
        // 保留原业务错误。
      }
    }
    if (e instanceof NoteTreeError) return sendNoteTreeError(req, res, 'restore-note-version', e);
    return sendNoteServerError(res, 'restore-note-version', e);
  } finally {
    connection?.release();
  }
};

// —— 笔记模板(用户自存;内置模板由前端常量提供,不进库) ——
const NOTE_TEMPLATE_LIMIT = 20; // 每人最多保存的模板数
const NOTE_TEMPLATE_CONTENT_MAX = NOTE_CONTENT_MAX_LENGTH; // 与笔记正文同一上限
const NOTE_TEMPLATE_TYPES = new Set(['html', 'markdown']);

function normalizeNoteTemplateInput(body, { expectedType = '', scene = 'write-note-template' } = {}) {
  const name = String(body?.name || '').trim();
  const titleTemplate = String(body?.titleTemplate || '').trim();
  const description = String(body?.description || '').trim();
  const requestedType = body?.type || expectedType || 'html';
  const type = requestedType === 'md' ? 'markdown' : String(requestedType);
  const rawContent = String(body?.content || '');
  const content =
    normalizeNoteType(type) === 'markdown'
      ? normalizeMarkdownBlockquoteEntities(rawContent)
      : sanitizePersistedNoteContent(rawContent, 'html', scene);
  if (!name) return { error: '模板名称不能为空' };
  if (name.length > 60) return { error: '模板名称不能超过 60 个字符' };
  if (titleTemplate.length > 255) return { error: '默认标题不能超过 255 个字符' };
  if (description.length > 255) return { error: '模板描述不能超过 255 个字符' };
  if (!NOTE_TEMPLATE_TYPES.has(type)) return { error: '模板类型仅支持 html 或 markdown' };
  if (expectedType && type !== expectedType) return { error: '模板格式不能直接切换,请复制后重新创建' };
  if (content.length > NOTE_TEMPLATE_CONTENT_MAX) return { error: '模板内容过长' };
  return {
    value: {
      name,
      titleTemplate: titleTemplate || null,
      description: description || null,
      type,
      content,
    },
  };
}

async function validateNoteTemplateImages({ content, userId, connection = null }) {
  const imageUrls = extractNoteImageUrls(content);
  if (!imageUrls.length) return { imageUrls, valid: true };
  const ownedUrls = await filterOwnedImageUrls({ urls: imageUrls, userId, connection });
  return { imageUrls, valid: ownedUrls.length === imageUrls.length };
}

function buildDuplicateTemplateName(name, existingNames, req) {
  const english = String(req?.headers?.['x-lang'] || req?.headers?.['accept-language'] || '')
    .toLowerCase()
    .startsWith('en');
  const suffix = english ? ' copy' : ' 副本';
  const names = new Set(existingNames.map((item) => String(item || '').trim()));
  const fit = (tail) =>
    `${Array.from(String(name || 'Template'))
      .slice(0, Math.max(1, 60 - tail.length))
      .join('')}${tail}`;
  let candidate = fit(suffix);
  for (let index = 2; names.has(candidate) && index < 100; index += 1) {
    candidate = fit(`${suffix} ${index}`);
  }
  return candidate;
}

// 模板列表(轻量:不含 content,选择器只需要元信息;实例化时再按 id 取正文)
export const queryNoteTemplates = async (req, res) => {
  try {
    const userId = req.user.id;
    const [rows] = await pool.query(
      `SELECT id, name, title_template, description, type, revision, create_time, update_time
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
      `SELECT id, name, title_template, description, type, content, revision, create_time, update_time
         FROM note_template WHERE id = ? AND create_by = ?`,
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
    const normalized = normalizeNoteTemplateInput(req.body, { scene: 'create-note-template' });
    if (normalized.error) return res.send(resultData(null, 400, normalized.error));
    const input = normalized.value;
    // 正文引用本站上传图片时,校验全部属于当前用户(经其笔记登记于 note_images),
    // 防止把他人图片 URL 写进模板绕过归属;外链图片不校验、不追踪。
    const imageValidation = await validateNoteTemplateImages({ content: input.content, userId });
    if (!imageValidation.valid) return res.send(resultData(null, 400, '模板包含无权使用的图片,请先移除后重试'));
    const [cntRows] = await pool.query('SELECT COUNT(*) AS n FROM note_template WHERE create_by = ?', [userId]);
    if (cntRows[0].n >= NOTE_TEMPLATE_LIMIT) {
      return res.send(resultData(null, 400, `最多保存 ${NOTE_TEMPLATE_LIMIT} 个模板,请先删除不用的模板`));
    }
    const data = insertData({
      ...input,
      createBy: userId,
    });
    await pool.query('INSERT INTO note_template SET ?', [data]);
    res.send(resultData({ id: data.id, name: input.name, revision: 1 }));
  } catch (e) {
    sendTemplateServerError(res, '保存模板', e);
  }
};

// 显式编辑模板:按 revision 做乐观锁,绝不把秒级 update_time 当并发版本。
export const updateNoteTemplate = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const userId = req.user.id;
  const templateId = String(req.body?.id || '').trim();
  const baseRevision = Number(req.body?.baseRevision);
  if (!templateId || !Number.isInteger(baseRevision) || baseRevision < 1) {
    return res.send(resultData(null, 400, '模板版本参数错误'));
  }
  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [rows] = await connection.query(
      `SELECT id, type, content, revision, update_time
         FROM note_template WHERE id = ? AND create_by = ? FOR UPDATE`,
      [templateId, userId],
    );
    if (!rows.length) {
      await connection.rollback();
      transactionStarted = false;
      return res.send(resultData(null, 404, '模板不存在'));
    }
    const current = rows[0];
    if (Number(current.revision) !== baseRevision) {
      await connection.rollback();
      transactionStarted = false;
      return res.send(
        resultData(
          {
            code: 'NOTE_TEMPLATE_VERSION_CONFLICT',
            revision: Number(current.revision),
            updateTime: current.update_time,
          },
          409,
          '模板已在其他页面或设备更新',
        ),
      );
    }
    const normalized = normalizeNoteTemplateInput(req.body, {
      expectedType: normalizeNoteType(current.type),
      scene: 'update-note-template',
    });
    if (normalized.error) {
      await connection.rollback();
      transactionStarted = false;
      return res.send(resultData(null, 400, normalized.error));
    }
    const input = normalized.value;
    const imageValidation = await validateNoteTemplateImages({
      content: input.content,
      userId,
      connection,
    });
    if (!imageValidation.valid) {
      await connection.rollback();
      transactionStarted = false;
      return res.send(resultData(null, 400, '模板包含无权使用的图片,请先移除后重试'));
    }
    const [result] = await connection.query(
      `UPDATE note_template
          SET name = ?, title_template = ?, description = ?, content = ?, revision = revision + 1
        WHERE id = ? AND create_by = ? AND revision = ?`,
      [input.name, input.titleTemplate, input.description, input.content, templateId, userId, baseRevision],
    );
    if (result.affectedRows !== 1) {
      await connection.rollback();
      transactionStarted = false;
      return res.send(resultData({ code: 'NOTE_TEMPLATE_VERSION_CONFLICT' }, 409, '模板状态已变化'));
    }
    await connection.commit();
    transactionStarted = false;
    const nextRevision = baseRevision + 1;
    const oldImages = extractNoteImageUrls(current.content);
    const nextImages = new Set(imageValidation.imageUrls);
    cleanupOrphanNoteImages(oldImages.filter((url) => !nextImages.has(url)));
    return res.send(
      resultData({
        id: templateId,
        name: input.name,
        titleTemplate: input.titleTemplate,
        description: input.description,
        type: input.type,
        content: input.content,
        revision: nextRevision,
        updateTime: new Date().toISOString(),
      }),
    );
  } catch (e) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch {
        // 保留原业务错误。
      }
    }
    return sendTemplateServerError(res, '更新模板', e);
  } finally {
    connection?.release();
  }
};

// 服务端复制避免客户端先拉正文再创建,同时按用户行锁串行校验 20 个上限。
export const duplicateNoteTemplate = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const userId = req.user.id;
  const templateId = String(req.body?.id || '').trim();
  if (!templateId) return res.send(resultData(null, 400, '参数错误'));
  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    await connection.query('SELECT id FROM user WHERE id = ? FOR UPDATE', [userId]);
    const [rows] = await connection.query(
      `SELECT name, title_template, description, type, content
         FROM note_template WHERE id = ? AND create_by = ? FOR UPDATE`,
      [templateId, userId],
    );
    if (!rows.length) {
      await connection.rollback();
      transactionStarted = false;
      return res.send(resultData(null, 404, '模板不存在'));
    }
    const [existingRows] = await connection.query('SELECT name FROM note_template WHERE create_by = ?', [userId]);
    if (existingRows.length >= NOTE_TEMPLATE_LIMIT) {
      await connection.rollback();
      transactionStarted = false;
      return res.send(resultData(null, 400, `最多保存 ${NOTE_TEMPLATE_LIMIT} 个模板,请先删除不用的模板`));
    }
    const source = rows[0];
    const name = buildDuplicateTemplateName(
      source.name,
      existingRows.map((item) => item.name),
      req,
    );
    const data = insertData({
      name,
      titleTemplate: source.title_template || null,
      description: source.description || null,
      type: normalizeNoteType(source.type),
      content: source.content || '',
      createBy: userId,
    });
    await connection.query('INSERT INTO note_template SET ?', [data]);
    await connection.commit();
    transactionStarted = false;
    return res.send(resultData({ id: data.id, name, revision: 1 }));
  } catch (e) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch {
        // 保留原业务错误。
      }
    }
    return sendTemplateServerError(res, '复制模板', e);
  } finally {
    connection?.release();
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
  // 导出格式的扩展名与 format 同名(md/html/pdf/zip),format 已在调用前过白名单
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
