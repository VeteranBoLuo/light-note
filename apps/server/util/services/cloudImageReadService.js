import pool from '../../db/index.js';
import { buildObjectKey, createDownloadSignedUrl } from '../obsClient.js';

export async function readOwnedCloudImage({ user, id, db = pool, sign = createDownloadSignedUrl }) {
  if (!user?.id || user.role === 'visitor') return null;
  const [rows] = await db.query(
    'SELECT create_by, file_name, file_type, file_size, obs_key FROM files WHERE id=? AND create_by=? AND del_flag=0 LIMIT 1',
    [String(id), user.id],
  );
  const file = rows[0];
  if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.file_type)) return null;
  if (Number(file.file_size) > 5 * 1024 * 1024) return null;
  return {
    contentType: file.file_type,
    url: sign({ objectKey: file.obs_key || buildObjectKey(file.create_by, file.file_name), expires: 60 }).url,
  };
}
