import { AsyncLocalStorage } from 'node:async_hooks';

const executionStorage = new AsyncLocalStorage();

export function runWithAiExecutionContext(execution, operation) {
  if (!execution || typeof execution !== 'object') {
    const error = new Error('AI Execution 上下文无效');
    error.code = 'AI_EXECUTION_CONTEXT_INVALID';
    throw error;
  }
  if (typeof operation !== 'function') {
    const error = new Error('AI Execution 缺少可执行操作');
    error.code = 'AI_EXECUTION_OPERATION_REQUIRED';
    throw error;
  }
  return executionStorage.run(execution, operation);
}

export function getActiveAiExecution() {
  return executionStorage.getStore() || null;
}

export function requireActiveAiExecution() {
  const execution = getActiveAiExecution();
  if (execution) return execution;
  const error = new Error('模型调用缺少 AI Execution 上下文');
  error.code = 'AI_EXECUTION_REQUIRED';
  error.status = 500;
  throw error;
}

export function isAiExecutionRuntimeRequired(env = process.env) {
  const raw = String(env.AI_GATEWAY_REQUIRE_EXECUTION || '')
    .trim()
    .toLowerCase();
  if (raw) return !['0', 'false', 'off', 'no'].includes(raw);
  // 模块化 Skill 已完成根执行迁移，运行时默认失败关闭；仅可通过显式环境变量做紧急回滚。
  return true;
}
