import { describe, expect, it, vi } from 'vitest';

const apiBasePost = vi.fn();
vi.mock('@/http/request.ts', () => ({ apiBasePost: (...args: unknown[]) => apiBasePost(...args) }));

const { buildChainSteps, fetchAgentLogChain, formatAnswerChars, formatAnswerDigest, formatDeliveredLabel, outcomeMeta } =
  await import('./agentLogOutcome.ts');

describe('结果轮廓展示口径', () => {
  it('把内部枚举翻译成后台文案，未知值不显示成空白', () => {
    expect(outcomeMeta('confirmation_card').label).toBe('已发确认卡');
    expect(outcomeMeta('answer').tone).toBe('success');
    expect(outcomeMeta('empty').tone).toBe('danger');
    // 迁移前的历史记录没有 outcome_kind，必须有可读兜底而不是空字符串
    expect(outcomeMeta(null).label).toBe('未记录');
    expect(outcomeMeta('semantic_planned').label).toBe('未记录');
  });

  it('区分「没有正文」与「摘要已过保留期」', () => {
    expect(formatAnswerDigest({ answerDigest: '笔记草稿已准备好。', answerChars: 180 })).toBe('笔记草稿已准备好。');
    // 轮廓字段说明本轮确实产出过 180 字，但摘要被保留期清空了
    expect(formatAnswerDigest({ answerDigest: null, answerChars: 180 })).toContain('已过保留期');
    expect(formatAnswerDigest({ answerDigest: null, answerChars: 0 })).toBe('本轮没有对话正文');
  });

  it('送达状态与字数缺失时不伪装成 0', () => {
    expect(formatDeliveredLabel(1)).toBe('已送达客户端');
    expect(formatDeliveredLabel(0)).toContain('未送达');
    expect(formatDeliveredLabel(null)).toBe('未记录');
    expect(formatAnswerChars({ answerChars: 1234 })).toBe('1,234 字');
    expect(formatAnswerChars({ answerChars: null })).toBe('未记录');
  });
});

describe('动作时间线', () => {
  it('把发卡与用户处置翻译成可读的一条链路', () => {
    const steps = buildChainSteps(
      [
        {
          id: 'log-1',
          taskType: 'agent',
          status: 'confirmation_pending',
          outcomeKind: 'confirmation_card',
          toolsUsed: '[{"name":"create_note","status":"confirmation_required"}]',
          delivered: 1,
          createdAt: '2026-08-05T11:44:19.000Z',
        },
        {
          id: 'log-2',
          taskType: 'agent_confirmation',
          status: 'success',
          outcomeKind: 'action_only',
          toolsUsed: '[{"name":"create_note","status":"success"}]',
          delivered: 1,
          createdAt: '2026-08-05T11:44:34.000Z',
        },
      ],
      'log-1',
    );

    expect(steps[0]).toMatchObject({
      title: '发出确认卡（create_note）',
      tone: 'warning',
      isCurrent: true,
    });
    expect(steps[0].detail).toContain('等待用户处置');
    expect(steps[1]).toMatchObject({
      title: '用户确认，执行成功（create_note）',
      tone: 'success',
      isCurrent: false,
    });
  });

  it('卡片生成后连接已断开时标成危险而不是等待中', () => {
    const [step] = buildChainSteps(
      [{ id: 'log-1', outcomeKind: 'confirmation_card', toolsUsed: '[]', delivered: 0, createdAt: '' }],
      'log-1',
    );
    expect(step.tone).toBe('danger');
    expect(step.detail).toContain('用户没有收到');
  });

  it('驳回与执行失败各自可辨，失败带出错误码', () => {
    const [rejected] = buildChainSteps(
      [{ id: 'a', taskType: 'agent_confirmation', status: 'confirmation_rejected', toolsUsed: '[]' }],
      'a',
    );
    expect(rejected.title).toBe('用户驳回');
    expect(rejected.tone).toBe('neutral');

    const [failed] = buildChainSteps(
      [
        {
          id: 'b',
          taskType: 'agent_confirmation',
          status: 'error',
          errorMsg: 'DUPLICATE_TITLE',
          toolsUsed: '[{"name":"create_note","status":"error"}]',
        },
      ],
      'b',
    );
    expect(failed.title).toBe('用户确认，执行失败（create_note）');
    expect(failed.detail).toBe('DUPLICATE_TITLE');
    expect(failed.tone).toBe('danger');
  });

  it('工具字段损坏时仍能渲染，不抛异常', () => {
    const [step] = buildChainSteps([{ id: 'a', outcomeKind: 'confirmation_card', toolsUsed: '{不是JSON' }], 'a');
    expect(step.title).toBe('发出确认卡');
  });
});

describe('链路拉取', () => {
  it('单轮问答没有链路可看时不发请求', async () => {
    apiBasePost.mockClear();
    const steps = await fetchAgentLogChain({
      id: 'log-1',
      requestId: 'req-1',
      correlationId: 'req-1',
      confirmationId: null,
    });
    expect(steps).toEqual([]);
    expect(apiBasePost).not.toHaveBeenCalled();
  });

  it('只有一条记录时不显示时间线，避免出现只有自己的「链路」', async () => {
    apiBasePost.mockClear();
    apiBasePost.mockResolvedValue({ status: 200, data: { items: [{ id: 'log-1', outcomeKind: 'answer' }] } });
    const steps = await fetchAgentLogChain({
      id: 'log-1',
      requestId: 'req-1',
      correlationId: 'origin-1',
      confirmationId: 'confirm-1',
    });
    expect(apiBasePost).toHaveBeenCalledWith(
      '/api/common/getAgentLogChain',
      { correlationId: 'origin-1' },
      { silent: true },
    );
    expect(steps).toEqual([]);
  });

  it('接口失败时返回空链路而不是抛给详情弹窗', async () => {
    apiBasePost.mockClear();
    apiBasePost.mockResolvedValue({ status: 500, data: null });
    await expect(
      fetchAgentLogChain({ id: 'log-1', requestId: 'req-1', correlationId: 'origin-1', confirmationId: 'confirm-1' }),
    ).resolves.toEqual([]);
  });
});
