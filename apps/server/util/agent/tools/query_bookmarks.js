import pool from '../../../db/index.js';
import { parseTimeRange } from '../timeRange.js';

export default {
  name: 'query_bookmarks',
  description: '查询用户的书签。可按关键词（匹配名称和URL）、标签名、时间范围筛选。跨类型搜索时可同时调用 query_notes 和 query_files。',
  parameters: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: '搜索关键词，匹配书签名称和URL' },
      tag: { type: 'string', description: '标签名称，精确匹配' },
      timeRange: { type: 'string', description: '时间范围，如"最近7天"、"上个月"、"今年"、"全部"' },
      limit: { type: 'integer', description: '返回条数，默认10，最大50' },
      user: { type: 'string', description: '可选，指定查询的用户（昵称/邮箱/ID），仅管理员可用。不填则查自己的数据' },
    },
  },
  requireRoot: false,
  async execute(args, ctx) {
    const { keyword, tag, timeRange, limit = 10 } = args;
    const time = parseTimeRange(timeRange);
    const take = Math.min(Math.max(limit || 10, 1), 50);

    let where = `b.user_id = ? AND b.del_flag = 0`;
    const baseParams = [ctx.userId];

    if (keyword) {
      where += ` AND (b.name LIKE ? OR b.url LIKE ?)`;
      baseParams.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (tag) {
      where += ` AND b.id IN (
                SELECT rtr.resource_id FROM resource_tag_relations rtr
                JOIN tag t ON t.id = rtr.tag_id
                WHERE t.name = ? AND rtr.resource_type = 'bookmark' AND rtr.user_id = ?)`;
      baseParams.push(tag, ctx.userId);
    }
    if (time) {
      where += ` AND b.create_time >= ? AND b.create_time <= ?`;
      baseParams.push(time.start, time.end);
    }

    const [[rows], [countRes]] = await Promise.all([
      pool.query(
        `SELECT b.id, b.name, b.url, b.create_time FROM bookmark b WHERE ${where} ORDER BY b.create_time DESC LIMIT ?`,
        [...baseParams, take],
      ),
      pool.query(
        `SELECT COUNT(*) as total FROM bookmark b WHERE ${where}`,
        baseParams,
      ),
    ]);

    return { total: countRes[0].total, items: rows };
  },
  transform(raw, args) {
    const items = raw?.items || [];
    if (!items.length) {
      const tagHint = args.tag ? `（标签"${args.tag}"）` : '';
      return `没有找到书签${tagHint}`;
    }
    const lines = items.slice(0, 10).map((r, i) => {
      const name = r.name || '无标题';
      const url = r.url || '';
      const time = r.create_time ? new Date(r.create_time).toLocaleString('zh-CN') : '';
      return `${i + 1}. 《${name}》 ${url} - ${time}`;
    });
    let result = `共 ${raw.total} 条书签：\n${lines.join('\n')}`;
    if (raw.total > 10) result += `\n...（仅展示前 10 条，共 ${raw.total} 条）`;
    return result;
  },
  summarize(raw, args) {
    if (!raw?.total) return `书签查询：无结果`;
    const keyword = args.keyword ? `关键词"${args.keyword}"` : '';
    return `书签查询${keyword ? `（${keyword}）` : ''}：共 ${raw.total} 条`;
  },
};
