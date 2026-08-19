import { describe, expect, it, vi } from 'vitest';
import { compileAgentTurnSpec } from './intentCompiler.js';

function response(args) {
  return {
    toolCalls: [
      {
        function: { name: 'submit_turn_spec', arguments: typeof args === 'string' ? args : JSON.stringify(args) },
      },
    ],
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    usageStatus: 'reported',
    finishReason: 'tool_calls',
  };
}

const base = {
  version: '2.0',
  requestKind: 'action',
  confidence: 'high',
  goals: [
    {
      id: 'goal-1',
      kind: 'write',
      capabilityDomain: 'todo',
      description: '创建待办',
      targetDescription: '明天提醒交报告',
      dependsOn: [],
    },
  ],
  groundingPolicy: 'general_knowledge',
  missingSlots: [],
  clarificationQuestion: '',
};

describe('Intent Compiler V2', () => {
  it('只接收能力域摘要，不把工具名、资源 ID 或正文放入编译输入', async () => {
    const request = vi.fn().mockResolvedValue(response(base));
    const result = await compileAgentTurnSpec({
      message: '明天提醒我交报告',
      history: [{ role: 'assistant', content: '旧事实' }],
      domainCatalog: [
        { id: 'todo.create', domain: 'todo', effect: 'write', status: 'enabled', description: '创建待办' },
      ],
      contextSummary: { selectedResourceTypes: ['note'], selectedResourceCount: 1 },
      authoritativeGroundingPolicy: 'general_knowledge',
      request,
    });
    expect(result.turnSpec.requestKind).toBe('action');
    const payload = JSON.parse(request.mock.calls[0][0][1].content);
    expect(payload.capabilityDomains).toEqual([
      { domain: 'todo', effects: ['write'], statuses: ['enabled'], descriptions: ['创建待办'] },
    ]);
    expect(request.mock.calls[0][0][1].content).not.toContain('todo.create');
    expect(request.mock.calls[0][1].tools[0].function.parameters.properties.groundingPolicy.enum).toEqual([
      'general_knowledge',
    ]);
  });

  it('I-09：协议损坏时只修复一次，修复成功后返回', async () => {
    const request = vi.fn().mockResolvedValueOnce(response('{bad-json')).mockResolvedValueOnce(response(base));
    const result = await compileAgentTurnSpec({
      message: '创建待办',
      domainCatalog: [{ domain: 'todo', effect: 'write', status: 'enabled' }],
      authoritativeGroundingPolicy: 'general_knowledge',
      request,
    });
    expect(result.attempts).toBe(2);
    expect(request.mock.calls[1][1].trace.stage).toBe('intent_compiler_repair');
  });

  it('第二次重试会带上服务端校验得到的具体语义纠错提示', async () => {
    const readGoal = {
      id: 'read',
      kind: 'read',
      capabilityDomain: 'web',
      description: '读取网页',
      targetDescription: '指定网址',
      dependsOn: [],
    };
    const invalid = response({
      ...base,
      requestKind: 'action',
      goals: [readGoal],
      groundingPolicy: 'current_explicit_only',
    });
    const valid = response({
      ...base,
      requestKind: 'answer',
      goals: [readGoal],
      groundingPolicy: 'current_explicit_only',
    });
    const request = vi.fn().mockResolvedValueOnce(invalid).mockResolvedValueOnce(valid);
    const result = await compileAgentTurnSpec({
      message: '读取这个网址',
      domainCatalog: [{ domain: 'web', effect: 'read', status: 'enabled' }],
      authoritativeGroundingPolicy: 'current_explicit_only',
      request,
    });
    expect(result.attempts).toBe(2);
    expect(request.mock.calls[1][0][0].content).toContain('纯读取请求应使用 answer');
  });

  it('连续两次 malformed 时失败关闭', async () => {
    const request = vi.fn().mockResolvedValue(response('{bad-json'));
    await expect(
      compileAgentTurnSpec({
        message: '帮我处理一下',
        authoritativeGroundingPolicy: 'none',
        request,
      }),
    ).rejects.toMatchObject({ code: 'TURN_SPEC_INVALID' });
    expect(request).toHaveBeenCalledTimes(2);
  });
});
