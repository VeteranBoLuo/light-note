import pool from '../../../db/index.js';
import { resolveAgentTimeRange } from '../timeRange.js';
import { categoryCondition, FILE_CATEGORY_CASE, FILE_CATEGORY_LABEL, breakdownFromRows } from '../fileCategory.js';
import { searchPersonalKnowledge } from '../../personalKnowledgeSearch.js';
import { PERSONAL_SCOPE_USER_PARAM, personalScopeHint } from '../ownerScope.js';
import { escapeLikePattern } from '../sqlPatterns.js';
import { withQueryResultMetadata } from '../toolResultMetadata.js';

/**
 * 文件名 LIKE 对口语化问法（"我上传过一个讲X的文档"）召回为零，且它只匹配文件名、
 * 不匹配解析正文。零结果时降级个人知识索引（覆盖已解析文件的正文与 OCR），
 * 索引只提供候选 ID 与顺序，归属与文件夹/类型/时间条件仍以二次 SQL 为最终边界。
 * 边界：尚未解析的文件不在索引里，降级救不回，fail-open 后仍是空结果。
 */
async function semanticFallback({ userId, keyword, take, resolvedFolderId, typeCond, time }) {
  const result = await searchPersonalKnowledge({
    userId,
    query: keyword,
    limit: take,
    scope: { types: ['file'] },
  });
  const orderedIds = [];
  const seen = new Set();
  for (const hit of result?.hits || []) {
    if (hit.type !== 'file') continue;
    const id = String(hit.id);
    if (seen.has(id)) continue;
    seen.add(id);
    orderedIds.push(id);
    if (orderedIds.length >= take) break;
  }
  if (!orderedIds.length) return [];
  let where = 'f.id IN (?) AND f.create_by = ? AND f.del_flag = 0';
  const params = [orderedIds, userId];
  if (resolvedFolderId) {
    where += ' AND f.folder_id = ?';
    params.push(resolvedFolderId);
  }
  if (time) {
    where += ' AND f.create_time >= ? AND f.create_time < ?';
    params.push(time.start, time.endExclusive);
  }
  if (typeCond) where += ` AND ${typeCond}`;
  const [rows] = await pool.query(
    `SELECT f.id, f.file_name, f.file_type, f.file_size, f.create_time,
            f.folder_id, folders.name AS folder_name
       FROM files f
       LEFT JOIN folders ON folders.id = f.folder_id
                        AND folders.create_by = f.create_by
                        AND folders.del_flag = 0
      WHERE ${where}`,
    params,
  );
  const byId = new Map(rows.map((row) => [String(row.id), row]));
  return orderedIds.map((id) => byId.get(id)).filter(Boolean);
}

function normalizeArgs(args = {}) {
  const rawFolderId = args.folderId ?? args.folder_id ?? args.directoryId ?? args.directory_id;
  const rawLimit = Number(args.limit ?? 10);
  let folderId = '';
  if (rawFolderId != null && String(rawFolderId).trim() && String(rawFolderId).trim() !== 'all') {
    const value = Number(rawFolderId);
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error('FOLDER_ID_INVALID: 文件夹 ID 无效');
    folderId = String(value);
  }
  return {
    keyword: String(args.keyword || '')
      .trim()
      .slice(0, 255),
    folderId,
    folderName: String(args.folderName || args.folder_name || args.folder || '')
      .trim()
      .slice(0, 255),
    type: String(args.type || '').trim(),
    timeRange: String(args.timeRange || '').trim(),
    limit: Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 50) : 10,
    user: String(args.user || '').trim(),
  };
}

