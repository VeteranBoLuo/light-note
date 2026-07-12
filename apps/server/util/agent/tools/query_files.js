import pool from '../../../db/index.js';
import { parseTimeRange } from '../timeRange.js';
import { categoryCondition, FILE_CATEGORY_CASE, FILE_CATEGORY_LABEL, breakdownFromRows } from '../fileCategory.js';

export default {
  name: 'query_files',
  description:
    '查询用户云空间的文件。可按关键词(匹配文件名)、文件类型(image图片/document文档/video视频/audio音频/archive压缩包/other其他)、时间范围筛选。' +
    '注意:file_type 存的是 MIME,类型按 MIME 归类;结果总会附带各类型数量分布 typeBreakdown,回答"各类文件有多少/除了图片还有什么"时直接看它,不要逐类猜。',
  parameters: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: '搜索关键词，匹配文件名' },
      type: { type: 'string', description: '文件类型：image(图片)、document(文档,含pdf/word/excel/ppt/文本等)、video(视频)、audio(音频)、archive(压缩包zip/rar/7z等)、other(其他)' },
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

    // 基础筛选(关键词/时间),不含类型 —— 用于「全类型分布」,让 AI 一次拿到完整分布
    let baseWhere = 'f.create_by = ? AND f.del_flag = 0';
    const baseParams = [ctx.userId];
    if (keyword) {
      baseWhere += ' AND f.file_name LIKE ?';
      baseParams.push(`%${keyword}%`);
    }
    if (time) {
      baseWhere += ' AND f.create_time >= ? AND f.create_time <= ?';
      baseParams.push(time.start, time.end);
    }

    // 叠加类型筛选(用于 items/total)——按 MIME 归类,修复 pdf/压缩包/文本被漏的问题
    let where = baseWhere;
    const cond = type ? categoryCondition(type) : null;
    if (cond) where += ` AND ${cond}`;

    const [[rows], [countRes], [bdRows]] = await Promise.all([
      pool.query(`SELECT f.id, f.file_name, f.file_type, f.file_size, f.create_time FROM files f WHERE ${where} ORDER BY f.create_time DESC LIMIT ?`, [...baseParams, take]),
      pool.query(`SELECT COUNT(*) as total FROM files f WHERE ${where}`, baseParams),
      pool.query(`SELECT ${FILE_CATEGORY_CASE} AS category, COUNT(*) AS c FROM files f WHERE ${baseWhere} GROUP BY category`, baseParams),
    ]);

    const { map: typeBreakdown } = breakdownFromRows(bdRows);
    return { total: countRes[0].total, items: rows, typeBreakdown };
  },
  transform(raw, args) {
    const { text: bdText } = breakdownFromRows(
      Object.entries(raw?.typeBreakdown || {}).map(([category, c]) => ({ category, c })),
    );
    const distLine = bdText ? `各类型分布:${bdText}\n` : '';
    const items = raw?.items || [];
    const label = args.type ? FILE_CATEGORY_LABEL[args.type] || args.type : '';
    if (!items.length) {
      return `${distLine}没有找到${label ? label + '文件' : '文件'}`;
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
    const head = label ? `${label}文件共 ${raw.total} 个` : `共 ${raw.total} 个文件`;
    return `${distLine}${head}：\n${lines.join('\n')}`;
  },
  summarize(raw) {
    if (!raw?.total && !(raw?.typeBreakdown && Object.keys(raw.typeBreakdown).length)) return `文件查询：无结果`;
    return `文件查询：共 ${raw.total} 个文件`;
  },
};
