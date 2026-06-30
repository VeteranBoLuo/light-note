import pool from '../../../db/index.js';
import { parseTimeRange } from '../timeRange.js';

export default {
  name: 'query_operation_logs',
  description: '查询用户操作日志。可按关键词、模块（bookmark/note/file/security）、时间范围筛选，返回操作模块、内容和时间。',
  parameters: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: '搜索关键词，匹配操作内容' },
      module: { type: 'string', description: '操作模块：bookmark(书签)、note(笔记)、file(文件)、security(安全)等' },
      user: { type: 'string', description: '可选，指定查询的用户（昵称/邮箱/ID），不填则查所有用户' },
      timeRange: { type: 'string', description: '时间范围' },
      limit: { type: 'integer', description: '返回条数，默认20，最大100' },
    },
  },
  requireRoot: true,
  async execute(args) {
    const { keyword, module, limit = 20 } = args;
    const time = parseTimeRange(args.timeRange);
    const take = Math.min(Math.max(limit || 20, 1), 100);

    let where = '1=1';
    const params = [];

    if (keyword) {
      where += ` AND ol.operation LIKE ?`;
      params.push(`%${keyword}%`);
    }
    if (module) {
      where += ` AND ol.module = ?`;
      params.push(module);
    }
    if (time) {
      where += ` AND ol.create_time >= ? AND ol.create_time <= ?`;
      params.push(time.start, time.end);
    }

    const sql = `SELECT ol.module, ol.operation, ol.create_by, ol.create_time FROM operation_logs ol WHERE ${where} ORDER BY ol.create_time DESC LIMIT ?`;
    params.push(take);

    const [rows] = await pool.query(sql, params);
    return rows;
  },
  transform(rows) {
    if (!rows?.length) return '没有找到操作日志';
    const lines = rows.map((r, i) => {
      const time = r.create_time ? new Date(r.create_time).toLocaleString('zh-CN') : '';
      return `${i + 1}. [${r.module}] ${r.operation} - ${time}`;
    });
    return `共 ${rows.length} 条操作记录：\n${lines.join('\n')}`;
  },
  summarize(rows) {
    if (!rows?.length) return '操作日志：无记录';
    const modules = [...new Set(rows.map(r => r.module))];
    return `操作日志：共 ${rows.length} 条，模块：${modules.join('、')}`;
  },
};
