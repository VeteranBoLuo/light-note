import pool from '../../../db/index.js';
import { createTodo } from '../../services/todoService.js';

const PRIORITY_LABELS = Object.freeze({ 0: '低优先级', 1: '普通优先级', 2: '高优先级' });
const MAX_TITLE_CHARS = 200;
const MAX_DESCRIPTION_CHARS = 2_000;
// 允许的截止时间区间。模型算错年份（把 2026 写成 2025 或 2035）是最典型的失败模式，
// 越界直接拒绝；小幅偏差不拒绝，交给确认卡上的「已过期」标注让用户自己判断。
const MAX_FUTURE_YEARS = 10;
const MAX_PAST_YEARS = 1;

function firstValue(args, keys) {
  for (const key of keys) {
    const value = args?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
}

function pad(part) {
  return String(part).padStart(2, '0');
}

/**
 * 把模型给的时间文本归一成 `YYYY-MM-DD HH:mm:ss` 本地时间。
 *
 * 按项目约定保留本地时区字面值，不走 toISOString——那会把北京时间的晚上偏移成前一天。
 * 只接受能被 Date 解析的具体时刻；自然语言（“今天晚上”“下周三”）由模型换算，
 * 服务端不再猜，算错的兜底是确认卡会显示这里解析出的结果。
 */
function normalizeDueAt(value) {
  const raw = String(value || '').trim();
  if (!raw) return { dueAt: null };
  const date = new Date(raw.includes('T') || raw.includes('-') ? raw : raw.replace(/\//g, '-'));
  if (!Number.isFinite(date.getTime())) {
    return { error: '截止时间格式无法识别，请用具体日期时间（例如 2026-08-04 21:00:00）。' };
  }
  const now = Date.now();
  const diffYears = (date.getTime() - now) / (365 * 24 * 3600 * 1000);
  if (diffYears > MAX_FUTURE_YEARS) {
    return { error: '截止时间距今超过 10 年，可能是年份写错了，请确认后重试。' };
  }
  if (diffYears < -MAX_PAST_YEARS) {
    return { error: '截止时间早于一年前，可能是年份写错了，请确认后重试。' };
  }
  return {
    dueAt: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
      date.getMinutes(),
    )}:${pad(date.getSeconds())}`,
    overdue: date.getTime() < now,
  };
}

export function normalizeCreateTodoArgs(args = {}) {
  const priorityRaw = firstValue(args, ['priority', 'priorityLevel', 'priority_level', 'importance']);
  // 缺省必须落在「普通」。Number('') 是 0，直接判 includes 会把没指定优先级的待办
  // 静默降成低优先级，与页面创建（默认 1）不一致。
  const priority = priorityRaw === '' ? 1 : Number(priorityRaw);
  return {
    title: firstValue(args, ['title', 'todoTitle', 'todo_title', 'taskTitle', 'task_title', 'name', 'content']).slice(
      0,
      MAX_TITLE_CHARS,
    ),
    description: firstValue(args, ['description', 'detail', 'details', 'note', 'remark', 'desc']).slice(
      0,
      MAX_DESCRIPTION_CHARS,
    ),
    dueAt: firstValue(args, ['dueAt', 'due_at', 'dueDate', 'due_date', 'deadline', 'remindAt', 'remind_at', 'time']),
    priority: [0, 1, 2].includes(priority) ? priority : 1,
  };
}

function normalizePreparedCreateTodoArgs(args = {}) {
  return {
    ...normalizeCreateTodoArgs(args),
    // 只由服务端 prepare 写入确认令牌，不在公开 schema 与 aliases 中，客户端无法伪造。
    dueAt: String(args?.dueAt || '').trim(),
    overdue: args?.overdue === true,
  };
}

function ensureTodoMutationAllowed(ctx) {
  if (ctx?.request?.adminContext) {
    const error = new Error('管理员代管模式暂不支持为用户创建待办。');
    error.code = 'TODO_ADMIN_CONTEXT_FORBIDDEN';
    error.status = 403;
    throw error;
  }
}

function markCommitOutcomeUnknown(error) {
  if (error && (typeof error === 'object' || typeof error === 'function')) {
    try {
      error.commitOutcomeUnknown = true;
      if (error.commitOutcomeUnknown) return error;
    } catch {
      // 冻结的第三方 Error 走下方包装，避免标记动作覆盖原始故障。
    }
  }
  const wrapped = new Error(error instanceof Error ? error.message : '提交结果暂时无法核验');
  wrapped.cause = error;
  wrapped.commitOutcomeUnknown = true;
  return wrapped;
}

async function withTransaction(callback) {
  let connection;
  let transactionStarted = false;
  let commitAttempted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const result = await callback(connection);
    commitAttempted = true;
    await connection.commit();
    return result;
  } catch (error) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch {
        // 原始异常更重要；提交状态由标记交给确认重放流程处理。
      }
    }
    throw commitAttempted ? markCommitOutcomeUnknown(error) : error;
  } finally {
    connection?.release();
  }
}

export default {
  name: 'create_todo',
  description:
    '为当前账号创建一条待办。title 必填。需要截止时间时用 dueAt，必须换算成具体的本地时间 YYYY-MM-DD HH:mm:ss，不要填写“今天晚上”这类相对说法（当前时间见系统提示）。只创建待办本身，不处理清单子项、重复规则和提醒渠道。',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', maxLength: MAX_TITLE_CHARS, description: '待办标题，必填' },
      description: { type: 'string', maxLength: MAX_DESCRIPTION_CHARS, description: '待办说明，可选' },
      dueAt: {
        type: 'string',
        description: '截止时间，格式 YYYY-MM-DD HH:mm:ss 本地时间；没有明确时间要求时省略',
      },
      priority: { type: 'integer', enum: [0, 1, 2], description: '优先级：0 低、1 普通（默认）、2 高' },
    },
    required: ['title'],
  },
  argumentAliases: [
    'todoTitle',
    'todo_title',
    'taskTitle',
    'task_title',
    'name',
    'content',
    'detail',
    'details',
    'note',
    'remark',
    'desc',
    'due_at',
    'dueDate',
    'due_date',
    'deadline',
    'remindAt',
    'remind_at',
    'time',
    'priorityLevel',
    'priority_level',
    'importance',
  ],
  requireRoot: false,
  isWrite: true,
  directAction: true,
  riskLevel: 'low',
  confirmationPolicy: 'default',
  normalizeArgs: normalizeCreateTodoArgs,
  async prepareArgs(input, ctx) {
    ensureTodoMutationAllowed(ctx);
    const args = normalizeCreateTodoArgs(input);
    if (!args.title) {
      const error = new Error('待办标题不能为空，请说明要记录什么。');
      error.code = 'TODO_TITLE_REQUIRED';
      error.status = 400;
      throw error;
    }
    const due = normalizeDueAt(args.dueAt);
    if (due.error) {
      const error = new Error(due.error);
      error.code = 'TODO_DUE_AT_INVALID';
      error.status = 400;
      throw error;
    }
    return { ...args, dueAt: due.dueAt || '', overdue: due.overdue === true };
  },
  preview(input) {
    const args = normalizePreparedCreateTodoArgs(input);
    return {
      title: '创建待办',
      target: args.title || '新待办',
      impact: args.dueAt
        ? `确认后将创建一条截止于 ${args.dueAt} 的待办${args.overdue ? '（该时间已过去，请核对）' : ''}。`
        : '确认后将创建一条没有截止时间的待办。',
      details: [
        { key: 'dueAt', value: args.dueAt ? `${args.dueAt}${args.overdue ? '（已过期）' : ''}` : '未设置' },
        { key: 'priority', value: PRIORITY_LABELS[args.priority] || '普通优先级' },
        // 不能复用 description——确认卡把它翻译成图片笔记的「图片说明」。
        ...(args.description ? [{ key: 'todoDescription', value: args.description.slice(0, 120) }] : []),
      ],
    };
  },
  async execute(input, ctx) {
    ensureTodoMutationAllowed(ctx);
    const args = normalizePreparedCreateTodoArgs(input);
    const created = await withTransaction((connection) =>
      createTodo(
        connection,
        ctx.userId,
        {
          title: args.title,
          description: args.description,
          priority: args.priority,
          dueAt: args.dueAt || null,
        },
        { suppressUserRewards: Boolean(ctx.suppressUserRewards || ctx.adminContext) },
      ),
    );
    return { id: created.id, title: args.title, dueAt: args.dueAt || null };
  },
  transform(raw) {
    const due = raw?.dueAt ? `，截止 ${raw.dueAt}` : '';
    return `✅ 待办「${raw?.title || '新待办'}」已创建${due}。`;
  },
  summarize(raw) {
    return `待办已创建${raw?.dueAt ? `（截止 ${raw.dueAt}）` : ''}`;
  },
};
