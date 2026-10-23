import { createHash } from 'node:crypto';

export async function withUploadObjectLock(connection, objectKey, operation, { waitSeconds = 0 } = {}) {
  const name = `ln-upload:${createHash('sha256').update(objectKey).digest('hex').slice(0, 48)}`;
  const [rows] = await connection.query('SELECT GET_LOCK(?, ?) AS acquired', [name, waitSeconds]);
  if (Number(rows[0]?.acquired) !== 1) {
    throw Object.assign(new Error('文件正在处理，请稍后重试'), { code: 'UPLOAD_BUSY', status: 409 });
  }
  try {
    return await operation();
  } finally {
    try {
      const [released] = await connection.query('SELECT RELEASE_LOCK(?) AS released', [name]);
      if (Number(released[0]?.released) !== 1) connection.destroy();
    } catch {
      connection.destroy();
    }
  }
}
