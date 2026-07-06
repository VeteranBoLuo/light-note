import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getActiveProviderPricing, requestDeepSeek, requestDeepSeekStream, looksLikeLeakedToolCall } from './deepseekClient.js';

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

describe('looksLikeLeakedToolCall(工具调用协议泄漏检测)', () => {
  it('命中真实泄漏样例(用户线上遇到的原始文本)', () => {
    const leaked = '你是管理员，我来查询用户列表。\n\n<｜｜DSML｜｜tool_calls>\n<｜｜invoke name="query_users">\n</｜｜invoke>\n</｜｜DSML｜｜tool_calls>';
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
