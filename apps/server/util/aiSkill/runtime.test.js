import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { executeAiSkill } from './runtime.js';

function request() {
  return {
    protocolVersion: 1,
    requestId: crypto.randomUUID(),
    skillId: 'help.answer',
    skillVersion: 1,
    threadId: null,
    input: { question: '问题' },
    scope: { resourceRefs: [] },
    client: { locale: 'zh-CN', timezone: 'Asia/Singapore', surface: 'test' },
  };
}

function resolvedContext(scopeDigest) {
  return {
    identity: {
      actorUserId: 'u-1',
      actorRole: 'user',
      subjectUserId: 'u-1',
      subjectRole: 'user',
      adminContextId: null,
      adminContextMode: 'normal',
    },
    resourceRefs: [],
    scopeDigest,
  };
}

describe('executeAiSkill', () => {
  it('页面已选定 Skill 后只执行该定义，并由一个根 Execution 包住准备与模型调用', async () => {
    const events = [];
    let insideExecution = false;
    const callModel = vi.fn().mockResolvedValue({ kind: 'grounded_markdown', content: '答案 [1]' });
    const skill = {
      id: 'help.answer',
      version: 1,
      domain: 'test',
      effect: 'read',
      modelPolicy: { maxTokens: 6000, temperature: 0.3 },
      validateInput: vi.fn((input) => input),
      prepare: vi.fn(async () => {
        expect(insideExecution).toBe(true);
        return {
          messages: [{ role: 'user', content: '证据' }],
          sources: [{ id: 's-1' }],
          coverage: { complete: true, warnings: [] },
        };
      }),
    };
    const runExecution = vi.fn(async (config, operation) => {
      events.push(['execution', config.skillId]);
      expect(config.billingPolicy).toBe('user');
      insideExecution = true;
      try {
        return await operation();
      } finally {
        insideExecution = false;
      }
    });
    const result = await executeAiSkill(
      request(),
      { user: { id: 'u-1', role: 'user' } },
      {
        resolveSkill: vi.fn(() => skill),
        assertDomainEnabled: vi.fn(),
        resolveContext: vi.fn().mockResolvedValue(resolvedContext('a'.repeat(64))),
        runExecution,
        callModel,
        modelPolicyOverrides: { maxTokens: 4200, timeoutMs: 150000, temperature: 0 },
      },
    );

    expect(events).toEqual([['execution', 'help.answer']]);
    const executionConfig = runExecution.mock.calls[0][0];
    expect(
      executionConfig.resolveResultOutcome({
        coverage: { warnings: ['image_recognition_fallback:file:private-id'] },
      }),
    ).toEqual({ status: 'partial', errorCode: 'IMAGE_RECOGNITION_FALLBACK' });
    expect(executionConfig.resolveResultOutcome({ coverage: { warnings: [] } })).toEqual({ status: 'success' });
    expect(executionConfig.resolveResultOutcome({ coverage: { complete: false, warnings: [] } })).toEqual({
      status: 'partial',
      errorCode: 'AI_SKILL_COVERAGE_PARTIAL',
    });
    expect(skill.prepare).toHaveBeenCalledTimes(1);
    expect(callModel).toHaveBeenCalledTimes(1);
    expect(callModel).toHaveBeenCalledWith(
      expect.objectContaining({ modelPolicy: { maxTokens: 4200, temperature: 0.3, timeoutMs: 150000 } }),
    );
    expect(result).toMatchObject({ status: 'completed', result: { content: '答案 [1]' } });
  });

  it('Context 或 prepare 失败也属于同一个可审计根 Execution', async () => {
    const failure = Object.assign(new Error('资源范围失效'), { code: 'AI_SKILL_SCOPE_STALE' });
    const operationSpy = vi.fn();
    const runExecution = vi.fn(async (_config, operation) => {
      operationSpy();
      return operation();
    });
    const skill = {
      id: 'help.answer',
      version: 1,
      domain: 'test',
      effect: 'read',
      validateInput: (input) => input,
      prepare: vi.fn(),
    };

    await expect(
      executeAiSkill(
        request(),
        { user: { id: 'u-1', role: 'user' } },
        {
          resolveSkill: () => skill,
          assertDomainEnabled: () => {},
          resolveContext: vi.fn().mockRejectedValue(failure),
          runExecution,
        },
      ),
    ).rejects.toBe(failure);

    expect(runExecution).toHaveBeenCalledOnce();
    expect(operationSpy).toHaveBeenCalledOnce();
    expect(skill.prepare).not.toHaveBeenCalled();
  });

  it('服务端内部积分任务可以让固定产物使用系统额度，公开请求仍无法声明该策略', async () => {
    let executionConfig;
    const skill = {
      id: 'help.answer',
      version: 1,
      domain: 'test',
      effect: 'read',
      validateInput: (input) => input,
      prepare: async () => ({
        result: { kind: 'grounded_markdown', content: '固定产物' },
        sources: [],
        coverage: { complete: true, warnings: [] },
        modelCalled: false,
      }),
    };
    await executeAiSkill(
      request(),
      { user: { id: 'u-1', role: 'user' } },
      {
        resolveSkill: () => skill,
        assertDomainEnabled: () => {},
        resolveContext: async () => resolvedContext('e'.repeat(64)),
        runExecution: async (config, operation) => {
          executionConfig = config;
          return operation();
        },
        executionConfigOverrides: { billingPolicy: 'system', systemId: 'toolbox_points' },
      },
    );
    expect(executionConfig).toMatchObject({ billingPolicy: 'system', systemId: 'toolbox_points' });
  });

  it('内部 Skill 拒绝公共调用，但可信 Worker 可按任务选择用户或系统计费', async () => {
    const runExecution = vi.fn(async (_config, operation) => operation());
    const skill = {
      id: 'help.answer',
      version: 1,
      domain: 'test',
      effect: 'read',
      internalOnly: true,
      allowedInternalCallers: ['toolbox_worker'],
      validateInput: (input) => input,
      prepare: async () => ({
        result: { kind: 'grounded_markdown', content: '内部产物' },
        sources: [],
        coverage: { complete: true, warnings: [] },
        modelCalled: false,
      }),
    };
    await expect(
      executeAiSkill(request(), { user: { id: 'u-1', role: 'user' } }, { resolveSkill: () => skill, runExecution }),
    ).rejects.toMatchObject({ code: 'AI_SKILL_INTERNAL_ONLY', status: 403 });
    expect(runExecution).not.toHaveBeenCalled();

    await expect(
      executeAiSkill(
        request(),
        { user: { id: 'u-1', role: 'user' } },
        {
          resolveSkill: () => skill,
          runExecution,
          executionConfigOverrides: { billingPolicy: 'system', systemId: 'toolbox_points' },
        },
      ),
    ).rejects.toMatchObject({ code: 'AI_SKILL_INTERNAL_ONLY', status: 403 });
    expect(runExecution).not.toHaveBeenCalled();

    await expect(
      executeAiSkill(
        request(),
        { user: { id: 'u-1', role: 'user' } },
        {
          resolveSkill: () => skill,
          assertDomainEnabled: () => {},
          resolveContext: async () => resolvedContext('f'.repeat(64)),
          runExecution,
          internalCaller: 'toolbox_worker',
          executionConfigOverrides: { billingPolicy: 'system', systemId: 'toolbox_points' },
        },
      ),
    ).resolves.toMatchObject({ result: { content: '内部产物' } });
    expect(runExecution).toHaveBeenCalledOnce();

    let userBillingConfig;
    await expect(
      executeAiSkill(
        request(),
        { user: { id: 'u-1', role: 'user' } },
        {
          resolveSkill: () => skill,
          assertDomainEnabled: () => {},
          resolveContext: async () => resolvedContext('f'.repeat(64)),
          runExecution: async (config, operation) => {
            userBillingConfig = config;
            return operation();
          },
          internalCaller: 'toolbox_worker',
        },
      ),
    ).resolves.toMatchObject({ result: { content: '内部产物' } });
    expect(userBillingConfig).toMatchObject({ billingPolicy: 'user', skillId: 'help.answer' });
  });

  it('Context-aware Skill 在根 Execution 内按服务端权威范围重编译调用计划', async () => {
    const configureExecution = vi.fn();
    const context = {
      ...resolvedContext('e'.repeat(64)),
      resourceRefs: Array.from({ length: 81 }, (_, index) => ({
        type: 'note',
        id: `n-${index + 1}`,
        version: 'v1',
      })),
    };
    const skill = {
      id: 'tag.analyze',
      version: 1,
      domain: 'tag',
      effect: 'read',
      modelPolicy: { maxTokens: 3_200, temperature: 0.1 },
      providerPlanPolicy: {
        contextAware: true,
        modelGenerationCalls: ({ resourceCount }) => Math.ceil(resourceCount / 40) + 1,
        outputRepairCalls: ({ resourceCount }) => Math.ceil(resourceCount / 40) + 1,
        maxCharsPerResource: 800,
        maxTotalEvidenceChars: 400_000,
      },
      validateInput: (input) => input,
      prepare: async () => ({
        result: { kind: 'grounded_markdown', content: '完成' },
        sources: [],
        coverage: { complete: true, warnings: [] },
        modelCalled: false,
      }),
    };

    const result = await executeAiSkill(
      { ...request(), skillId: 'tag.analyze', scope: { resourceRefs: [{ type: 'tag', id: 'tag-1' }] } },
      { user: { id: 'u-1', role: 'user' } },
      {
        resolveSkill: () => skill,
        assertDomainEnabled: () => {},
        resolveContext: async () => context,
        runExecution: async (_config, operation) => operation(),
        configureExecution,
      },
    );

    expect(configureExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        maxUserProviderCalls: 4,
        maxPlatformProviderCalls: 4,
        providerPlan: expect.objectContaining({
          stages: {
            model_generation: { billingScope: 'user', maxCalls: 4 },
            output_repair: { billingScope: 'platform', maxCalls: 4 },
          },
        }),
      }),
    );
    expect(result.receipt.resourceCount).toBe(81);
  });

  it('Skill 可确定性返回结果而完全不调用模型', async () => {
    const callModel = vi.fn();
    const skill = {
      id: 'help.answer',
      version: 1,
      domain: 'test',
      effect: 'read',
      validateInput: (input) => input,
      prepare: async () => ({
        result: { kind: 'grounded_markdown', content: '没有可靠材料。' },
        sources: [],
        coverage: { complete: false, warnings: ['empty'] },
        modelCalled: false,
      }),
    };
    const result = await executeAiSkill(
      request(),
      { user: { id: 'u-1', role: 'user' } },
      {
        resolveSkill: () => skill,
        assertDomainEnabled: () => {},
        resolveContext: async () => resolvedContext('b'.repeat(64)),
        runExecution: async (_config, operation) => operation(),
        callModel,
      },
    );
    expect(callModel).not.toHaveBeenCalled();
    expect(result.receipt).toMatchObject({ modelCalled: false, writeCommitted: false });
  });

  it('结构化 Skill 可以替换模型适配器并在根 execution 内返回预览', async () => {
    const structured = vi.fn().mockResolvedValue({ kind: 'structured_draft', title: '任务', writeCommitted: false });
    const skill = {
      id: 'help.answer',
      version: 1,
      domain: 'test',
      effect: 'preview',
      modelPolicy: { maxTokens: 500, temperature: 0 },
      validateInput: (input) => input,
      prepare: async () => ({
        messages: [{ role: 'user', content: '生成草稿' }],
        sources: [],
        coverage: { complete: true, warnings: [] },
        callModel: structured,
        structuredTool: { name: 'submit' },
        validateArguments: (value) => value,
      }),
    };
    const result = await executeAiSkill(
      request(),
      { user: { id: 'u-1', role: 'user' } },
      {
        resolveSkill: () => skill,
        assertDomainEnabled: () => {},
        resolveContext: async () => resolvedContext('c'.repeat(64)),
        runExecution: async (_config, operation) => operation(),
      },
    );
    expect(structured).toHaveBeenCalledWith(expect.objectContaining({ structuredTool: { name: 'submit' } }));
    expect(result.status).toBe('preview_ready');
  });

  it('服务端记录真实 Skill 生命周期且范围拒绝不会被记成普通失败', async () => {
    const recordTelemetry = vi.fn().mockResolvedValue({ accepted: true });
    const skill = {
      id: 'help.answer',
      version: 1,
      domain: 'test',
      effect: 'read',
      validateInput: (input) => input,
      prepare: async () => ({ result: { kind: 'text', content: 'ok' }, modelCalled: false }),
    };
    await executeAiSkill(
      request(),
      { user: { id: 'u-1', role: 'user' } },
      {
        resolveSkill: () => skill,
        assertDomainEnabled: () => {},
        resolveContext: async () => resolvedContext('d'.repeat(64)),
        runExecution: async (_config, operation) => operation(),
        recordTelemetry,
      },
    );
    await Promise.resolve();
    expect(recordTelemetry.mock.calls.map(([, payload]) => payload.event)).toEqual([
      'ai_skill_started',
      'ai_skill_completed',
    ]);
    expect(recordTelemetry.mock.calls[1][1].dimensions).toMatchObject({
      skillId: 'help.answer',
      outcome: 'success',
      resourceCountBucket: '0',
    });

    recordTelemetry.mockClear();
    const rejected = Object.assign(new Error('scope'), { code: 'AI_SKILL_SCOPE_STALE' });
    await expect(
      executeAiSkill(
        request(),
        { user: { id: 'u-1', role: 'user' } },
        {
          resolveSkill: () => skill,
          assertDomainEnabled: () => {},
          resolveContext: async () => {
            throw rejected;
          },
          runExecution: async (_config, operation) => operation(),
          recordTelemetry,
        },
      ),
    ).rejects.toBe(rejected);
    await Promise.resolve();
    expect(recordTelemetry.mock.calls.map(([, payload]) => payload.event)).toEqual([
      'ai_skill_started',
      'ai_skill_scope_rejected',
    ]);
  });
});
