import pool from '../../../db/index.js';
import { drawingNoteAiProjection, renderDrawingNoteForAi } from '../../drawingNoteAi.js';
import { describeResolvedTimeRange, resolveAgentTimeRange } from '../timeRange.js';
import { parseNoteContent, renderNoteForAi } from '../../noteSemantic.js';
import { searchPersonalKnowledge } from '../../personalKnowledgeSearch.js';
import { PERSONAL_SCOPE_USER_PARAM, personalScopeHint } from '../ownerScope.js';
import { escapeLikePattern } from '../sqlPatterns.js';
import { withQueryResultMetadata } from '../toolResultMetadata.js';
import {
  formatNoteTypeBreakdown,
  isStandaloneNoteTypeAlias,
  normalizeNoteType,
  NOTE_TYPE_LABEL,
  noteTypeBreakdownFromRows,
  noteTypeSql,
} from '../noteTypeFacet.js';

const NOTE_VIEW_ALIASES = new Map([
  ['list', 'list'],
  ['列表', 'list'],
  ['type_breakdown', 'type_breakdown'],
  ['type-breakdown', 'type_breakdown'],
  ['breakdown', 'type_breakdown'],
  ['distribution', 'type_breakdown'],
  ['summary', 'type_breakdown'],
  ['统计', 'type_breakdown'],
  ['分布', 'type_breakdown'],
]);

function normalizeArgs(input = {}) {
  const rawLimit = Number(input.limit ?? 10);
  let keyword = String(input.keyword ?? input.query ?? '')
    .trim()
    .slice(0, 200);
  let type = normalizeNoteType(input.type ?? input.noteType ?? input.note_type ?? input.format);
  let promotedTypeAlias = false;

  // 兼容模型把受控类型名错误填进 keyword 的情况。只接收完整枚举别名，绝不从长句中
  // 抽词，因此“富文本编辑器优化”仍然是普通全文关键词，不会被改写为类型筛选。
  if (!type && isStandaloneNoteTypeAlias(keyword)) {
    type = normalizeNoteType(keyword, { allowAll: false });
    keyword = '';
    promotedTypeAlias = true;
  }

  const rawView = String(input.view || '')
    .trim()
    .toLowerCase();
  const view = NOTE_VIEW_ALIASES.get(rawView || (promotedTypeAlias ? 'type_breakdown' : 'list')) || 'list';
  const normalizedType = type === 'all' ? '' : type;
  const timeRange = String(input.timeRange || '').trim();
  const user = String(input.user || '').trim();

  // 可选参数未提供时必须真正省略，不能用空字符串充当“未指定”。工具参数会在
  // normalizeArgs 之后再次经过同一份 JSON Schema 校验；空字符串既不属于 type
  // 枚举，也会把服务端默认值误写成模型显式选择，最终让最普通的全量查询在执行前
  // 被 TOOL_ARGUMENTS_INVALID 拦住。
  return {
    ...(keyword ? { keyword } : {}),
    ...(normalizedType ? { type: normalizedType } : {}),
    view,
    ...(timeRange ? { timeRange } : {}),
    limit: Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 50) : 10,
    ...(user ? { user } : {}),
  };
}

/**
 * 裸 LIKE 对口语化问法（"我记得有一篇讲X的笔记"）召回为零——整句不可能是任何正文的子串。
 * 实测 30 篇真实笔记：LIKE 口语化问法 0/12，同一问句 MiniSearch 12/12。
 * 因此 LIKE 零结果时降级到个人知识索引，把"必然归零"变成"退化为词法匹配"；
 * 归属仍以二次 SQL（create_by + del_flag）为最终边界，索引结果只提供候选 ID 与顺序。
 */
