import pool from '../../../db/index.js';
import { FILE_CATEGORY_CASE, breakdownFromRows } from '../fileCategory.js';

export default {
  name: 'get_storage_usage',
  description: '查询当前用户的云空间存储用量：文件总数、占用空间、各类型(图片/文档/视频/音频/压缩包/其他)数量分布,以及回收站情况。回答"云空间有多少文件/各类文件多少"用它。',
  parameters: {
    type: 'object',
    properties: {
      user: { type: 'string', description: '可选，指定查询的用户（昵称/邮箱/ID），仅管理员可用。不填则查自己的数据' },
    },
  },
  requireRoot: false,
  async execute(args, ctx) {
    const [[active], [trash], [bdRows]] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) as fileCount, COALESCE(SUM(file_size), 0) as totalSize FROM files WHERE create_by = ? AND del_flag = 0`,
        [ctx.userId],
      ),
      pool.query(
        `SELECT COUNT(*) as fileCount, COALESCE(SUM(file_size), 0) as totalSize FROM files WHERE create_by = ? AND del_flag = 1`,
        [ctx.userId],
      ),
      pool.query(`SELECT ${FILE_CATEGORY_CASE} AS category, COUNT(*) AS c FROM files WHERE create_by = ? AND del_flag = 0 GROUP BY category`, [ctx.userId]),
    ]);
    return {
      fileCount: Number(active[0].fileCount),
      totalSize: Number(active[0].totalSize),
      trashFileCount: Number(trash[0].fileCount || 0),
      trashSize: Number(trash[0].totalSize || 0),
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
    let result = `云空间：${raw.fileCount} 个文件，已用 ${formatSize(raw.totalSize)}`;
    const { text } = breakdownFromRows(Object.entries(raw?.typeBreakdown || {}).map(([category, c]) => ({ category, c })));
    if (text) result += `\n各类型分布：${text}`;
    if (raw.trashFileCount > 0) {
      result += `\n（回收站还有 ${raw.trashFileCount} 个文件，${formatSize(raw.trashSize)}，合计 ${formatSize(raw.totalSize + raw.trashSize)}）`;
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
    return `存储用量：${raw.fileCount} 个文件，${formatSize(raw.totalSize)}`;
  },
};
