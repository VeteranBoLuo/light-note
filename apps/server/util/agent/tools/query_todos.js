import pool from '../../../db/index.js';
import { listTodoPage } from '../../services/todoService.js';
import { searchPersonalKnowledge } from '../../personalKnowledgeSearch.js';

const PRIORITY_LABELS = Object.freeze({ 0: '低优先级', 1: '普通优先级', 2: '高优先级' });
const REMINDER_LABELS = Object.freeze({ in_app: '站内提醒', email: '邮件提醒' });

/**
 * listTodoPage 的 keyword 是裸 LIKE，口语化问法（"我有没有关于X的待办"）召回为零。
 * 首页零结果时降级个人知识索引（待办的标题/说明/清单文本都在索引里）；索引只提供
 * 候选 ID 与顺序，归属与状态条件仍以二次 SQL 为最终边界。翻页（带 cursor）的零结果
 * 是翻到底，不是检索失败，不触发降级。排序沿用索引相关度序——这是检索场景而非
 * 列表场景，不套用待办列表的 smart/due 产品排序。
 * 候选二次查询继续复用 listTodoPage，保证计划日期、提醒时间和安全字段投影始终只有
 * 一份事实源，不能在语义降级里复制 SQL 后悄悄丢失结构化筛选。
 */
async function semanticFallback({ userId, keyword, take, status, planDate, reminderAt }) {
  const result = await searchPersonalKnowledge({
    userId,
    query: keyword,
    limit: take,
    scope: { types: ['todo'] },
  });
  const orderedIds = [];
  const seen = new Set();
  for (const hit of result?.hits || []) {
    if (hit.type !== 'todo') continue;
    const id = String(hit.id);
    if (seen.has(id)) continue;
    seen.add(id);
    orderedIds.push(id);
    if (orderedIds.length >= take) break;
  }
  if (!orderedIds.length) return [];
  const page = await listTodoPage(pool, userId, {
    ids: orderedIds,
    status,
    planDate,
    reminderAt,
    view: 'summary',
    includeTotal: false,
  });
  const byId = new Map(page.items.map((row) => [String(row.id), row]));
  return orderedIds.map((id) => byId.get(id)).filter(Boolean);
}

function normalizeArgs(input = {}) {
  const rawLimit = Number(input.limit ?? 20);
  const planDate = String(input.planDate ?? input.scheduleDate ?? '')
    .trim()
    .slice(0, 10);
  const reminderAt = String(input.reminderAt ?? '')
    .trim()
    .replace('T', ' ')
    .slice(0, 16);
  return {
    todoId: String(input.todoId ?? input.id ?? '')
      .trim()
      .slice(0, 255),
    status: String(input.status ?? input.todoStatus ?? input.todo_status ?? 'pending').toLowerCase(),
    keyword: String(input.keyword ?? input.query ?? '')
      .trim()
      .slice(0, 100),
    sort: String(input.sort || 'smart').toLowerCase(),
    ...(planDate ? { planDate } : {}),
    ...(reminderAt ? { reminderAt } : {}),
    limit: Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 50) : 20,
    cursor: String(input.cursor || '')
      .trim()
      .slice(0, 256),
  };
}

function formatTime(value) {
  if (!value) return '未设置截止时间';
  const wallClock = String(value).match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/u);
  if (wallClock) return `${wallClock[1]} ${wallClock[2]}`;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN', { hour12: false }) : String(value);
}

function formatPlanDate(value) {
  return value ? String(value).slice(0, 10) : '未设置计划日期';
}

function cannotReadTodos(ctx) {
  // 普通游客没有独立待办空间；管理员只读代管时仍应能查看当前主体，
  // 具体 actor/subject 边界已由 toolPolicy 在执行前校验。
  return !ctx.userId || (ctx.userRole === 'visitor' && !ctx.request?.adminContext);
}

