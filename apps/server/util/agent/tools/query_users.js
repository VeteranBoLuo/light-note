import pool from '../../../db/index.js';
import { parseTimeRange } from '../timeRange.js';

export default {
  name: 'query_users',
  description:
    '查询平台用户列表/总数。可按关键词匹配昵称/邮箱/ID；可用 registeredWithin 按注册时间段筛选，回答"最近N天/本周/本月新增了多少用户"这类问题。',
  parameters: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: '搜索关键词，匹配用户昵称或邮箱' },
      registeredWithin: {
        type: 'string',
        description: '按注册时间筛选，如"最近7天"、"本周"、"本月"、"今天"；问"新增用户数"时用此参数，total 即为该时段新增数',
      },
      limit: { type: 'integer', description: '返回条数，默认10，最大50' },
    },
  },
  requireRoot: true,
  async execute(args) {
    const { keyword, registeredWithin, limit = 10 } = args;
    const take = Math.min(Math.max(limit || 10, 1), 50);

    let where = 'u.del_flag = 0';
    const params = [];

    if (keyword) {
      where += ` AND (u.alias LIKE ? OR u.email LIKE ? OR u.id LIKE ?)`;
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    // 注册时间段:让"最近一周新增多少用户"可答;total 直接是该时段的新增数
    const time = registeredWithin ? parseTimeRange(registeredWithin) : null;
    if (time) {
      where += ' AND u.create_time >= ? AND u.create_time <= ?';
      params.push(time.start, time.end);
    }

    const [[rows], [countRes]] = await Promise.all([
      pool.query(
        `SELECT u.id, u.alias, u.email, u.role, u.create_time FROM user u WHERE ${where} ORDER BY u.create_time DESC LIMIT ?`,
        [...params, take],
      ),
      pool.query(`SELECT COUNT(*) AS total FROM user u WHERE ${where}`, params),
    ]);

    return { total: countRes[0].total, items: rows, registeredWithin: registeredWithin || null };
  },
  transform(raw) {
    const scope = raw?.registeredWithin ? `${raw.registeredWithin}新增` : '';
    const items = raw?.items || [];
    if (!raw?.total) return scope ? `${raw.registeredWithin}没有新增用户` : '没有找到用户';
    const lines = items.map((r, i) => {
      const time = r.create_time ? new Date(r.create_time).toLocaleString('zh-CN') : '';
      return `${i + 1}. ${r.alias || '未知'} (${r.email}) - ${r.role} - ${time}`;
    });
    let result = `${scope ? `${scope} ` : '共 '}${raw.total} 个用户：\n${lines.join('\n')}`;
    if (raw.total > items.length) result += `\n...（仅展示前 ${items.length} 条，共 ${raw.total} 条）`;
    return result;
  },
  summarize(raw) {
    if (!raw?.total) return '用户查询：无结果';
    const scope = raw?.registeredWithin ? `${raw.registeredWithin}新增` : '共';
    return `用户查询：${scope} ${raw.total} 个用户`;
  },
};
