import pool from '../../../db/index.js';
import { parseTimeRange } from '../timeRange.js';

export default {
  name: 'get_active_users',
  description: '查询最近活跃的用户排行，按 API 请求次数降序排列。支持按时间范围筛选。',
  parameters: {
    type: 'object',
    properties: {
      timeRange: { type: 'string', description: '时间范围，如"今天"、"最近7天"、"本周"、"最近30天"，默认最近7天' },
      limit: { type: 'integer', description: '返回用户数，默认10，最大50' },
    },
  },
  requireRoot: true,
  async execute(args) {
    const { limit = 10 } = args;
    const take = Math.min(Math.max(limit || 10, 1), 50);
    const time = parseTimeRange(args.timeRange || '最近7天');

    let where = '1=1';
    const params = [];

    if (time) {
      where += ' AND a.request_time >= ? AND a.request_time <= ?';
      params.push(time.start, time.end);
    }

    const [rows] = await pool.query(
      `SELECT u.alias, u.email, COUNT(*) as request_count, MAX(a.request_time) as last_active
       FROM api_logs a JOIN user u ON a.user_id = u.id
       WHERE ${where} AND a.user_id IS NOT NULL AND a.user_id != ''
       GROUP BY a.user_id, u.alias, u.email
       ORDER BY request_count DESC LIMIT ?`,
      [...params, take],
    );
    return rows;
  },
  transform(rows) {
    if (!rows?.length) return '该时间段内没有用户活动记录';
    const lines = rows.map((r, i) => {
      const alias = r.alias || '未知';
      const lastTime = r.last_active ? new Date(r.last_active).toLocaleString('zh-CN') : '';
      return `${i + 1}. ${alias} (${r.email || '无邮箱'}) — ${r.request_count} 次请求，最后活跃: ${lastTime}`;
    });
    return `活跃用户排行：\n${lines.join('\n')}`;
  },
  summarize(rows) {
    if (!rows?.length) return '活跃用户：无';
    return `活跃用户：${rows.length} 人，最高 ${rows[0]?.request_count || 0} 次请求`;
  },
};
