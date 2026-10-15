import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAiExecution } from '../aiExecution/service.js';
import { callGroundedSkillModel } from './model.js';

describe('Skill 的真实 Gateway / Provider 失败边界', () => {
  beforeEach(() => {
    vi.stubEnv('AGENT_LLM_PROVIDER', 'deepseek');
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-key');
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each(['timeout', 'unavailable', 'invalid'])('%s 不进入内容修复，失败调用保留归属并退回额度', async (scenario) => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, { signal }) => {
        if (scenario === 'unavailable') return new Response('private error page', { status: 503 });
        if (scenario === 'invalid') return new Response('{}');
        return {
          ok: true,
          status: 200,
          json: () =>
            new Promise((_resolve, reject) => {
              signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
            }),
        };
      }),
    );
    const persistence = Object.fromEntries(
      [
        'insertAiExecution',
        'updateAiExecutionReservation',
        'renewAiExecutionLease',
        'insertAiProviderSpan',
        'settleAiExecution',
      ].map((name) => [name, vi.fn()]),
    );
    const quota = {
      reserve: vi.fn().mockResolvedValue({ reservationKey: 'request-1', reserved: 20_000 }),
      reconcile: vi.fn().mockResolvedValue({ charged: 0 }),
    };
    const code = {
      timeout: 'AI_GATEWAY_TIMEOUT',
      unavailable: 'AI_PROVIDER_ERROR',
      invalid: 'AI_PROVIDER_ERROR',
    }[scenario];
    const pending = runAiExecution(
      {
        request: { user: { id: 'u1', role: 'user' }, headers: {}, body: {} },
        skillId: 'toolbox.idea_to_draft',
        taskType: 'skill_toolbox_idea_to_draft',
        persistence,
      },
      () =>
        callGroundedSkillModel({
          messages: [{ role: 'user', content: 'synthetic test material' }],
          modelPolicy: { maxTokens: 1000, timeoutMs: 1000 },
          trace: { stage: 'skill_toolbox_idea_to_draft' },
        }),
      { quota },
    );
    const assertion = expect(pending).rejects.toMatchObject({ code });
    await Promise.all([assertion, vi.advanceTimersByTimeAsync(1000)]);

    expect(fetch).toHaveBeenCalledOnce();
    expect(persistence.insertAiProviderSpan).toHaveBeenCalledOnce();
    expect(persistence.insertAiProviderSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'deepseek',
        status: 'failed',
        errorCode: code,
        usageStatus: 'missing',
      }),
    );
    expect(quota.reconcile).toHaveBeenCalledWith(expect.any(Object), 0, { aborted: false });
    expect(persistence.settleAiExecution.mock.calls[0][0]).toMatchObject({
      status: 'failed',
      providerCallCount: 1,
      chargedTokens: 0,
    });
  });
});
