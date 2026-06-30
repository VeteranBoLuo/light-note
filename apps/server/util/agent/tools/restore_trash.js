import pool from '../../../db/index.js';
import { parseTimeRange } from '../timeRange.js';

const TABLE_CONFIG = {
  bookmark: { table: 'bookmark', userIdField: 'user_id' },
  note: { table: 'note', userIdField: 'create_by' },
  file: { table: 'files', userIdField: 'create_by' },
};

export default {
  name: 'restore_trash',
  description: '从回收站恢复已删除的内容。支持按 id 恢复单个、按 type 恢复某类内容、按 timeRange 恢复某时间段删除的内容；至少应提供一个筛选条件以避免误恢复。',
  parameters: {
    type: 'object',
    properties: {
      type: { type: 'string', description: '资源类型：bookmark(书签)、note(笔记)、file(文件)，不填则查全部' },
      id: { type: 'string', description: '要恢复的资源 ID，指定后只恢复这一个' },
      timeRange: { type: 'string', description: '时间范围，恢复该时间段内删除的内容，如"今天"、"昨天"' },
    },
  },
  requireRoot: false,
  isWrite: true,
  async execute(args, ctx) {
    const { type, id } = args;
    const time = parseTimeRange(args.timeRange);
    const types = type ? [type] : ['bookmark', 'note', 'file'];

    const results = [];

    for (const t of types) {
      const cfg = TABLE_CONFIG[t];
      if (!cfg) continue;

      let where = `${cfg.userIdField} = ? AND del_flag = 1`;
      const params = [ctx.userId];

      if (id) {
        where += ' AND id = ?';
        params.push(id);
      }
      if (time) {
        where += ' AND deleted_at >= ? AND deleted_at <= ?';
        params.push(time.start, time.end);
      }

      const [r] = await pool.query(
        `UPDATE \`${cfg.table}\` SET del_flag = 0, deleted_at = NULL WHERE ${where}`,
        params,
      );
      if (r.affectedRows > 0) {
        results.push({ type: t, count: r.affectedRows });
      }
    }

    return results;
  },
  transform(raw) {
    if (!raw?.length) return '没有找到可恢复的内容，或已恢复过了。';
    const parts = raw.map((r) => `【${r.type}】${r.count} 项`);
    return `✅ 已恢复 ${parts.join('、')}`;
  },
  summarize(raw) {
    if (!raw?.length) return '恢复：无操作';
    const total = raw.reduce((s, r) => s + r.count, 0);
    return `恢复回收站：共 ${total} 项`;
  },
};
