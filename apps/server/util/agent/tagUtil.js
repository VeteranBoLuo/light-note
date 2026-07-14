import pool from '../../db/index.js';
import { ensureTag as ensureTagService } from '../services/tagService.js';

/**
 * 找到用户名下的标签,不存在则创建,返回 tagId。
 * 供 Agent 的 create_bookmark 复用(与 add_tag 语义一致)。
 */
export async function ensureTag(userId, tagName, connection = pool) {
  const name = String(tagName || '').trim();
  if (!name) return null;
  const tag = await ensureTagService({ userId, name, connection });
  return tag.id;
}
