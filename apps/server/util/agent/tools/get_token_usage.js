import pool from '../../../db/index.js';
import { parseTimeRange } from '../timeRange.js';

export default {
  name: 'get_token_usage',
  description: '查询 Token 消耗统计，返回请求次数、token 数和费用合计。可按时间范围汇总。',
  parameters: {
    type: 'object',
    properties: {
      timeRange: { type: 'string', description: '时间范围，如"今天"、"最近7天"、"本周"、"本月"，默认今天' },
      user: { type: 'string', description: '可选，指定查询的用户（昵称/邮箱/ID），不填则查全部用户' },
    },
  },
  requireRoot: true,
  async execute(args) {
    const time = parseTimeRange(args.timeRange || '今天');

    let where = '1=1';
    const params = [];

    if (time) {
      where += ' AND created_at >= ? AND created_at <= ?';
      params.push(time.start, time.end);
    }

    const [rows] = await pool.query(
      `SELECT COUNT(*) as request_count, COALESCE(SUM(prompt_tokens),0) as total_prompt, COALESCE(SUM(completion_tokens),0) as total_completion, COALESCE(SUM(total_tokens),0) as total_tokens, COALESCE(SUM(cost),0) as total_cost
       FROM agent_logs WHERE ${where}`,
      params,
    );
    return rows[0];
  },
  transform(raw) {
    const count = Number(raw.request_count || 0);
    if (!count) return '该时间段内没有 AI 调用记录';
    return `Token 消耗统计：
• 请求次数：${count} 次
• Prompt Token：${Number(raw.total_prompt).toLocaleString()} tk
• 输出 Token：${Number(raw.total_completion).toLocaleString()} tk
• 总 Token：${Number(raw.total_tokens).toLocaleString()} tk
• 费用合计：¥${Number(raw.total_cost).toFixed(4)}`;
  },
  summarize(raw) {
    const count = Number(raw.request_count || 0);
    if (!count) return 'Token消耗：无记录';
    return `Token消耗：${count} 次请求，¥${Number(raw.total_cost).toFixed(4)}`;
  },
};
