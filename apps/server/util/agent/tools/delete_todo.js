import pool from '../../../db/index.js';
import { applyTodoDeletion, prepareTodoDeletion } from '../../services/todoService.js';

const STATUS_LABELS = Object.freeze({ pending: '待处理', completed: '已完成' });
const PRIORITY_LABELS = Object.freeze({ 0: '低优先级', 1: '普通优先级', 2: '高优先级' });
const SCOPE_LABELS = Object.freeze({ current: '仅当前项', future: '当前及以后', series: '整个任务系列' });

function firstValue(args, keys) {
  for (const key of keys) {
    const value = args?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
}

function normalizeTodoId(value) {
  const text = String(value || '').trim();
  const marker = /^\[?todo:([^\]\s]+)\]?$/i.exec(text);
  return String(marker?.[1] || text).slice(0, 64);
}

export function normalizeDeleteTodoArgs(args = {}) {
  const scope = String(args?.scope || args?.deleteScope || args?.delete_scope || '')
    .trim()
    .toLowerCase();
  return {
    todoId: normalizeTodoId(firstValue(args, ['todoId', 'todo_id', 'taskId', 'task_id', 'id'])),
    keyword: firstValue(args, ['keyword', 'query', 'title', 'todoTitle', 'todo_title']).slice(0, 100),
    ...(scope ? { scope } : {}),
  };
}

function normalizePreparedDeleteTodoArgs(args = {}) {
  return {
    ...normalizeDeleteTodoArgs(args),
    // 这些字段只能由服务端 prepare 写入一次性确认参数，不在公开 schema 中暴露。
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
    recurring: Boolean(args?.recurring),
    planVersion: Number.isFinite(Number(args?.planVersion)) ? Math.max(1, Math.trunc(Number(args.planVersion))) : 1,
  };
}

function ensureTodoDeletionAllowed(ctx) {
  if (ctx?.request?.adminContext) {
    const error = new Error('管理员代管模式暂不支持删除用户待办。');
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
  const reminderPart = args.activeReminderCount ? `，并停止当前项的 ${args.activeReminderCount} 条未触发提醒` : '';
  if (args.scope === 'series') {
    return '确认后将删除该系列中尚未完成的项目并结束系列；已完成历史保留。';
  }
  if (args.scope === 'future') {
    return '确认后将删除当前及以后尚未完成的项目并结束系列；更早与已完成历史保留。';
  }
  if (args.recurring && args.planVersion === 1) {
    return `确认后将这条待办移入回收站${reminderPart}；该旧版重复链不再由此项生成后续待办。`;
  }
  return `确认后将这条待办移入回收站${reminderPart}。`;
}

function markCommitOutcomeUnknown(error) {
  if (error && (typeof error === 'object' || typeof error === 'function')) {
    try {
      error.commitOutcomeUnknown = true;
      if (error.commitOutcomeUnknown) return error;
    } catch {
      // 冻结或只读异常会在下方包装，不覆盖原始故障。
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
        // 保留原始业务或提交异常。
      }
    }
    throw commitAttempted ? markCommitOutcomeUnknown(error) : error;
  } finally {
    connection?.release();
  }
}

export default {
  name: 'delete_todo',
  description:
    '删除当前账号的一条明确待办。必须提供 todoId 或足够具体的标题关键词；同名或多条匹配时服务端会要求用户选择。普通待办只能删除当前项；任务系列必须按用户原话指定 current、future 或 series，绝不猜测删除范围。',
  parameters: {
    type: 'object',
    properties: {
      todoId: { type: 'string', maxLength: 64, description: '要删除的待办 ID；来自 query_todos 的 [todo:ID]' },
      keyword: { type: 'string', maxLength: 100, description: '待办标题关键词；没有 ID 时使用，必须足够具体' },
      scope: {
        type: 'string',
        enum: ['current', 'future', 'series'],
        description:
          '删除范围：current 仅当前项，future 当前及以后，series 整个任务系列。普通待办可省略；任务系列不能省略',
      },
    },
  },
  argumentAliases: [
    'todo_id',
    'taskId',
    'task_id',
    'id',
    'query',
    'title',
    'todoTitle',
    'todo_title',
    'deleteScope',
    'delete_scope',
  ],
  requireRoot: false,
  isWrite: true,
  directAction: true,
  riskLevel: 'medium',
  confirmationPolicy: 'always',
  dependencyBindings: [{ argument: 'todoId', refType: 'todo', requireUnique: true }],
  normalizeArgs: normalizeDeleteTodoArgs,
  async prepareArgs(input, ctx) {
    ensureTodoDeletionAllowed(ctx);
    return prepareTodoDeletion(pool, ctx.userId, normalizeDeleteTodoArgs(input));
  },
  preview(input) {
    const args = normalizePreparedDeleteTodoArgs(input);
    return {
      title: '删除待办',
      target: args.targetTitle || '当前待办',
      impact: buildImpact(args),
      details: [
        { key: 'currentStatus', value: STATUS_LABELS[args.currentStatus] || args.currentStatus || '未知' },
        { key: 'deleteScope', value: SCOPE_LABELS[args.scope] || args.scope || '仅当前项' },
        { key: 'dueAt', value: formatDueAt(args.dueAt) },
        { key: 'priority', value: PRIORITY_LABELS[args.priority] || '普通优先级' },
        ...(args.scope === 'current' ? [{ key: 'activeReminderCount', value: `${args.activeReminderCount} 条` }] : []),
      ],
    };
  },
  async execute(input, ctx) {
    ensureTodoDeletionAllowed(ctx);
    const args = normalizePreparedDeleteTodoArgs(input);
    return withTransaction((connection) => applyTodoDeletion(connection, ctx.userId, args));
  },
  transform(raw) {
    const target = raw?.title || '该待办';
    if (raw?.scope === 'series') {
      return `✅ 任务系列“${target}”中尚未完成的项目已删除，系列已结束。`;
    }
    if (raw?.scope === 'future') {
      return `✅ 任务系列“${target}”当前及以后尚未完成的项目已删除，系列已结束。`;
    }
    return `✅ 待办“${target}”已移入回收站。`;
  },
  summarize(raw) {
    if (raw?.scope === 'series') return '整个任务系列的未完成项已删除';
    if (raw?.scope === 'future') return '当前及以后的未完成待办已删除';
    return '待办已移入回收站';
  },
};
