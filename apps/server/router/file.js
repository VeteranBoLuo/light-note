import express from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import os from 'os';
import { L, resultData, snakeCaseKeys } from '../util/common.js';
import pool from '../db/index.js';
import { awardCreate, getUserSpaceMb } from '../util/growth.js';
import { ensureMeaningfulCreateEvent } from '../util/meaningfulActivity.js';
import {
  bucketBaseUrl,
  buildObjectKey,
  buildObjectUrl,
  createDownloadSignedUrl,
  createUploadSignedUrl,
  deleteObjectFromObs,
  getObjectMetadataFromObs,
  putObjectToObs,
} from '../util/obsClient.js';
import {
  FILE_CATEGORY_ORDER,
  buildFileCategorySql,
  getFileExtension,
  resolveFileCategory,
} from '../util/fileCategory.js';
import * as fileHandle from '../router_handle/fileHandle.js';
import * as fileShareHandle from '../router_handle/fileShareHandle.js';
import * as filePreviewHandle from '../router_handle/filePreviewHandle.js';
import { ensureNotVisitor, ensureUserOrAdminPolicy } from '../util/auth.js';
import { recordFirstOwnResource } from '../util/conversion.js';
import { attachPendingStatus, enqueueResources, removeInboxRelations } from '../util/resourceInbox.js';
import { purgeDocumentSourcesForCloudFiles } from '../util/aiDocument/service.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';
import { buildPagedResult, normalizeOptionalPagination } from '../util/pagination.js';
import { buildFileListOrderBy } from '../util/fileListSort.js';
import {
  BYTES_PER_MB,
  getAccountedStorageBytes,
  getActiveReplacementBytes,
  getProjectedStorageBytes,
  getStorageUsageBreakdown,
  storageBytesToMb,
} from '../util/storageUsage.js';
import {
  abortManagedCloudUpload,
  confirmManagedCloudUpload,
  prepareManagedCloudUpload,
} from '../util/services/managedCloudUploadService.js';
const router = express.Router();
const fileShareAccessLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res) =>
    res.send(
      resultData(
        { errorCode: 'SHARE_RATE_LIMITED' },
        429,
        L(req, '尝试次数过多，请稍后再试', 'Too many attempts. Try again later'),
      ),
    ),
});
const fileSharePreviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 240,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res) =>
    res.send(
      resultData(
        { errorCode: 'SHARE_PREVIEW_RATE_LIMITED' },
        429,
        L(req, '预览请求过于频繁，请稍后重试', 'Too many preview requests. Try again later'),
      ),
    ),
});

function sendFileServerError(res, scene, error, message = '服务器暂时无法处理，请稍后重试') {
  console.error('[file] %s failed code=%s', scene, stableAgentErrorCode(error));
  return res.send(resultData(null, 500, message));
}

const backupUpload = multer({ dest: os.tmpdir(), limits: { fileSize: 200 * 1024 * 1024 } });

// 列表/预览/分享页会把这个签名 URL 烤进页面并在整个浏览会话里复用(缩略图、预览、拖拽下载),
// 原 600s(10 分钟)太短——用户停留稍久再点预览/下载就拿到过期 URL,表现为图裂/预览失败/下载报错。
// 拉长到 2 小时覆盖正常会话;真正"点击即下载"的 downloadFileById 另走 600s、点了立即用,不受影响。
export const buildSignedDownloadUrl = (objectKey, expires = 7200) => {
  if (!objectKey) return null;
  const { url } = createDownloadSignedUrl({ objectKey, expires });
  return url || buildObjectUrl(objectKey);
};

const formatFileRecord = (file) => {
  const category = resolveFileCategory({
    fileName: file.file_name,
    fileType: file.file_type,
  });

  return {
    id: file.id,
    fileName: file.file_name,
    fileType: file.file_type,
    ext: getFileExtension(file.file_name),
    category,
    fileSize: file.file_size,
    fileUrl: file.obs_key ? buildSignedDownloadUrl(file.obs_key) : file.directory + file.file_name,
    uploadTime: file.create_time,
    folderId: file.folder_id,
    folderName: file.folderName,
    obsKey: file.obs_key,
    tags: Array.isArray(file.tags) ? file.tags : [],
  };
};

