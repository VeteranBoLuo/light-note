import pool from '../../../db/index.js';
import { parseTimeRange } from '../timeRange.js';

export default {
  name: 'query_files',
  description: '查询用户云空间的文件。可按关键词（匹配文件名）、文件类型（image/document/video/audio/other）、时间范围筛选。',
  parameters: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: '搜索关键词，匹配文件名' },
      type: { type: 'string', description: '文件类型：image(图片)、document(文档)、video(视频)、audio(音频)、other(其他)' },
      timeRange: { type: 'string', description: '时间范围，如"最近7天"、"上个月"、"全部"' },
      limit: { type: 'integer', description: '返回条数，默认10，最大50' },
      user: { type: 'string', description: '可选，指定查询的用户（昵称/邮箱/ID），仅管理员可用。不填则查自己的数据' },
    },
  },
  requireRoot: false,
  async execute(args, ctx) {
    const { keyword, type, timeRange, limit = 10 } = args;
    const time = parseTimeRange(timeRange);
    const take = Math.min(Math.max(limit || 10, 1), 50);

    const typeMap = { image: 'image', document: 'document', video: 'video', audio: 'audio', other: 'other' };

    let where = `f.create_by = ? AND f.del_flag = 0`;
    const baseParams = [ctx.userId];

    if (keyword) {
      where += ` AND f.file_name LIKE ?`;
      baseParams.push(`%${keyword}%`);
    }
    if (type && typeMap[type]) {
      where += ` AND f.file_type LIKE ?`;
      baseParams.push(`${typeMap[type]}%`);
    }
    if (time) {
      where += ` AND f.create_time >= ? AND f.create_time <= ?`;
      baseParams.push(time.start, time.end);
    }

    const [[rows], [countRes]] = await Promise.all([
      pool.query(`SELECT f.id, f.file_name, f.file_type, f.file_size, f.create_time FROM files f WHERE ${where} ORDER BY f.create_time DESC LIMIT ?`, [...baseParams, take]),
      pool.query(`SELECT COUNT(*) as total FROM files f WHERE ${where}`, baseParams),
    ]);

    return { total: countRes[0].total, items: rows };
  },
  transform(raw, args) {
    const items = raw?.items || [];
    if (!items.length) {
      const typeHint = args.type ? `（类型: ${args.type}）` : '';
      return `没有找到文件${typeHint}`;
    }
    const formatSize = (bytes) => {
      if (!bytes || bytes === 0) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(1024));
      return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
    };
    const lines = items.map((r, i) => {
      const name = r.file_name || '未知';
      const size = formatSize(r.file_size);
      const time = r.create_time ? new Date(r.create_time).toLocaleString('zh-CN') : '';
      return `${i + 1}. ${name} (${size}) - ${time}`;
    });
    return `共 ${raw.total} 个文件：\n${lines.join('\n')}`;
  },
  summarize(raw) {
    if (!raw?.total) return `文件查询：无结果`;
    return `文件查询：共 ${raw.total} 个文件`;
  },
};
