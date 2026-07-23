import pool from '../../../db/index.js';
import { listTodoPage } from '../../services/todoService.js';

const PRIORITY_LABELS = Object.freeze({ 0: '低优先级', 1: '普通优先级', 2: '高优先级' });
const REMINDER_LABELS = Object.freeze({ in_app: '站内提醒', email: '邮件提醒' });

function normalizeArgs(input = {}) {
  const rawLimit = Number(input.limit ?? 20);
  return {
    status: String(input.status ?? input.todoStatus ?? input.todo_status ?? 'pending').toLowerCase(),
    keyword: String(input.keyword ?? input.query ?? '')
      .trim()
      .slice(0, 100),
    sort: String(input.sort || 'smart').toLowerCase(),
    limit: Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 50) : 20,
    cursor: String(input.cursor || '')
      .trim()
      .slice(0, 256),
  };
}

function formatTime(value) {
  if (!value) return '未设置截止时间';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN', { hour12: false }) : String(value);
}

function cannotReadTodos(ctx) {
  // 普通游客没有独立待办空间；管理员只读代管时仍应能查看当前主体，
  // 具体 actor/subject 边界已由 toolPolicy 在执行前校验。
  return !ctx.userId || (ctx.userRole === 'visitor' && !ctx.request?.adminContext);
}

export default {
  name: 'query_todos',
  description:
    '查询当前账号的待办。可按待办状态、关键词和排序筛选，返回标题、截止时间、优先级、清单完成进度与提醒渠道摘要；不读取待办说明或提醒邮箱。需要继续查看更多结果时传回上一页返回的 cursor。',
  parameters: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['pending', 'completed', 'all'], description: '待办状态，默认 pending' },
      keyword: { type: 'string', maxLength: 100, description: '可选，按待办标题或说明搜索' },
      sort: {
        type: 'string',
        enum: ['smart', 'due', 'newest', 'oldest'],
        description: '排序方式：smart 智能、due 截止时间、newest 最新、oldest 最早',
      },
      limit: { type: 'integer', minimum: 1, maximum: 50, description: '返回条数，默认 20，最大 50' },
      cursor: { type: 'string', maxLength: 256, description: '上一页结果返回的下一页游标' },
    },
  },
  argumentAliases: ['todoStatus', 'todo_status', 'query'],
  normalizeArgs,
  requireRoot: false,
  async execute(input, ctx) {
    const args = normalizeArgs(input);
    if (cannotReadTodos(ctx)) return { items: [], total: 0, nextCursor: null };
    return listTodoPage(pool, ctx.userId, { ...args, view: 'summary' });
  },
  transform(raw, args = {}) {
    const items = raw?.items || [];
    if (!items.length) {
      const keyword = args.keyword ? `（关键词“${args.keyword}”）` : '';
      return `没有找到待办${keyword}`;
    }
    const lines = items.map((item, index) => {
      const checklist = item.checklistProgress || { completed: 0, total: 0 };
      const reminder = item.reminderChannels?.length
        ? ` · 提醒：${item.reminderChannels.map((channel) => REMINDER_LABELS[channel] || channel).join('、')}`
        : '';
      return `${index + 1}. [todo:${item.id}] ${item.title || '未命名待办'} · ${item.status === 'completed' ? '已完成' : '待处理'} · ${PRIORITY_LABELS[item.priority] || '普通优先级'} · 截止：${formatTime(item.dueAt)} · 清单：${checklist.completed}/${checklist.total}${reminder}`;
    });
    const head = `共 ${raw.total || items.length} 条待办，当前返回 ${items.length} 条：`;
    const cursor = raw?.nextCursor ? `\n还有更多结果；继续查询时仅将此 cursor 传给本工具：${raw.nextCursor}` : '';
    return `${head}\n${lines.join('\n')}${cursor}`;
  },
  summarize(raw, args = {}) {
    if (!raw?.total) return '待办查询：无结果';
    const keyword = args.keyword ? `（关键词“${args.keyword}”）` : '';
    return `待办查询${keyword}：共 ${raw.total} 条，已返回 ${raw.items?.length || 0} 条安全摘要`;
  },
};
