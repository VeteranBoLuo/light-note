import pool from '../../../db/index.js';
import { ensureTag } from '../tagUtil.js';

// 资源类型 → 表名 + 归属字段
const TABLE = { bookmark: 'bookmark', note: 'note', file: 'files' };
const OWNER = { bookmark: 'user_id', note: 'create_by', file: 'create_by' };
const LABEL = { bookmark: '书签', note: '笔记', file: '文件' };

export default {
  name: 'tag_resource',
  description:
    '给指定的书签/笔记/文件打上标签。参数 resourceType(bookmark|note|file)、resourceId(从查询结果里拿)、tagName(标签名,不存在会自动创建)。资源必须属于当前用户。注意:add_tag 只创建标签本身,给资源打标签要用本工具。',
  parameters: {
    type: 'object',
    properties: {
      resourceType: { type: 'string', enum: ['bookmark', 'note', 'file'], description: '资源类型' },
      resourceId: { type: 'string', description: '资源 ID(从查询结果获得)' },
      tagName: { type: 'string', description: '标签名,不存在自动创建' },
    },
    required: ['resourceType', 'resourceId', 'tagName'],
  },
  requireRoot: false,
  isWrite: true,
  async execute(args, ctx) {
    const type = args.resourceType;
    const table = TABLE[type];
    const ownerCol = OWNER[type];
    if (!table) return { error: 'BAD_TYPE', message: '资源类型必须是 bookmark、note 或 file' };

    const resourceId = args.resourceId;
    const tagName = String(args.tagName || '').trim();
    if (!resourceId) return { error: 'ID_REQUIRED', message: '资源 ID 不能为空' };
    if (!tagName) return { error: 'TAG_REQUIRED', message: '标签名不能为空' };

    // 归属校验:只能给自己的、未删除的资源打标签
    const [own] = await pool.query(
      `SELECT id FROM \`${table}\` WHERE id = ? AND ${ownerCol} = ? AND del_flag = 0`,
      [resourceId, ctx.userId],
    );
    if (!own.length) return { error: 'NOT_FOUND', message: '资源不存在或不属于你' };

    const tagId = await ensureTag(ctx.userId, tagName);
    const [r] = await pool.query(
      `INSERT IGNORE INTO resource_tag_relations (tag_id, resource_type, resource_id, user_id, source) VALUES (?, ?, ?, ?, 'agent')`,
      [tagId, type, resourceId, ctx.userId],
    );
    return { tagName, type, added: Number(r?.affectedRows || 0) > 0 };
  },
  transform(raw) {
    if (raw.error) return `打标签失败:${raw.message}`;
    const t = LABEL[raw.type] || '资源';
    return raw.added ? `✅ 已给该${t}打上标签「${raw.tagName}」` : `该${t}已有标签「${raw.tagName}」,无需重复添加`;
  },
  summarize(raw) {
    if (raw.error) return `打标签失败:${raw.message}`;
    return `给${LABEL[raw.type] || '资源'}打标签「${raw.tagName}」`;
  },
};
