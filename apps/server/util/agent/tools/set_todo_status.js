import pool from '../../../db/index.js';
import { applyTodoStatusChange, prepareTodoStatusChange } from '../../services/todoService.js';

const STATUS_LABELS = Object.freeze({ pending: '待处理', completed: '已完成' });
const PRIORITY_LABELS = Object.freeze({ 0: '低优先级', 1: '普通优先级', 2: '高优先级' });

function firstValue(args, keys) {
  for (const key of keys) {
    const value = args?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
}

export function normalizeSetTodoStatusArgs(args = {}) {
  return {
    todoId: firstValue(args, ['todoId', 'todo_id', 'taskId', 'task_id', 'id']).slice(0, 64),
    keyword: firstValue(args, ['keyword', 'query', 'title', 'todoTitle', 'todo_title']).slice(0, 100),
    status: String(args?.status || '')
      .trim()
      .toLowerCase(),
  };
}

function normalizePreparedSetTodoStatusArgs(args = {}) {
  return {
    ...normalizeSetTodoStatusArgs(args),
    // 以下字段只会由服务端 prepare 写入确认令牌。保留它们是为了让同一份冻结参数
    // 能被 preview 与最终确认执行复用；它们不在公开 schema / aliases 中，客户端不能伪造。
    expectedVersion: String(args?.expectedVersion || '')
      .trim()
      .slice(0, 128),
    targetTitle: String(args?.targetTitle || '')
      .trim()
      .slice(0, 200),
    currentStatus: String(args?.currentStatus || '')
      .trim()
      .toLowerCase(),
    dueAt: args?.dueAt || null,
    priority: args?.priority != null && Number.isFinite(Number(args.priority)) ? Number(args.priority) : null,
    activeReminderCount: Number.isFinite(Number(args?.activeReminderCount))
      ? Math.max(0, Math.trunc(Number(args.activeReminderCount)))
      : 0,
  };
}

function ensureTodoMutationAllowed(ctx) {
  if (ctx?.request?.adminContext) {
    const error = new Error('管理员代管模式暂不支持修改用户待办。');
    error.code = 'TODO_ADMIN_CONTEXT_FORBIDDEN';
    error.status = 403;
    throw error;
  }
}

function formatDueAt(value) {
  if (!value) return '未设置';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN', { hour12: false }) : String(value);
}

function buildImpact(args) {
  if (args.status === 'completed') {
    const reminderPart = args.activeReminderCount ? `，并取消 ${args.activeReminderCount} 条尚未触发的提醒` : '';
    return `确认后将把该待办标记为已完成${reminderPart}；重新打开不会自动恢复已取消的提醒。`;
  }
  return '确认后将把该待办重新标记为待处理；此前已取消的提醒不会自动恢复，可在待办页面重新设置。';
}

function markCommitOutcomeUnknown(error) {
  if (error && (typeof error === 'object' || typeof error === 'function')) {
    try {
      error.commitOutcomeUnknown = true;
      if (error.commitOutcomeUnknown) return error;
    } catch {
      // 冻结对象或只读异常会在下方包装，避免标记动作本身覆盖原始故障。
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
        // 原始业务/提交异常更重要；提交状态仍由下方标记交给确认重放流程处理。
      }
    }
    throw commitAttempted ? markCommitOutcomeUnknown(error) : error;
  } finally {
    connection?.release();
  }
}

export default {
  name: 'set_todo_status',
  description:
    '修改当前账号的一条待办状态，只支持设为已完成或重新设为待处理。必须提供 todoId 或足够具体的待办标题关键词；同名或多条匹配时，服务端会要求用户选择。不能修改清单子项、提醒内容或多条待办。',
  parameters: {
    type: 'object',
    properties: {
      todoId: { type: 'string', maxLength: 64, description: '要修改的待办 ID；来自 query_todos 的 [todo:ID]' },
      keyword: { type: 'string', maxLength: 100, description: '待办标题关键词；没有 ID 时使用，必须足够具体' },
      status: {
        type: 'string',
        enum: ['pending', 'completed'],
        description: '目标状态：pending 待处理，completed 已完成',
      },
    },
    required: ['status'],
  },
  argumentAliases: ['todo_id', 'taskId', 'task_id', 'id', 'query', 'title', 'todoTitle', 'todo_title'],
  requireRoot: false,
  isWrite: true,
  directAction: true,
  riskLevel: 'low',
  confirmationPolicy: 'always',
  normalizeArgs: normalizeSetTodoStatusArgs,
  async prepareArgs(input, ctx) {
    ensureTodoMutationAllowed(ctx);
    const args = normalizeSetTodoStatusArgs(input);
    return prepareTodoStatusChange(pool, ctx.userId, args);
  },
  preview(input) {
    const args = normalizePreparedSetTodoStatusArgs(input);
    return {
      title: args.status === 'completed' ? '完成待办' : '重新打开待办',
      target: args.targetTitle || '当前待办',
      impact: buildImpact(args),
      details: [
        { key: 'currentStatus', value: STATUS_LABELS[args.currentStatus] || args.currentStatus || '未知' },
        { key: 'targetStatus', value: STATUS_LABELS[args.status] || args.status || '未知' },
        { key: 'dueAt', value: formatDueAt(args.dueAt) },
        { key: 'priority', value: PRIORITY_LABELS[args.priority] || '普通优先级' },
        ...(args.status === 'completed'
          ? [{ key: 'activeReminderCount', value: `${args.activeReminderCount} 条` }]
          : []),
      ],
    };
  },
  async execute(input, ctx) {
    ensureTodoMutationAllowed(ctx);
    const args = normalizePreparedSetTodoStatusArgs(input);
    return withTransaction((connection) => applyTodoStatusChange(connection, ctx.userId, args));
  },
  transform(raw) {
    const target = raw?.title || '该待办';
    if (raw?.state === 'noop') return `待办“${target}”已经是${STATUS_LABELS[raw.status] || raw.status}，未重复修改。`;
    const reminderPart = raw?.cancelledReminderCount ? `，已取消 ${raw.cancelledReminderCount} 条未触发提醒` : '';
    return `✅ 待办“${target}”已设为${STATUS_LABELS[raw?.status] || raw?.status || '目标状态'}${reminderPart}。`;
  },
  summarize(raw) {
    if (raw?.state === 'noop') return '待办状态：无需修改';
    return `待办状态已更新为${STATUS_LABELS[raw?.status] || raw?.status || '目标状态'}`;
  },
};
