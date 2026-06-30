import pool from '../../../db/index.js';
import { insertData } from '../../../util/common.js';

export default {
  name: 'add_tag',
  description: '创建一个新标签。如果标签已存在则返回已有信息。只创建标签，不关联资源。',
  parameters: {
    type: 'object',
    properties: {
      tagName: { type: 'string', description: '标签名称' },
    },
    required: ['tagName'],
  },
  requireRoot: false,
  isWrite: true,
  async execute(args, ctx) {
    const tagName = (args.tagName || args.tag || '').trim();
    if (!tagName) {
      return { error: 'TAG_REQUIRED', message: '标签名称不能为空' };
    }

    const [existing] = await pool.query(
      'SELECT id FROM tag WHERE user_id = ? AND name = ? AND del_flag = 0',
      [ctx.userId, tagName],
    );

    if (existing.length > 0) {
      return { tagName, isNew: false };
    }

    const tagData = insertData({ name: tagName, userId: ctx.userId });
    await pool.query('INSERT INTO tag SET ?', [tagData]);
    return { tagName, isNew: true };
  },
  transform(raw) {
    if (raw.error) return `操作失败：${raw.message}`;
    if (!raw.isNew) return `标签「${raw.tagName}」已存在`;
    return `✅ 已创建标签「${raw.tagName}」`;
  },
  summarize(raw) {
    if (raw.error) return `加标签失败：${raw.message}`;
    if (!raw.isNew) return `标签「${raw.tagName}」已存在`;
    return `已创建标签「${raw.tagName}」`;
  },
};
