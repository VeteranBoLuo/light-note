import pool from '../../db/index.js';
import { insertData } from '../agent/data.js';

function normalizeName(value) {
  const name = String(value || '').trim();
  if (!name) throw new Error('TAG_REQUIRED: 标签名称不能为空');
  if (name.length > 255) throw new Error('TAG_TOO_LONG: 标签名称不能超过 255 个字符');
  return name;
}

export async function createTag({ userId, name, iconUrl, sort, connection = pool, existingIsSuccess = false } = {}) {
  if (!userId) throw new Error('USER_REQUIRED: 缺少用户');
  const normalizedName = normalizeName(name);
  const [existing] = await connection.query(
    'SELECT id, name FROM tag WHERE user_id = ? AND name = ? AND del_flag = 0 LIMIT 1',
    [userId, normalizedName],
  );
  if (existing.length) {
    if (existingIsSuccess) return { id: existing[0].id, name: existing[0].name, isNew: false };
    throw new Error('TAG_DUPLICATE: 标签已存在');
  }
  const fields = { name: normalizedName, userId };
  if (iconUrl !== undefined) fields.iconUrl = String(iconUrl || '');
  if (sort !== undefined && Number.isFinite(Number(sort))) fields.sort = Number(sort);
  const data = insertData(fields);
  await connection.query('INSERT INTO tag SET ?', [data]);
  return { id: data.id, name: normalizedName, isNew: true };
}

export async function ensureTag({ userId, name, connection = pool } = {}) {
  return createTag({ userId, name, connection, existingIsSuccess: true });
}
