import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getActiveProviderPricing, requestDeepSeek, requestDeepSeekStream } from './deepseekClient.js';

const ORIGINAL_ENV = { ...process.env };

describe('Agent LLM 供应商切换(AGENT_LLM_PROVIDER)', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
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
});