export default {
  name: 'query_todos',
  description:
    '查询当前账号的待办。可按状态、短关键词、计划日期和精确提醒时间定位同名待办，返回标题、计划日期、截止时间、精确提醒时间、优先级、清单完成进度与提醒渠道安全摘要；不读取待办说明或提醒邮箱。用户提到“今天/某天的待办”时使用 planDate，提到“今天16点提醒的那个”时同时使用 reminderAt。为“标记完成”定位目标时查 pending，为“重新打开/恢复为待处理”定位目标时必须查 completed，为“删除”定位目标时必须查 all；只问当前状态时按用户原话选择 pending/completed/all。若 total 大于当前返回条数，不得把当前页概括为全部结果；继续查看更多时传回 cursor。',
  parameters: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['pending', 'completed', 'all'],
        description:
          '待办状态，默认 pending。定位“标记完成”的目标用 pending；定位“重新打开/恢复为待处理”的目标必须用 completed；定位“删除”的目标必须用 all',
      },
      todoId: {
        type: 'string',
        maxLength: 255,
        description: '可选，服务端已校验上下文中的待办 ID；存在时精确定位该待办',
      },
      keyword: { type: 'string', maxLength: 100, description: '可选，按待办标题或说明搜索' },
      planDate: {
        type: 'string',
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        description:
          '可选，待办在页面上的计划日期，格式 YYYY-MM-DD；相对日期必须按服务端 temporalContext.currentDate 换算',
      },
      reminderAt: {
        type: 'string',
        pattern: '^\\d{4}-\\d{2}-\\d{2}[ T]\\d{2}:\\d{2}$',
        description:
          '可选，精确到分钟的本地提醒时间，格式 YYYY-MM-DD HH:mm；用于定位同名待办，日期和时区必须来自服务端 temporalContext',
      },
      sort: {
        type: 'string',
        enum: ['smart', 'due', 'newest', 'oldest'],
        description:
          '排序方式：smart 为待办列表默认智能顺序、due 为最先到期、newest 为最新、oldest 为最早；用户只说“第一条”时必须用 smart',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 50,
        description: '返回条数，默认 20，最大 50；定位第一条、最新、最早或最先到期时使用 1',
      },
      cursor: { type: 'string', maxLength: 256, description: '上一页结果返回的下一页游标' },
    },
  },
  argumentAliases: ['id', 'todoStatus', 'todo_status', 'query', 'scheduleDate'],
  normalizeArgs,
  resourceBindings: [{ argument: 'todoId', refType: 'todo', sourceField: 'id' }],
  requireRoot: false,
  async execute(input, ctx) {
    const args = normalizeArgs(input);
    if (cannotReadTodos(ctx)) return { items: [], total: 0, nextCursor: null };
    const page = await listTodoPage(pool, ctx.userId, {
      ...args,
      ...(args.todoId ? { ids: [args.todoId] } : {}),
      view: 'summary',
    });
    if (page.items.length || !args.keyword || args.cursor) {
      return { ...page, matchMode: 'like' };
    }
    // 首页 LIKE 零结果 → 语义降级；降级自身失败 fail-open 回空结果，不升级成报错。
    try {
      const fallbackItems = await semanticFallback({
        userId: ctx.userId,
        keyword: args.keyword,
        take: args.limit,
        status: args.status,
        planDate: args.planDate,
        reminderAt: args.reminderAt,
      });
      if (fallbackItems.length) {
        return { items: fallbackItems, total: fallbackItems.length, nextCursor: null, matchMode: 'semantic' };
      }
    } catch (error) {
      console.warn('[query_todos] semantic fallback failed code=%s', error?.code || error?.message);
    }
    return { ...page, matchMode: 'like' };
  },
  getDependencyRefs(raw) {
    return (Array.isArray(raw?.items) ? raw.items : []).map((item) => ({ type: 'todo', id: item.id }));
  },
  toSources(raw) {
    return (Array.isArray(raw?.items) ? raw.items : []).map((item) => {
      const checklist = item.checklistProgress || { completed: 0, total: 0 };
      const reminderAt = item.matchedReminderAt || item.reminderAt;
      return {
        type: 'todo',
        id: String(item.id || ''),
        title: item.title || '未命名待办',
        target: 'todo-inbox',
        excerpt: `${item.status === 'completed' ? '已完成' : '待处理'}；${PRIORITY_LABELS[item.priority] || '普通优先级'}；计划日期：${formatPlanDate(item.planDate)}；截止：${formatTime(item.dueAt)}；提醒：${reminderAt ? formatTime(reminderAt) : '未设置'}；清单：${checklist.completed}/${checklist.total}`,
      };
    });
  },
  transform(raw, args = {}) {
    const items = raw?.items || [];
    if (!items.length) {
      const keyword = args.keyword ? `（关键词“${args.keyword}”）` : '';
      return `没有找到待办${keyword}`;
    }
    const lines = items.map((item, index) => {
      const checklist = item.checklistProgress || { completed: 0, total: 0 };
      const reminderAt = item.matchedReminderAt || item.reminderAt;
      const channels = item.reminderChannels?.length
        ? `（${item.reminderChannels.map((channel) => REMINDER_LABELS[channel] || channel).join('、')}）`
        : '';
      const reminder = reminderAt
        ? ` · 提醒时间：${formatTime(reminderAt)}${channels}`
        : channels
          ? ` · 提醒渠道：${channels.slice(1, -1)}`
          : ' · 未设置提醒';
      return `${index + 1}. [todo:${item.id}] ${item.title || '未命名待办'} · ${item.status === 'completed' ? '已完成' : '待处理'} · ${PRIORITY_LABELS[item.priority] || '普通优先级'} · 计划日期：${formatPlanDate(item.planDate)} · 截止：${formatTime(item.dueAt)} · 清单：${checklist.completed}/${checklist.total}${reminder}`;
    });
    // 降级结果不能冒充精确计数
    const head =
      raw?.matchMode === 'semantic'
        ? `关键词没有精确匹配，以下是语义相关的 ${items.length} 条待办：`
        : `共 ${raw.total || items.length} 条待办，当前返回 ${items.length} 条${Number(raw.total || 0) > items.length ? '；以下只是当前页，不能据此推断未返回结果' : ''}：`;
    const cursor = raw?.nextCursor ? `\n还有更多结果；继续查询时仅将此 cursor 传给本工具：${raw.nextCursor}` : '';
    return `${head}\n${lines.join('\n')}${cursor}`;
  },
  summarize(raw, args = {}) {
    if (!raw?.total) return '待办查询：无结果';
    const keyword = args.keyword ? `（关键词“${args.keyword}”）` : '';
    const mode = raw?.matchMode === 'semantic' ? '（语义匹配）' : '';
    return `待办查询${keyword}${mode}：共 ${raw.total} 条，已返回 ${raw.items?.length || 0} 条安全摘要`;
  },
  getAnswerRequirements(raw) {
    const items = Array.isArray(raw?.items) ? raw.items : [];
    if (items.length !== 1) return [];
    const checklist = items[0]?.checklistProgress || { completed: 0, total: 0 };
    const completed = Math.max(0, Number(checklist.completed || 0));
    const total = Math.max(0, Number(checklist.total || 0));
    if (!Number.isFinite(completed) || !Number.isFinite(total) || total < 1) return [];
    const remaining = Math.max(0, total - completed);
    return [
      {
        id: 'todo.checklist_progress',
        anyOf: [
          `${completed}/${total}`,
          `已完成${completed}项还差${remaining}项`,
          `完成${completed}项剩余${remaining}项`,
        ],
        appendText: `清单进度：已完成 ${completed} 项，还差 ${remaining} 项（${completed}/${total}）。`,
      },
    ];
  },
};