async function semanticFallback({ userId, keyword, take, time, type }) {
  const result = await searchPersonalKnowledge({
    userId,
    query: keyword,
    limit: take,
    scope: { types: ['note'] },
  });
  const orderedIds = [];
  const seen = new Set();
  for (const hit of result?.hits || []) {
    if (hit.type !== 'note') continue;
    const id = String(hit.id);
    if (seen.has(id)) continue;
    seen.add(id);
    orderedIds.push(id);
    if (orderedIds.length >= take) break;
  }
  if (!orderedIds.length) return [];
  let where = `n.id IN (?) AND n.create_by = ? AND n.del_flag = '0'`;
  const params = [orderedIds, userId];
  if (time) {
    where += ` AND n.create_time >= ? AND n.create_time < ?`;
    params.push(time.start, time.endExclusive);
  }
  if (type) where += ` AND ${noteTypeSql('n')} = ?`;
  if (type) params.push(type);
  const [rows] = await pool.query(
    `SELECT n.id, n.title, IF(n.type = 'drawing', '', LEFT(COALESCE(n.content, ''), 30000)) AS content,
            ${drawingNoteAiProjection('n')}, n.type, n.create_time, n.update_time
       FROM note n WHERE ${where}`,
    params,
  );
  const byId = new Map(rows.map((row) => [String(row.id), row]));
  return orderedIds.map((id) => byId.get(id)).filter(Boolean);
}

