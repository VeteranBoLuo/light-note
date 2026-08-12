import pool from '../../db/index.js';

function serviceError(code, message, status = 400) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  error.status = status;
  return error;
}

function normalizeFolderName(value) {
  const name = String(value || '')
    .normalize('NFC')
    .trim();
  if (!name) throw serviceError('FOLDER_NAME_REQUIRED', '文件夹名称不能为空');
  if (name.length > 255) throw serviceError('FOLDER_NAME_INVALID', '文件夹名称不能超过 255 个字符');
  return name;
}

/**
 * 查找或创建当前账号的同名云空间目录。
 *
 * 通过锁定账号行串行化同一用户的 ensure 请求，避免连续点击或多端并发时创建多个“周报”目录。
 */
export async function ensureOwnedCloudFolder({ userId, name, database = pool } = {}) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) throw serviceError('USER_REQUIRED', '缺少用户信息', 401);
  const normalizedName = normalizeFolderName(name);
  const connection = await database.getConnection();
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const [userRows] = await connection.query('SELECT id FROM user WHERE id = ? LIMIT 1 FOR UPDATE', [
      normalizedUserId,
    ]);
    if (!userRows.length) throw serviceError('USER_NOT_FOUND', '用户不存在', 404);

    const [folderRows] = await connection.query(
      `SELECT id, name FROM folders
       WHERE create_by = ? AND name = ? AND del_flag = 0
       ORDER BY id ASC LIMIT 1`,
      [normalizedUserId, normalizedName],
    );
    if (folderRows.length) {
      await connection.commit();
      transactionStarted = false;
      return { id: String(folderRows[0].id), name: folderRows[0].name || normalizedName, created: false };
    }

    const [insertResult] = await connection.query('INSERT INTO folders SET ?', [
      { name: normalizedName, create_by: normalizedUserId, del_flag: 0 },
    ]);
    await connection.commit();
    transactionStarted = false;
    return { id: String(insertResult.insertId), name: normalizedName, created: true };
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch {
        // 回滚失败不能覆盖最初的业务/数据库错误；连接仍在 finally 中释放。
      }
    }
    throw error;
  } finally {
    connection.release();
  }
}

export const __testing = { normalizeFolderName, serviceError };
