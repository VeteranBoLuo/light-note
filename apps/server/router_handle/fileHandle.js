import path from 'path';
import pool from '../db/index.js';
import { resultData, insertData, L } from '../util/common.js';
import { bucketBaseUrl, buildObjectKey, copyObjectInObs, deleteObjectFromObs } from '../util/obsClient.js';
import { buildSignedDownloadUrl } from '../router/file.js';
import { getFileExtension, resolveFileCategory } from '../util/fileCategory.js';
import {
  queryTagsForResource,
  RESOURCE_TYPE,
  replaceResourceTagRelations,
  validateUserTags,
} from '../util/resourceTags.js';
import { ensureNotVisitor } from '../util/auth.js';
import { purgeDocumentSourcesForCloudFiles } from '../util/aiDocument/service.js';
import { invalidatePersonalKnowledgeCache } from '../util/personalKnowledgeSearch.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';
import { ensureOwnedCloudFolder } from '../util/services/cloudFolderService.js';
import {
  clearOwnedCloudFolderFiles,
  createOwnedCloudFolder,
  deleteEmptyOwnedCloudFolder,
  deleteOwnedCloudFolderTree,
  listOwnedCloudFolders,
  moveOwnedCloudFolder,
  renameOwnedCloudFolder,
  reorderOwnedCloudFolders,
} from '../util/services/cloudFolderTreeService.js';

function sendFolderServiceError(req, res, error, fallback) {
  const status = Number(error?.status || 500);
  if (status >= 500) console.error('[file] cloud folder operation failed code=%s', stableAgentErrorCode(error));
  const message = status >= 500 ? fallback : String(error?.message || fallback).replace(/^[A-Z_]+:\s*/u, '');
  return res.send(resultData({ code: error?.code || 'FOLDER_OPERATION_FAILED' }, status, message));
}

export const getFileInfo = async (req, res) => {
  try {
    const { id } = req.body;
    // 需要查出创建者的名字
    const sql =
      'SELECT files.*, user.alias AS creatorName FROM files LEFT JOIN user ON files.create_by = user.id WHERE files.id = ? AND files.del_flag = 0';
    const [results] = await pool.query(sql, [id]);
    if (results.length === 0) {
      return res.send(resultData(null, 404, '数据库中未找到文件'));
    }
    const file = results[0];
    // 分享页统一通过独立 file_shares API 读取；这里仅允许本人或 root。
    const uid = req.user?.id;
    const canAccess = (uid && uid === file.create_by) || req.user?.role === 'root';
    if (!canAccess) {
      return res.send(resultData(null, 403, '无权访问该文件'));
    }
    const category = resolveFileCategory({
      fileName: file.file_name,
      fileType: file.file_type,
    });

    file.fileUrl = file.obs_key ? buildSignedDownloadUrl(file.obs_key) : file.directory + file.file_name;
    file.ext = getFileExtension(file.file_name);
    file.category = category;

    res.send(resultData(file, 200));
  } catch (e) {
    console.error('[file] 获取文件信息失败 code=%s', stableAgentErrorCode(e));
    res.send(resultData(null, 500, '服务器暂时无法处理，请稍后重试'));
  }
};

