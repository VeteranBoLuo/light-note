import path from 'path';
import pool from '../db/index.js';
import { resultData, snakeCaseKeys, insertData } from '../util/common.js';
import { bucketBaseUrl, buildObjectKey, copyObjectInObs, deleteObjectFromObs } from '../util/obsClient.js';
import { buildSignedDownloadUrl } from '../router/file.js';
import { getFileExtension, resolveFileCategory } from '../util/fileCategory.js';
import { queryTagsForResource, RESOURCE_TYPE, replaceResourceTagRelations, validateUserTags } from '../util/resourceTags.js';
import { ensureNotVisitor } from '../util/auth.js';

export const getFileInfo = async (req, res) => {
  try {
    const { id } = req.body;
    // 需要查出创建者的名字
    const sql =
      'SELECT files.*, user.alias AS creatorName FROM files LEFT JOIN user ON files.create_by = user.id WHERE files.id = ?';
    const [results] = await pool.query(sql, [id]);
    if (results.length === 0) {
      return res.send(resultData(null, 404, '数据库中未找到文件'));
    }
    const file = results[0];
    const category = resolveFileCategory({
      fileName: file.file_name,
      fileType: file.file_type,
    });

    file.fileUrl = file.obs_key ? buildSignedDownloadUrl(file.obs_key) : file.directory + file.file_name;
    file.ext = getFileExtension(file.file_name);
    file.category = category;

    res.send(resultData(file, 200));
  } catch (e) {
    console.error('获取文件信息时出错:', e);
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
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

    try {
      await copyObjectInObs(sourceKey, targetKey);
      await deleteObjectFromObs(sourceKey);
    } catch (obsError) {
      console.error('OBS 重命名失败:', obsError);
      return res.send(resultData(null, 500, 'OBS 文件重命名失败: ' + obsError.message));
    }

    const updateSql = 'UPDATE files SET file_name = ?, obs_key = ?, directory = ? WHERE id = ? AND create_by = ?';
    await pool.query(updateSql, [finalFileName, targetKey, `${bucketBaseUrl}/files/${file.create_by}/`, id, req.user.id]);

    res.send(resultData({ id, fileName: finalFileName }));
  } catch (e) {
    console.error('修改文件名时出错:', e);
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
  }
};

export const queryFolder = async (req, res) => {
  const { filters } = req.body;
  const connection = await pool.getConnection();

  try {
    const userId = req.user.id;
    const params = [userId];
    // 获取用户ID
    let query = `SELECT * FROM folders`;
    let whereClauses = ['create_by = ?'];

    const key = filters?.name?.trim() || '';

    // 可选的模糊查询
    if (key.length > 0) {
      whereClauses.push(`name LIKE CONCAT('%', ?, '%')`);
      params.push(key);
    }

    // 动态构建 WHERE 条件
    if (whereClauses.length > 0) {
      query += ` WHERE ` + whereClauses.join(' AND ');
    }

    // 固定排序
    query += ` ORDER BY sort, create_time DESC`;

    const [result] = await connection.query(query, params);
    res.send(resultData({ items: result, total: result.length }, 200));
  } catch (e) {
    res.send(resultData(null, 500, `服务器内部错误: ${e.message}`));
  } finally {
    connection.release();
  }
};

export const addFolder = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const connection = await pool.getConnection();
  try {
    const { name } = req.body;
    const createBy = req.user.id;
    const folder = {
      name: name,
      createBy,
      del_flag: 0,
    };
    const [result] = await connection.query(`INSERT INTO folders SET ?`, [snakeCaseKeys(folder)]);
    res.send(resultData(result.insertId, 200, '新增文件夹成功'));
  } catch (e) {
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
  } finally {
    connection.release();
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
        `SELECT id FROM folders WHERE id = ? AND create_by = ?`,
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
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
  } finally {
    connection.release();
  }
};

// 删除文件夹（物理删除，其下文件 folder_id 由 FK ON DELETE SET NULL 自动置空）
export const deleteFolder = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const connection = await pool.getConnection();
  try {
    const { id } = req.body;
    await connection.beginTransaction();
    const [result] = await connection.query(`DELETE FROM folders WHERE id = ? AND create_by = ?`, [id, req.user.id]);
    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.send(resultData(null, 404, '文件夹不存在或无权限'));
    }
    await connection.commit();
    res.send(resultData(null, 200, '删除成功'));
  } catch (e) {
    await connection.rollback();
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
  } finally {
    connection.release();
  }
};

// 修改文件夹名称
export const updateFolder = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const connection = await pool.getConnection();
  try {
    const { id, name } = req.body;
    const [result] = await connection.query(`UPDATE folders SET name = ? WHERE id = ? AND create_by = ?`, [
      name,
      id,
      req.user.id,
    ]);
    if (result.affectedRows === 0) {
      return res.send(resultData(null, 404, '文件夹不存在或无权限'));
    }
    res.send(resultData(result.affectedRows, 200, '修改成功'));
  } catch (e) {
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
  } finally {
    connection.release();
  }
};

export const updateFolderSort = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const connection = await pool.getConnection();
  try {
    const userId = req.user.id;
    await connection.beginTransaction(); // 开始事务
    const { tags } = req.body;
    for (const tag of tags) {
      const { id, sort } = tag;
      const sql = 'UPDATE folders SET sort = ? WHERE id = ? AND create_by = ?';
      await connection.query(sql, [sort, id, userId]);
    }
    await connection.commit(); // 提交事务
    res.send(resultData(null, 200, 'Sort updated successfully'));
  } catch (e) {
    await connection.rollback(); // 如果发生错误，回滚事务
    res.send(resultData(null, 500, '服务器内部错误' + e)); // 设置状态码为400
  } finally {
    connection.release(); // 释放连接回连接池
  }
};

export const getFileTags = async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) {
      return res.send(resultData(null, 400, '缺少文件ID'));
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
