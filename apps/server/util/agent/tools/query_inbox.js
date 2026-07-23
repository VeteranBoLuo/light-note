import pool from '../../../db/index.js';
import { listInboxResources } from '../../resourceInbox.js';

const TYPE_LABELS = Object.freeze({ bookmark: '书签', note: '笔记', file: '文件' });
const SOURCE_LABELS = Object.freeze({
  quick_capture: '快速收集',
  manual: '手动加入',
  duplicate_requeue: '重复内容重新整理',
  admin_demo: '管理员演示',
});

function normalizeArgs(input = {}) {
  const rawLimit = Number(input.limit ?? 20);
  const type = input.resourceType ?? input.resource_type ?? input.type ?? 'all';
  return {
    resourceType: String(type || 'all').toLowerCase(),
    keyword: String(input.keyword ?? input.query ?? '')
      .trim()
      .slice(0, 100),
    sort: String(input.sort || 'newest').toLowerCase(),
    limit: Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 50) : 20,
    cursor: String(input.cursor || '')
      .trim()
      .slice(0, 256),
  };
}

function formatTime(value) {
  if (!value) return '未知时间';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN', { hour12: false }) : String(value);
}

function sourceTarget(type) {
  if (type === 'bookmark') return 'bookmark-edit';
  if (type === 'note') return 'note-detail';
  if (type === 'file') return 'cloud-file';
  return undefined;
}

function cannotReadInbox(ctx) {
  // 普通游客没有独立待整理空间；管理员只读代管时仍应能查看当前主体，
  // 具体 actor/subject 边界已由 toolPolicy 在执行前校验。
  return !ctx.userId || (ctx.userRole === 'visitor' && !ctx.request?.adminContext);
}

export default {
  name: 'query_inbox',
  description:
    '查询当前账号待整理的书签、笔记和文件。可按资源类型、关键词和加入时间排序筛选，返回资源标题、类型、加入时间与来源；不读取笔记正文、书签 URL 或文件内容。需要继续查看更多结果时传回上一页返回的 cursor。',
  parameters: {
    type: 'object',
    properties: {
      resourceType: {
        type: 'string',
        enum: ['all', 'bookmark', 'note', 'file'],
        description: '资源类型，默认 all',
      },
      keyword: { type: 'string', maxLength: 100, description: '可选，按资源标题或摘要搜索' },
      sort: { type: 'string', enum: ['newest', 'oldest'], description: '加入待整理的排序方式，默认 newest' },
      limit: { type: 'integer', minimum: 1, maximum: 50, description: '返回条数，默认 20，最大 50' },
      cursor: { type: 'string', maxLength: 256, description: '上一页结果返回的下一页游标' },
    },
  },
  argumentAliases: ['resource_type', 'type', 'query'],
  normalizeArgs,
  requireRoot: false,
  async execute(input, ctx) {
    const args = normalizeArgs(input);
    if (cannotReadInbox(ctx)) {
      return {
        items: [],
        total: 0,
        nextCursor: null,
        pendingTotal: 0,
        typeTotals: { bookmark: 0, note: 0, file: 0 },
      };
    }
    return listInboxResources(pool, {
      userId: ctx.userId,
      type: args.resourceType,
      keyword: args.keyword,
      sort: args.sort,
      limit: args.limit,
      cursor: args.cursor,
      view: 'summary',
    });
  },
  transform(raw, args = {}) {
    const items = raw?.items || [];
    if (!items.length) {
      const keyword = args.keyword ? `（关键词“${args.keyword}”）` : '';
      return `没有找到待整理资源${keyword}；当前待整理总数为 ${Number(raw?.pendingTotal || 0)}。`;
    }
    const lines = items.map((item, index) => {
      const type = TYPE_LABELS[item.resourceType] || item.resourceType || '资源';
      const source = SOURCE_LABELS[item.source] || '其他来源';
      return `${index + 1}. [inbox:${item.resourceType}:${item.resourceId}] 《${item.title || '未命名资源'}》 · ${type} · 加入于 ${formatTime(item.collectedAt)} · 来源：${source}`;
    });
    const head = `共匹配 ${raw.total || items.length} 条待整理资源；当前待整理总数 ${Number(raw.pendingTotal || 0)}，本页返回 ${items.length} 条：`;
    const cursor = raw?.nextCursor ? `\n还有更多结果；继续查询时仅将此 cursor 传给本工具：${raw.nextCursor}` : '';
    return `${head}\n${lines.join('\n')}${cursor}`;
  },
  summarize(raw) {
    if (!raw?.total) return `待整理查询：无匹配结果（当前待整理 ${Number(raw?.pendingTotal || 0)} 条）`;
    return `待整理查询：匹配 ${raw.total} 条，当前待整理 ${Number(raw.pendingTotal || 0)} 条`;
  },
  toSources(raw) {
    return (raw?.items || []).map((item) => ({
      type: item.resourceType,
      id: item.resourceId,
      title: item.title,
      target: sourceTarget(item.resourceType),
    }));
  },
};
