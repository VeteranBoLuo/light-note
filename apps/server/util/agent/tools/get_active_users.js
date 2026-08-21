import pool from '../../../db/index.js';
import { resolveAgentTimeRange } from '../timeRange.js';
import { withQueryResultMetadata } from '../toolResultMetadata.js';

export default {
  name: 'get_active_users',
  description: '查询最近活跃的用户排行，按 API 请求次数降序排列。支持按时间范围筛选。',
  routing: {
    targetScope: 'platform',
    requireAny: [
      /(?:活跃).{0,16}(?:用户|账号|排行)|(?:用户|账号).{0,16}(?:活跃|API\s*请求)|API\s*请求(?:次数)?.{0,12}(?:排行|最多)/iu,
    ],
    preferAny: [/(?:活跃用户|用户活跃|API\s*请求)/iu],
    excludeAny: [/(?:书签|笔记|文件|资源|内容).{0,16}(?:新增|创建|最多|排行)/iu],
  },
  parameters: {
    type: 'object',
    properties: {
      timeRange: { type: 'string', description: '时间范围，如"今天"、"最近7天"、"本周"、"最近30天"，默认最近7天' },
      limit: { type: 'integer', description: '返回用户数，默认10，最大50' },
    },
  },
  requireRoot: true,
  async execute(args, ctx = {}) {
    const { limit = 10 } = args;
    const take = Math.min(Math.max(limit || 10, 1), 50);
    const time = resolveAgentTimeRange(args, 'timeRange', {
      context: ctx,
      defaultExpression: '最近7天',
      label: '用户活跃时间',
    });

    let where = '1=1';
    const params = [];

    if (time) {
      where += ' AND a.request_time >= ? AND a.request_time < ?';
      params.push(time.start, time.endExclusive);
    }

    const activityFrom = `FROM api_logs a JOIN user u ON a.user_id = u.id
       WHERE ${where} AND a.user_id IS NOT NULL AND a.user_id != ''`;
    const [[rows], [countRows]] = await Promise.all([
      pool.query(
        `SELECT u.id AS user_id, u.alias, u.email, COUNT(*) as request_count, MAX(a.request_time) as last_active
         ${activityFrom}
         GROUP BY a.user_id, u.id, u.alias, u.email
         ORDER BY request_count DESC LIMIT ?`,
        [...params, take],
      ),
      pool.query(`SELECT COUNT(DISTINCT a.user_id) AS total ${activityFrom}`, params),
    ]);
    return withQueryResultMetadata(
      { total: Number(countRows[0]?.total || 0), items: rows },
      {
        resolvedRanges: {
          timeRange: {
            expression: String(args.timeRange || '最近7天'),
            range: time,
            source: 'tool',
          },
        },
      },
    );
  },
  getDependencyRefs(raw) {
    return (raw?.items || []).map((item) => ({ type: 'user', id: item.user_id }));
  },
  transform(raw) {
    const rows = raw?.items || [];
    if (!rows?.length) return '该时间段内没有用户活动记录';
    const lines = rows.map((r, i) => {
      const alias = r.alias || '未知';
      const lastTime = r.last_active ? new Date(r.last_active).toLocaleString('zh-CN') : '';
      return `${i + 1}. ${alias} (${r.email || '无邮箱'}) — ${r.request_count} 次请求，最后活跃: ${lastTime}`;
    });
    return `活跃用户排行（共 ${raw.total} 人）：\n${lines.join('\n')}`;
  },
  summarize(raw) {
    const rows = raw?.items || [];
    if (!rows?.length) return '活跃用户：无';
    return `活跃用户：共 ${raw.total} 人，最高 ${rows[0]?.request_count || 0} 次请求`;
  },
};
