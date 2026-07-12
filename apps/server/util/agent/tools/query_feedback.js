import pool from '../../../db/index.js';

// 我的意见反馈及处理状态(只读)。直接查 opinion 表。
export default {
  name: 'query_feedback',
  description:
    '查询当前用户提交过的意见反馈及处理状态(是否已回复、回复内容)。回答"我提的反馈回复了吗""我的意见反馈进展""管理员回我了吗"。',
  parameters: {
    type: 'object',
    properties: { limit: { type: 'integer', description: '返回条数,默认 10,最大 30' } },
  },
  requireRoot: false,
  async execute(args, ctx) {
    if (!ctx.userId || ctx.userRole === 'visitor') return { total: 0, items: [] };
    const take = Math.min(Math.max(args.limit || 10, 1), 30);
    const [items] = await pool.query(
      'SELECT type, content, status, reply_content, create_time FROM opinion WHERE user_id = ? AND del_flag = 0 ORDER BY create_time DESC LIMIT ?',
      [ctx.userId, take],
    );
    return { total: items.length, items };
  },
  transform(raw) {
    const items = raw?.items || [];
    if (!items.length) return '你还没有提交过反馈。';
    const lines = items.map((o, i) => {
      const replied = o.status === 'replied' || o.status === 'viewed' || !!o.reply_content;
      const t = o.create_time ? new Date(o.create_time).toLocaleDateString('zh-CN') : '';
      let s = `${i + 1}. [${o.type || '反馈'}] ${String(o.content || '').slice(0, 50)} · ${t} · ${replied ? '已回复' : '待处理'}`;
      if (o.reply_content) s += `\n   回复:${o.reply_content}`;
      return s;
    });
    return `你的反馈(共 ${items.length} 条):\n${lines.join('\n')}`;
  },
  summarize(raw) {
    return `反馈:${raw?.items?.length || 0} 条`;
  },
};
