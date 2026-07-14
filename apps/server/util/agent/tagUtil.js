import pool from '../../db/index.js';
import { insertData } from './data.js';

/**
 * 找到用户名下的标签,不存在则创建,返回 tagId。
 * 供 Agent 的 create_bookmark 复用(与 add_tag 语义一致)。
 */
export async function ensureTag(userId, tagName, connection = pool) {
  const name = String(tagName || '').trim();
  if (!name) return null;
  const [rows] = await connection.query('SELECT id FROM tag WHERE user_id = ? AND name = ? AND del_flag = 0', [userId, name]);
  if (rows.length) return rows[0].id;
  const tagData = insertData({ name, userId });
  await connection.query('INSERT INTO tag SET ?', [tagData]);
  return tagData.id;
}
