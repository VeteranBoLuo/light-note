import { queueLegacyObjectRetirement } from './cloudLegacyObjectLifecycle.js';
import {
  reserveRenameStage,
  adoptRenameStage,
  releaseRenameStage,
  cleanupRenameStage,
} from './cloudFileRenameStaging.js';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  bucketBaseUrl,
  buildObjectKey,
  copyObjectInObs,
  deleteObjectFromObs,
  getObjectMetadataFromObs,
} from '../obsClient.js';
import { relocateCloudImage } from '../imagePreview/relocate.js';
import { purgeDocumentSourcesForCloudFiles } from '../aiDocument/service.js';
import pool from '../../db/index.js';
import { assertOwnedManagedObjectKey } from './managedCloudUploadService.js';
class RenamePreparationRequired extends Error {
  constructor(file, finalName, sourceKey) {
    super('File rename preparation required');
    this.file = file;
    this.finalName = finalName;
    this.sourceKey = sourceKey;
  }
}

function snapshot(file) {
  return JSON.stringify([
    String(file.id),
    String(file.create_by),
    file.file_name,
    file.obs_key || '',
    String(file.file_size ?? ''),
    file.file_type || '',
  ]);
}

// operation must own a complete transaction, including rollback/release on error.
// Only the internal preparation signal is retried, once; business errors are not.
export async function withPreparedCloudFileRename(operation) {
  const preparation = {};
  let staged;
  let completed = false;
  try {
    try {
      return await operation(preparation);
    } catch (error) {
      if (!(error instanceof RenamePreparationRequired)) throw error;
      const { file, finalName, sourceKey } = error;
      const metadata = await getObjectMetadataFromObs(sourceKey);
      if (!metadata.etag)
        throw Object.assign(new Error('文件状态暂时无法核验，请重试'), {
          status: 503,
          code: 'FILE_RENAME_SOURCE_UNVERIFIED',
        });
      const stageId = randomUUID();
      staged = {
        id: stageId,
        userId: file.create_by,
        fileId: file.id,
        sourceKey,
        finalName,
        snapshot: snapshot(file),
        targetKey: buildObjectKey(file.create_by, `renamed/${stageId}${path.extname(finalName).slice(0, 17)}`),
      };
      await reserveRenameStage(staged);
      try {
        await copyObjectInObs(sourceKey, staged.targetKey, { sourceEtag: metadata.etag });
      } catch (copyError) {
        if (copyError.obsStatus === 412)
          throw Object.assign(new Error('文件内容已变化，请重试'), {
            status: 409,
            code: 'FILE_RENAME_SOURCE_CHANGED',
          });
        throw copyError;
      }
      preparation.staged = staged;
      const result = await operation(preparation);
      completed = preparation.applied === true;
      return result;
    }
  } finally {
    if (staged) {
      await releaseRenameStage(staged.id).catch(() => {});
      if (!completed) await cleanupRenameStage({ id: staged.id }).catch(() => {});
    }
  }
}

export async function renameOwnedCloudFile(connection, { userId, id, name, preserveExtension = false, preparation }) {
  await connection.query('SELECT id FROM user WHERE id = ? LIMIT 1 FOR UPDATE', [userId]);
  const [rows] = await connection.query('SELECT * FROM files WHERE id=? AND create_by=? AND del_flag=0 FOR UPDATE', [
    id,
    userId,
  ]);
  const file = rows[0];
  if (!file) throw Object.assign(new Error('文件不存在'), { status: 404, code: 'FILE_NOT_FOUND' });
  if (preparation?.staged && preparation.staged.snapshot !== snapshot(file))
    throw Object.assign(new Error('文件已变化，请刷新后重试'), { status: 409, code: 'FILE_RENAME_CHANGED' });
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
  let targetKey = buildObjectKey(userId, finalName);
  // 托管上传的随机对象键已与展示名分离；改名不需要复制字节、迁移资产或撤销预览租约。
  // 历史名称地址只迁移一次；随机迁移地址也与展示名分离。
  try {
    targetKey = assertOwnedManagedObjectKey(userId, sourceKey);
  } catch (error) {
    if (error.code !== 'UPLOAD_KEY_INVALID') throw error;
    // Server namespaces (AI exports, onboarding, old nested keys) are also
    // independent of the display name. Ordinary upload names cannot contain '/'.
    // Keeping these keys avoids copying immutable content and preserves the
    // onboarding service's deterministic-key deduplication after a rename.
    const prefix = buildObjectKey(userId, '');
    const suffix = sourceKey.startsWith(prefix) ? sourceKey.slice(prefix.length) : '';
    if (
      suffix.includes('/') &&
      !/[\\\x00-\x1f\x7f]/u.test(suffix) &&
      suffix.split('/').every((part) => part && part !== '.' && part !== '..')
    )
      targetKey = sourceKey;
  }
  if (sourceKey !== targetKey) {
    if (!preparation?.staged) throw new RenamePreparationRequired(file, finalName, sourceKey);
    const staged = preparation.staged;
    if (staged.snapshot !== snapshot(file) || staged.sourceKey !== sourceKey || staged.finalName !== finalName)
      throw Object.assign(new Error('文件已变化，请刷新后重试'), { status: 409, code: 'FILE_RENAME_CHANGED' });
    targetKey = staged.targetKey;
    await adoptRenameStage(connection, staged);
    await relocateCloudImage(connection, { ...file, obs_key: sourceKey }, targetKey, finalName);
    preparation.applied = true;
  }
  const retiredInTransaction =
    sourceKey !== targetKey && (await queueLegacyObjectRetirement(connection, userId, sourceKey));
  await connection.query(
    'UPDATE files SET file_name=?,obs_key=?,directory=? WHERE id=? AND create_by=? AND del_flag=0',
    [finalName, targetKey, `${bucketBaseUrl}/files/${userId}/`, id, userId],
  );
  return {
    name: finalName,
    cleanup: async () => {
      await Promise.allSettled([
        ...(sourceKey !== targetKey && !retiredInTransaction ? [removeRenamedSource(userId, id, sourceKey)] : []),
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
    const [files] = await c.query(
      "SELECT id FROM files WHERE create_by=? AND (obs_key=? OR ((obs_key IS NULL OR obs_key='') AND CONCAT('files/',create_by,'/',file_name)=?)) FOR UPDATE",
      [userId, sourceKey, sourceKey],
    );
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