// ---- 云空间容量配额 ----
// 按用户成长等级下发:容量随 level 提升,root=满级。曲线见 growth.js RANKS.spaceMb。
// 新用户(无成长账本)=Lv1 1024MB,满级 20480MB(20G)；正常区与回收站共享容量。
async function storageQuotaMB(user) {
  return await getUserSpaceMb(user?.id, user?.role);
}

function summarizeIncomingFiles(files) {
  const sizeByName = new Map();
  for (const file of Array.isArray(files) ? files : []) {
    const fileName = String(file?.fileName || file?.filename || '').trim();
    const fileSize = Number(file?.fileSize ?? file?.file_size);
    if (!fileName || !Number.isFinite(fileSize) || fileSize < 0) continue;
    // 同一请求出现同名文件时最终只会保留最后一个，容量预判也按最终状态计算。
    sizeByName.set(fileName, fileSize);
  }
  return {
    fileNames: [...sizeByName.keys()],
    incomingBytes: [...sizeByName.values()].reduce((sum, size) => sum + size, 0),
  };
}

function storageQuotaError(req, { quotaMB, usedBytes, incomingBytes, replacementBytes }) {
  const projectedBytes = getProjectedStorageBytes({ usedBytes, incomingBytes, replacementBytes });
  const quotaBytes = Number(quotaMB) * BYTES_PER_MB;
  return resultData(
    {
      errorCode: 'STORAGE_QUOTA_EXCEEDED',
      quotaMB: Number(quotaMB),
      usedMB: storageBytesToMb(usedBytes),
      shortfallMB: storageBytesToMb(Math.max(0, projectedBytes - quotaBytes)),
    },
    413,
    L(
      req,
      `云空间容量不足（总容量 ${quotaMB}MB），回收站文件同样占用容量；请清理回收站、提升等级或兑换扩容包后重试`,
      `Cloud storage is full (${quotaMB} MB total). Files in Trash also count; empty Trash, level up, or redeem an expansion pack and try again.`,
    ),
  );
}

router.post('/uploadFiles', async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const userId = req.user.id;
    const { files } = req.body || {};

    if (!userId) {
      return res.send(resultData(null, 400, '缺少用户信息'));
    }

    if (!Array.isArray(files) || files.length === 0) {
      return res.send(resultData(null, 400, '没有上传文件'));
    }

    // 容量早拦:签发预签名 URL 前先按前端上报的 fileSize 拦一道,避免白传 OBS(无 size 时留给 /confirmUpload 权威拦)
    const { fileNames, incomingBytes } = summarizeIncomingFiles(files);
    if (incomingBytes > 0) {
      const [usedBytes, replacementBytes] = await Promise.all([
        getAccountedStorageBytes(pool, userId),
        getActiveReplacementBytes(pool, userId, fileNames),
      ]);
      const quotaMB = await storageQuotaMB(req.user);
      if (getProjectedStorageBytes({ usedBytes, incomingBytes, replacementBytes }) > quotaMB * BYTES_PER_MB) {
        return res.send(storageQuotaError(req, { quotaMB, usedBytes, incomingBytes, replacementBytes }));
      }
    }

    const results = files.map((file) => {
      const fileName = file.fileName || file.filename;
      const fileType = file.fileType || file.mimetype || 'application/octet-stream';

      if (!fileName) {
        return { filename: '', status: '处理失败', error: '缺少文件名' };
      }

      const objectKey = buildObjectKey(userId, fileName);
      const { url, headers, expiresIn } = createUploadSignedUrl({
        objectKey,
        contentType: fileType,
      });

      return {
        filename: fileName,
        fileType,
        objectKey,
        uploadUrl: url,
        headers,
        expiresIn,
      };
    });

    res.send(resultData(results));
  } catch (e) {
    return sendFileServerError(res, 'prepare-upload', e);
  }
});

