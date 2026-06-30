import { generateUUID } from '../../../util/common.js';
import pool from '../../../db/index.js';

export default {
  name: 'write_knowledge_base',
  description: '新增或更新知识库条目。当用户要求"记录""写一篇""存到知识库""新增知识"时使用。如果 title 匹配已有条目则更新，否则新建。仅限 root 用户使用。',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: '知识标题，必填' },
      content: { type: 'string', description: '知识内容正文，支持 HTML 或 Markdown' },
      category: { type: 'string', description: '分类，可选值：帮助中心 / 内部知识 / FAQ / 系统行为' },
      status: { type: 'string', description: '状态，public 或 internal，默认 internal' },
      type: { type: 'string', description: '内容类型，html 或 markdown' },
    },
    required: ['title'],
  },
  requireRoot: true,
  isWrite: true,
  async execute(args, ctx) {
    const title = (args.title || '').trim();
    if (!title) return { error: 'TITLE_REQUIRED', message: '标题不能为空' };

    const content = args.content || '';
    const category = args.category || '内部知识';
    const status = args.status || 'internal';
    const type = args.type || 'markdown';

    // Check if title already exists
    const [existing] = await pool.query('SELECT id FROM knowledge_base WHERE title = ? LIMIT 1', [title]);
    if (existing.length > 0) {
      // Update existing
      const id = existing[0].id;
      await pool.query(
        'UPDATE knowledge_base SET content = ?, category = ?, status = ?, type = ?, updated_by = ? WHERE id = ?',
        [content, category, status, type, ctx.userId, id]
      );
      return { id, title, action: 'updated' };
    }

    // Create new
    const id = generateUUID();
    await pool.query(
      'INSERT INTO knowledge_base (id, title, content, category, status, type, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, title, content, category, status, type, ctx.userId, ctx.userId]
    );
    return { id, title, action: 'created' };
  },
  transform(raw) {
    if (raw.error) return `写入失败：${raw.message}`;
    if (raw.action === 'updated') return `✅ 知识「${raw.title}」已更新`;
    return `✅ 知识「${raw.title}」已创建成功（ID: ${raw.id}）`;
  },
  summarize(raw) {
    if (raw.error) return `写入知识库失败：${raw.message}`;
    return `写入知识库：${raw.action} 「${raw.title}」`;
  },
};
