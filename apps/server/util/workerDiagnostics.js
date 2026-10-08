import { AsyncLocalStorage } from 'node:async_hooks';
import { stableAgentErrorCode } from './agent/logSafety.js';

const context = new AsyncLocalStorage();
const reported = new WeakSet();

function report(error, details) {
  if (error && typeof error === 'object' && reported.has(error)) return;
  try {
    console.error(
      '[document-worker]',
      JSON.stringify({
        time: new Date().toISOString(),
        channel: details.channel,
        stage: details.stage,
        code: stableAgentErrorCode(error),
      }),
    );
    if (error && typeof error === 'object') reported.add(error);
  } catch {
    /* Diagnostics must never change task execution or retry behavior. */
  }
}

export async function withWorkerStage(stage, work) {
  const current = context.getStore();
  if (!current) return work();
  return context.run({ ...current, stage }, async () => {
    try {
      return await work();
    } catch (error) {
      report(error, context.getStore());
      throw error;
    }
  });
}

export function withWorkerDiagnostics(channel, work) {
  return context.run({ channel, stage: 'poll' }, () => withWorkerStage('poll', work));
}
