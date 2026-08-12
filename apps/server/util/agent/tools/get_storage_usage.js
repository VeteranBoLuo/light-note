import pool from '../../../db/index.js';
import { FILE_CATEGORY_CASE, breakdownFromRows } from '../fileCategory.js';
import { PERSONAL_SCOPE_USER_PARAM } from '../ownerScope.js';
import { getUserSpaceMb } from '../../growth.js';

export default {
  name: 'get_storage_usage',
  description:
    '查询当前用户的云空间共享容量：正常文件与回收站文件共同占用空间，并返回总容量、剩余空间、文件数量及类型分布。回答"云空间有多少文件/还剩多少容量/各类文件多少"用它。',
  parameters: {
    type: 'object',
    properties: {
      user: { type: 'string', description: PERSONAL_SCOPE_USER_PARAM },
    },
  },
  requireRoot: false,
  async execute(args, ctx) {
    const [[active], [trash], [bdRows], quotaMb] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) as fileCount, COALESCE(SUM(file_size), 0) as totalSize FROM files WHERE create_by = ? AND del_flag = 0`,
        [ctx.userId],
      ),
      pool.query(
        `SELECT COUNT(*) as fileCount, COALESCE(SUM(file_size), 0) as totalSize FROM files WHERE create_by = ? AND del_flag = 1`,
        [ctx.userId],
      ),
      pool.query(
        `SELECT ${FILE_CATEGORY_CASE} AS category, COUNT(*) AS c FROM files WHERE create_by = ? AND del_flag = 0 GROUP BY category`,
        [ctx.userId],
      ),
      getUserSpaceMb(ctx.userId, ctx.userRole),
    ]);
    const activeSize = Number(active[0].totalSize || 0);
    const trashSize = Number(trash[0].totalSize || 0);
    const totalSize = activeSize + trashSize;
    const quotaBytes = Math.max(0, Number(quotaMb || 0) * 1024 * 1024);
    return {
      fileCount: Number(active[0].fileCount),
      activeSize,
      trashFileCount: Number(trash[0].fileCount || 0),
      trashSize,
      totalSize,
      quotaBytes,
      remainingSize: Math.max(0, quotaBytes - totalSize),
      typeBreakdown: breakdownFromRows(bdRows).map,
    };
  },
  transform(raw) {
    const formatSize = (bytes) => {
      const b = Number(bytes);
      if (!b || b === 0) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(b) / Math.log(1024));
      return (b / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
    };
    let result = `云空间共享容量：已用 ${formatSize(raw.totalSize)} / ${formatSize(raw.quotaBytes)}，剩余 ${formatSize(raw.remainingSize)}`;
    result += `\n正常区 ${raw.fileCount} 个文件，占用 ${formatSize(raw.activeSize)}`;
    const { text } = breakdownFromRows(
      Object.entries(raw?.typeBreakdown || {}).map(([category, c]) => ({ category, c })),
    );
    if (text) result += `\n各类型分布：${text}`;
    if (raw.trashFileCount > 0) {
      result += `\n回收站 ${raw.trashFileCount} 个文件，占用 ${formatSize(raw.trashSize)}；彻底删除后才会释放容量`;
    }
    return result;
  },
  summarize(raw) {
    const formatSize = (bytes) => {
      if (!bytes || bytes === 0) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(1024));
      return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
    };
    return `共享存储：${formatSize(raw.totalSize)} / ${formatSize(raw.quotaBytes)}（含回收站）`;
  },
};