export default {
  name: 'query_files',
  sourceType: 'file',
  description:
    '查询用户云空间的文件。keyword 应为短关键词或词组(匹配文件名),不要传整句问题;可按文件夹 ID/精确名称、文件类型(image图片/document文档/video视频/audio音频/archive压缩包/other其他)、时间范围筛选。folderId 与 folderName 同时存在时以 folderId 为准。' +
    '注意:file_type 存的是 MIME,类型按 MIME 归类;结果总会附带各类型数量分布 typeBreakdown,回答"各类文件有多少/除了图片还有什么"时直接看它,不要逐类猜。需要按语义查找文件正文内容时优先使用 search_content。' +
    personalScopeHint('云空间文件'),
  routing: { targetScope: 'single_owner' },
  parameters: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: '搜索关键词，匹配文件名' },
      folderId: { type: 'string', description: '可选，目标云空间文件夹 ID，优先于 folderName' },
      folderName: { type: 'string', description: '可选，目标云空间文件夹的精确名称' },
      type: {
        type: 'string',
        description:
          '文件类型：image(图片)、document(文档,含pdf/word/excel/ppt/文本等)、video(视频)、audio(音频)、archive(压缩包zip/rar/7z等)、other(其他)',
      },
      timeRange: { type: 'string', description: '时间范围，如"最近7天"、"上个月"、"全部"' },
      limit: { type: 'integer', description: '返回条数，默认10，最大50' },
      user: { type: 'string', description: PERSONAL_SCOPE_USER_PARAM },
    },
  },
  argumentAliases: ['folder_id', 'directoryId', 'directory_id', 'folder_name', 'folder'],
  normalizeArgs,
  requireRoot: false,
  async execute(input, ctx = {}) {
    const args = normalizeArgs(input);
    const { keyword, folderId, folderName, type, timeRange, limit = 10 } = args;
    const time = resolveAgentTimeRange(args, 'timeRange', { context: ctx, label: '文件创建时间' });
    const resolvedRanges = timeRange ? { timeRange: { expression: timeRange, range: time, source: 'tool' } } : {};
    const take = limit;

    let resolvedFolderId = folderId;
    if (!resolvedFolderId && folderName) {
      const [folderRows] = await pool.query(
        `SELECT id
           FROM folders
          WHERE create_by = ? AND del_flag = 0 AND name = ?
          ORDER BY id ASC
          LIMIT 2`,
        [ctx.userId, folderName],
      );
      if (!folderRows.length) {
        return withQueryResultMetadata({ total: 0, items: [], typeBreakdown: {} }, { resolvedRanges });
      }
      if (folderRows.length > 1) {
        throw new Error(`FOLDER_AMBIGUOUS: 存在多个名为“${folderName}”的文件夹，请使用文件夹 ID 指定目标`);
      }
      resolvedFolderId = String(folderRows[0].id);
    }

    // 基础筛选(关键词/时间),不含类型 —— 用于「全类型分布」,让 AI 一次拿到完整分布
    let baseWhere = 'f.create_by = ? AND f.del_flag = 0';
    const baseParams = [ctx.userId];
    if (keyword) {
      baseWhere += " AND f.file_name LIKE ? ESCAPE '\\\\'";
      baseParams.push(`%${escapeLikePattern(keyword)}%`);
    }
    if (resolvedFolderId) {
      baseWhere += ' AND f.folder_id = ?';
      baseParams.push(resolvedFolderId);
    }
    if (time) {
      baseWhere += ' AND f.create_time >= ? AND f.create_time < ?';
      baseParams.push(time.start, time.endExclusive);
    }

    // 叠加类型筛选(用于 items/total)——按 MIME 归类,修复 pdf/压缩包/文本被漏的问题
    let where = baseWhere;
    const cond = type ? categoryCondition(type) : null;
    if (cond) where += ` AND ${cond}`;

    // 有关键词时按相关度排序（文件名精确 100 > 前缀 80 > 包含 60），同档按时间；
    // 否则宽泛词命中超过 limit 时旧目标会被时间排序挤出截断。
    const order = keyword
      ? `ORDER BY CASE
           WHEN LOWER(f.file_name) = LOWER(?) THEN 100
           WHEN LOWER(f.file_name) LIKE LOWER(?) ESCAPE '\\\\' THEN 80
           ELSE 60
         END DESC, f.create_time DESC`
      : 'ORDER BY f.create_time DESC';
    const orderParams = keyword ? [keyword, `${escapeLikePattern(keyword)}%`] : [];

    const [[rows], [countRes], [bdRows]] = await Promise.all([
      pool.query(
        `SELECT f.id, f.file_name, f.file_type, f.file_size, f.create_time,
                f.folder_id, folders.name AS folder_name
           FROM files f
           LEFT JOIN folders ON folders.id = f.folder_id
                            AND folders.create_by = f.create_by
                            AND folders.del_flag = 0
          WHERE ${where}
          ${order} LIMIT ?`,
        [...baseParams, ...orderParams, take],
      ),
      pool.query(
        `SELECT COUNT(*) as total FROM files f
         LEFT JOIN folders ON folders.id = f.folder_id
                          AND folders.create_by = f.create_by
                          AND folders.del_flag = 0
         WHERE ${where}`,
        baseParams,
      ),
      pool.query(
        `SELECT ${FILE_CATEGORY_CASE} AS category, COUNT(*) AS c FROM files f
         LEFT JOIN folders ON folders.id = f.folder_id
                          AND folders.create_by = f.create_by
                          AND folders.del_flag = 0
         WHERE ${baseWhere} GROUP BY category`,
        baseParams,
      ),
    ]);

    const { map: typeBreakdown } = breakdownFromRows(bdRows);
    const mapRow = (row) => ({
      ...row,
      folderId: row.folder_id == null ? null : String(row.folder_id),
      folderName: row.folder_name || null,
    });
    if (rows.length || !keyword) {
      return withQueryResultMetadata(
        {
          total: Number(countRes[0]?.total || 0),
          items: rows.map(mapRow),
          typeBreakdown,
          matchMode: 'like',
        },
        { resolvedRanges },
      );
    }

    // LIKE 零结果 → 语义降级；降级自身失败 fail-open 回空结果，不升级成报错。
    // typeBreakdown 保持主查询口径（LIKE 筛选下的分布），不用降级结果冒充。
    try {
      const fallbackRows = await semanticFallback({
        userId: ctx.userId,
        keyword,
        take,
        resolvedFolderId,
        typeCond: cond,
        time,
      });
      if (fallbackRows.length) {
        return withQueryResultMetadata(
          {
            total: fallbackRows.length,
            items: fallbackRows.map(mapRow),
            typeBreakdown,
            matchMode: 'semantic',
          },
          { exactTotal: false, coverage: 'partial', truncationReason: 'semantic_recall', resolvedRanges },
        );
      }
    } catch (error) {
      console.warn('[query_files] semantic fallback failed code=%s', error?.code || error?.message);
    }
    return withQueryResultMetadata({ total: 0, items: [], typeBreakdown, matchMode: 'like' }, { resolvedRanges });
  },
  getDependencyRefs(raw) {
    return (Array.isArray(raw?.items) ? raw.items : []).map((item) => ({ type: 'file', id: item.id }));
  },
  transform(raw, args = {}) {
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
      const folder = r.folderName || r.folder_name || '未放入文件夹';
      return `${i + 1}. [file:${r.id}] ${name} (${size}) · 文件夹：${folder}${time ? ` · ${time}` : ''}`;
    });
    // 降级结果不能冒充精确计数
    const head =
      raw?.matchMode === 'semantic'
        ? `文件名没有精确匹配，以下是内容语义相关的 ${items.length} 个文件`
        : label
          ? `${label}文件共 ${raw.total} 个`
          : `共 ${raw.total} 个文件`;
    return `${distLine}${head}：\n${lines.join('\n')}`;
  },
  summarize(raw) {
    if (!raw?.total && !(raw?.typeBreakdown && Object.keys(raw.typeBreakdown).length)) return `文件查询：无结果`;
    const mode = raw?.matchMode === 'semantic' ? '（语义匹配）' : '';
    return `文件查询${mode}：共 ${raw.total} 个文件`;
  },
};