export const updateFile = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const { id, fileName } = req.body;

    // 查询文件信息
    const sql = 'SELECT * FROM files WHERE id = ? AND create_by = ? AND del_flag = 0';
    const [results] = await pool.query(sql, [id, req.user.id]);

    if (results.length === 0) {
      return res.send(resultData(null, 404, '数据库中未找到文件'));
    }

    const file = results[0];

    const originalExt = path.extname(file.file_name);
    const newExt = path.extname(fileName);
    let finalFileName = fileName;

    if (!newExt) {
      finalFileName = fileName + originalExt;
    } else if (newExt !== originalExt) {
      finalFileName = fileName;
    }

    // 检查文件扩展名
    if (
      finalFileName.includes('/') ||
      finalFileName.includes('\\\\') ||
      finalFileName.includes('>') ||
      finalFileName.includes('<')
    ) {
      return res.send(resultData(null, 400, '文件名不能包含特殊字符或路径分隔符'));
    }

    // 查重：同用户下是否存在同名文件（排除自身）
    const [dupRows] = await pool.query(
      'SELECT id FROM files WHERE create_by = ? AND file_name = ? AND id != ? AND del_flag = 0',
      [file.create_by, finalFileName, id],
    );
    if (dupRows.length > 0) {
      return res.send(resultData(null, 400, '已存在同名文件'));
    }

    const sourceKey = file.obs_key || buildObjectKey(file.create_by, file.file_name);
    const targetKey = buildObjectKey(file.create_by, finalFileName);

    // 顺序改为 copy → DB 更新 → 删旧:原先「copy 后立即删旧」在 DB 更新失败时会让 DB 仍指向已删对象,文件永久损坏。
    // 另防同名保存(sourceKey === targetKey):copy 自身后再删除 = 删掉唯一对象。
    if (sourceKey !== targetKey) {
      try {
        await copyObjectInObs(sourceKey, targetKey);
      } catch (obsError) {
        console.error('[file] OBS 重命名失败 code=%s', stableAgentErrorCode(obsError));
        return res.send(resultData(null, 500, '文件重命名暂时失败，请稍后重试'));
      }
    }

    const updateSql = 'UPDATE files SET file_name = ?, obs_key = ?, directory = ? WHERE id = ? AND create_by = ?';
    await pool.query(updateSql, [
      finalFileName,
      targetKey,
      `${bucketBaseUrl}/files/${file.create_by}/`,
      id,
      req.user.id,
    ]);
    res.send(resultData({ id, fileName: finalFileName }));

    // 文件名和对象映射已提交，先结束用户请求；旧对象清理与 AI 索引失效都不是本次重命名成功的前置条件。
    // 这样不会把 AI 文档清理的耗时暴露给用户，同时仍保证失败仅留下可安全清理的冗余数据。
    if (sourceKey !== targetKey) {
      deleteObjectFromObs(sourceKey).catch((e) =>
        console.warn('[file] 旧 OBS 对象清理失败(冗余无害) code=%s', stableAgentErrorCode(e)),
      );
    }
    void Promise.allSettled([
      purgeDocumentSourcesForCloudFiles(pool, req.user.id, [id]),
      invalidatePersonalKnowledgeCache(req.user.id),
    ]).then((results) => {
      if (results.some((result) => result.status === 'rejected')) {
        console.warn('[file] 重命名后 AI 缓存清理失败');
      }
    });
  } catch (e) {
    console.error('[file] 修改文件名失败 code=%s', stableAgentErrorCode(e));
    res.send(resultData(null, 500, '服务器暂时无法处理，请稍后重试'));
  }
};

export const queryFolder = async (req, res) => {
  try {
    const result = await listOwnedCloudFolders({
      userId: req.user.id,
      filters: req.body?.filters,
    });
    // 旧客户端只理解平铺列表：默认仅返回一级文件夹，避免把子级误画成同级并错误重排。
    if (Number(req.body?.treeVersion || 1) < 2) {
      const items = result.items.filter((item) => item.parent_id == null);
      return res.send(resultData({ items, total: items.length }, 200));
    }
    return res.send(resultData(result, 200));
  } catch (e) {
    return sendFolderServiceError(
      req,
      res,
      e,
      L(req, '文件夹目录暂时无法加载，请稍后重试', 'Folders are temporarily unavailable. Try again later.'),
    );
  }
};

export const addFolder = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const folder = await createOwnedCloudFolder({
      userId: req.user.id,
      name: req.body?.name,
      parentId: req.body?.parentId,
    });
    // 保持旧客户端只读取数字 ID 的响应契约；目录元数据通过 treeVersion=2 的查询统一刷新。
    return res.send(resultData(Number(folder.id), 200, L(req, '新增文件夹成功', 'Folder created')));
  } catch (e) {
    return sendFolderServiceError(
      req,
      res,
      e,
      L(req, '文件夹创建暂时失败，请稍后重试', 'The folder could not be created. Try again later.'),
    );
  }
};

export const ensureFolder = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const folder = await ensureOwnedCloudFolder({ userId: req.user?.id, name: req.body?.name });
    return res.send(resultData(folder));
  } catch (error) {
    const status = Number(error?.status || 500);
    const message = status >= 500 ? '服务器暂时无法创建文件夹，请稍后重试' : String(error?.message || '文件夹名称无效');
    if (status >= 500) console.error('[file] ensure folder failed code=%s', stableAgentErrorCode(error));
    return res.send(
      resultData({ code: error?.code || 'FOLDER_ENSURE_FAILED' }, status, message.replace(/^[A-Z_]+:\s*/u, '')),
    );
  }
};

// 文件关联文件夹
export const associateFile = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const connection = await pool.getConnection();
  try {
    const userId = req.user.id;
    let { folderId, fileIds } = req.body;
    if (!folderId) {
      folderId = null;
    }
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return res.send(resultData(null, 400, 'fileIds 必须是一个非空数组'));
    }
    if (folderId) {
      const [folderRows] = await connection.query(
        `SELECT id FROM folders WHERE id = ? AND create_by = ? AND del_flag = 0`,
        [folderId, userId],
      );
      if (folderRows.length === 0) {
        return res.send(resultData(null, 404, '文件夹不存在或无权限'));
      }
    }
    const placeholders = fileIds.map(() => '?').join(',');
    const sql = `UPDATE files SET folder_id = ? WHERE id IN (${placeholders}) AND create_by = ?`;
    const params = [folderId, ...fileIds, userId];
    const [result] = await connection.query(sql, params);
    res.send(resultData(result.affectedRows, 200, '关联成功'));
  } catch (e) {
    console.error('[file] associate file with folder failed code=%s', stableAgentErrorCode(e));
    res.send(resultData(null, 500, '服务器暂时无法处理，请稍后重试'));
  } finally {
    connection.release();
  }
};

