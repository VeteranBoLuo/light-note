import pool from '../../../db/index.js';

export default {
  name: 'query_users',
  description: '查询平台用户列表。可按关键词匹配用户昵称、邮箱或用户ID。',
  parameters: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: '搜索关键词，匹配用户昵称或邮箱' },
      limit: { type: 'integer', description: '返回条数，默认20，最大100' },
    },
  },
  requireRoot: true,
  async execute(args) {
    const { keyword, limit = 10 } = args;
    const take = Math.min(Math.max(limit || 10, 1), 50);

    let sql = `SELECT u.id, u.alias, u.email, u.role, u.create_time
               FROM user u WHERE 1=1`;
    const params = [];

    if (keyword) {
      sql += ` AND (u.alias LIKE ? OR u.email LIKE ? OR u.id LIKE ?)`;
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    sql += ` ORDER BY u.create_time DESC LIMIT ?`;
    params.push(take);

    const [rows] = await pool.query(sql, params);
    return rows;
  },
  transform(rows) {
    if (!rows?.length) return '没有找到用户';
    const lines = rows.map((r, i) => {
      const time = r.create_time ? new Date(r.create_time).toLocaleString('zh-CN') : '';
      return `${i + 1}. ${r.alias || '未知'} (${r.email}) - ${r.role} - ${time}`;
    });
    return `共 ${rows.length} 个用户：\n${lines.join('\n')}`;
  },
  summarize(rows) {
    if (!rows?.length) return '用户查询：无结果';
    return `用户查询：共 ${rows.length} 个用户`;
  },
};
