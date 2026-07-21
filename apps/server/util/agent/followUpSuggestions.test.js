import { describe, expect, it, vi } from 'vitest';

vi.mock('../redisClient.js', () => ({
  default: {
    get: vi.fn().mockResolvedValue(null),
    setEx: vi.fn().mockResolvedValue('OK'),
  },
}));

const {
  buildFallbackQuestions,
  getFollowUpSuggestions,
  parseFollowUpQuestions,
  shouldOfferFollowUps,
  storeFollowUpContext,
} = await import('./followUpSuggestions.js');

describe('followUpSuggestions', () => {
  it('解析结构化追问并过滤重复、原问题和破坏性建议', () => {
    const raw =
      '```json\n{"questions":["按主题归纳这些笔记","按主题归纳这些笔记","原问题","删除全部笔记","提取其中的待办"]}\n```';
    expect(parseFollowUpQuestions(raw, { originalQuestion: '原问题', locale: 'zh' })).toEqual([
      '按主题归纳这些笔记',
      '提取其中的待办',
    ]);
  });

  it('根据工具和来源构造有上下文的规则降级问题', () => {
    expect(
      buildFallbackQuestions({
        locale: 'zh-CN',
        tools: [{ name: 'query_link_health' }],
        sources: [{ type: 'bookmark' }],
      }),
    ).toEqual(['把这些失效书签按原因分类', '哪些失效链接最需要优先处理？', '这些失效书签分别该怎么处理？']);
  });

  it('待确认、回答过短和错误回答不生成追问', () => {
    expect(shouldOfferFollowUps({ answer: '正常且足够长的回答内容，可以继续进行深入分析。' })).toBe(true);
    expect(shouldOfferFollowUps({ answer: '太短' })).toBe(false);
    expect(shouldOfferFollowUps({ answer: '抱歉，我暂时无法处理这个请求，请稍后再试。' })).toBe(false);
    expect(
      shouldOfferFollowUps({ answer: '正常且足够长的回答内容，可以继续进行深入分析。', confirmations: [{}] }),
    ).toBe(false);
  });

  it('保存服务端上下文后生成三条追问并复用缓存', async () => {
    const requestId = '11111111-1111-4111-8111-111111111111';
    expect(
      storeFollowUpContext({
        ownerKey: 'user:u1',
        requestId,
        question: '帮我总结这些笔记',
        answer: '这些笔记主要围绕项目计划、风险和后续行动展开，需要继续细化负责人和时间节点。',
        locale: 'zh-CN',
        tools: [{ name: 'query_notes', status: 'success' }],
        sources: [{ type: 'note', title: '项目计划' }],
      }),
    ).toBe(true);
    const request = vi.fn().mockResolvedValue({
      content: '{"questions":["按优先级整理行动项","补充每项任务的负责人","生成一份本周执行计划"]}',
      usage: { promptTokens: 80, completionTokens: 30, totalTokens: 110 },
      usageStatus: 'reported',
      finishReason: 'stop',
    });
    const first = await getFollowUpSuggestions({ ownerKey: 'user:u1', requestId, request });
    const second = await getFollowUpSuggestions({ ownerKey: 'user:u1', requestId, request });
    expect(first.suggestions).toEqual(['按优先级整理行动项', '补充每项任务的负责人', '生成一份本周执行计划']);
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        trace: expect.objectContaining({ traceId: requestId, taskType: 'follow_up' }),
        governance: {
          quotaPolicy: 'system',
          systemId: 'follow_up',
          taskType: 'follow_up',
          requestId,
        },
      }),
    );
  });

  it('不同所有者不能读取同一 requestId 的上下文', async () => {
    const requestId = '22222222-2222-4222-8222-222222222222';
    storeFollowUpContext({
      ownerKey: 'user:u1',
      requestId,
      question: '分析我的文件',
      answer: '文件已经完成分析，主要内容包括需求、范围、风险以及下一步计划。',
    });
    await expect(getFollowUpSuggestions({ ownerKey: 'user:u2', requestId, request: vi.fn() })).rejects.toMatchObject({
      code: 'FOLLOW_UP_CONTEXT_NOT_FOUND',
    });
  });

  it('模型超时或失败时返回上下文规则问题，不阻断主回答', async () => {
    const requestId = '33333333-3333-4333-8333-333333333333';
    storeFollowUpContext({
      ownerKey: 'user:u3',
      requestId,
      question: '检查我的失效书签',
      answer: '检查已经完成，其中有几条链接无法访问，建议按失败原因逐项处理。',
      tools: [{ name: 'query_link_health', status: 'success' }],
    });
    const result = await getFollowUpSuggestions({
      ownerKey: 'user:u3',
      requestId,
      request: vi.fn().mockRejectedValue(Object.assign(new Error('timeout'), { code: 'AI_TIMEOUT' })),
    });
    expect(result).toMatchObject({
      strategy: 'fallback',
      suggestions: ['把这些失效书签按原因分类', '哪些失效链接最需要优先处理？', '这些失效书签分别该怎么处理？'],
      generationError: 'AI_TIMEOUT',
    });
  });

  it('同一轮并发请求只调用一次模型，后到请求视为缓存复用', async () => {
    const requestId = '44444444-4444-4444-8444-444444444444';
    storeFollowUpContext({
      ownerKey: 'user:u4',
      requestId,
      question: '总结项目资料',
      answer: '项目资料已经完成总结，重点包括范围、风险、时间表和待确认事项。',
    });
    let release;
    const request = vi.fn(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              content: '{"questions":["继续梳理项目风险","列出待确认事项","生成执行时间表"]}',
              usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
              usageStatus: 'reported',
            });
        }),
    );
    const first = getFollowUpSuggestions({ ownerKey: 'user:u4', requestId, request });
    const second = getFollowUpSuggestions({ ownerKey: 'user:u4', requestId, request });
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    release();
    await expect(first).resolves.toMatchObject({ cached: false });
    await expect(second).resolves.toMatchObject({ cached: true });
  });
});
