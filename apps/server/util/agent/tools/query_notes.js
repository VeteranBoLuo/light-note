import pool from '../../../db/index.js';
import { parseTimeRange } from '../timeRange.js';

export default {
  name: 'query_notes',
  description: '查询用户的笔记。可按关键词（匹配标题和内容）、时间范围筛选，返回笔记标题和创建时间。管理员可通过 user 参数查询指定用户的笔记。',
  parameters: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: '搜索关键词，匹配笔记标题和内容' },
      timeRange: { type: 'string', description: '时间范围，如"最近7天"、"上个月"、"全部"' },
      limit: { type: 'integer', description: '返回条数，默认10，最大50' },
      user: { type: 'string', description: '可选，指定查询的用户（昵称/邮箱/ID），仅管理员可用。不填则查自己的数据' },
    },
  },
  requireRoot: false,
  async execute(args, ctx) {
    const { keyword, timeRange, limit = 10 } = args;
    const time = parseTimeRange(timeRange);
    const take = Math.min(Math.max(limit || 10, 1), 50);

    let where = `n.create_by = ? AND n.del_flag = '0'`;
    const baseParams = [ctx.userId];

    if (keyword) {
      where += ` AND (n.title LIKE ? OR n.content LIKE ?)`;
      baseParams.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (time) {
      where += ` AND n.create_time >= ? AND n.create_time <= ?`;
      baseParams.push(time.start, time.end);
    }

    const [[rows], [countRes]] = await Promise.all([
      pool.query(`SELECT n.id, n.title, n.create_time FROM note n WHERE ${where} ORDER BY n.create_time DESC LIMIT ?`, [...baseParams, take]),
      pool.query(`SELECT COUNT(*) as total FROM note n WHERE ${where}`, baseParams),
    ]);

    return { total: countRes[0].total, items: rows };
  },
  transform(raw, args) {
    const items = raw?.items || [];
    if (!items.length) {
      const kw = args.keyword ? `（关键词"${args.keyword}"）` : '';
      return `没有找到笔记${kw}`;
    }
    const lines = items.map((r, i) => {
      const title = r.title || '无标题';
      const time = r.create_time ? new Date(r.create_time).toLocaleString('zh-CN') : '';
      return `${i + 1}. 《${title}》 - ${time}`;
    });
    return `共 ${raw.total} 条笔记：\n${lines.join('\n')}`;
  },
  summarize(raw, args) {
    if (!raw?.total) return `笔记查询：无结果`;
    const keyword = args.keyword ? `关键词"${args.keyword}"` : '';
    return `笔记查询${keyword ? `（${keyword}）` : ''}：共 ${raw.total} 条`;
  },
};
