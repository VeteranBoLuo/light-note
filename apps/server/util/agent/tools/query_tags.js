import pool from '../../../db/index.js';

export default {
  name: 'query_tags',
  description: '查询用户的所有标签。可按关键词模糊匹配标签名称，返回每个标签关联的资源数量。仅查询，不创建或修改标签。',
  parameters: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: '搜索关键词，模糊匹配标签名称' },
      limit: { type: 'integer', description: '返回条数，默认20，最大100' },
    },
  },
  requireRoot: false,
  async execute(args, ctx) {
    const { keyword, limit = 20 } = args;
    const take = Math.min(Math.max(limit || 20, 1), 100);

    let where = 't.user_id = ? AND t.del_flag = 0';
    const params = [ctx.userId];

    if (keyword) {
      where += ' AND t.name LIKE ?';
      params.push(`%${keyword}%`);
    }

    const [[rows], [countRes]] = await Promise.all([
      pool.query(
        `SELECT t.id, t.name, t.create_time,
                (SELECT COUNT(*) FROM resource_tag_relations rtr WHERE rtr.tag_id = t.id AND rtr.user_id = t.user_id) AS resource_count
         FROM tag t WHERE ${where}
         ORDER BY t.create_time DESC LIMIT ?`,
        [...params, take],
      ),
      pool.query(
        `SELECT COUNT(*) as total FROM tag t WHERE ${where}`,
        params,
      ),
    ]);

    return { total: countRes[0].total, items: rows };
  },
  transform(raw) {
    const items = raw?.items || [];
    if (!items.length) {
      const kw = raw.keyword ? `（关键词"${raw.keyword}"）` : '';
      return `没有找到标签${kw}`;
    }
    const lines = items.map((r, i) => `${i + 1}. 「${r.name}」${r.resource_count > 0 ? `（${r.resource_count} 个资源）` : ''}`);
    return `共 ${raw.total} 个标签：\n${lines.join('\n')}`;
  },
  summarize(raw) {
    if (!raw?.total) return '标签查询：无结果';
    return `标签查询：共 ${raw.total} 个标签`;
  },
};
