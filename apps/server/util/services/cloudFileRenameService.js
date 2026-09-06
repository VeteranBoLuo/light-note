import path from 'node:path';
import { bucketBaseUrl, buildObjectKey, copyObjectInObs, deleteObjectFromObs } from '../obsClient.js';
import { purgeDocumentSourcesForCloudFiles } from '../aiDocument/service.js';
import pool from '../../db/index.js';
export async function renameOwnedCloudFile(connection, { userId, id, name, preserveExtension = false }) {
  const [rows] = await connection.query('SELECT * FROM files WHERE id=? AND create_by=? AND del_flag=0 FOR UPDATE', [
    id,
    userId,
  ]);
  const file = rows[0];
  if (!file) throw Object.assign(new Error('文件不存在'), { status: 404, code: 'FILE_NOT_FOUND' });
  const ext = path.extname(file.file_name);
  let finalName = String(name || '').trim();
  if (!finalName || ['.', '..'].includes(finalName))
    throw Object.assign(new Error('文件名无效'), { status: 400, code: 'FILE_NAME_INVALID' });
  if (preserveExtension && ext)
    finalName =
      (path.extname(finalName).toLowerCase() === ext.toLowerCase() ? finalName.slice(0, -ext.length) : finalName) + ext;
  else if (!path.extname(finalName)) finalName += ext;
  if (!finalName || finalName.length > 255 || /[\\/<>\x00-\x1f]/u.test(finalName))
    throw Object.assign(new Error('文件名无效'), { status: 400, code: 'FILE_NAME_INVALID' });
  const [duplicates] = await connection.query(
    'SELECT id FROM files WHERE create_by=? AND file_name=? AND id<>? AND del_flag=0 FOR UPDATE',
    [userId, finalName, id],
  );
  if (duplicates.length) throw Object.assign(new Error('已存在同名文件'), { status: 409, code: 'FILE_NAME_CONFLICT' });
  const sourceKey = file.obs_key || buildObjectKey(userId, file.file_name),
    targetKey = buildObjectKey(userId, finalName);
  if (sourceKey !== targetKey) await copyObjectInObs(sourceKey, targetKey);
  await connection.query(
    'UPDATE files SET file_name=?,obs_key=?,directory=? WHERE id=? AND create_by=? AND del_flag=0',
    [finalName, targetKey, `${bucketBaseUrl}/files/${userId}/`, id, userId],
  );
  // 原对象只在调用方提交后清理；重名保存绝不删除唯一对象。
  return {
    name: finalName,
    cleanup: async () => {
      await Promise.allSettled([
        ...(sourceKey !== targetKey ? [deleteObjectFromObs(sourceKey)] : []),
        purgeDocumentSourcesForCloudFiles(pool, userId, [id]),
      ]);
    },
  };
}
