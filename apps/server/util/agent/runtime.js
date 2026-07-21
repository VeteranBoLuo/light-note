export class AgentDeadlineError extends Error {
  constructor(code = 'AGENT_HARD_DEADLINE_EXCEEDED', message = 'AI 请求超过最大处理时间') {
    super(message);
    this.name = 'TimeoutError';
    this.code = code;
  }
}

function boundedMs(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.trunc(parsed))) : fallback;
}

export function getAgentRuntimeLimits(env = process.env) {
  const hardMs = boundedMs(env.AI_AGENT_HARD_DEADLINE_MS, 180_000, 30_000, 300_000);
  const softMs = Math.min(hardMs - 5000, boundedMs(env.AI_AGENT_SOFT_DEADLINE_MS, 120_000, 15_000, 240_000));
  const toolConcurrency = boundedMs(env.AI_AGENT_TOOL_CONCURRENCY, 4, 1, 4);
  return { softMs, hardMs, toolConcurrency };
}

/** 在已有请求 AbortController 上安装软/硬 deadline。 */
export function createAgentDeadline({ controller, softMs, hardMs, onSoftDeadline = () => {} }) {
  const startedAt = Date.now();
  let softExpired = false;
  const softTimer = setTimeout(() => {
    softExpired = true;
    onSoftDeadline();
  }, softMs);
  const hardTimer = setTimeout(() => {
    if (!controller.signal.aborted) controller.abort(new AgentDeadlineError());
  }, hardMs);
  softTimer.unref?.();
  hardTimer.unref?.();
  return {
    get softExpired() {
      return softExpired;
    },
    remainingMs() {
      return Math.max(0, hardMs - (Date.now() - startedAt));
    },
    dispose() {
      clearTimeout(softTimer);
      clearTimeout(hardTimer);
    },
  };
}

/** 保序、固定并发的异步 map；新任务启动前会再次检查取消信号。 */
export async function mapWithConcurrency(items, concurrency, worker, signal) {
  const input = Array.isArray(items) ? items : [];
  if (!input.length) return [];
  const results = new Array(input.length);
  let cursor = 0;
  const take = () => {
    const index = cursor;
    cursor += 1;
    return index;
  };
  const run = async () => {
    while (true) {
      if (signal?.aborted) throw signal.reason || new DOMException('请求已取消', 'AbortError');
      const index = take();
      if (index >= input.length) return;
      results[index] = await worker(input[index], index);
    }
  };
  const workerCount = Math.min(input.length, Math.max(1, Math.trunc(Number(concurrency) || 1)));
  await Promise.all(Array.from({ length: workerCount }, () => run()));
  return results;
}

/** 让不支持 AbortSignal 的旧异步阶段也受请求硬 deadline 约束。 */
export function raceWithSignal(promise, signal) {
  if (!signal) return Promise.resolve(promise);
  if (signal.aborted) return Promise.reject(signal.reason || new DOMException('请求已取消', 'AbortError'));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason || new DOMException('请求已取消', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(promise).then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}