// 笔记等需要“创建新文件”的入口使用托管单文件上传：随机对象键与展示名解耦，
// 同名只自动改名，不覆盖旧文件记录，避免破坏已经保存的资源引用。
router.post('/prepareManagedUpload', async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const data = await prepareManagedCloudUpload({
      userId: req.user?.id,
      userRole: req.user?.role,
      fileName: req.body?.fileName,
      fileType: req.body?.fileType,
      fileSize: req.body?.fileSize,
    });
    return res.send(resultData(data));
  } catch (error) {
    if (error?.code) {
      return res.send(resultData(error.details || { errorCode: error.code }, error.httpStatus || 400, error.message));
    }
    return sendFileServerError(res, 'prepare-managed-upload', error);
  }
});

router.post('/confirmManagedUpload', async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const data = await confirmManagedCloudUpload({
      userId: req.user?.id,
      userRole: req.user?.role,
      objectKey: req.body?.objectKey,
      fileName: req.body?.fileName,
      fileType: req.body?.fileType,
      folderId: req.body?.folderId,
      request: req,
    });
    return res.send(resultData(data));
  } catch (error) {
    if (error?.code) {
      return res.send(resultData(error.details || { errorCode: error.code }, error.httpStatus || 400, error.message));
    }
    return sendFileServerError(res, 'confirm-managed-upload', error);
  }
});

router.post('/abortManagedUpload', async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const data = await abortManagedCloudUpload({ userId: req.user?.id, objectKey: req.body?.objectKey });
    return res.send(resultData(data));
  } catch (error) {
    if (error?.code) return res.send(resultData({ errorCode: error.code }, 400, error.message));
    return sendFileServerError(res, 'abort-managed-upload', error);
  }
});

