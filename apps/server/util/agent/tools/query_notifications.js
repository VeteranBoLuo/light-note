import pool from '../../../db/index.js';

const TYPE_LABEL = { level_up: '升级', opinion_reply: '反馈回复', system: '系统公告', other: '其他' };

// 我的站内通知(只读)。直接查 notification 表(不 import handler,避免路由循环)。
export default {
  name: 'query_notifications',
  description:
    '查询当前用户的站内通知(升级 / 反馈回复 / 系统公告),返回未读数与最近通知。回答"我有几条未读通知""最近有什么通知/系统消息/升级提醒"。',
  parameters: {
    type: 'object',
    properties: {
      limit: { type: 'integer', description: '返回条数,默认 10,最大 30' },
      unreadOnly: { type: 'boolean', description: '只看未读' },
    },
  },
  requireRoot: false,
  async execute(args, ctx) {
    if (!ctx.userId || ctx.userRole === 'visitor') return { unread: 0, items: [] };
    const take = Math.min(Math.max(args.limit || 10, 1), 30);
    const [[u]] = await pool.query('SELECT COUNT(*) AS c FROM notification WHERE user_id = ? AND is_read = 0 AND del_flag = 0', [ctx.userId]);
    let where = 'user_id = ? AND del_flag = 0';
    if (args.unreadOnly) where += ' AND is_read = 0';
    const [items] = await pool.query(
      `SELECT type, title, content, is_read, create_time FROM notification WHERE ${where} ORDER BY create_time DESC LIMIT ?`,
      [ctx.userId, take],
    );
    return { unread: Number(u.c || 0), items };
  },
  transform(raw) {
    const items = raw?.items || [];
    const head = `未读 ${raw.unread} 条`;
    if (!items.length) return `${head}。暂无通知。`;
    const lines = items.map((n) => {
      const t = n.create_time ? new Date(n.create_time).toLocaleString('zh-CN') : '';
      return `${n.is_read ? '' : '🔴 '}[${TYPE_LABEL[n.type] || n.type}]《${n.title}》 - ${t}`;
    });
    return `${head}。最近通知:\n${lines.join('\n')}`;
  },
  summarize(raw) {
    return `通知:未读 ${raw?.unread || 0} 条`;
  },
};
