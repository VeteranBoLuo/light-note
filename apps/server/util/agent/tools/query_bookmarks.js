import pool from '../../../db/index.js';
import { parseTimeRange } from '../timeRange.js';
import { searchPersonalKnowledge } from '../../personalKnowledgeSearch.js';
import { PERSONAL_SCOPE_USER_PARAM, personalScopeHint } from '../ownerScope.js';

// LIKE 通配符按字面处理：名称里的 % 和 _ 不能变成通配（与 query_notes/todoService 同规则）。
function escapeLikePattern(keyword) {
  return String(keyword).replace(/[\\%_]/g, '\\$&');
}

function buildScopeConditions({ userId, tag, time }) {
  let where = '';
  const params = [];
  if (tag) {
    where += ` AND b.id IN (
              SELECT rtr.resource_id FROM resource_tag_relations rtr
              JOIN tag t ON t.id = rtr.tag_id
              WHERE t.name = ? AND rtr.resource_type = 'bookmark' AND rtr.user_id = ?)`;
    params.push(tag, userId);
  }
  if (time) {
    where += ` AND b.create_time >= ? AND b.create_time <= ?`;
    params.push(time.start, time.end);
  }
  return { where, params };
}

/**
 * 裸 LIKE 对口语化问法召回为零（与 query_notes 同一问题：整句不可能是名称/URL 的子串）。
 * LIKE 零结果时降级个人知识索引；索引只提供候选 ID 与顺序，归属与 tag/时间条件仍以
 * 二次 SQL 为最终边界。边界：没有描述且没有快照的纯标题书签不在索引里，降级救不回，
 * fail-open 后仍是空结果（与现状一致）。
 */
async function semanticFallback({ userId, keyword, take, tag, time }) {
  const result = await searchPersonalKnowledge({
    userId,
    query: keyword,
    limit: take,
    scope: { types: ['bookmark'] },
  });
  const orderedIds = [];
  const seen = new Set();
  for (const hit of result?.hits || []) {
    if (hit.type !== 'bookmark') continue;
    const id = String(hit.id);
    if (seen.has(id)) continue;
    seen.add(id);
    orderedIds.push(id);
    if (orderedIds.length >= take) break;
  }
  if (!orderedIds.length) return [];
  const scope = buildScopeConditions({ userId, tag, time });
  const [rows] = await pool.query(
    `SELECT b.id, b.name, b.url, b.create_time FROM bookmark b
      WHERE b.id IN (?) AND b.user_id = ? AND b.del_flag = 0${scope.where}`,
    [orderedIds, userId, ...scope.params],
  );
  const byId = new Map(rows.map((row) => [String(row.id), row]));
  return orderedIds.map((id) => byId.get(id)).filter(Boolean);
}

export default {
  name: 'query_bookmarks',
  sourceType: 'bookmark',
  description:
    '查询书签。keyword 应为短关键词或词组（匹配名称和URL），不要传整句问题；可按标签名、时间范围筛选。' +
    '需要按语义查找书签快照正文时优先使用 search_content。跨类型搜索时可同时调用 query_notes 和 query_files。' +
    personalScopeHint('书签'),
  routing: { targetScope: 'single_owner' },
  parameters: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: '搜索关键词或短词组，匹配书签名称和URL；不要传整句问题' },
      tag: { type: 'string', description: '标签名称，精确匹配' },
      timeRange: { type: 'string', description: '时间范围，如"最近7天"、"上个月"、"今年"、"全部"' },
      limit: { type: 'integer', description: '返回条数，默认10，最大50' },
      user: { type: 'string', description: PERSONAL_SCOPE_USER_PARAM },
    },
  },
  requireRoot: false,
  async execute(args, ctx) {
    const { keyword, tag, timeRange, limit = 10 } = args;
    const time = parseTimeRange(timeRange);
    const take = Math.min(Math.max(limit || 10, 1), 50);

    let where = 'b.user_id = ? AND b.del_flag = 0';
    const baseParams = [ctx.userId];

    if (keyword) {
      where += ` AND (b.name LIKE ? OR b.url LIKE ?)`;
      const pattern = `%${escapeLikePattern(keyword)}%`;
      baseParams.push(pattern, pattern);
    }
    const scope = buildScopeConditions({ userId: ctx.userId, tag, time });
    where += scope.where;
    baseParams.push(...scope.params);

    // 有关键词时按相关度排序（名称精确 100 > 前缀 80 > 包含 60 > 仅 URL 命中 40，
    // 档位与全局搜索一致），否则宽泛词命中超过 limit 时旧目标会被时间排序挤出截断。
    const order = keyword
      ? `ORDER BY CASE
           WHEN LOWER(b.name) = LOWER(?) THEN 100
           WHEN LOWER(b.name) LIKE LOWER(?) THEN 80
           WHEN LOWER(b.name) LIKE LOWER(?) THEN 60
           ELSE 40
         END DESC, b.create_time DESC`
      : 'ORDER BY b.create_time DESC';
    const orderParams = keyword ? [keyword, `${escapeLikePattern(keyword)}%`, `%${escapeLikePattern(keyword)}%`] : [];

    const [[rows], [countRes]] = await Promise.all([
      pool.query(`SELECT b.id, b.name, b.url, b.create_time FROM bookmark b WHERE ${where} ${order} LIMIT ?`, [
        ...baseParams,
        ...orderParams,
        take,
      ]),
      pool.query(`SELECT COUNT(*) as total FROM bookmark b WHERE ${where}`, baseParams),
    ]);

    if (rows.length || !keyword) {
      return { total: countRes[0].total, items: rows, matchMode: 'like' };
    }

    // LIKE 零结果 → 语义降级；降级自身失败 fail-open 回空结果，不升级成报错。
    try {
      const fallbackRows = await semanticFallback({ userId: ctx.userId, keyword, take, tag, time });
      if (fallbackRows.length) {
        return { total: fallbackRows.length, items: fallbackRows, matchMode: 'semantic' };
      }
    } catch (error) {
      console.warn('[query_bookmarks] semantic fallback failed code=%s', error?.code || error?.message);
    }
    return { total: 0, items: [], matchMode: 'like' };
  },
  transform(raw, args) {
    const items = raw?.items || [];
    if (!items.length) {
      const tagHint = args.tag ? `（标签"${args.tag}"）` : '';
      return `没有找到书签${tagHint}`;
    }
    const lines = items.slice(0, 10).map((r, i) => {
      const name = r.name || '无标题';
      const url = r.url || '';
      const time = r.create_time ? new Date(r.create_time).toLocaleString('zh-CN') : '';
      return `${i + 1}. 《${name}》 ${url} - ${time}`;
    });
    // 降级结果不能冒充精确计数
    const head =
      raw?.matchMode === 'semantic'
        ? `关键词没有精确匹配，以下是语义相关的 ${items.length} 条书签：`
        : `共 ${raw.total} 条书签：`;
    let result = `${head}\n${lines.join('\n')}`;
    if (raw?.matchMode !== 'semantic' && raw.total > 10) result += `\n...（仅展示前 10 条，共 ${raw.total} 条）`;
    return result;
  },
  summarize(raw, args) {
    if (!raw?.total) return `书签查询：无结果`;
    const keyword = args.keyword ? `关键词"${args.keyword}"` : '';
    const mode = raw?.matchMode === 'semantic' ? '（语义匹配）' : '';
    return `书签查询${keyword ? `（${keyword}）` : ''}${mode}：共 ${raw.total} 条`;
  },
};