// 新客户端明确确认后可删除整棵子目录并把文件移回未分类；旧客户端仍只能删空目录。
export const deleteFolder = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const deleteTree = req.body?.recursive === true;
    const result = deleteTree
      ? await deleteOwnedCloudFolderTree({ userId: req.user.id, id: req.body?.id })
      : await deleteEmptyOwnedCloudFolder({ userId: req.user.id, id: req.body?.id });
    return res.send(resultData(result, 200, L(req, '删除成功', 'Folder deleted')));
  } catch (e) {
    return sendFolderServiceError(
      req,
      res,
      e,
      L(req, '文件夹删除暂时失败，请稍后重试', 'The folder could not be deleted. Try again later.'),
    );
  }
};

export const clearFolderFiles = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const result = await clearOwnedCloudFolderFiles({
      userId: req.user.id,
      id: req.body?.id,
      deleteFolders: req.body?.deleteFolders === true,
    });
    return res.send(resultData(result, 200, L(req, '目录内文件已移入回收站', 'Folder files moved to Trash')));
  } catch (e) {
    return sendFolderServiceError(
      req,
      res,
      e,
      L(req, '目录文件删除暂时失败，请稍后重试', 'Folder files could not be deleted. Try again later.'),
    );
  }
};

// 修改文件夹名称
export const updateFolder = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const folder = await renameOwnedCloudFolder({ userId: req.user.id, id: req.body?.id, name: req.body?.name });
    return res.send(resultData(folder, 200, L(req, '修改成功', 'Folder renamed')));
  } catch (e) {
    return sendFolderServiceError(
      req,
      res,
      e,
      L(req, '文件夹重命名暂时失败，请稍后重试', 'The folder could not be renamed. Try again later.'),
    );
  }
};

export const moveFolder = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const result = await moveOwnedCloudFolder({
      userId: req.user.id,
      id: req.body?.id,
      parentId: req.body?.parentId,
      anchorId: req.body?.anchorId,
      position: req.body?.position,
    });
    return res.send(resultData(result, 200, L(req, '移动成功', 'Folder moved')));
  } catch (e) {
    return sendFolderServiceError(
      req,
      res,
      e,
      L(req, '文件夹移动暂时失败，请稍后重试', 'The folder could not be moved. Try again later.'),
    );
  }
};

export const updateFolderSort = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const items = Array.isArray(req.body?.folders) ? req.body.folders : req.body?.tags;
    const result = await reorderOwnedCloudFolders({
      userId: req.user.id,
      parentId: req.body?.parentId,
      items,
    });
    return res.send(resultData(result, 200, L(req, '排序成功', 'Folder order updated')));
  } catch (e) {
    return sendFolderServiceError(
      req,
      res,
      e,
      L(req, '文件夹排序暂时失败，请稍后重试', 'The folder order could not be updated. Try again later.'),
    );
  }
};

export const getFileTags = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.body;
    if (!id) {
      return res.send(resultData(null, 400, '缺少文件ID'));
    }
    // 归属校验:先确认该文件属于当前用户,防止传他人 file id 枚举其标签
    const [own] = await pool.query('SELECT id FROM files WHERE id=? AND create_by=?', [id, userId]);
    if (own.length === 0) {
      return res.send(resultData(null, 404, '数据库中未找到文件'));
    }
    const tags = await queryTagsForResource({
      resourceType: RESOURCE_TYPE.FILE,
      resourceId: id,
    });
    res.send(resultData(tags));
  } catch (e) {
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
  }
};

export const updateFileTags = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const connection = await pool.getConnection();
  try {
    const userId = req.user.id;
    const { id, tags = [] } = req.body;
    if (!id) {
      return res.send(resultData(null, 400, '缺少文件ID'));
    }
    await connection.beginTransaction();
    const [own] = await connection.query(`SELECT id FROM files WHERE id = ? AND create_by = ?`, [id, userId]);
    if (own.length === 0) {
      await connection.rollback();
      return res.send(resultData(null, 404, '数据库中未找到文件'));
    }
    const tagIds = await validateUserTags(connection, { tagIds: tags, userId });
    await replaceResourceTagRelations(connection, {
      tagIds,
      resourceType: RESOURCE_TYPE.FILE,
      resourceId: id,
      userId,
    });
    await connection.commit();
    res.send(resultData(null, 200, '文件标签更新成功'));
  } catch (e) {
    await connection.rollback();
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
  } finally {
    connection.release();
  }
};
