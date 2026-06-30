import pool from '../../../db/index.js';
import { parseTimeRange } from '../timeRange.js';

export default {
  name: 'get_security_events',
  description: '查询安全攻击事件记录。可按攻击类型、源IP、处理状态（handled/unhandled）、时间范围筛选。',
  parameters: {
    type: 'object',
    properties: {
      type: { type: 'string', description: '攻击类型筛选，如：SQL_INJECTION、XSS、COMMAND_INJECTION、PATH_TRAVERSAL、RATE_LIMIT、AUTH_FAIL' },
      ip: { type: 'string', description: '源IP地址筛选' },
      status: { type: 'string', description: '处理状态：handled(已处理)、unhandled(未处理)' },
      timeRange: { type: 'string', description: '时间范围' },
      limit: { type: 'integer', description: '返回条数，默认20，最大100' },
    },
  },
  requireRoot: true,
  async execute(args) {
    const { type, ip, status, limit = 20 } = args;
    const time = parseTimeRange(args.timeRange);
    const take = Math.min(Math.max(limit || 20, 1), 100);

    let where = '1=1';
    const params = [];

    if (type) {
      where += ` AND se.attack_type LIKE ?`;
      params.push(`%${type}%`);
    }
    if (ip) {
      where += ` AND se.source_ip = ?`;
      params.push(ip);
    }
    if (status) {
      where += ` AND se.handled_status = ?`;
      params.push(status);
    }
    if (time) {
      where += ` AND se.created_at >= ? AND se.created_at <= ?`;
      params.push(time.start, time.end);
    }

    const sql = `SELECT se.attack_type, se.source_ip, se.request_path, se.handled_status, se.threat_score, se.created_at FROM security_events se WHERE ${where} ORDER BY se.created_at DESC LIMIT ?`;
    params.push(take);

    const [rows] = await pool.query(sql, params);
    return rows;
  },
  transform(rows) {
    if (!rows?.length) return '没有找到安全事件记录';
    const lines = rows.map((r, i) => {
      const time = r.created_at ? new Date(r.created_at).toLocaleString('zh-CN') : '';
      return `${i + 1}. [${r.attack_type}] ${r.source_ip} -> ${r.request_path} (风险分: ${r.threat_score}, 状态: ${r.handled_status}) - ${time}`;
    });
    return `共 ${rows.length} 条安全事件：\n${lines.join('\n')}`;
  },
  summarize(rows) {
    if (!rows?.length) return '安全事件：无记录';
    const types = [...new Set(rows.map(r => r.attack_type))];
    return `安全事件：共 ${rows.length} 条，类型：${types.join('、')}`;
  },
};
