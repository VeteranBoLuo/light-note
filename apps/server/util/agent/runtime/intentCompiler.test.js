import { describe, expect, it, vi } from 'vitest';
import { __testing, compileAgentTurnSpec } from './intentCompiler.js';

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
      operation: 'create',
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
      contextSummary: { actorRole: 'root', selectedResourceTypes: ['note'], selectedResourceCount: 1 },
      authoritativeGroundingPolicy: 'general_knowledge',
      request,
    });
    expect(result.turnSpec.requestKind).toBe('action');
    const payload = JSON.parse(request.mock.calls[0][0][1].content);
    expect(payload.capabilityDomains).toEqual([
      { domain: 'todo', effects: ['write'], statuses: ['enabled'], descriptions: ['创建待办'] },
    ]);
    expect(request.mock.calls[0][0][1].content).not.toContain('todo.create');
    expect(payload.contextSummary.actorRole).toBe('root');
    expect(request.mock.calls[0][1].tools[0].function.parameters.properties.groundingPolicy.enum).toEqual([
      'general_knowledge',
    ]);
  });

  it('能力域摘要保留域内全部不同能力，不能按注册顺序静默截掉后面的工具', () => {
    const catalog = Array.from({ length: 7 }, (_, index) => ({
      domain: 'account',
      effect: 'read',
      status: 'enabled',
      description: `账号能力 ${index + 1}`,
    }));
    expect(__testing.normalizeDomainCatalog(catalog)[0].descriptions).toEqual(catalog.map((item) => item.description));
  });

  it('I-09：协议损坏时有界修复，修复成功后返回', async () => {
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
      operation: 'read',
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

  it('启动后台检查即使无需确认也编译为 action 写目标，不与读取历史结果混淆', async () => {
    const invalid = response({
      ...base,
      requestKind: 'action',
      goals: [
        {
          id: 'health-check',
          kind: 'read',
          operation: 'read',
          capabilityDomain: 'bookmark',
          description: '立即启动书签死链体检',
          targetDescription: '当前账号全部书签',
          dependsOn: [],
        },
      ],
      groundingPolicy: 'workspace_query',
    });
    const valid = response({
      ...base,
      requestKind: 'action',
      goals: [
        {
          id: 'health-check',
          kind: 'write',
          operation: 'create',
          capabilityDomain: 'bookmark',
          description: '立即启动书签死链体检',
          targetDescription: '当前账号全部书签',
          dependsOn: [],
        },
      ],
      groundingPolicy: 'workspace_query',
    });
    const request = vi.fn().mockResolvedValueOnce(invalid).mockResolvedValueOnce(valid);

    const result = await compileAgentTurnSpec({
      message: '立即检查我现在有哪些失效书签链接。',
      domainCatalog: [
        {
          domain: 'bookmark',
          effect: 'write',
          status: 'enabled',
          description: '立即启动书签死链体检',
        },
      ],
      authoritativeGroundingPolicy: 'workspace_query',
      request,
    });

    expect(result.turnSpec.goals[0]).toMatchObject({ kind: 'write', operation: 'create' });
    expect(request.mock.calls[0][0][0].content).toContain('后台任务属于 action');
    expect(request.mock.calls[1][0][0].content).toContain('即使具体工具无需确认也不能写成 action + read');
  });

  it('把权威笔记 OutputContract 交给编译器，并纠正 mixed/标题追问', async () => {
    const outputContract = { format: 'note_markdown', length: { mode: 'minimum', minChars: 2000 } };
    const readGoal = {
      id: 'read',
      kind: 'read',
      operation: 'read',
      capabilityDomain: 'note',
      description: '读取今天的笔记',
      targetDescription: '今天全部笔记',
      dependsOn: [],
    };
    const noteGoal = {
      id: 'note',
      kind: 'transform',
      operation: 'create',
      capabilityDomain: 'note',
      description: '生成总结笔记',
      targetDescription: 'Markdown 笔记',
      dependsOn: ['read'],
    };
    const invalid = response({
      ...base,
      requestKind: 'mixed',
      goals: [readGoal, noteGoal],
      groundingPolicy: 'workspace_query',
      missingSlots: [{ name: 'title', reason: '没有标题', question: '标题是什么？' }],
      clarificationQuestion: '标题是什么？',
    });
    const valid = response({
      ...base,
      requestKind: 'create_artifact',
      goals: [readGoal, noteGoal],
      groundingPolicy: 'workspace_query',
      missingSlots: [],
      clarificationQuestion: '',
    });
    const request = vi.fn().mockResolvedValueOnce(invalid).mockResolvedValueOnce(valid);

    const result = await compileAgentTurnSpec({
      message: '根据今天全部笔记生成一篇新笔记，至少 2000 字',
      domainCatalog: [
        { domain: 'note', effect: 'read', status: 'enabled', description: '查询笔记' },
        { domain: 'note', effect: 'write', status: 'enabled', description: '创建笔记' },
      ],
      authoritativeGroundingPolicy: 'workspace_query',
      outputContract,
      request,
    });

    expect(result.turnSpec).toMatchObject({ requestKind: 'create_artifact', outputContract });
    expect(JSON.parse(request.mock.calls[0][0][1].content).authoritativeOutputContract).toEqual(outputContract);
    expect(request.mock.calls[1][0][0].content).toContain('笔记标题由草稿生成器自动拟定');
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
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('用户已明确相对时间时，不接受编译器虚构“缺少时间范围”', async () => {
    const invalidArgs = {
      ...base,
      requestKind: 'answer',
      confidence: 'medium',
      goals: [
        {
          id: 'read-users',
          kind: 'read',
          operation: 'read',
          capabilityDomain: 'admin',
          description: '查询新增用户',
          targetDescription: '今天新增用户',
          dependsOn: [],
        },
      ],
      missingSlots: [{ name: 'timeRange', reason: '缺少时间范围', question: '具体查询哪一天？' }],
      clarificationQuestion: '具体查询哪一天？',
    };
    const invalid = response(invalidArgs);
    const valid = response({
      ...invalidArgs,
      confidence: 'high',
      missingSlots: [],
      clarificationQuestion: '',
    });
    const request = vi.fn().mockResolvedValueOnce(invalid).mockResolvedValueOnce(valid);

    const result = await compileAgentTurnSpec({
      message: '今天有多少新用户？',
      domainCatalog: [{ domain: 'admin', effect: 'read', status: 'enabled' }],
      contextSummary: { actorRole: 'root' },
      authoritativeGroundingPolicy: 'general_knowledge',
      request,
    });

    expect(result.attempts).toBe(2);
    expect(request.mock.calls[1][0][0].content).toContain('已经明确给出时间范围');
  });

  it('唯一已选资源的通用分析请求默认执行，不把分析偏好伪装成必填项', async () => {
    const readGoal = {
      id: 'read-selected-resource',
      kind: 'read',
      operation: 'read',
      capabilityDomain: 'web',
      description: '分析已选网页',
      targetDescription: '本轮唯一已选书签',
      dependsOn: [],
    };
    const invalid = response({
      ...base,
      requestKind: 'answer',
      confidence: 'medium',
      goals: [readGoal],
      groundingPolicy: 'current_explicit_only',
      missingSlots: [
        {
          name: 'analysisFocus',
          reason: '没有指定分析侧重点',
          question: '你希望如何分析这个地址？',
        },
      ],
      clarificationQuestion: '你希望如何分析这个地址？',
    });
    const valid = response({
      ...base,
      requestKind: 'answer',
      confidence: 'high',
      goals: [readGoal],
      groundingPolicy: 'current_explicit_only',
      missingSlots: [],
      clarificationQuestion: '',
    });
    const request = vi.fn().mockResolvedValueOnce(invalid).mockResolvedValueOnce(valid);

    const result = await compileAgentTurnSpec({
      message: '分析这个地址',
      domainCatalog: [{ domain: 'web', effect: 'read', status: 'enabled', description: '读取网页正文' }],
      contextSummary: { selectedResourceTypes: ['bookmark'], selectedResourceCount: 1 },
      authoritativeGroundingPolicy: 'current_explicit_only',
      request,
    });

    expect(result).toMatchObject({ attempts: 2, turnSpec: { confidence: 'high', missingSlots: [] } });
    expect(request.mock.calls[1][0][0].content).toContain('唯一已选资源已经确定读取目标');
  });

  it('多个已选资源或非读取目标仍保留真实歧义，不擅自套用默认分析', () => {
    const ambiguous = {
      requestKind: 'answer',
      groundingPolicy: 'current_explicit_only',
      goals: [{ kind: 'read', operation: 'read' }],
      missingSlots: [{ name: 'target', reason: '目标不唯一', question: '分析哪一个？' }],
    };
    expect(
      __testing.contradictedSelectedResourceReadFeedback(ambiguous, {
        selectedResourceTypes: ['bookmark'],
        selectedResourceCount: 2,
      }),
    ).toBe('');
    expect(
      __testing.contradictedSelectedResourceReadFeedback(
        { ...ambiguous, requestKind: 'action', goals: [{ kind: 'write', operation: 'create' }] },
        { selectedResourceTypes: ['bookmark'], selectedResourceCount: 1 },
      ),
    ).toBe('');
    expect(
      __testing.contradictedSelectedResourceReadFeedback(
        {
          ...ambiguous,
          missingSlots: [{ name: 'comparisonTarget', reason: '缺少要对比的另一个网页', question: '与谁对比？' }],
        },
        { selectedResourceTypes: ['bookmark'], selectedResourceCount: 1 },
      ),
    ).toBe('');
  });

  it('“最近/近期”也是完整的相对排序范围，不追问精确日期', () => {
    for (const message of ['查询我最近登录过的设备。', '列出近期保存的书签。']) {
      expect(
        __testing.contradictedMissingSlotFeedback(
          {
            missingSlots: [{ name: 'timeRange', reason: '缺少时间范围', question: '具体哪一天？' }],
          },
          message,
          'user',
        ),
      ).toContain('时间范围');
    }
  });

  it('root 已明确集合对象时，不接受编译器追问某一个具体用户', () => {
    expect(
      __testing.contradictedMissingSlotFeedback(
        {
          missingSlots: [{ name: 'targetUser', reason: '缺少目标用户', question: '具体要查询哪一个用户？' }],
        },
        '今天新增的所有用户都创建了哪些资源？',
        'root',
      ),
    ).toContain('集合用户/平台范围');
    expect(
      __testing.contradictedMissingSlotFeedback(
        {
          missingSlots: [{ name: 'targetUser', reason: '缺少目标用户', question: '具体要查询哪一个用户？' }],
        },
        '查询用户的笔记',
        'root',
      ),
    ).toBe('');
  });

  it('明确只预览且不要创建时，拒绝编译器生成写目标并要求修复为 answer + read', async () => {
    const invalid = response({
      ...base,
      requestKind: 'action',
      goals: [
        {
          id: 'preview-plan',
          kind: 'write',
          operation: 'create',
          capabilityDomain: 'todo',
          description: '预览每天重复提醒计划',
          targetDescription: '每天上午 09:00',
          dependsOn: [],
        },
      ],
    });
    const valid = response({
      ...base,
      requestKind: 'answer',
      goals: [
        {
          id: 'preview-plan',
          kind: 'read',
          operation: 'read',
          capabilityDomain: 'todo',
          description: '只预览每天重复提醒计划',
          targetDescription: '每天上午 09:00',
          dependsOn: [],
        },
      ],
    });
    const request = vi.fn().mockResolvedValueOnce(invalid).mockResolvedValueOnce(valid);

    const result = await compileAgentTurnSpec({
      message: '只预览不要创建：安排每天上午 09:00 重复提醒。',
      domainCatalog: [{ domain: 'todo', effect: 'read', status: 'enabled' }],
      authoritativeGroundingPolicy: 'general_knowledge',
      request,
    });

    expect(result).toMatchObject({ attempts: 2, turnSpec: { requestKind: 'answer' } });
    expect(request.mock.calls[1][0][0].content).toContain('只预览、模拟或不创建/不执行');
  });

  it('即时回顾未要求保存成产物时，拒绝写目标；明确保存为笔记时不套用该约束', async () => {
    const mutationSpec = {
      ...base,
      requestKind: 'action',
      groundingPolicy: 'workspace_query',
      goals: [
        {
          id: 'recap',
          kind: 'write',
          operation: 'create',
          capabilityDomain: 'growth',
          description: '生成本周内容回顾',
          targetDescription: '当前账号',
          dependsOn: [],
        },
      ],
    };
    const readSpec = {
      ...base,
      requestKind: 'answer',
      groundingPolicy: 'workspace_query',
      goals: [
        {
          id: 'recap',
          kind: 'read',
          operation: 'read',
          capabilityDomain: 'growth',
          description: '生成本周内容回顾',
          targetDescription: '当前账号',
          dependsOn: [],
        },
      ],
    };
    const request = vi.fn().mockResolvedValueOnce(response(mutationSpec)).mockResolvedValueOnce(response(readSpec));

    const result = await compileAgentTurnSpec({
      message: '生成我的本周内容回顾。',
      domainCatalog: [{ domain: 'growth', effect: 'read', status: 'enabled' }],
      authoritativeGroundingPolicy: 'workspace_query',
      request,
    });

    expect(result).toMatchObject({ attempts: 2, turnSpec: { requestKind: 'answer' } });
    expect(request.mock.calls[1][0][0].content).toContain('没有要求持久化产物');
    expect(__testing.contradictedReadOnlyIntentFeedback(mutationSpec, '生成本周回顾并保存为一篇新笔记。')).toBe('');
  });
});
