import express from 'express';
import multer from 'multer';
import os from 'os';
import { resultData, snakeCaseKeys } from '../util/common.js';
import pool from '../db/index.js';
import {
  bucketBaseUrl,
  buildObjectKey,
  buildObjectUrl,
  createDownloadSignedUrl,
  createUploadSignedUrl,
  putObjectToObs,
} from '../util/obsClient.js';
import { FILE_CATEGORY_ORDER, getFileExtension, resolveFileCategory } from '../util/fileCategory.js';
import * as fileHandle from '../router_handle/fileHandle.js';
import { ensureNotVisitor } from '../util/auth.js';
const router = express.Router();

const backupUpload = multer({ dest: os.tmpdir(), limits: { fileSize: 200 * 1024 * 1024 } });

export const buildSignedDownloadUrl = (objectKey, expires = 600) => {
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
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
  }
});

// 前端直传 OBS 成功后回调此接口，将文件信息写入数据库
router.post('/confirmUpload', async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const connection = await pool.getConnection();
  try {
    const userId = req.user.id;
    const { files, folderId } = req.body || {};

    if (!userId) {
      connection.release();
      return res.send(resultData(null, 400, '缺少用户信息'));
    }

    if (!Array.isArray(files) || files.length === 0) {
      connection.release();
      return res.send(resultData(null, 400, '没有上传文件'));
    }

    await connection.beginTransaction();
    const results = [];

    for (const file of files) {
      const fileName = file.fileName;
      const fileType = file.fileType || 'application/octet-stream';
      const fileSize = file.fileSize || 0;

      if (!fileName) {
        results.push({ filename: '', status: '处理失败', error: '缺少文件名' });
        continue;
      }

      const objectKey = buildObjectKey(userId, fileName);
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
        const deleteSql = 'DELETE FROM files WHERE id = ?';
        await connection.query(deleteSql, [existingRows[0].id]);
      }

      const insertSql = 'INSERT INTO files SET ?';
      const [insertResult] = await connection.query(insertSql, [snakeCaseKeys(fileInfo)]);

      results.push({
        filename: fileName,
        status: existingRows.length > 0 ? '已覆盖' : '已上传',
        fileId: insertResult.insertId,
      });
    }

    await connection.commit();
    res.send(resultData(results));
  } catch (error) {
    await connection.rollback();
    res.send(resultData(null, 500, '服务器内部错误: ' + error.message));
  } finally {
    connection.release();
  }
});

// 查询所有文件
router.post('/queryFiles', async (req, res) => {
  try {
    const userId = req.user.id;
    const { filters = {} } = req.body;
    const params = [userId];
    let sql =
      `SELECT files.*, folders.name AS folderName,
        (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', t.id, 'name', t.name))
         FROM resource_tag_relations r
         INNER JOIN tag t ON r.tag_id = t.id
         WHERE r.resource_type = 'file' AND r.resource_id = files.id AND t.del_flag = 0
        ) AS tags
       FROM files LEFT JOIN folders ON files.folder_id = folders.id WHERE files.create_by = ?`;
    // 添加文件夹ID条件
    if (filters.folderId !== undefined && filters.folderId !== null && filters.folderId !== '' && filters.folderId !== 'all') {
      sql += ' AND files.folder_id = ?';
      params.push(filters.folderId);
    }
    // 添加标签ID条件
    if (filters.tagId) {
      sql += ` AND files.id IN (SELECT resource_id FROM resource_tag_relations WHERE tag_id = ? AND resource_type = 'file')`;
      params.push(filters.tagId);
    }
    sql += ' AND files.del_Flag=0 ORDER BY files.create_time DESC';
    const [files] = await pool.query(sql, params);

    let formattedFiles = files.map(formatFileRecord);

    // 处理 tags 为数组
    formattedFiles.forEach((file) => {
      file.tags =
        file.tags && Array.isArray(file.tags) && file.tags.every((tag) => tag && tag.id !== null) ? file.tags : [];
    });

    // 3. 应用文件名过滤
    if (filters?.fileName) {
      formattedFiles = formattedFiles.filter((file) => file.fileName.includes(filters.fileName));
    }

    // 4. 应用文件类型过滤
    const categoryFilters = Array.isArray(filters?.category)
      ? filters.category.filter((item) => FILE_CATEGORY_ORDER.includes(item))
      : [];
    if (categoryFilters.length > 0) {
      formattedFiles = formattedFiles.filter((file) => {
        return categoryFilters.includes(file.category);
      });
    } else if (filters?.category !== undefined && filters?.category !== null) {
      formattedFiles = [];
    }
    res.send(resultData(formattedFiles));
  } catch (error) {
    console.error('查询文件时出错:', error);
    res.send(resultData(null, 500, '服务器内部错误: ' + error.message));
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
    console.error('下载文件时出错:', error);
    res.send(resultData(null, 500, '服务器内部错误')); // 设置状态码为500
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
    await connection.commit();
    res.send(resultData({ deletedIds: fileIds, count: result.affectedRows }, 200, '删除成功'));
  } catch (e) {
    await connection.rollback();
    console.error('删除文件时出错:', e);
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
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
    const [allRows] = await pool.query(
      `SELECT file_name FROM files WHERE create_by = ? AND del_flag = 0`,
      [userId],
    );
    const allNames = allRows.map((r) => r.file_name);
    res.send(resultData({ check: result, allNames }, 200));
  } catch (e) {
    res.send(resultData(null, 500, '检查文件名时出错: ' + e.message));
  }
});

// 查询某个人下的文件的总共大小（单位MB）
router.post('/queryTotalFileSize', async (req, res) => {
  try {
    // 获取用户ID
    const userId = req.user.id;

    // 构建SQL查询
    const sql = 'SELECT SUM(file_size) as total_size FROM files WHERE create_by = ? AND del_flag = 0';
    const [result] = await pool.query(sql, [userId]);
    // 提取总大小（MB）保留两位小数
    const totalSizeMB = parseFloat((result[0].total_size / (1024 * 1024)).toFixed(2));
    // 返回结果
    res.send(resultData({ totalSizeMB }));
  } catch (error) {
    // 处理错误
    console.error('查询文件总大小时出错:', error);
    res.send(resultData(null, 500, '服务器内部错误: ' + error.message));
  }
});

router.post('/updateFile', fileHandle.updateFile);
router.post('/getFileInfo', fileHandle.getFileInfo);

router.post('/queryFolder', fileHandle.queryFolder);
router.post('/addFolder', fileHandle.addFolder);
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
      if (filePath) await import('fs').then(fs => fs.promises.unlink(filePath).catch(() => {}));
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
    console.error('[HermesBackup] 上传失败:', e.message);
    res.send(resultData(null, 500, '备份上传失败: ' + e.message));
  } finally {
    // 清理临时文件
    if (filePath) {
      const fs = await import('fs');
      fs.promises.unlink(filePath).catch(() => {});
    }
  }
});

export default router;
