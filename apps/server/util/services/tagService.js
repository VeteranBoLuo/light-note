import pool from '../../db/index.js';
import { insertData } from '../agent/data.js';

function normalizeName(value) {
  const name = String(value || '').trim();
  if (!name) throw new Error('TAG_REQUIRED: 标签名称不能为空');
  if (name.length > 255) throw new Error('TAG_TOO_LONG: 标签名称不能超过 255 个字符');
  return name;
}

function duplicateTagError() {
  return new Error('TAG_DUPLICATE: 标签已存在');
}

export function normalizeTagDescription(value) {
  if (value === undefined) return undefined;
  const description = String(value || '').trim();
  if (description.length > 500) throw new Error('TAG_DESCRIPTION_TOO_LONG: 标签说明不能超过 500 个字符');
  return description;
}

export async function createTag({
  userId,
  name,
  description,
  iconUrl,
  sort,
  connection = pool,
  existingIsSuccess = false,
} = {}) {
  if (!userId) throw new Error('USER_REQUIRED: 缺少用户');
  const normalizedName = normalizeName(name);
  const [existing] = await connection.query(
    'SELECT id, name FROM tag WHERE user_id = ? AND name = ? AND del_flag = 0 LIMIT 1',
    [userId, normalizedName],
  );
  if (existing.length) {
    if (existingIsSuccess) return { id: existing[0].id, name: existing[0].name, isNew: false };
    throw duplicateTagError();
  }
  const fields = { name: normalizedName, userId };
  const normalizedDescription = normalizeTagDescription(description);
  if (normalizedDescription !== undefined) fields.description = normalizedDescription;
  if (iconUrl !== undefined) fields.iconUrl = String(iconUrl || '');
  if (sort !== undefined && Number.isFinite(Number(sort))) fields.sort = Number(sort);
  const data = insertData(fields);
  try {
    await connection.query('INSERT INTO tag SET ?', [data]);
  } catch (error) {
    if (error?.code !== 'ER_DUP_ENTRY') throw error;
    // 数据库唯一键才是并发下的最终裁决。另一个事务先创建同名标签时，
    // ensure 语义使用锁定读绕过 RR 旧快照回读赢家；显式 create 仍返回稳定的重复错误。
    const [raced] = await connection.query(
      'SELECT id, name FROM tag WHERE user_id = ? AND name = ? AND del_flag = 0 LIMIT 1 FOR UPDATE',
      [userId, normalizedName],
    );
    if (!raced.length) throw error;
    if (existingIsSuccess) return { id: raced[0].id, name: raced[0].name, isNew: false };
    throw duplicateTagError();
  }
  return { id: data.id, name: normalizedName, isNew: true };
}

export async function ensureTag({ userId, name, connection = pool } = {}) {
  return createTag({ userId, name, connection, existingIsSuccess: true });
}
