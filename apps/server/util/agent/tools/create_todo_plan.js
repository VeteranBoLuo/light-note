import crypto from 'crypto';
import pool from '../../../db/index.js';
import { assertTodoPlanReady } from '../../todoPlanCalculator.js';
import { createTodoPlan, previewTodoPlan } from '../../services/todoSeriesService.js';
import { assertTodoPlanFeatureEnabled } from '../../todoPlanFeature.js';
import { normalizeTodoPlanToolArgs, TODO_PLAN_TOOL_PARAMETERS, todoPlanPreviewCard } from '../todoPlanToolShared.js';

function ensureAllowed(ctx) {
  assertTodoPlanFeatureEnabled('ai');
  if (ctx?.request?.adminContext) {
    const error = new Error('管理员代管模式不支持为其他用户创建任务计划。');
    error.code = 'TODO_ADMIN_CONTEXT_FORBIDDEN';
    error.status = 403;
    throw error;
  }
}

async function withTransaction(callback) {
  const connection = await pool.getConnection();
  let commitAttempted = false;
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    commitAttempted = true;
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback().catch(() => {});
    if (commitAttempted && error && typeof error === 'object') error.commitOutcomeUnknown = true;
    throw error;
  } finally {
    connection.release();
  }
}

export default {
  name: 'create_todo_plan',
  description:
    '创建完整待办计划，支持仅一次、按日程重复、完成后再次安排，以及每项提醒一次或多次催办。所有日期必须先由服务端确定性计算并展示确认卡；用户未明确过去日期处理方式时禁止执行。普通单条无提醒待办也可继续用 create_todo。',
  parameters: TODO_PLAN_TOOL_PARAMETERS,
  requireRoot: false,
  isWrite: true,
  directAction: true,
  riskLevel: 'medium',
  confirmationPolicy: 'always',
  normalizeArgs: normalizeTodoPlanToolArgs,
  async prepareArgs(input, ctx) {
    ensureAllowed(ctx);
    const args = normalizeTodoPlanToolArgs(input);
    if (!args.title) {
      const error = new Error('待办标题不能为空，请说明要记录什么。');
      error.code = 'TODO_TITLE_REQUIRED';
      error.status = 400;
      throw error;
    }
    if (args.reminder.channels.includes('email') && !args.reminder.targetEmail) {
      const [[user]] = await pool.query('SELECT email FROM user WHERE id = ? AND del_flag = 0 LIMIT 1', [ctx.userId]);
      args.reminder.targetEmail = String(user?.email || '').trim();
    }
    const preview = assertTodoPlanReady(previewTodoPlan(args));
    return {
      ...args,
      _previewHash: preview.previewHash,
      _idempotencyKey: crypto.randomUUID(),
      _previewCard: todoPlanPreviewCard(preview),
    };
  },
  preview(input) {
    if (!input?._previewHash || !input?._previewCard) {
      const error = new Error('任务计划需要重新计算确认预览。');
      error.code = 'TODO_PLAN_PREVIEW_REQUIRED';
      throw error;
    }
    return input._previewCard;
  },
  async execute(input, ctx) {
    ensureAllowed(ctx);
    const args = normalizeTodoPlanToolArgs(input);
    const preview = assertTodoPlanReady(previewTodoPlan(args));
    if (preview.previewHash !== input?._previewHash) {
      const error = new Error('任务计划在确认前已变化，请重新预览。');
      error.code = 'TODO_PREVIEW_STALE';
      error.status = 409;
      throw error;
    }
    return withTransaction((connection) =>
      createTodoPlan(connection, ctx.userId, {
        ...args,
        previewHash: input._previewHash,
        idempotencyKey: input._idempotencyKey,
      }),
    );
  },
  transform(raw) {
    return `✅ 任务计划已创建：生成 ${raw?.createdCount || 0} 项，提醒投递 ${raw?.reminderJobsCreated || 0} 条。`;
  },
  summarize(raw) {
    return `任务计划已创建（${raw?.createdCount || 0} 项）`;
  },
};
