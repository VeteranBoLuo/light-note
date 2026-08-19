import pool from '../../../db/index.js';
import { parseTimeRange } from '../timeRange.js';
import { parseNoteContent, renderNoteForAi } from '../../noteSemantic.js';
import { searchPersonalKnowledge } from '../../personalKnowledgeSearch.js';
import { PERSONAL_SCOPE_USER_PARAM, personalScopeHint } from '../ownerScope.js';

// LIKE 通配符按字面处理：用户标题里的 % 和 _ 不能变成通配（与 todoService 同规则）。
function escapeLikePattern(keyword) {
  return String(keyword).replace(/[\\%_]/g, '\\$&');
}

/**
 * 裸 LIKE 对口语化问法（"我记得有一篇讲X的笔记"）召回为零——整句不可能是任何正文的子串。
 * 实测 30 篇真实笔记：LIKE 口语化问法 0/12，同一问句 MiniSearch 12/12。
 * 因此 LIKE 零结果时降级到个人知识索引，把"必然归零"变成"退化为词法匹配"；
 * 归属仍以二次 SQL（create_by + del_flag）为最终边界，索引结果只提供候选 ID 与顺序。
 */
async function semanticFallback({ userId, keyword, take, time }) {
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
    where += ` AND n.create_time >= ? AND n.create_time <= ?`;
    params.push(time.start, time.end);
  }
  const [rows] = await pool.query(
    `SELECT n.id, n.title, IF(n.type = 'drawing', '', LEFT(COALESCE(n.content, ''), 30000)) AS content, n.type, n.create_time
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
    '查询笔记。keyword 应为短关键词或词组（如"开发计划"），不要传整句问题；可按时间范围筛选，返回笔记标题、内容片段和创建时间。' +
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
      keyword: { type: 'string', description: '搜索关键词或短词组，匹配笔记标题和内容；不要传整句问题' },
      timeRange: { type: 'string', description: '时间范围，如"最近7天"、"上个月"、"全部"' },
      limit: { type: 'integer', description: '返回条数，默认10，最大50' },
      user: { type: 'string', description: PERSONAL_SCOPE_USER_PARAM },
    },
  },
  requireRoot: false,
  async execute(args, ctx) {
    const { keyword, timeRange, limit = 10 } = args;
    const time = parseTimeRange(timeRange);
    const take = Math.min(Math.max(limit || 10, 1), 50);

    let where = "n.create_by = ? AND n.del_flag = '0'";
    const baseParams = [ctx.userId];

    if (keyword) {
      where += ` AND (n.title LIKE ? OR (COALESCE(n.type, 'html') <> 'drawing' AND n.content LIKE ?))`;
      const pattern = `%${escapeLikePattern(keyword)}%`;
      baseParams.push(pattern, pattern);
    }
    if (time) {
      where += ` AND n.create_time >= ? AND n.create_time <= ?`;
      baseParams.push(time.start, time.end);
    }

    // 有关键词时按相关度排序（档位与全局搜索一致：标题精确 100 > 前缀 80 > 包含 60 > 仅正文 10），
    // 同档位再按时间。否则宽泛词（如 "app"）命中超过 limit 时，目标会被纯时间排序挤出截断。
    const order = keyword
      ? `ORDER BY CASE
           WHEN LOWER(n.title) = LOWER(?) THEN 100
           WHEN LOWER(n.title) LIKE LOWER(?) THEN 80
           WHEN LOWER(n.title) LIKE LOWER(?) THEN 60
           ELSE 10
         END DESC, n.create_time DESC`
      : 'ORDER BY n.create_time DESC';
    const orderParams = keyword ? [keyword, `${escapeLikePattern(keyword)}%`, `%${escapeLikePattern(keyword)}%`] : [];

    const [[rows], [countRes]] = await Promise.all([
      pool.query(
        `SELECT n.id, n.title, IF(n.type = 'drawing', '', LEFT(COALESCE(n.content, ''), 30000)) AS content, n.type, n.create_time
           FROM note n WHERE ${where} ${order} LIMIT ?`,
        [...baseParams, ...orderParams, take],
      ),
      pool.query(`SELECT COUNT(*) as total FROM note n WHERE ${where}`, baseParams),
    ]);

    if (rows.length || !keyword) {
      return { total: countRes[0].total, items: rows, matchMode: 'like' };
    }

    // LIKE 零结果 → 语义降级。降级自身失败必须 fail-open 回到"空结果"，不能把正常的
    // "没找到"升级成报错。
    try {
      const fallbackRows = await semanticFallback({ userId: ctx.userId, keyword, take, time });
      if (fallbackRows.length) {
        return { total: fallbackRows.length, items: fallbackRows, matchMode: 'semantic' };
      }
    } catch (error) {
      console.warn('[query_notes] semantic fallback failed code=%s', error?.code || error?.message);
    }
    return { total: 0, items: [], matchMode: 'like' };
  },
  getDependencyRefs(raw) {
    return (Array.isArray(raw?.items) ? raw.items : []).map((item) => ({ type: 'note', id: item.id }));
  },
  transform(raw, args) {
    const items = raw?.items || [];
    if (!items.length) {
      const kw = args.keyword ? `（关键词"${args.keyword}"）` : '';
      return `没有找到笔记${kw}`;
    }
    const lines = items.map((r, i) => {
      const title = r.title || '无标题';
      const document = parseNoteContent({ content: r.content, type: r.type });
      const preview = renderNoteForAi(document, { maxChars: 1800 });
      const time = r.create_time ? new Date(r.create_time).toLocaleString('zh-CN') : '';
      return `${i + 1}. [note:${r.id}]《${title}》\n   内容：${preview}\n   创建时间：${time}`;
    });
    // 降级结果不能冒充精确计数："共 N 条"只在 LIKE 主查询下成立。
    const header =
      raw?.matchMode === 'semantic'
        ? `关键词没有精确匹配，以下是语义相关的 ${items.length} 条笔记：`
        : `共 ${raw.total} 条笔记：`;
    return `${header}\n${lines.join('\n\n')}`;
  },
  summarize(raw, args) {
    if (!raw?.total) return `笔记查询：无结果`;
    const keyword = args.keyword ? `关键词"${args.keyword}"` : '';
    const mode = raw?.matchMode === 'semantic' ? '（语义匹配）' : '';
    return `笔记查询${keyword ? `（${keyword}）` : ''}${mode}：共 ${raw.total} 条，已返回内容片段`;
  },
};
