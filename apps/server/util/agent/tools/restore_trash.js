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
  riskLevel: 'medium',
  confirmationPolicy: 'always',
  async preview(args, ctx) {
    const filters = normalizeFilters(args);
    const impact = [];
    for (const type of filters.types) {
      const cfg = TABLE_CONFIG[type];
      const { where, params } = buildWhere(cfg, filters, ctx.userId);
      const [rows] = await pool.query(`SELECT COUNT(*) AS count FROM \`${cfg.table}\` WHERE ${where}`, params);
      impact.push({ type, count: Number(rows[0]?.count || 0) });
    }
    const total = impact.reduce((sum, item) => sum + item.count, 0);
    return {
      title: '恢复回收站内容',
      target: impact.map((item) => `${item.type} ${item.count} 项`).join('、'),
      impact: `预计恢复 ${total} 项内容`,
      items: impact,
    };
  },
  async execute(args, ctx) {
    const filters = normalizeFilters(args);

    const results = [];
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const t of filters.types) {
        const cfg = TABLE_CONFIG[t];
        const { where, params } = buildWhere(cfg, filters, ctx.userId);

        const [r] = await connection.query(
          `UPDATE \`${cfg.table}\` SET del_flag = 0, deleted_at = NULL WHERE ${where}`,
          params,
        );
        if (r.affectedRows > 0) {
          results.push({ type: t, count: r.affectedRows });
        }
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
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

function normalizeFilters(args = {}) {
  const type = String(args.type || '').trim();
  const id = String(args.id || '').trim();
  const time = parseTimeRange(args.timeRange);
  if (!type && !id && !time) {
    throw new Error('FILTER_REQUIRED: 至少需要提供资源类型、资源 ID 或有效时间范围');
  }
  if (type && !TABLE_CONFIG[type]) {
    throw new Error('INVALID_TYPE: 不支持的资源类型');
  }
  if (id && !type) {
    throw new Error('TYPE_REQUIRED: 按 ID 恢复时必须同时指定资源类型');
  }
  return { id, time, types: type ? [type] : Object.keys(TABLE_CONFIG) };
}

function buildWhere(cfg, filters, userId) {
  let where = `${cfg.userIdField} = ? AND del_flag = 1`;
  const params = [userId];
  if (filters.id) {
    where += ' AND id = ?';
    params.push(filters.id);
  }
  if (filters.time) {
    where += ' AND deleted_at >= ? AND deleted_at <= ?';
    params.push(filters.time.start, filters.time.end);
  }
  return { where, params };
}
