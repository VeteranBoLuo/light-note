import pool from '../../../db/index.js';

export default {
  name: 'query_users',
  description: '查询平台用户列表/总数。可按关键词匹配用户昵称、邮箱或用户ID。',
  parameters: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: '搜索关键词，匹配用户昵称或邮箱' },
      limit: { type: 'integer', description: '返回条数，默认10，最大50' },
    },
  },
  requireRoot: true,
  async execute(args) {
    const { keyword, limit = 10 } = args;
    const take = Math.min(Math.max(limit || 10, 1), 50);

    let where = 'u.del_flag = 0';
    const params = [];

    if (keyword) {
      where += ` AND (u.alias LIKE ? OR u.email LIKE ? OR u.id LIKE ?)`;
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    const [[rows], [countRes]] = await Promise.all([
      pool.query(
        `SELECT u.id, u.alias, u.email, u.role, u.create_time FROM user u WHERE ${where} ORDER BY u.create_time DESC LIMIT ?`,
        [...params, take],
      ),
      pool.query(`SELECT COUNT(*) AS total FROM user u WHERE ${where}`, params),
    ]);

    return { total: countRes[0].total, items: rows };
  },
  transform(raw) {
    const items = raw?.items || [];
    if (!items.length) return '没有找到用户';
    const lines = items.map((r, i) => {
      const time = r.create_time ? new Date(r.create_time).toLocaleString('zh-CN') : '';
      return `${i + 1}. ${r.alias || '未知'} (${r.email}) - ${r.role} - ${time}`;
    });
    let result = `共 ${raw.total} 个用户：\n${lines.join('\n')}`;
    if (raw.total > items.length) result += `\n...（仅展示前 ${items.length} 条，共 ${raw.total} 条）`;
    return result;
  },
  summarize(raw) {
    if (!raw?.total) return '用户查询：无结果';
    return `用户查询：共 ${raw.total} 个用户`;
  },
};
