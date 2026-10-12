import { appendFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

const blocked = `const stop = () => { throw Object.assign(new Error('Evaluation production adapters disabled'), { code: 'EXTRACTION_EVAL_INFRA_DISABLED' }); };`;

// CLI-only isolation: use the real Execution/Gateway/provider with local experiment adapters.
// Do not import the database or the production quota dependency tree, even for reads.
export async function loadRuntime() {
  if (process.env.NODE_ENV === 'test') throw new Error('Live evaluation is forbidden in test runtime');
  const replacements = new Map([
    [
      new URL('../../util/aiQuota.js', import.meta.url).href,
      `${blocked} export const reserve = stop; export const reconcile = stop;`,
    ],
    [
      new URL('../../util/aiExecution/persistence.js', import.meta.url).href,
      `${blocked} export const defaultAiExecutionPersistence = new Proxy({}, { get: () => stop });`,
    ],
  ]);
  const hook = registerHooks({
    load(url, context, nextLoad) {
      if (replacements.has(url)) return { format: 'module', source: replacements.get(url), shortCircuit: true };
      // Fail closed if a future import starts accessing any production infrastructure.
      if (/\/server\/(?:db\/|util\/(?:redisClient|nodemailer|obs)\.)/.test(url))
        throw new Error('EXTRACTION_EVAL_INFRA_DISABLED');
      return nextLoad(url, context);
    },
  });
  try {
    const execution = await import('../../util/aiExecution/service.js');
    const model = await import('../../util/aiSkill/structuredModel.js');
    return { ...execution, ...model, dispose: () => hook.deregister() };
  } catch (error) {
    hook.deregister();
    throw error;
  }
}

export function localAdapters(path, maxReservedTokens = 80_000) {
  let reserved = 0;
  const events = [];
  const save = (event) => {
    appendFileSync(path, `${JSON.stringify(event)}\n`, { mode: 0o600 });
    events.push(structuredClone(event));
  };
  const executionEvent = (event, e) =>
    save({
      event,
      id: e.id,
      requestId: e.requestId,
      status: e.status,
      usage: e.usage,
      chargedTokens: e.chargedTokens,
      durationMs: e.durationMs,
      errorCode: e.errorCode,
      providerCallCount: e.providerCallCount,
      missingUsageSpans: e.missingUsageSpans,
      quotaSettlementStatus: e.quotaSettlementStatus,
    });
  return {
    events,
    persistence: {
      insertAiExecution: (e) => executionEvent('execution_started', e),
      updateAiExecutionReservation: (e) => executionEvent('reservation_linked', e),
      renewAiExecutionLease: (e) => executionEvent('lease_renewed', e),
      settleAiExecution: (e) => executionEvent('execution_settled', e),
      insertAiProviderSpan: (s) =>
        save({
          event: 'provider_span',
          executionId: s.executionId,
          stage: s.stage,
          provider: s.provider,
          model: s.model,
          status: s.status,
          usage: s.usage,
          usageStatus: s.usageStatus,
          estimatedTokens: s.estimatedTokens,
          durationMs: s.durationMs,
          errorCode: s.errorCode,
        }),
    },
    quota: {
      reserve: async (_request, { reserveTokens, requestId }) => {
        if (!Number.isSafeInteger(reserveTokens) || reserveTokens < 1 || reserved + reserveTokens > maxReservedTokens)
          throw Object.assign(new Error('Local experiment budget exceeded'), {
            code: 'EXTRACTION_EVAL_BUDGET_EXCEEDED',
          });
        save({ event: 'local_budget_reserved', requestId, reserveTokens });
        reserved += reserveTokens;
        return { reserved: reserveTokens, reservationKey: `evaluation:${requestId}`, blocked: false };
      },
      reconcile: async (handle, chargedTokens) => {
        save({ event: 'local_budget_settled', reservationKey: handle.reservationKey, chargedTokens });
        // Do not recycle a reservation: an unknown provider outcome must not permit a retry.
        return true;
      },
    },
  };
}
