import pool from '../../../db/index.js';

// 【root】全站待回复反馈(只读)。
export default {
  name: 'get_pending_feedback',
  description: '【管理员】查询全站待回复的用户反馈(状态=待处理),返回数量与最近内容。回答"有多少待回复反馈""最近的用户反馈""哪些反馈还没处理"。',
  parameters: { type: 'object', properties: { limit: { type: 'integer', description: '默认 10,最大 30' } } },
  requireRoot: true,
  async execute(args) {
    const take = Math.min(Math.max(args.limit || 10, 1), 30);
    const [[c]] = await pool.query("SELECT COUNT(*) c FROM opinion WHERE status='pending' AND del_flag=0");
    const [items] = await pool.query(
      "SELECT o.type, o.content, o.create_time, u.alias FROM opinion o LEFT JOIN user u ON u.id=o.user_id WHERE o.status='pending' AND o.del_flag=0 ORDER BY o.create_time DESC LIMIT ?",
      [take],
    );
    return { pending: Number(c.c || 0), items };
  },
  transform(raw) {
    const items = raw?.items || [];
    if (!items.length) return '没有待回复的反馈 👍';
    const lines = items.map((o, i) => `${i + 1}. [${o.type || '反馈'}] ${o.alias || '用户'}:${String(o.content || '').slice(0, 50)} · ${o.create_time ? new Date(o.create_time).toLocaleDateString('zh-CN') : ''}`);
    return `待回复反馈 ${raw.pending} 条,最近:\n${lines.join('\n')}`;
  },
  summarize(raw) {
    return `待回复反馈:${raw?.pending || 0} 条`;
  },
};
