import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  getActiveProviderPricing,
  getNoteAssistMaxTokens,
  requestDeepSeek,
  requestDeepSeekStream,
  looksLikeLeakedToolCall,
} from './deepseekClient.js';

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

describe('Agent LLM 供应商切换(AGENT_LLM_PROVIDER)', () => {
  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...ORIGINAL_ENV };
    globalThis.fetch = ORIGINAL_FETCH;
  });

  it('未设置 AGENT_LLM_PROVIDER 时默认走 deepseek,单价 1/2', () => {
    delete process.env.AGENT_LLM_PROVIDER;
    expect(getActiveProviderPricing()).toEqual({ provider: 'deepseek', price: { input: 1, output: 2 } });
  });

  it('AGENT_LLM_PROVIDER=qwen 时单价切换为 0.2/2', () => {
    process.env.AGENT_LLM_PROVIDER = 'qwen';
    expect(getActiveProviderPricing()).toEqual({ provider: 'qwen', price: { input: 0.2, output: 2 } });
  });

  it('未知的 AGENT_LLM_PROVIDER 取值应报错,而不是静默回退', () => {
    process.env.AGENT_LLM_PROVIDER = 'unknown-vendor';
    expect(() => getActiveProviderPricing()).toThrow(/未知的 AGENT_LLM_PROVIDER/);
  });

  it('笔记助手默认给 8K 输出预算，且环境变量只能在供应商安全上限内调整', () => {
    delete process.env.AGENT_LLM_PROVIDER;
    delete process.env.DEEPSEEK_NOTE_ASSIST_MAX_TOKENS;
    delete process.env.NOTE_ASSIST_MAX_TOKENS;
    expect(getNoteAssistMaxTokens()).toBe(8192);

    process.env.DEEPSEEK_NOTE_ASSIST_MAX_TOKENS = '2048';
    expect(getNoteAssistMaxTokens()).toBe(2048);

    process.env.DEEPSEEK_NOTE_ASSIST_MAX_TOKENS = '99999';
    expect(getNoteAssistMaxTokens()).toBe(8192);
  });

  it('切到 qwen 但缺少 DASHSCOPE_API_KEY 时,requestDeepSeek 报错且不发起网络请求', async () => {
    process.env.AGENT_LLM_PROVIDER = 'qwen';
    delete process.env.DASHSCOPE_API_KEY;
    await expect(requestDeepSeek([{ role: 'user', content: 'hi' }])).rejects.toThrow(/DASHSCOPE_API_KEY/);
  });

  it('deepseek 缺少 DEEPSEEK_API_KEY 时,requestDeepSeekStream 报错', async () => {
    delete process.env.AGENT_LLM_PROVIDER;
    delete process.env.DEEPSEEK_API_KEY;
    await expect(requestDeepSeekStream([{ role: 'user', content: 'hi' }], { onDelta: () => {} })).rejects.toThrow(
      /DEEPSEEK_API_KEY/,
    );
  });

  it('测试环境即使存在密钥也禁止使用原生 fetch 连接真实 Provider', async () => {
    delete process.env.AGENT_LLM_PROVIDER;
    process.env.DEEPSEEK_API_KEY = 'should-never-leave-test';
    globalThis.fetch = ORIGINAL_FETCH;
    await expect(requestDeepSeek([{ role: 'user', content: 'hi' }])).rejects.toMatchObject({
      code: 'TEST_PROVIDER_NETWORK_DISABLED',
    });
  });

  it('同步请求返回供应商、模型、finish reason 与真实 usage', async () => {
    delete process.env.AGENT_LLM_PROVIDER;
    process.env.DEEPSEEK_API_KEY = 'test-key';
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    await expect(requestDeepSeek([{ role: 'user', content: 'hi' }])).resolves.toMatchObject({
      content: 'ok',
      provider: 'deepseek',
      finishReason: 'stop',
      usageStatus: 'reported',
      usage: { promptTokens: 11, completionTokens: 7, totalTokens: 18 },
    });
  });

  it('DeepSeek 同步 Planner 显式关闭思考模式，允许强制指定计划工具', async () => {
    delete process.env.AGENT_LLM_PROVIDER;
    process.env.DEEPSEEK_API_KEY = 'test-key';
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '', tool_calls: [] }, finish_reason: 'tool_calls' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await requestDeepSeek([{ role: 'user', content: '查询待办' }], {
      tools: [{ type: 'function', function: { name: 'plan_intent', parameters: { type: 'object' } } }],
      toolChoice: { type: 'function', function: { name: 'plan_intent' } },
    });

    const requestBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(requestBody).toMatchObject({
      model: 'deepseek-v4-flash',
      thinking: { type: 'disabled' },
      tool_choice: { type: 'function', function: { name: 'plan_intent' } },
    });
  });

  it('流式请求解析增量与末尾 usage，不把缺失 usage 记为 0 成功', async () => {
    delete process.env.AGENT_LLM_PROVIDER;
    process.env.DEEPSEEK_API_KEY = 'test-key';
    const sse = [
      'data: {"choices":[{"delta":{"content":"你"},"finish_reason":null}]}',
      'data: {"choices":[{"delta":{"content":"好"},"finish_reason":"stop"}]}',
      'data: {"choices":[],"usage":{"prompt_tokens":9,"completion_tokens":2,"total_tokens":11}}',
      'data: [DONE]',
      '',
    ].join('\n');
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(sse, { status: 200 }));
    const chunks = [];
    const result = await requestDeepSeekStream([{ role: 'user', content: 'hi' }], {
      onDelta: (chunk) => chunks.push(chunk),
    });
    expect(chunks.join('')).toBe('你好');
    expect(result).toMatchObject({
      content: '你好',
      finishReason: 'stop',
      usageStatus: 'reported',
      usage: { promptTokens: 9, completionTokens: 2, totalTokens: 11 },
    });
    const requestBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(requestBody).toMatchObject({
      model: 'deepseek-v4-flash',
      thinking: { type: 'disabled' },
      stream: true,
    });
  });

  it('千问备用供应商继续使用自身的非思考参数，不混入 DeepSeek thinking 字段', async () => {
    process.env.AGENT_LLM_PROVIDER = 'qwen';
    process.env.DASHSCOPE_API_KEY = 'test-key';
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await requestDeepSeek([{ role: 'user', content: 'hi' }]);

    const requestBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(requestBody).toMatchObject({
      model: 'qwen3.5-flash',
      enable_thinking: false,
    });
    expect(requestBody).not.toHaveProperty('thinking');
  });

  it('首字长期未到时返回可识别的超时码，并清理流式计时器', async () => {
    delete process.env.AGENT_LLM_PROVIDER;
    process.env.DEEPSEEK_API_KEY = 'test-key';
    vi.useFakeTimers();
    globalThis.fetch = vi.fn(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
        }),
    );

    const pending = requestDeepSeekStream([{ role: 'user', content: 'hi' }], { onDelta: () => {} });
    // 先挂上 rejection handler，再推进假时钟，避免 Vitest 把预期中的超时视为未处理异常。
    const timeoutExpectation = expect(pending).rejects.toMatchObject({
      name: 'TimeoutError',
      code: 'AI_FIRST_TOKEN_TIMEOUT',
    });
    await vi.advanceTimersByTimeAsync(60_000);

    await timeoutExpectation;
  });

  it('流式响应中的 DSML 标记被拆分时也不会泄漏给前端', async () => {
    delete process.env.AGENT_LLM_PROVIDER;
    process.env.DEEPSEEK_API_KEY = 'test-key';
    const sse = [
      'data: {"choices":[{"delta":{"content":"好的，我来整理。\\n"},"finish_reason":null}]}',
      'data: {"choices":[{"delta":{"content":"<｜｜DS"},"finish_reason":null}]}',
      'data: {"choices":[{"delta":{"content":"ML｜｜tool_calls><｜｜invoke name=\\"get_growth\\">"},"finish_reason":"stop"}]}',
      'data: [DONE]',
      '',
    ].join('\n');
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(sse, { status: 200 }));
    const chunks = [];
    const result = await requestDeepSeekStream([{ role: 'user', content: '生成本周回顾' }], {
      onDelta: (chunk) => chunks.push(chunk),
    });
    expect(chunks.join('')).toBe('好的，我来整理。\n');
    expect(result).toMatchObject({
      content: '好的，我来整理。\n',
      leakedToolCall: true,
    });
  });
});

