import pool from '../../../db/index.js';
import { parseTimeRange } from '../timeRange.js';

export default {
  name: 'query_api_logs',
  description: '查询 API 请求日志。可按请求路径关键词、时间范围筛选，返回接口路径、状态码和请求时间。',
  parameters: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: '搜索关键词，匹配请求路径' },
      user: { type: 'string', description: '可选，指定查询的用户（昵称/邮箱/ID），不填则查所有用户' },
      timeRange: { type: 'string', description: '时间范围' },
      limit: { type: 'integer', description: '返回条数，默认20，最大100' },
    },
  },
  requireRoot: true,
  async execute(args) {
    const { keyword, limit = 20 } = args;
    const time = parseTimeRange(args.timeRange);
    const take = Math.min(Math.max(limit || 20, 1), 100);

    let where = '1=1';
    const params = [];

    if (keyword) {
      where += ` AND a.url LIKE ?`;
      params.push(`%${keyword}%`);
    }
    if (time) {
      where += ` AND a.request_time >= ? AND a.request_time <= ?`;
      params.push(time.start, time.end);
    }

    const sql = `SELECT a.url, a.status_code, a.user_id, a.request_time FROM api_logs a WHERE ${where} ORDER BY a.request_time DESC LIMIT ?`;
    params.push(take);

    const [rows] = await pool.query(sql, params);
    return rows;
  },
  transform(rows) {
    if (!rows?.length) return '没有找到 API 日志';
    const lines = rows.map((r, i) => {
      const time = r.request_time ? new Date(r.request_time).toLocaleString('zh-CN') : '';
      return `${i + 1}. ${r.url} → ${r.status_code} - ${time}`;
    });
    return `共 ${rows.length} 条 API 请求：\n${lines.join('\n')}`;
  },
  summarize(rows) {
    if (!rows?.length) return 'API 日志：无记录';
    const codes = {};
    rows.forEach(r => { codes[r.status_code] = (codes[r.status_code] || 0) + 1; });
    const stats = Object.entries(codes).map(([k, v]) => `${k}:${v}`).join(', ');
    return `API 日志：共 ${rows.length} 条 (${stats})`;
  },
};