// 前端直传 OBS 成功后回调此接口，将文件信息写入数据库
router.post('/confirmUpload', async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const connection = await pool.getConnection();
  const supersededObjectKeys = new Set();
  let transactionStarted = false;
  try {
    const userId = req.user.id;
    const { files, folderId, addToInbox = false, inboxSource = 'quick_capture' } = req.body || {};

    if (!userId) {
      return res.send(resultData(null, 400, '缺少用户信息'));
    }

    if (!Array.isArray(files) || files.length === 0) {
      return res.send(resultData(null, 400, '没有上传文件'));
    }

    // 浏览器直传完成后以 OBS 元数据为准，客户端 fileSize 只用于签名阶段的提前提示，不能作为最终容量依据。
    const verifiedFiles = await Promise.all(
      files.map(async (file) => {
        const fileName = String(file?.fileName || '').trim();
        if (!fileName) return { ...file, fileName: '', fileSize: 0 };
        const objectKey = buildObjectKey(userId, fileName);
        const metadata = await getObjectMetadataFromObs(objectKey);
        const fileSize = Number(metadata?.contentLength);
        if (!Number.isSafeInteger(fileSize) || fileSize < 0) {
          throw new Error('OBS_UPLOAD_INVALID_SIZE');
        }
        return { ...file, fileName, fileSize, objectKey };
      }),
    );

    await connection.beginTransaction();
    transactionStarted = true;
    // 与 AI“保存到云空间”共用账号行锁，串行化同一账号的选名、覆盖和容量核算。
    // 否则普通直传与 AI 保存并发时，即使 OBS 对象键互不冲突，也可能写出两条同名文件记录。
    await connection.query('SELECT id FROM user WHERE id = ? LIMIT 1 FOR UPDATE', [userId]);

    // 容量强校验（权威）：正常文件与回收站文件共享容量，同名覆盖只计算新旧差额。
    const { fileNames, incomingBytes } = summarizeIncomingFiles(verifiedFiles);
    if (incomingBytes > 0) {
      const usedBytes = await getAccountedStorageBytes(connection, userId);
      const replacementBytes = await getActiveReplacementBytes(connection, userId, fileNames);
      const quotaMB = await storageQuotaMB(req.user);
      if (getProjectedStorageBytes({ usedBytes, incomingBytes, replacementBytes }) > quotaMB * BYTES_PER_MB) {
        await connection.rollback();
        transactionStarted = false;
        // 早退触发下方 finally 的 connection.release(),不重复释放
        return res.send(storageQuotaError(req, { quotaMB, usedBytes, incomingBytes, replacementBytes }));
      }
    }

    const results = [];

    for (const file of verifiedFiles) {
      const fileName = file.fileName;
      const fileType = file.fileType || 'application/octet-stream';
      const fileSize = file.fileSize || 0;

      if (!fileName) {
        results.push({ filename: '', status: '处理失败', error: '缺少文件名' });
        continue;
      }

      const objectKey = file.objectKey || buildObjectKey(userId, fileName);
      const directory = `${bucketBaseUrl}/files/${userId}/`;

      const fileInfo = {
        create_by: userId,
        file_name: fileName,
        file_type: fileType,
        file_size: fileSize,
        directory,
        obs_key: objectKey,
        folder_id: folderId || null,
      };

      const selectSql = 'SELECT * FROM files WHERE create_by = ? AND file_name = ? AND del_flag = 0';
      const [existingRows] = await connection.query(selectSql, [userId, fileName]);

      if (existingRows.length > 0) {
        const existingObjectKey = existingRows[0].obs_key || buildObjectKey(userId, existingRows[0].file_name);
        // AI 保存使用随机对象键；普通同名上传覆盖数据库记录后，提交成功再清理被替换的旧对象。
        if (existingObjectKey && existingObjectKey !== objectKey) supersededObjectKeys.add(existingObjectKey);
        await removeInboxRelations(connection, {
          userId,
          items: [{ resourceType: 'file', resourceId: String(existingRows[0].id) }],
        });
        await purgeDocumentSourcesForCloudFiles(connection, userId, [existingRows[0].id]);
        const deleteSql = 'DELETE FROM files WHERE id = ?';
        await connection.query(deleteSql, [existingRows[0].id]);
      }

      const insertSql = 'INSERT INTO files SET ?';
      const [insertResult] = await connection.query(insertSql, [snakeCaseKeys(fileInfo)]);

      if (addToInbox === true) {
        await enqueueResources(connection, {
          userId,
          items: [{ resourceType: 'file', resourceId: String(insertResult.insertId) }],
          source: inboxSource,
        });
      }

      results.push({
        filename: fileName,
        status: existingRows.length > 0 ? '已覆盖' : '已上传',
        fileId: insertResult.insertId,
      });
    }

    await connection.commit();
    transactionStarted = false;
    if (supersededObjectKeys.size) {
      const cleanupKeys = [...supersededObjectKeys];
      const cleanupResults = await Promise.allSettled(cleanupKeys.map((objectKey) => deleteObjectFromObs(objectKey)));
      cleanupResults.forEach((result) => {
        if (result.status === 'rejected') {
          console.warn('[file] superseded object cleanup failed code=%s', stableAgentErrorCode(result.reason));
        }
      });
    }
    const newlyCreatedFiles = results.filter((result) => result.status === '已上传');
    // C5 即时任务事实必须在响应前落库；经验仍是提交后的旁路，失败不反向影响文件上传。
    if (!req.suppressUserRewards) {
      await Promise.allSettled(
        newlyCreatedFiles.map((result) => ensureMeaningfulCreateEvent(req.user.id, 'file', result.fileId)),
      );
    }
    res.send(resultData(results));
    recordFirstOwnResource(req, 'file'); // 激活里程碑:首次自建文件(直传回调写库成功)
    if (!req.suppressUserRewards) {
      newlyCreatedFiles.forEach((result) => {
        void awardCreate(req.user.id, 'file', result.fileId, { userRole: req.user.role }).catch((error) =>
          console.warn('[growth] 上传文件奖励发放失败 code=%s', stableAgentErrorCode(error)),
        );
      });
    }
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    return sendFileServerError(res, 'confirm-upload', error);
  } finally {
    connection.release();
  }
});

