import { describe, expect, it, vi } from 'vitest';
import { createAiGateway } from './aiGateway.js';
import { redactSensitiveText } from './logSafety.js';

describe('Agent AI Gateway', () => {
  it('为供应商调用生成无正文的 trace span', async () => {
    const client = vi.fn().mockResolvedValue({
      content: 'ok',
      provider: 'qwen',
      model: 'qwen-test',
      usageStatus: 'reported',
    });
    const onTrace = vi.fn();
    const gateway = createAiGateway({ completeClient: client, streamClient: vi.fn() });
    const result = await gateway.complete([{ role: 'user', content: '私密正文' }], {
      trace: { traceId: 'trace-1', stage: 'planner', onTrace },
    });
    expect(result.gatewayTrace).toMatchObject({ traceId: 'trace-1', stage: 'planner', provider: 'qwen' });
    expect(client).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ toolChoice: 'none', signal: expect.any(AbortSignal) }),
    );
    expect(client.mock.calls[0][1]).not.toHaveProperty('trace');
    expect(onTrace.mock.calls.flat().join(' ')).not.toContain('私密正文');
    expect(onTrace).toHaveBeenCalledTimes(2);
  });

  it('失败时只记录清洗后的错误并把 span 附到异常', async () => {
    const error = new Error('Authorization: Bearer secret-token password=hunter2');
    const gateway = createAiGateway({ completeClient: vi.fn().mockRejectedValue(error), streamClient: vi.fn() });
    await expect(gateway.complete([], { trace: { traceId: 'trace-2' } })).rejects.toBe(error);
    expect(error.gatewayTrace.error).not.toContain('secret-token');
    expect(error.gatewayTrace.error).not.toContain('hunter2');
  });

  it('第三方返回冻结 Error 时仍保留原异常，不被追踪字段写入覆盖', async () => {
    const error = Object.freeze(new Error('provider frozen error'));
    const gateway = createAiGateway({ completeClient: vi.fn().mockRejectedValue(error), streamClient: vi.fn() });

    await expect(gateway.complete([])).rejects.toBe(error);
  });

  it('日志清洗覆盖 key、JWT、邮箱和 URL 查询凭据', () => {
    const raw =
      'api_key=sk-abcdefghijklmnop email=a@example.com token=eyJabcdefgh.abcdefgh.abcdefgh https://x.test?a=1&token=abc';
    const safe = redactSensitiveText(raw);
    expect(safe).not.toContain('abcdefghijklmnop');
    expect(safe).not.toContain('a@example.com');
    expect(safe).not.toContain('eyJabcdefgh');
    expect(safe).not.toContain('token=abc');
  });

  it('完整调用受 Gateway 硬超时约束，并返回稳定错误码', async () => {
    vi.useFakeTimers();
    try {
      const client = vi.fn(
        (_messages, options) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
          }),
      );
      const gateway = createAiGateway({ completeClient: client, streamClient: vi.fn() });
      const pending = gateway.complete([], { timeoutMs: 1_000, trace: { traceId: 'trace-timeout' } });
      const assertion = expect(pending).rejects.toMatchObject({ code: 'AI_GATEWAY_TIMEOUT' });

      await vi.advanceTimersByTimeAsync(1_000);

      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('治理适配器在 Provider 前占位、完成后结算，且治理参数不下传供应商', async () => {
    const governanceAdapter = {
      beginAiGatewayGovernance: vi.fn().mockResolvedValue({ id: 'state-1' }),
      finishAiGatewayGovernance: vi.fn().mockResolvedValue(undefined),
    };
    const client = vi.fn().mockResolvedValue({
      content: 'ok',
      usage: { promptTokens: 2, completionTokens: 1, totalTokens: 3 },
      usageStatus: 'reported',
    });
    const gateway = createAiGateway({ completeClient: client, streamClient: vi.fn(), governanceAdapter });
    const governance = { quotaPolicy: 'system', systemId: 'test', taskType: 'test_task' };

    const result = await gateway.complete([], {
      governance,
      trace: { traceId: 'trace-governed', taskType: 'test_task' },
    });

    expect(governanceAdapter.beginAiGatewayGovernance).toHaveBeenCalledWith(
      expect.objectContaining({ governance, traceId: 'trace-governed', taskType: 'test_task' }),
    );
    expect(client.mock.calls[0][1]).not.toHaveProperty('governance');
    expect(governanceAdapter.finishAiGatewayGovernance).toHaveBeenCalledWith(
      expect.objectContaining({
        state: { id: 'state-1' },
        result: expect.objectContaining({ content: 'ok' }),
        error: null,
      }),
    );
  });

  it('治理 gate 拒绝时不会调用 Provider', async () => {
    const error = Object.assign(new Error('quota blocked'), { code: 'AI_QUOTA_EXCEEDED', status: 429 });
    const governanceAdapter = {
      beginAiGatewayGovernance: vi.fn().mockRejectedValue(error),
      finishAiGatewayGovernance: vi.fn(),
    };
    const client = vi.fn();
    const gateway = createAiGateway({ completeClient: client, streamClient: vi.fn(), governanceAdapter });

    await expect(
      gateway.complete([], { governance: { quotaPolicy: 'user' }, trace: { traceId: 'trace-blocked' } }),
    ).rejects.toBe(error);
    expect(client).not.toHaveBeenCalled();
    expect(governanceAdapter.finishAiGatewayGovernance).not.toHaveBeenCalled();
  });
});
