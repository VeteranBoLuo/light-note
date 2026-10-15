import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAiGateway } from './aiGateway.js';
import { requestDeepSeek, requestDeepSeekStream } from './deepseekClient.js';

const messages = [{ role: 'user', content: 'transport test' }];
const completedResponse = { choices: [{ message: { content: 'completed' }, finish_reason: 'stop' }] };

describe('同步 Provider 响应读取与 Gateway 超时', () => {
  beforeEach(() => {
    vi.stubEnv('AGENT_LLM_PROVIDER', 'deepseek');
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-key');
    vi.stubEnv('AI_GATEWAY_REQUIRE_EXECUTION', 'false');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('收到 HTTP 头后超时仍是失败，保留网关原因且不记录成功 span', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, { signal }) => ({
        ok: true,
        status: 200,
        json: () =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
          }),
      })),
    );
    const onTrace = vi.fn();
    const pending = createAiGateway().complete(messages, { timeoutMs: 1_000, trace: { onTrace } });
    const assertion = expect(pending).rejects.toMatchObject({ code: 'AI_GATEWAY_TIMEOUT' });

    await Promise.all([assertion, vi.advanceTimersByTimeAsync(1_000)]);
    expect(onTrace.mock.calls.map(([event]) => event.event)).toEqual(['ai.span.started', 'ai.span.failed']);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([150_000, 0])('遵守 Gateway 的 %s 毫秒预算，不被客户端 90 秒限制截断', async (timeoutMs) => {
    vi.useFakeTimers();
    // 让旧客户端的原生 AbortSignal.timeout 也随虚拟时间推进，重现双重超时。
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), ms);
      return controller.signal;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, { signal }) => ({
        ok: true,
        status: 200,
        json: () =>
          new Promise((resolve, reject) => {
            signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
            setTimeout(() => resolve(completedResponse), 100_000);
          }),
      })),
    );
    const assertion = expect(createAiGateway().complete(messages, { timeoutMs })).resolves.toMatchObject({
      content: 'completed',
    });

    await Promise.all([assertion, vi.advanceTimersByTimeAsync(100_000)]);
  });

  it('用户取消响应读取时保留取消原因', async () => {
    const controller = new AbortController();
    const reason = Object.assign(new Error('cancelled'), { code: 'AI_ABORTED' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          controller.abort(reason);
          throw new DOMException('aborted', 'AbortError');
        },
      })),
    );

    await expect(requestDeepSeek(messages, { signal: controller.signal })).rejects.toBe(reason);
  });

  it.each([
    [new SyntaxError('private provider payload'), 'AI_PROVIDER_ERROR', 502],
    [new TypeError('private socket details'), 'AI_NETWORK_ERROR', 503],
  ])('响应读取失败不伪装成空成果，也不暴露上游正文', async (error, code, status) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: vi.fn().mockRejectedValue(error) }),
    );

    await expect(requestDeepSeek(messages)).rejects.toMatchObject({ code, status, retryable: true });
    await expect(requestDeepSeek(messages)).rejects.not.toThrow('private');
  });

  it('非 JSON 的 HTTP 错误仍保留状态分类', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private upstream HTML', { status: 429 })));

    await expect(requestDeepSeek(messages)).rejects.toMatchObject({ code: 'AI_RATE_LIMITED', status: 429 });
  });

  it.each([null, {}, { error: { message: 'private upstream error' } }])(
    'HTTP 200 的无效响应不伪装成空成果',
    async (data) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(data))));
      await expect(requestDeepSeek(messages)).rejects.toMatchObject({ code: 'AI_PROVIDER_ERROR' });
    },
  );

  it.each([requestDeepSeek, requestDeepSeekStream])('同步和流式请求共用供应商故障分类', async (request) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private unavailable page', { status: 503 })));
    await expect(request(messages)).rejects.toMatchObject({
      code: 'AI_PROVIDER_ERROR',
      status: 503,
      providerStatus: 503,
    });
  });

  it('读取流式 HTTP 错误正文时也保留超时原因', async () => {
    const controller = new AbortController();
    const reason = Object.assign(new Error('deadline'), { code: 'AI_GATEWAY_TIMEOUT' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 503,
        json: async () => {
          controller.abort(reason);
          throw new DOMException('aborted', 'AbortError');
        },
      })),
    );
    await expect(requestDeepSeekStream(messages, { signal: controller.signal })).rejects.toBe(reason);
  });
});