// 查询文件列表：主云空间显式分页；标签配置等旧调用未传 pageSize 时保持原数组结构。
router.post('/queryFiles', async (req, res) => {
  try {
    const userId = req.user.id;
    const { filters = {} } = req.body;
    const pagination = normalizeOptionalPagination(req.body);
    const where = ['files.create_by = ?', 'files.del_flag = 0'];
    const params = [userId];
    const categorySql = buildFileCategorySql();

    if (
      filters.folderId !== undefined &&
      filters.folderId !== null &&
      filters.folderId !== '' &&
      filters.folderId !== 'all'
    ) {
      where.push('files.folder_id = ?');
      params.push(filters.folderId);
    }
    if (filters.tagId) {
      where.push(`
        EXISTS (
          SELECT 1
          FROM resource_tag_relations ftr_filter
          WHERE ftr_filter.resource_type = 'file'
            AND ftr_filter.resource_id = files.id
            AND ftr_filter.tag_id = ?
        )
      `);
      params.push(filters.tagId);
    }
    const fileName = String(filters.fileName || '')
      .trim()
      .slice(0, 255);
    if (fileName) {
      where.push('files.file_name LIKE ?');
      params.push(`%${fileName}%`);
    }

    if (filters.category !== undefined && filters.category !== null) {
      const categoryFilters = Array.isArray(filters.category)
        ? [...new Set(filters.category.filter((item) => FILE_CATEGORY_ORDER.includes(item)))]
        : [];
      if (categoryFilters.length === 0) {
        where.push('1 = 0');
      } else if (categoryFilters.length < FILE_CATEGORY_ORDER.length) {
        where.push(`${categorySql} IN (${categoryFilters.map(() => '?').join(', ')})`);
        params.push(...categoryFilters);
      }
    }

    const whereSql = where.join(' AND ');
    const orderBy = buildFileListOrderBy(req.body?.sort);
    let sql = `SELECT files.*, folders.name AS folderName,
        (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', t.id, 'name', t.name))
         FROM resource_tag_relations r
         INNER JOIN tag t ON r.tag_id = t.id
         WHERE r.resource_type = 'file' AND r.resource_id = files.id AND t.del_flag = 0
        ) AS tags
       FROM files
       LEFT JOIN folders ON files.folder_id = folders.id
       WHERE ${whereSql}
       ORDER BY ${orderBy}`;
    const listParams = [...params];
    if (pagination.enabled) {
      sql += ' LIMIT ? OFFSET ?';
      listParams.push(pagination.pageSize, pagination.offset);
    }

    const [listQueryResult, totalQueryResult] = await Promise.all([
      pool.query(sql, listParams),
      pagination.enabled
        ? pool.query(`SELECT COUNT(*) AS total FROM files WHERE ${whereSql}`, params)
        : Promise.resolve([[]]),
    ]);
    const [files] = listQueryResult;
    const formattedFiles = files.map(formatFileRecord);
    formattedFiles.forEach((file) => {
      file.tags =
        file.tags && Array.isArray(file.tags) && file.tags.every((tag) => tag && tag.id !== null) ? file.tags : [];
    });

    try {
      await attachPendingStatus(pool, { userId, resourceType: 'file', items: formattedFiles });
    } catch (error) {
      console.warn('[待整理角标] 文件状态回填失败(忽略) code=%s', String(error?.code || 'INBOX_STATUS_FAILED'));
    }

    if (!pagination.enabled) {
      return res.send(resultData(formattedFiles));
    }

    const total = Number(totalQueryResult?.[0]?.[0]?.total || 0);
    return res.send(resultData(buildPagedResult(formattedFiles, total, pagination)));
  } catch (error) {
    return sendFileServerError(res, 'query-files', error);
  }
});

// 后端：/downloadFileById 接口
router.post('/downloadFileById', async (req, res) => {
  try {
    const { id } = req.body;

    // 查询文件信息
    const sql = 'SELECT * FROM files WHERE id = ?';
    const [results] = await pool.query(sql, [id]);

    if (results.length === 0) {
      return res.send(resultData(null, 404, '文件未找到'));
    }

    const file = results[0];
    // 分享下载统一走独立 file_shares 生命周期；这里仅允许本人或 root，避免撤销后旧 files.share_token 绕过。
    const uid = req.user?.id;
    const canAccess = (uid && uid === file.create_by) || req.user?.role === 'root';
    if (!canAccess) {
      return res.send(resultData(null, 403, '无权访问该文件'));
    }
    const objectKey = file.obs_key || buildObjectKey(file.create_by, file.file_name);
    const { url, expiresIn } = createDownloadSignedUrl({ objectKey, expires: 600 });

    if (!url) {
      return res.send(resultData(null, 500, '获取下载链接失败'));
    }

    res.send(
      resultData({
        downloadUrl: url,
        fileName: file.file_name,
        fileType: file.file_type,
        category: resolveFileCategory({
          fileName: file.file_name,
          fileType: file.file_type,
        }),
        fileSize: file.file_size,
        expiresIn,
      }),
    );
  } catch (error) {
    return sendFileServerError(res, 'download-file', error); // 设置状态码为500
  }
});