describe('looksLikeLeakedToolCall(工具调用协议泄漏检测)', () => {
  it('命中真实泄漏样例(用户线上遇到的原始文本)', () => {
    const leaked =
      '你是管理员，我来查询用户列表。\n\n<｜｜DSML｜｜tool_calls>\n<｜｜invoke name="query_users">\n</｜｜invoke>\n</｜｜DSML｜｜tool_calls>';
    expect(looksLikeLeakedToolCall(leaked)).toBe(true);
  });

  it('正常中文回答不误判', () => {
    expect(looksLikeLeakedToolCall('当前平台共有 46 个用户，其中 root 1 个、admin 44 个、visitor 1 个。')).toBe(false);
  });

  it('正常回答提到"调用"/"invoke"等词但不构成泄漏特征,不误判', () => {
    expect(looksLikeLeakedToolCall('我需要调用 invoke 一下这个函数来查询数据')).toBe(false);
  });

  it('只有特殊竖线但不含工具调用关键词,不误判(避免误伤正常内容里偶尔出现的全角符号)', () => {
    expect(looksLikeLeakedToolCall('这是一段包含｜符号的普通文本')).toBe(false);
  });

  it('非字符串/空值安全返回 false', () => {
    expect(looksLikeLeakedToolCall(null)).toBe(false);
    expect(looksLikeLeakedToolCall(undefined)).toBe(false);
    expect(looksLikeLeakedToolCall('')).toBe(false);
  });
});
