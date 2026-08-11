import { describe, expect, it } from 'vitest';
import { createInternalActionContinuationRequest, resolveAutomaticActionContinuation } from './actionContinuation';
import type { AiToolConfirmationResolution } from '@/types/aiAgent';

function resolution(policy: 'terminal' | 'final_reply' | 'resume_plan'): AiToolConfirmationResolution {
  return {
    toolName: 'create_todo',
    summary: '待办已创建',
    sources: [],
    receipt: {
      actionId: 'confirmation-1',
      toolName: 'create_todo',
      status: 'succeeded',
      summary: '待办已创建',
      completedAt: new Date().toISOString(),
    },
    continuation: {
      schemaVersion: 1,
      token: 'continuation-token',
      policy,
    },
  };
}

describe('actionContinuation', () => {
  it('只让 final_reply 自动形成内部续答', () => {
    expect(resolveAutomaticActionContinuation(resolution('final_reply'))).toMatchObject({
      token: 'continuation-token',
      policy: 'final_reply',
    });
    expect(resolveAutomaticActionContinuation(resolution('terminal'))).toBeNull();
    expect(resolveAutomaticActionContinuation(resolution('resume_plan'))).toBeNull();
  });

  it('内部续答只发送令牌，不伪造用户控制语句', () => {
    expect(createInternalActionContinuationRequest(resolution('final_reply').continuation!)).toEqual({
      message: '',
      trigger: 'card_continuation',
      continuationToken: 'continuation-token',
    });
  });

  it('缺少令牌时保持原卡片结算行为', () => {
    const input = resolution('final_reply');
    input.continuation = { ...input.continuation!, token: '' };
    expect(resolveAutomaticActionContinuation(input)).toBeNull();
  });
});