// 软删除文件（移入回收站，OBS 对象保留）
router.post('/deleteFileById', async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const connection = await pool.getConnection();
  try {
    let { id, ids } = req.body;
    let fileIds = [];

    if (ids && Array.isArray(ids)) {
      fileIds = ids;
    } else if (id) {
      fileIds = [id];
    } else {
      return res.send(resultData(null, 400, '缺少文件ID'));
    }

    if (fileIds.length === 0) {
      return res.send(resultData(null, 400, '文件ID列表为空'));
    }

    const userId = req.user.id;
    await connection.beginTransaction();
    const placeholders = fileIds.map(() => '?').join(',');
    const [result] = await connection.query(
      `UPDATE files SET del_flag = 1, deleted_at = NOW() WHERE id IN (${placeholders}) AND create_by = ? AND del_flag = 0`,
      [...fileIds, userId],
    );
    await removeInboxRelations(connection, {
      userId,
      items: fileIds.map((fileId) => ({ resourceType: 'file', resourceId: String(fileId) })),
    });
    await connection.query(
      `UPDATE file_shares
       SET status = 'revoked', revoked_at = COALESCE(revoked_at, NOW()), update_time = NOW()
       WHERE file_id IN (${placeholders}) AND owner_user_id = ? AND status = 'active'`,
      [...fileIds, userId],
    );
    await connection.commit();
    res.send(resultData({ deletedIds: fileIds, count: result.affectedRows }, 200, '删除成功'));
  } catch (e) {
    await connection.rollback();
    return sendFileServerError(res, 'delete-file', e);
  } finally {
    connection.release();
  }
});

// 检查文件名是否已存在（用于上传前预检）
router.post('/checkFileNames', async (req, res) => {
  try {
    const userId = req.user.id;
    const { fileNames } = req.body;
    if (!Array.isArray(fileNames) || fileNames.length === 0) {
      return res.send(resultData([], 200));
    }
    const placeholders = fileNames.map(() => '?').join(',');
    const [rows] = await pool.query(
      `SELECT file_name FROM files WHERE create_by = ? AND file_name IN (${placeholders}) AND del_flag = 0`,
      [userId, ...fileNames],
    );
    const existingNames = new Set(rows.map((r) => r.file_name));
    const result = fileNames.map((name) => ({
      fileName: name,
      exists: existingNames.has(name),
    }));
    // 同时返回该用户所有已有文件名，供前端自动改名构建完整 existingSet
    const [allRows] = await pool.query(`SELECT file_name FROM files WHERE create_by = ? AND del_flag = 0`, [userId]);
    const allNames = allRows.map((r) => r.file_name);
    res.send(resultData({ check: result, allNames }, 200));
  } catch (e) {
    return sendFileServerError(res, 'check-file-names', e, '检查文件名失败，请稍后重试');
  }
});

// 查询某个人下的文件的总共大小（单位MB）
router.post('/queryTotalFileSize', async (req, res) => {
  try {
    // 获取用户ID
    const userId = req.user.id;

    const usage = await getStorageUsageBreakdown(pool, userId);
    // 一并下发容量配额(前端 store 据此设 maxSpace,按等级正确显示)
    const quotaMB = await storageQuotaMB(req.user);
    res.send(
      resultData({
        totalSizeMB: storageBytesToMb(usage.totalBytes),
        activeSizeMB: storageBytesToMb(usage.activeBytes),
        trashSizeMB: storageBytesToMb(usage.trashBytes),
        quotaMB,
        sharedWithTrash: true,
      }),
    );
  } catch (error) {
    // 处理错误
    return sendFileServerError(res, 'query-total-size', error);
  }
});

