import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiBasePostMock } = vi.hoisted(() => ({ apiBasePostMock: vi.fn() }));

vi.mock('@/http/request', () => ({ apiBasePost: apiBasePostMock }));

import { fetchAiFollowUps } from './aiFollowUpApi';

describe('aiFollowUpApi', () => {
  beforeEach(() => apiBasePostMock.mockReset());

  it('静默短请求并规范化最多三条追问', async () => {
    apiBasePostMock.mockResolvedValue({
      status: 200,
      data: {
        requestId: 'request-1',
        strategy: 'ai',
        suggestions: [' 继续分析风险 ', '', '列出下一步', '补充负责人', '多余问题'],
      },
    });
    await expect(fetchAiFollowUps('request-1')).resolves.toEqual({
      requestId: 'request-1',
      strategy: 'ai',
      suggestions: ['继续分析风险', '列出下一步', '补充负责人'],
    });
    expect(apiBasePostMock).toHaveBeenCalledWith(
      '/api/chat/agent/follow-ups',
      { requestId: 'request-1' },
      { silent: true, timeout: 4500 },
    );
  });

  it('业务失败交给聊天区固定问题静默降级', async () => {
    apiBasePostMock.mockResolvedValue({ status: 404, msg: '本轮上下文已失效', data: null });
    await expect(fetchAiFollowUps('expired')).rejects.toThrow('本轮上下文已失效');
  });
});
