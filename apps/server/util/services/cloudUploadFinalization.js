import { createHash, randomUUID } from 'node:crypto';
import { copyObjectInObs, getObjectMetadataFromObs } from '../obsClient.js';
import { cloudObjectOwner, lockCloudObjectForPublication } from './cloudObjectPublication.js';
import { withUploadObjectLock } from './cloudUploadObjectLock.js';

const hash = (value) => createHash('sha256').update(value).digest('hex');

export function publishedUploadKey(userId, uploadKey) {
  if (cloudObjectOwner(uploadKey) !== String(userId) || uploadKey.startsWith(`files/${userId}/published/`)) {
    throw Object.assign(new Error('上传对象无效'), { code: 'UPLOAD_KEY_INVALID', status: 400 });
  }
  // 确定性映射保留响应丢失后的幂等；这个命名空间从不签发客户端写权限。
  return `files/${userId}/published/${hash(uploadKey)}`;
}

/** 必须在复制及业务事务开始前持久化，失败/崩溃留下的对象也有清理身份。 */
export async function trackCloudUpload(db, userId, uploadKey) {
  const keys = [uploadKey, publishedUploadKey(userId, uploadKey)];
  await db.query(
    `INSERT IGNORE INTO cloud_legacy_object_lifecycle
      (object_hash,generation,user_id,object_key,state,available_at)
     VALUES (?, ?, ?, ?, 'pending', DATE_ADD(NOW(), INTERVAL 1 DAY)),
            (?, ?, ?, ?, 'pending', DATE_ADD(NOW(), INTERVAL 1 DAY))`,
    keys.flatMap((key) => [hash(key), randomUUID(), userId, key]),
  );
}

/** 单对象事务冻结一次；业务账号事务在其提交后再核算容量并发布。 */
export async function freezeCloudUpload(db, userId, uploadKey) {
  const objectKey = publishedUploadKey(userId, uploadKey);
  const [[source]] = await db.query('SELECT state FROM cloud_legacy_object_lifecycle WHERE object_hash = ?', [
    hash(uploadKey),
  ]);
  if (source && ['deleting', 'retired'].includes(source.state)) {
    throw Object.assign(new Error('上传对象已失效，请重新上传'), { code: 'UPLOAD_OBJECT_RETIRED', status: 409 });
  }
  const connection = await db.getConnection();
  try {
    return await withUploadObjectLock(
      connection,
      uploadKey,
      async () => {
        await connection.beginTransaction();
        await lockCloudObjectForPublication(connection, userId, objectKey);
        const [[stage]] = await connection.query(
          'SELECT upload_key FROM cloud_legacy_object_lifecycle WHERE object_hash = ? FOR UPDATE',
          [hash(objectKey)],
        );
        if (!stage?.upload_key) {
          await copyObjectInObs(uploadKey, objectKey);
          // 发布前持久化冻结事实；重试/并发确认均不能再复制覆盖正式副本。
          await connection.query('UPDATE cloud_legacy_object_lifecycle SET upload_key = ? WHERE object_hash = ?', [
            objectKey,
            hash(objectKey),
          ]);
        }
        const metadata = await getObjectMetadataFromObs(objectKey);
        const contentLength = Number(metadata?.contentLength);
        if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
          throw Object.assign(new Error('上传文件大小无法核验'), { code: 'OBS_UPLOAD_INVALID_SIZE', status: 503 });
        }
        await connection.commit();
        return { objectKey, contentLength };
      },
      { waitSeconds: 30 },
    );
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}
