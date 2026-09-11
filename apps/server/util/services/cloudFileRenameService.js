import path from 'node:path';
import { bucketBaseUrl, buildObjectKey, copyObjectInObs, deleteObjectFromObs } from '../obsClient.js';
import { relocateCloudImage } from '../imagePreview/relocate.js';
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
  const sourceKey = file.obs_key || buildObjectKey(userId, file.file_name);
  const targetKey = buildObjectKey(userId, finalName);
  if (sourceKey !== targetKey) {
    const [occupied] = await connection.query(
      'SELECT id FROM files WHERE create_by=? AND obs_key=? AND id<>? FOR UPDATE',
      [userId, targetKey, id],
    );
    if (occupied.length)
      throw Object.assign(new Error('目标文件名仍被其他文件占用，请换一个名称'), {
        status: 409,
        code: 'FILE_NAME_CONFLICT',
      });
    await relocateCloudImage(connection, { ...file, obs_key: sourceKey }, targetKey, finalName);
    await copyObjectInObs(sourceKey, targetKey);
  }
  await connection.query(
    'UPDATE files SET file_name=?,obs_key=?,directory=? WHERE id=? AND create_by=? AND del_flag=0',
    [finalName, targetKey, `${bucketBaseUrl}/files/${userId}/`, id, userId],
  );
  return {
    name: finalName,
    cleanup: async () => {
      await Promise.allSettled([
        ...(sourceKey !== targetKey ? [removeRenamedSource(userId, id, sourceKey)] : []),
        purgeDocumentSourcesForCloudFiles(pool, userId, [id]),
      ]);
    },
  };
}

// Run only after commit. Recheck under locks so a delayed cleanup cannot delete a subsequent rename's source.
async function removeRenamedSource(userId, id, sourceKey) {
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    await c.query('SELECT id FROM files WHERE id=? AND create_by=? FOR UPDATE', [id, userId]);
    const [files] = await c.query('SELECT id FROM files WHERE create_by=? AND obs_key=? FOR UPDATE', [
      userId,
      sourceKey,
    ]);
    const [assets] = await c.query(
      "SELECT id FROM image_assets WHERE storage_kind='obs' AND source_locator=? FOR UPDATE",
      [sourceKey],
    );
    if (!files.length && !assets.length) await deleteObjectFromObs(sourceKey);
    await c.commit();
  } catch (error) {
    await c.rollback();
    throw error;
  } finally {
    c.release();
  }
}
