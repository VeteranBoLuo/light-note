import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  stream: vi.fn(),
  looksLikeLeakedToolCall: vi.fn(() => false),
}));

vi.mock('./deepseekClient.js', () => ({
  requestDeepSeek: mocks.request,
  requestDeepSeekStream: mocks.stream,
  looksLikeLeakedToolCall: mocks.looksLikeLeakedToolCall,
}));

const { generateFinalReply } = await import('./finalReply.js');

describe('generateFinalReply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.looksLikeLeakedToolCall.mockReturnValue(false);
  });

  it('把供应商的多个真实增量原样推送给调用方', async () => {
    mocks.stream.mockImplementation(async (_messages, options) => {
      options.onDelta('第一段');
      options.onDelta('第二段');
      return {
        content: '第一段第二段',
        leakedToolCall: false,
        usage: { promptTokens: 10, completionTokens: 4, totalTokens: 14 },
        usageStatus: 'reported',
        finishReason: 'stop',
      };
    });
    const chunks = [];

    const result = await generateFinalReply({
      messages: [{ role: 'user', content: '测试' }],
      stream: true,
      onDelta: (chunk) => chunks.push(chunk),
    });

    expect(chunks).toEqual(['第一段', '第二段']);
    expect(result).toEqual(
      expect.objectContaining({
        content: '第一段第二段',
        apiCalls: 1,
        finishReason: 'stop',
        usageStatus: 'reported',
        usage: { promptTokens: 10, completionTokens: 4, totalTokens: 14 },
      }),
    );
  });

  it('流中泄漏工具协议时用禁用工具的请求恢复回答并累计用量', async () => {
    mocks.stream.mockResolvedValue({
      content: '',
      leakedToolCall: true,
      usage: { promptTokens: 8, completionTokens: 2, totalTokens: 10 },
      usageStatus: 'reported',
      finishReason: 'stop',
    });
    mocks.request.mockResolvedValue({
      content: '恢复后的回答',
      usage: { promptTokens: 9, completionTokens: 3, totalTokens: 12 },
      usageStatus: 'reported',
      finishReason: 'stop',
    });
    const chunks = [];

    const result = await generateFinalReply({
      messages: [{ role: 'user', content: '测试' }],
      stream: true,
      onDelta: (chunk) => chunks.push(chunk),
    });

    expect(mocks.request).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ content: expect.stringContaining('禁止输出') })]),
      expect.objectContaining({ toolChoice: 'none' }),
    );
    expect(chunks).toEqual(['恢复后的回答']);
    expect(result).toEqual(
      expect.objectContaining({
        content: '恢复后的回答',
        apiCalls: 2,
        usage: { promptTokens: 17, completionTokens: 5, totalTokens: 22 },
      }),
    );
  });

  it('非流式请求也经过独立最终回答并过滤协议泄漏', async () => {
    mocks.request.mockResolvedValue({
      content: '<tool_calls>bad</tool_calls>',
      usage: { promptTokens: 5, completionTokens: 1, totalTokens: 6 },
      usageStatus: 'reported',
      finishReason: 'stop',
    });
    mocks.looksLikeLeakedToolCall.mockReturnValue(true);

    const result = await generateFinalReply({ messages: [], stream: false });

    expect(result.content).toBe('抱歉，无法处理该请求。');
    expect(result.apiCalls).toBe(1);
  });
});
