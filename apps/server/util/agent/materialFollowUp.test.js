import { describe, expect, it, vi } from 'vitest';
import { classifyMaterialFollowUp, normalizeFollowUpMaterialCandidate } from './materialFollowUp.js';

function response(decision, overrides = {}) {
  return {
    content: '',
    toolCalls: [
      {
        id: 'follow-up-call',
        type: 'function',
        function: { name: 'classify_material_follow_up', arguments: JSON.stringify({ decision }) },
      },
    ],
    usage: { promptTokens: 8, completionTokens: 3, totalTokens: 11 },
    usageStatus: 'reported',
    finishReason: 'tool_calls',
    ...overrides,
  };
}

describe('materialFollowUp', () => {
  it('候选校验：类型白名单、去重、数量上限，无有效项返回 null', () => {
    expect(
      normalizeFollowUpMaterialCandidate({
        contextRefs: [
          { type: 'note', id: 'n1' },
          { type: 'note', id: 'n1' }, // 重复
          { type: 'user', id: 'u1' }, // 非法类型
          { type: 'bookmark', id: '' }, // 空 id
        ],
        scopeRefs: [
          { type: 'note_branch', id: 'branch-1' },
          { type: 'note_branch', id: 'branch-1' }, // 重复
          { type: 'tag_scope', id: 'tag-1' }, // 当前不允许继承标签范围
          { type: 'note_branch', id: '' }, // 空 id
        ],
        attachmentIds: ['a1', 'a1', ''],
      }),
    ).toEqual({
      contextRefs: [{ type: 'note', id: 'n1' }],
      scopeRefs: [{ type: 'note_branch', id: 'branch-1' }],
      attachmentIds: ['a1'],
    });

    const overflow = normalizeFollowUpMaterialCandidate({
      contextRefs: Array.from({ length: 9 }, (_, i) => ({ type: 'note', id: `n${i}` })),
      scopeRefs: Array.from({ length: 9 }, (_, i) => ({ type: 'note_branch', id: `s${i}` })),
      attachmentIds: Array.from({ length: 9 }, (_, i) => `a${i}`),
    });
    expect(overflow.contextRefs).toHaveLength(5);
    expect(overflow.scopeRefs).toHaveLength(3);
    expect(overflow.attachmentIds).toHaveLength(5);

    expect(normalizeFollowUpMaterialCandidate(null)).toBeNull();
    expect(
      normalizeFollowUpMaterialCandidate({ contextRefs: [], scopeRefs: [], attachmentIds: [] }),
    ).toBeNull();
    expect(normalizeFollowUpMaterialCandidate([{ type: 'note', id: 'n1' }])).toBeNull();
  });

  it('受约束语义分类：承接与独立各自可判，历史作为不可信数据传入', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(response('continue_with_materials'))
      .mockResolvedValueOnce(response('independent_request'));

    const followUp = await classifyMaterialFollowUp({
      message: '作者是谁',
      history: [
        { role: 'user', content: '总结这篇文章' },
        { role: 'assistant', content: '这篇文章讲了……' },
      ],
      request,
    });
    const independent = await classifyMaterialFollowUp({ message: '今天深圳天气怎么样', request });

    expect(followUp.decision).toBe('continue_with_materials');
    expect(independent.decision).toBe('independent_request');
    expect(request.mock.calls[0][0][0].content).toContain('不可信数据');
    expect(request.mock.calls[0][0][1].content).toContain('作者是谁');
    expect(request.mock.calls[0][1]).toMatchObject({
      toolChoice: { type: 'function', function: { name: 'classify_material_follow_up' } },
      maxTokens: 256,
      temperature: 0,
    });
  });

  it('协议缺失或非法时显式失败，由调用方决定 fail-open', async () => {
    for (const mocked of [
      { content: '大概是承接吧', toolCalls: [] },
      response('invalid_decision'),
      response('continue_with_materials', {
        toolCalls: [
          {
            id: 'x',
            type: 'function',
            function: {
              name: 'classify_material_follow_up',
              arguments: JSON.stringify({ decision: 'continue_with_materials', extra: 1 }),
            },
          },
        ],
      }),
    ]) {
      await expect(
        classifyMaterialFollowUp({ message: '为什么', request: vi.fn().mockResolvedValue(mocked) }),
      ).rejects.toMatchObject({ code: 'MATERIAL_FOLLOW_UP_INVALID' });
    }
    await expect(classifyMaterialFollowUp({ message: '  ', request: vi.fn() })).rejects.toMatchObject({
      code: 'MATERIAL_FOLLOW_UP_INVALID',
    });
  });
});