router.post('/updateFile', fileHandle.updateFile);
router.post('/getFileInfo', fileHandle.getFileInfo);
router.post('/preview/resolve', filePreviewHandle.resolveOwnedFilePreview);
router.post('/preview/prepare', (req, res) => {
  if (!ensureUserOrAdminPolicy(req, res, ['content_write'])) return;
  return filePreviewHandle.prepareOwnedFilePreview(req, res);
});
router.post('/preview/archive', filePreviewHandle.listOwnedArchivePreview);
router.post('/share/create', (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  return fileShareHandle.createFileShare(req, res);
});
router.post('/share/list', (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  return fileShareHandle.listFileShares(req, res);
});
router.post('/share/revoke', (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  return fileShareHandle.revokeFileShare(req, res);
});
router.post('/share/rotate', (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  return fileShareHandle.rotateFileShare(req, res);
});
router.post('/share/resolve', fileShareAccessLimiter, fileShareHandle.resolveFileShare);
router.post('/share/download', fileShareAccessLimiter, fileShareHandle.downloadFileShare);
router.post('/share/preview/prepare', fileShareAccessLimiter, fileShareHandle.prepareFileSharePreview);
router.post('/share/preview/resolve', fileSharePreviewLimiter, fileShareHandle.resolveFileSharePreview);
router.post('/share/preview/archive', fileSharePreviewLimiter, fileShareHandle.listFileShareArchivePreview);

router.post('/queryFolder', fileHandle.queryFolder);
router.post('/addFolder', fileHandle.addFolder);
router.post('/ensureFolder', fileHandle.ensureFolder);
router.post('/associateFile', fileHandle.associateFile);
router.post('/updateFolder', fileHandle.updateFolder);
router.post('/deleteFolder', fileHandle.deleteFolder);
router.post('/updateFolderSort', fileHandle.updateFolderSort);
router.post('/getFileTags', fileHandle.getFileTags);
router.post('/updateFileTags', fileHandle.updateFileTags);

// Hermes 备份上传：服务端一键上传 OBS + 写库
const HERMES_BACKUP_USER_ID = '453c9c95-9b2e-11ef-9d4d-84a93e80c16e';
const HERMES_BACKUP_FILENAME = 'hermes-backup.tar.gz';

router.post('/hermesBackup', backupUpload.single('file'), async (req, res) => {
  const filePath = req.file?.path;
  try {
    const token = req.headers['x-backup-token'];
    const expected = process.env.BACKUP_TOKEN;

    if (!expected || token !== expected) {
      if (filePath) await import('fs').then((fs) => fs.promises.unlink(filePath).catch(() => {}));
      return res.send(resultData(null, 403, '备份令牌无效'));
    }

    if (!req.file) {
      return res.send(resultData(null, 400, '未收到文件'));
    }

    const objectKey = buildObjectKey(HERMES_BACKUP_USER_ID, HERMES_BACKUP_FILENAME);

    // 1. 直传 OBS
    await putObjectToObs(objectKey, filePath, 'application/gzip');

    // 2. 写入 files 表（同名覆盖）
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [existing] = await connection.query(
        'SELECT id FROM files WHERE create_by = ? AND file_name = ? AND del_flag = 0',
        [HERMES_BACKUP_USER_ID, HERMES_BACKUP_FILENAME],
      );
      if (existing.length > 0) {
        await purgeDocumentSourcesForCloudFiles(connection, HERMES_BACKUP_USER_ID, [existing[0].id]);
        await connection.query('DELETE FROM files WHERE id = ?', [existing[0].id]);
      }

      const directory = `${bucketBaseUrl}/files/${HERMES_BACKUP_USER_ID}/`;
      const fileInfo = {
        create_by: HERMES_BACKUP_USER_ID,
        file_name: HERMES_BACKUP_FILENAME,
        file_type: 'application/gzip',
        file_size: req.file.size,
        directory,
        obs_key: objectKey,
        folder_id: null,
      };
      await connection.query('INSERT INTO files SET ?', [snakeCaseKeys(fileInfo)]);

      await connection.commit();
      res.send(resultData({ fileName: HERMES_BACKUP_FILENAME, size: req.file.size }, 200, '备份上传成功'));
    } catch (dbErr) {
      await connection.rollback();
      throw dbErr;
    } finally {
      connection.release();
    }
  } catch (e) {
    return sendFileServerError(res, 'hermes-backup', e, '备份上传失败，请稍后重试');
  } finally {
    // 清理临时文件
    if (filePath) {
      const fs = await import('fs');
      fs.promises.unlink(filePath).catch(() => {});
    }
  }
});

export default router;