export default {
  name: 'query_notes',
  sourceType: 'note',
  description:
    '查询和统计笔记。keyword 只用于标题或正文的短关键词（如"开发计划"），不要把笔记格式放进 keyword；' +
    '格式必须使用 type：html(富文本)、markdown/Markdown/md、drawing(手绘/绘画)。询问各格式数量或分布时使用 view=type_breakdown；' +
    '结果总会附带同一关键词与时间口径下、未叠加 type 筛选的精确 typeBreakdown，不能从返回列表条数猜测格式总量。可按时间范围筛选，返回笔记标题、内容片段和创建时间。' +
    '需要按语义查找"资料里怎么说"或跨资料检索正文证据时，优先使用 search_content。' +
    personalScopeHint('笔记'),
  routing: {
    targetScope: 'single_owner',
    preferAny: [
      /(?:多少|哪些|列出|查找|查询|最近|今天|昨天|本周|本月).{0,20}(?:笔记|记录)|(?:笔记|记录).{0,20}(?:多少|哪些|列表|清单)/iu,
    ],
  },
  parameters: {
    type: 'object',
    properties: {
      keyword: {
        type: 'string',
        maxLength: 200,
        description: '搜索关键词或短词组，匹配笔记标题和内容；不要传整句问题或笔记格式名',
      },
      type: {
        type: 'string',
        enum: ['html', 'markdown', 'drawing', 'all'],
        description: '笔记格式：html(富文本)、markdown(含 md)、drawing(手绘/绘画)、all(全部)',
      },
      view: {
        type: 'string',
        enum: ['list', 'type_breakdown'],
        description: 'list 返回列表；type_breakdown 返回各笔记格式的精确数量分布',
      },
      timeRange: { type: 'string', description: '时间范围，如"今天"、"昨天"、"最近24小时"、"最近7天"、"全部"' },
      limit: { type: 'integer', minimum: 1, maximum: 50, description: '返回条数，默认10，最大50' },
      user: { type: 'string', description: PERSONAL_SCOPE_USER_PARAM },
    },
  },
  argumentAliases: ['query', 'noteType', 'note_type', 'format'],
  normalizeArgs,
  requireRoot: false,
  async execute(input, ctx = {}) {
    const args = normalizeArgs(input);
    const { keyword, type, timeRange, limit = 10 } = args;
    const time = resolveAgentTimeRange(args, 'timeRange', { context: ctx, label: '笔记创建时间' });
    const resolvedTimeRange = time
      ? {
          expression: String(timeRange || '').trim(),
          ...time,
        }
      : null;
    const timeRangeMetadata = resolvedTimeRange ? { resolvedTimeRange } : {};
    const resolvedRanges = timeRange
      ? { timeRange: { expression: String(timeRange).trim(), range: time, source: 'tool' } }
      : {};
    const take = Math.min(Math.max(limit || 10, 1), 50);

    let baseWhere = "n.create_by = ? AND n.del_flag = '0'";
    const baseParams = [ctx.userId];

    if (keyword) {
      baseWhere += ` AND (n.title LIKE ? ESCAPE '\\\\' OR (${noteTypeSql('n')} <> 'drawing' AND n.content LIKE ? ESCAPE '\\\\'))`;
      const pattern = `%${escapeLikePattern(keyword)}%`;
      baseParams.push(pattern, pattern);
    }
    if (time) {
      baseWhere += ` AND n.create_time >= ? AND n.create_time < ?`;
      baseParams.push(time.start, time.endExclusive);
    }

    let where = baseWhere;
    if (type) where += ` AND ${noteTypeSql('n')} = ?`;
    const queryParams = type ? [...baseParams, type] : baseParams;

    // 有关键词时按相关度排序（档位与全局搜索一致：标题精确 100 > 前缀 80 > 包含 60 > 仅正文 10），
    // 同档位再按时间。否则宽泛词（如 "app"）命中超过 limit 时，目标会被纯时间排序挤出截断。
    const order = keyword
      ? `ORDER BY CASE
           WHEN LOWER(n.title) = LOWER(?) THEN 100
           WHEN LOWER(n.title) LIKE LOWER(?) ESCAPE '\\\\' THEN 80
           WHEN LOWER(n.title) LIKE LOWER(?) ESCAPE '\\\\' THEN 60
           ELSE 10
         END DESC, n.create_time DESC`
      : 'ORDER BY n.create_time DESC';
    const orderParams = keyword ? [keyword, `${escapeLikePattern(keyword)}%`, `%${escapeLikePattern(keyword)}%`] : [];

    const [[rows], [countRes], [breakdownRows]] = await Promise.all([
      args.view === 'type_breakdown'
        ? Promise.resolve([[]])
        : pool.query(
            `SELECT n.id, n.title, IF(n.type = 'drawing', '', LEFT(COALESCE(n.content, ''), 30000)) AS content,
                    ${drawingNoteAiProjection('n')}, n.type, n.create_time, n.update_time
               FROM note n WHERE ${where} ${order} LIMIT ?`,
            [...queryParams, ...orderParams, take],
          ),
      pool.query(`SELECT COUNT(*) as total FROM note n WHERE ${where}`, queryParams),
      pool.query(
        `SELECT ${noteTypeSql('n')} AS note_type, COUNT(*) AS c
           FROM note n WHERE ${baseWhere} GROUP BY note_type`,
        baseParams,
      ),
    ]);
    const typeBreakdown = noteTypeBreakdownFromRows(breakdownRows);
    const exactFacets = { noteType: { exact: true, values: typeBreakdown } };

    // 分布视图已经由 SQL 聚合得到完整结果，不依赖列表行，也不应在 rows 为空时退化到
    // 语义召回。否则“某时间段/关键词下的类型分布”会被误当成内容检索再次执行。
    if (args.view === 'type_breakdown' || rows.length || !keyword) {
      return withQueryResultMetadata(
        {
          total: Number(countRes[0].total || 0),
          items: rows,
          typeBreakdown,
          typeFilter: type || null,
          view: args.view,
          matchMode: 'like',
          ...timeRangeMetadata,
        },
        { resolvedRanges, facets: exactFacets },
      );
    }

    // LIKE 零结果 → 语义降级。降级自身失败必须 fail-open 回到"空结果"，不能把正常的
    // "没找到"升级成报错。
    try {
      const fallbackRows = await semanticFallback({ userId: ctx.userId, keyword, take, time, type });
      if (fallbackRows.length) {
        return withQueryResultMetadata(
          {
            total: fallbackRows.length,
            items: fallbackRows,
            typeFilter: type || null,
            view: args.view,
            matchMode: 'semantic',
            ...timeRangeMetadata,
          },
          { exactTotal: false, coverage: 'partial', truncationReason: 'semantic_recall', resolvedRanges },
        );
      }
    } catch (error) {
      console.warn('[query_notes] semantic fallback failed code=%s', error?.code || error?.message);
    }
    return withQueryResultMetadata(
      {
        total: 0,
        items: [],
        typeBreakdown,
        typeFilter: type || null,
        view: args.view,
        matchMode: 'like',
        ...timeRangeMetadata,
      },
      { resolvedRanges, facets: exactFacets },
    );
  },
  getDependencyRefs(raw) {
    return (Array.isArray(raw?.items) ? raw.items : []).map((item) => ({ type: 'note', id: item.id }));
  },
  transform(raw, input = {}) {
    const args = normalizeArgs(input);
    const hasExactBreakdown = raw?.matchMode === 'like' && raw?.typeBreakdown;
    const distribution = hasExactBreakdown ? formatNoteTypeBreakdown(raw.typeBreakdown) : '';
    const distributionLine = distribution ? `笔记类型精确分布：${distribution}。` : '';
    if (args.view === 'type_breakdown') {
      const scope = describeResolvedTimeRange(
        raw?.resolvedTimeRange?.expression || args.timeRange,
        raw?.resolvedTimeRange,
      );
      return `${scope ? `${scope}` : ''}${distributionLine}`;
    }
    const items = raw?.items || [];
    if (!items.length) {
      const kw = args.keyword ? `（关键词"${args.keyword}"）` : '';
      const typeLabel = args.type ? NOTE_TYPE_LABEL[args.type] : '';
      const scope = describeResolvedTimeRange(
        raw?.resolvedTimeRange?.expression || args.timeRange,
        raw?.resolvedTimeRange,
      );
      return [distributionLine, `${scope ? `${scope}` : ''}没有找到${typeLabel ? `${typeLabel}笔记` : '笔记'}${kw}`]
        .filter(Boolean)
        .join('\n');
    }
    const lines = items.map((r, i) => {
      const title = r.title || '无标题';
      const preview =
        r.type === 'drawing'
          ? renderDrawingNoteForAi(r, { maxChars: 1800 })
          : renderNoteForAi(parseNoteContent({ content: r.content, type: r.type }), { maxChars: 1800 });
      const time = r.create_time ? new Date(r.create_time).toLocaleString('zh-CN') : '';
      return `${i + 1}. [note:${r.id}]《${title}》\n   内容：${preview}\n   创建时间：${time}`;
    });
    // 降级结果不能冒充精确计数："共 N 条"只在 LIKE 主查询下成立。
    const typeLabel = args.type ? NOTE_TYPE_LABEL[args.type] : '';
    const header =
      raw?.matchMode === 'semantic'
        ? `关键词没有精确匹配，以下是语义相关的 ${items.length} 条笔记：`
        : typeLabel
          ? `${typeLabel}笔记共 ${raw.total} 条：`
          : `共 ${raw.total} 条笔记：`;
    return [distributionLine, header, lines.join('\n\n')].filter(Boolean).join('\n');
  },
  summarize(raw, input = {}) {
    const args = normalizeArgs(input);
    const distribution =
      raw?.matchMode === 'like' && raw?.typeBreakdown ? formatNoteTypeBreakdown(raw.typeBreakdown) : '';
    if (!raw?.total) {
      const scope = describeResolvedTimeRange(
        raw?.resolvedTimeRange?.expression || args.timeRange,
        raw?.resolvedTimeRange,
      );
      return `笔记查询${scope ? `（${scope}）` : ''}：无结果${distribution ? `；类型分布：${distribution}` : ''}`;
    }
    const keyword = args.keyword ? `关键词"${args.keyword}"` : '';
    const typeLabel = args.type ? NOTE_TYPE_LABEL[args.type] : '';
    const mode = raw?.matchMode === 'semantic' ? '（语义匹配）' : '';
    return `笔记查询${keyword ? `（${keyword}）` : ''}${mode}：${typeLabel ? `${typeLabel} ` : ''}共 ${raw.total} 条${distribution ? `；类型分布：${distribution}` : ''}`;
  },
  getAnswerRequirements(raw) {
    if (raw?.matchMode !== 'like' || !raw?.typeBreakdown) return [];
    const distribution = formatNoteTypeBreakdown(raw.typeBreakdown);
    if (raw?.view === 'type_breakdown') {
      return [
        {
          id: 'note.type_breakdown',
          anyOf: [distribution, distribution.replaceAll(' 条', '')],
          appendText: `笔记类型精确分布：${distribution}。`,
          onMissing: 'replace',
        },
      ];
    }
    if (!raw?.typeFilter) return [];
    const typeLabel = NOTE_TYPE_LABEL[raw.typeFilter] || raw.typeFilter;
    const parsedCount = Number(raw?.total);
    const exactCount = Number.isFinite(parsedCount) ? Math.max(0, Math.trunc(parsedCount)) : 0;
    return [
      {
        id: `note.type_count.${raw.typeFilter}`,
        anyOf: [`${typeLabel}笔记共 ${exactCount} 条`, `${typeLabel} ${exactCount} 条`],
        appendText: `${typeLabel}笔记共 ${exactCount} 条。`,
        onMissing: 'append',
      },
    ];
  },
};
