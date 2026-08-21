import pool from '../../../db/index.js';
import { escapeLikePattern } from '../sqlPatterns.js';
import { MANAGEMENT_SCOPE_USER_PARAM } from '../ownerScope.js';
import { resolveAgentTimeRange } from '../timeRange.js';
import { withQueryResultMetadata } from '../toolResultMetadata.js';

export default {
  name: 'query_api_logs',
  description: '查询 API 请求日志。可按请求路径关键词、时间范围筛选，返回接口路径、状态码和请求时间。',
  parameters: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: '搜索关键词，匹配请求路径' },
      scope_user: { type: 'string', description: MANAGEMENT_SCOPE_USER_PARAM },
      timeRange: { type: 'string', description: '时间范围' },
      limit: { type: 'integer', description: '返回条数，默认20，最大100' },
    },
  },
  scopeUserMigration: true,
  requireRoot: true,
  async execute(args, ctx = {}) {
    const { keyword, limit = 20 } = args;
    const time = resolveAgentTimeRange(args, 'timeRange', { context: ctx, label: 'API 日志时间' });
    const take = Math.min(Math.max(limit || 20, 1), 100);

    let where = '1=1';
    const params = [];

    if (keyword) {
      where += ` AND a.url LIKE ? ESCAPE '\\\\'`;
      params.push(`%${escapeLikePattern(keyword)}%`);
    }
    if (time) {
      where += ` AND a.request_time >= ? AND a.request_time < ?`;
      params.push(time.start, time.endExclusive);
    }
    if (args.scope_user) {
      where += ' AND a.user_id = ?';
      params.push(ctx.userId);
    }

    const [[rows], [countRows]] = await Promise.all([
      pool.query(
        `SELECT a.id, a.url, a.status_code, a.user_id, a.request_time FROM api_logs a WHERE ${where} ORDER BY a.request_time DESC LIMIT ?`,
        [...params, take],
      ),
      pool.query(`SELECT COUNT(*) AS total FROM api_logs a WHERE ${where}`, params),
    ]);
    return withQueryResultMetadata(
      { total: Number(countRows[0]?.total || 0), items: rows },
      {
        resolvedRanges: args.timeRange
          ? { timeRange: { expression: args.timeRange, range: time, source: 'tool' } }
          : {},
      },
    );
  },
  getDependencyRefs(raw) {
    return (Array.isArray(raw?.items) ? raw.items : []).map((item) => ({ type: 'api_log', id: item.id }));
  },
  transform(raw) {
    const rows = raw?.items || [];
    if (!rows?.length) return '没有找到 API 日志';
    const lines = rows.map((r, i) => {
      const time = r.request_time ? new Date(r.request_time).toLocaleString('zh-CN') : '';
      return `${i + 1}. ${r.url} → ${r.status_code} - ${time}`;
    });
    return `共 ${raw.total} 条 API 请求：\n${lines.join('\n')}`;
  },
  summarize(raw) {
    const rows = raw?.items || [];
    if (!rows?.length) return 'API 日志：无记录';
    const codes = {};
    rows.forEach((r) => {
      codes[r.status_code] = (codes[r.status_code] || 0) + 1;
    });
    const stats = Object.entries(codes)
      .map(([k, v]) => `${k}:${v}`)
      .join(', ');
    return `API 日志：共 ${rows.length} 条 (${stats})`;
  },
};
