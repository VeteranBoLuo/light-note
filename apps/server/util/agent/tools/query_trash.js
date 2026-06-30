import pool from '../../../db/index.js';
import { parseTimeRange } from '../timeRange.js';

const TABLE_CONFIG = {
  bookmark: { table: 'bookmark', userIdField: 'user_id', nameField: 'name' },
  note: { table: 'note', userIdField: 'create_by', nameField: 'title' },
  file: { table: 'files', userIdField: 'create_by', nameField: 'file_name' },
};

export default {
  name: 'query_trash',
  description: '查询回收站中被删除的内容。可按资源类型（bookmark/note/file）、关键词、时间范围筛选。不传 type 则查询全部类型。',
  parameters: {
    type: 'object',
    properties: {
      type: { type: 'string', description: '资源类型：bookmark(书签)、note(笔记)、file(文件)，不填则查全部' },
      keyword: { type: 'string', description: '搜索关键词，匹配名称' },
      timeRange: { type: 'string', description: '时间范围，如"今天"、"最近7天"、"昨天"' },
      limit: { type: 'integer', description: '返回条数，默认20，最大50' },
    },
  },
  requireRoot: false,
  async execute(args, ctx) {
    const { keyword, limit = 20 } = args;
    const time = parseTimeRange(args.timeRange);
    const take = Math.min(Math.max(limit || 20, 1), 50);
    const types = args.type ? [args.type] : ['bookmark', 'note', 'file'];

    const queries = [];
    const countQueries = [];

    for (const type of types) {
      const cfg = TABLE_CONFIG[type];
      if (!cfg) continue;

      let where = `${cfg.userIdField} = ? AND del_flag = 1`;
      const params = [ctx.userId];

      if (keyword) {
        where += ` AND ${cfg.nameField} LIKE ?`;
        params.push(`%${keyword}%`);
      }
      if (time) {
        where += ' AND deleted_at >= ? AND deleted_at <= ?';
        params.push(time.start, time.end);
      }

      queries.push(
        pool.query(
          `SELECT id, ${cfg.nameField} AS name, ? AS resourceType, deleted_at
           FROM \`${cfg.table}\` WHERE ${where}
           ORDER BY deleted_at DESC LIMIT ?`,
          [type, ...params, take],
        ),
      );
      countQueries.push(
        pool.query(
          `SELECT COUNT(*) AS cnt FROM \`${cfg.table}\` WHERE ${where}`,
          params,
        ),
      );
    }

    const [queryResults, countResults] = await Promise.all([
      Promise.all(queries),
      Promise.all(countQueries),
    ]);

    let allItems = [];
    for (const [rows] of queryResults) {
      allItems = allItems.concat(rows);
    }
    allItems.sort((a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime());
    allItems = allItems.slice(0, take);

    let total = 0;
    for (const [rows] of countResults) {
      total += Number(rows[0]?.cnt || 0);
    }

    return { total, items: allItems };
  },
  transform(raw) {
    const items = raw?.items || [];
    if (!items.length) return '回收站为空，没有找到已删除的内容';

    const groups = {};
    for (const item of items) {
      const t = item.resourceType || 'unknown';
      if (!groups[t]) groups[t] = [];
      groups[t].push(item);
    }

    const parts = Object.entries(groups).map(([type, list]) => {
      const names = list.map((r) => r.name).join('、');
      return `【${type}】${list.length} 项：${names}`;
    });

    let result = `共 ${raw.total} 项回收站内容：\n${parts.join('\n')}`;
    if (items.length < raw.total) {
      result += `\n...（仅展示前 ${items.length} 项，共 ${raw.total} 项）`;
    }
    return result;
  },
  summarize(raw) {
    if (!raw?.total) return '回收站：无内容';
    return `回收站：共 ${raw.total} 项`;
  },
};
