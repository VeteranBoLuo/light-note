import { describe, expect, it, vi } from 'vitest';
import {
  buildExecutionPlanToolDefinition,
  buildPlannerTemporalContext,
  normalizePlannerExecutionContext,
  planAgentExecution,
} from './executionPlanner.js';
import { validateExecutionPlan } from './planValidator.js';

const queryTool = {
  name: 'query_todos',
  isWrite: false,
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: { keyword: { type: 'string' } },
    required: ['keyword'],
  },
};
const writeTool = {
  name: 'set_todo_status',
  isWrite: true,
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: { todoId: { type: 'string' }, status: { type: 'string' } },
    required: ['todoId', 'status'],
  },
};
const turnSpec = {
  version: '2.0',
  digest: 'digest-1',
  requestKind: 'action',
  groundingPolicy: 'general_knowledge',
  outputContract: null,
  goals: [
    { id: 'read-target', kind: 'read', capabilityDomain: 'todo', dependsOn: [] },
    { id: 'write-target', kind: 'write', capabilityDomain: 'todo', dependsOn: ['read-target'] },
  ],
};
const route = {
  state: 'ready',
  candidates: [queryTool, writeTool],
  goalRoutes: [
    { goalId: 'read-target', status: 'ready', toolNames: ['query_todos'] },
    { goalId: 'write-target', status: 'ready', toolNames: ['set_todo_status'] },
  ],
};

function response(plan, extraCalls = []) {
  return {
    toolCalls: [{ function: { name: 'submit_execution_plan', arguments: JSON.stringify(plan) } }, ...extraCalls],
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    finishReason: 'tool_calls',
  };
}

describe('Execution Planner / Validator V2', () => {
  it('向 Planner 注入可信时区时钟，并把业务参数错误反馈给有界修复轮', async () => {
    const temporalTool = {
      ...queryTool,
      validatePlanArgs(args) {
        if (args.keyword !== 'resolved') {
          const error = new Error('args.keyword 必须根据当前日期换算为具体值。');
          error.code = 'TEST_RELATIVE_TIME_UNRESOLVED';
          throw error;
        }
      },
    };
    const temporalSpec = {
      ...turnSpec,
      requestKind: 'answer',
      goals: [turnSpec.goals[0]],
    };
    const temporalRoute = {
      state: 'ready',
      candidates: [temporalTool],
      goalRoutes: [{ goalId: 'read-target', status: 'ready', toolNames: ['query_todos'] }],
    };
    const makePlan = (keyword) =>
      response({
        version: '2.0',
        turnSpecDigest: 'digest-1',
        steps: [
          {
            id: 'read-step',
            goalId: 'read-target',
            toolName: 'query_todos',
            arguments: { keyword },
            dependsOn: [],
            expectedResultKind: 'todo_list',
          },
        ],
        deferredGoalIds: [],
        unsupportedGoalIds: [],
      });
    const request = vi.fn().mockResolvedValueOnce(makePlan('tomorrow')).mockResolvedValueOnce(makePlan('resolved'));

    const result = await planAgentExecution({
      message: '查询明天要处理的报告，不要读取任何历史请求。',
      turnSpec: temporalSpec,
      route: temporalRoute,
      timeZone: 'Asia/Shanghai',
      now: new Date('2026-08-19T12:34:56Z'),
      executionContext: { contextRefs: [{ type: 'note', id: 'note-1' }], attachmentIds: ['attachment-1'] },
      request,
      validate: validateExecutionPlan,
    });

    expect(result).toMatchObject({ attempts: 2, validation: { valid: true } });
    const firstPayload = JSON.parse(request.mock.calls[0][0][1].content);
    const repairPayload = JSON.parse(request.mock.calls[1][0][1].content);
    expect(firstPayload.temporalContext).toEqual({
      timeZone: 'Asia/Shanghai',
      storageTimeZone: 'Asia/Shanghai',
      currentDate: '2026-08-19',
      currentDateTime: '2026-08-19 20:34:56',
      currentInstant: '2026-08-19T12:34:56.000Z',
    });
    expect(firstPayload.availableContext).toEqual({
      contextRefs: [{ type: 'note', id: 'note-1' }],
      attachmentIds: ['attachment-1'],
    });
    expect(firstPayload.latestMessage).toBe('查询明天要处理的报告，不要读取任何历史请求。');
    expect(firstPayload).not.toHaveProperty('history');
    expect(repairPayload.previousValidation).toMatchObject({
      issues: expect.arrayContaining(['TEST_RELATIVE_TIME_UNRESOLVED']),
      feedback: [expect.objectContaining({ toolName: 'query_todos' })],
    });
  });

  it('非法客户端时区不会进入 Planner，统一回退到服务端默认时区', () => {
    expect(
      buildPlannerTemporalContext({ timeZone: 'not/a-timezone', now: new Date('2026-08-19T00:00:00Z') }),
    ).toMatchObject({ timeZone: 'Asia/Shanghai', currentDate: '2026-08-19' });
  });

  it('执行上下文去重并限制为可控的稳定引用', () => {
    expect(
      normalizePlannerExecutionContext({
        contextRefs: [
          { type: 'note', id: 'n1' },
          { type: 'note', id: 'n1' },
          { type: '', id: 'invalid' },
        ],
        attachmentIds: ['a1', 'a1', ''],
      }),
    ).toEqual({ contextRefs: [{ type: 'note', id: 'n1' }], attachmentIds: ['a1'] });
  });

  it('附件参数只能由服务端已校验的本轮上下文绑定', () => {
    const attachmentTool = {
      name: 'create_image_note',
      isWrite: true,
      resourceBindings: [{ argument: 'attachmentId', refType: 'attachment', sourceField: 'id' }],
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: { attachmentId: { type: 'string' }, title: { type: 'string' } },
        required: ['attachmentId'],
      },
    };
    const attachmentSpec = {
      ...turnSpec,
      requestKind: 'create_artifact',
      goals: [{ id: 'image', kind: 'transform', capabilityDomain: 'note', dependsOn: [] }],
    };
    const attachmentRoute = {
      state: 'ready',
      candidates: [attachmentTool],
      goalRoutes: [{ goalId: 'image', status: 'ready', toolNames: ['create_image_note'] }],
    };
    const parsed = {
      invalid: false,
      extraCalls: [],
      plan: {
        version: '2.0',
        turnSpecDigest: 'digest-1',
        steps: [
          {
            id: 'image-step',
            goalId: 'image',
            toolName: 'create_image_note',
            arguments: { title: '现场记录' },
            dependsOn: [],
            expectedResultKind: 'confirmation',
          },
        ],
        deferredGoalIds: [],
        unsupportedGoalIds: [],
      },
    };
    const single = validateExecutionPlan({
      turnSpec: attachmentSpec,
      route: attachmentRoute,
      parsed,
      executionContext: { attachmentIds: ['attachment-1'] },
    });
    expect(single.valid).toBe(true);
    expect(JSON.parse(single.toolCalls[0].function.arguments)).toMatchObject({ attachmentId: 'attachment-1' });

    parsed.plan.steps[0].arguments = { attachmentId: 'model-invented', title: '现场记录' };
    const overridden = validateExecutionPlan({
      turnSpec: attachmentSpec,
      route: attachmentRoute,
      parsed,
      executionContext: { attachmentIds: ['attachment-1'] },
    });
    expect(overridden.valid).toBe(true);
    expect(JSON.parse(overridden.toolCalls[0].function.arguments)).toMatchObject({ attachmentId: 'attachment-1' });

    expect(
      validateExecutionPlan({
        turnSpec: attachmentSpec,
        route: attachmentRoute,
        parsed,
        executionContext: { attachmentIds: ['attachment-1', 'attachment-2'] },
      }).issues,
    ).toContain('TOOL_RESOURCE_SELECTION_REQUIRED');

    expect(
      validateExecutionPlan({
        turnSpec: attachmentSpec,
        route: attachmentRoute,
        parsed,
        executionContext: { attachmentIds: [] },
      }).issues,
    ).toContain('TOOL_RESOURCE_CONTEXT_REQUIRED');
  });

  it('可选资源绑定不会被误升级为必填，也不会采纳模型编造的资源 ID', () => {
    const optionalResourceTool = {
      name: 'query_todos',
      isWrite: false,
      resourceBindings: [{ argument: 'todoId', refType: 'todo', sourceField: 'id' }],
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: { todoId: { type: 'string' }, status: { type: 'string' } },
      },
    };
    const optionalSpec = {
      ...turnSpec,
      requestKind: 'answer',
      goals: [{ id: 'read-target', kind: 'read', capabilityDomain: 'todo', dependsOn: [] }],
    };
    const optionalRoute = {
      state: 'ready',
      candidates: [optionalResourceTool],
      goalRoutes: [{ goalId: 'read-target', status: 'ready', toolNames: ['query_todos'] }],
    };
    const plannerStepSchema = buildExecutionPlanToolDefinition({
      turnSpec: optionalSpec,
      route: optionalRoute,
      candidateTools: [optionalResourceTool],
    }).function.parameters.properties.steps.items;
    expect(plannerStepSchema.properties.arguments.properties).not.toHaveProperty('todoId');
    expect(plannerStepSchema.properties.arguments.properties).toHaveProperty('status');
    const parsed = {
      invalid: false,
      extraCalls: [],
      plan: {
        version: '2.0',
        turnSpecDigest: 'digest-1',
        steps: [
          {
            id: 'read-step',
            goalId: 'read-target',
            toolName: 'query_todos',
            arguments: { status: 'pending' },
            dependsOn: [],
            expectedResultKind: 'todo_list',
          },
        ],
        deferredGoalIds: [],
        unsupportedGoalIds: [],
      },
    };

    const workspaceQuery = validateExecutionPlan({
      turnSpec: optionalSpec,
      route: optionalRoute,
      parsed,
      executionContext: {},
    });
    expect(workspaceQuery.valid).toBe(true);
    expect(JSON.parse(workspaceQuery.toolCalls[0].function.arguments)).toEqual({ status: 'pending' });

    parsed.plan.steps[0].arguments.todoId = 'model-invented';
    const inventedOptionalId = validateExecutionPlan({
      turnSpec: optionalSpec,
      route: optionalRoute,
      parsed,
      executionContext: {},
    });
    expect(inventedOptionalId.valid).toBe(true);
    expect(JSON.parse(inventedOptionalId.toolCalls[0].function.arguments)).toEqual({ status: 'pending' });
  });

  it('通用资源绑定只向 Planner 暴露稳定引用，并由服务端注入书签 URL', async () => {
    const readUrlTool = {
      name: 'read_url',
      isWrite: false,
      resourceBindings: [{ argument: 'url', refTypes: ['bookmark', 'web'], sourceField: 'url', allowLiteral: true }],
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: { url: { type: 'string' } },
        required: ['url'],
      },
    };
    const readSpec = {
      ...turnSpec,
      requestKind: 'answer',
      goals: [{ id: 'read-target', kind: 'read', capabilityDomain: 'web', dependsOn: [] }],
    };
    const readRoute = {
      state: 'ready',
      candidates: [readUrlTool],
      goalRoutes: [{ goalId: 'read-target', status: 'ready', toolNames: ['read_url'] }],
    };
    const request = vi.fn().mockResolvedValue(
      response({
        version: '2.0',
        turnSpecDigest: 'digest-1',
        steps: [
          {
            id: 'read-step',
            goalId: 'read-target',
            toolName: 'read_url',
            arguments: { url: 'https://model-invented.invalid' },
            dependsOn: [],
            expectedResultKind: 'web_page',
          },
        ],
        deferredGoalIds: [],
        unsupportedGoalIds: [],
      }),
    );
    const result = await planAgentExecution({
      message: '分析这个地址',
      turnSpec: readSpec,
      route: readRoute,
      executionContext: {
        contextRefs: [{ type: 'bookmark', id: 'bookmark-1' }],
        resources: [
          { type: 'bookmark', id: 'bookmark-1', values: { url: 'https://www.baidu.com', description: 'secret' } },
        ],
      },
      request,
      validate: validateExecutionPlan,
    });

    expect(result.validation).toMatchObject({ valid: true });
    expect(JSON.parse(result.validation.toolCalls[0].function.arguments)).toEqual({ url: 'https://www.baidu.com' });
    const payload = JSON.parse(request.mock.calls[0][0][1].content);
    expect(payload.availableContext).toEqual({
      contextRefs: [{ type: 'bookmark', id: 'bookmark-1' }],
      attachmentIds: [],
      resourceBindings: [
        {
          toolName: 'read_url',
          argument: 'url',
          refs: [{ type: 'bookmark', id: 'bookmark-1' }],
        },
      ],
    });
    expect(JSON.stringify(payload)).not.toContain('https://www.baidu.com');
    expect(JSON.stringify(payload)).not.toContain('secret');
    const stepSchema = request.mock.calls[0][1].tools[0].function.parameters.properties.steps.items;
    expect(stepSchema.properties.arguments.required).toEqual([]);
    expect(stepSchema.properties.argumentBindings).toBeTruthy();

    const inheritedWeb = validateExecutionPlan({
      turnSpec: readSpec,
      route: readRoute,
      parsed: {
        invalid: false,
        extraCalls: [],
        plan: {
          version: '2.0',
          turnSpecDigest: 'digest-1',
          steps: [
            {
              id: 'read-inherited-web',
              goalId: 'read-target',
              toolName: 'read_url',
              arguments: {},
              dependsOn: [],
              expectedResultKind: 'web_page',
            },
          ],
          deferredGoalIds: [],
          unsupportedGoalIds: [],
        },
      },
      executionContext: {
        contextRefs: [{ type: 'web', id: 'https://www.baidu.com/' }],
        resources: [
          {
            type: 'web',
            id: 'https://www.baidu.com/',
            values: { url: 'https://www.baidu.com/' },
          },
        ],
      },
    });
    expect(inheritedWeb.valid).toBe(true);
    expect(JSON.parse(inheritedWeb.toolCalls[0].function.arguments)).toEqual({ url: 'https://www.baidu.com/' });
  });

  it('多资源必须选本轮稳定引用；没有资源时仅声明允许 literal 的工具可直接使用参数', () => {
    const tool = {
      name: 'read_url',
      isWrite: false,
      resourceBindings: [{ argument: 'url', refType: 'bookmark', sourceField: 'url', allowLiteral: true }],
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: { url: { type: 'string' } },
        required: ['url'],
      },
    };
    const scopedTurnSpec = {
      ...turnSpec,
      requestKind: 'answer',
      goals: [{ id: 'read-target', kind: 'read', capabilityDomain: 'web', dependsOn: [] }],
    };
    const scopedRoute = {
      state: 'ready',
      candidates: [tool],
      goalRoutes: [{ goalId: 'read-target', status: 'ready', toolNames: ['read_url'] }],
    };
    const step = {
      id: 'read-step',
      goalId: 'read-target',
      toolName: 'read_url',
      arguments: {},
      dependsOn: [],
      expectedResultKind: 'web_page',
    };
    const parsed = {
      invalid: false,
      extraCalls: [],
      plan: {
        version: '2.0',
        turnSpecDigest: 'digest-1',
        steps: [step],
        deferredGoalIds: [],
        unsupportedGoalIds: [],
      },
    };
    const context = {
      contextRefs: [
        { type: 'bookmark', id: 'bookmark-1' },
        { type: 'bookmark', id: 'bookmark-2' },
      ],
      resources: [
        { type: 'bookmark', id: 'bookmark-1', values: { url: 'https://one.example' } },
        { type: 'bookmark', id: 'bookmark-2', values: { url: 'https://two.example' } },
      ],
    };
    const multiResourceStepSchema = buildExecutionPlanToolDefinition({
      turnSpec: scopedTurnSpec,
      candidateTools: [tool],
      executionContext: context,
    }).function.parameters.properties.steps.items;
    expect(multiResourceStepSchema.required).toContain('argumentBindings');
    expect(multiResourceStepSchema.properties.argumentBindings.required).toEqual(['url']);
    const literalStepSchema = buildExecutionPlanToolDefinition({
      turnSpec: scopedTurnSpec,
      route: scopedRoute,
      candidateTools: [tool],
      executionContext: {},
    }).function.parameters.properties.steps.items;
    expect(literalStepSchema.properties.arguments.properties).toHaveProperty('url');
    expect(literalStepSchema.properties.arguments.required).toContain('url');
    expect(
      validateExecutionPlan({ turnSpec: scopedTurnSpec, route: scopedRoute, parsed, executionContext: context }).issues,
    ).toContain('TOOL_RESOURCE_SELECTION_REQUIRED');

    step.arguments = { url: 'https://two.example' };
    expect(
      validateExecutionPlan({ turnSpec: scopedTurnSpec, route: scopedRoute, parsed, executionContext: context }).issues,
    ).toContain('TOOL_RESOURCE_SELECTION_REQUIRED');
    step.arguments = {};

    step.argumentBindings = { url: { type: 'bookmark', id: 'bookmark-2' } };
    const selected = validateExecutionPlan({
      turnSpec: scopedTurnSpec,
      route: scopedRoute,
      parsed,
      executionContext: context,
    });
    expect(selected.valid).toBe(true);
    expect(JSON.parse(selected.toolCalls[0].function.arguments)).toEqual({ url: 'https://two.example' });

    step.argumentBindings = { url: { type: 'bookmark', id: 'bookmark-outside' } };
    expect(
      validateExecutionPlan({ turnSpec: scopedTurnSpec, route: scopedRoute, parsed, executionContext: context }).issues,
    ).toContain('TOOL_RESOURCE_SELECTION_INVALID');

    delete step.argumentBindings;
    step.arguments = { url: 'https://literal.example' };
    const literal = validateExecutionPlan({
      turnSpec: scopedTurnSpec,
      route: scopedRoute,
      parsed,
      executionContext: {},
    });
    expect(literal.valid).toBe(true);
    expect(JSON.parse(literal.toolCalls[0].function.arguments)).toEqual({ url: 'https://literal.example' });

    step.arguments = {};
    const unavailable = validateExecutionPlan({
      turnSpec: scopedTurnSpec,
      route: scopedRoute,
      parsed,
      executionContext: {
        contextRefs: [{ type: 'bookmark', id: 'bookmark-empty' }],
        resources: [{ type: 'bookmark', id: 'bookmark-empty', values: { url: '' } }],
      },
    });
    expect(unavailable.issues).toContain('TOOL_RESOURCE_VALUE_UNAVAILABLE');
  });

  it('只执行依赖已满足且属于 goal route 的步骤', async () => {
    const request = vi.fn().mockResolvedValue(
      response({
        version: '2.0',
        turnSpecDigest: 'digest-1',
        steps: [
          {
            id: 'write-step',
            goalId: 'write-target',
            toolName: 'set_todo_status',
            arguments: { todoId: 't1', status: 'completed' },
            dependsOn: [],
            expectedResultKind: 'confirmation',
          },
        ],
        deferredGoalIds: [],
        unsupportedGoalIds: [],
      }),
    );
    const result = await planAgentExecution({
      turnSpec,
      route: { ...route, goalRoutes: [route.goalRoutes[1]] },
      completedGoalIds: ['read-target'],
      request,
      validate: validateExecutionPlan,
    });
    expect(result.validation.valid).toBe(true);
    expect(result.validation.toolCalls[0].function.name).toBe('set_todo_status');
  });

  it('T-01/T-02：额外读工具丢弃，额外写或未知工具整体阻断', () => {
    const basePlan = {
      version: '2.0',
      turnSpecDigest: 'digest-1',
      steps: [
        {
          id: 'read-step',
          goalId: 'read-target',
          toolName: 'query_todos',
          arguments: { keyword: '报告' },
          dependsOn: [],
          expectedResultKind: 'todo_list',
        },
      ],
      deferredGoalIds: ['write-target'],
      unsupportedGoalIds: [],
    };
    const readExtra = { function: { name: 'query_todos', arguments: '{}' } };
    const writeExtra = { function: { name: 'set_todo_status', arguments: '{}' } };
    const parse = (extraCalls) => ({ plan: basePlan, extraCalls, invalid: false });
    expect(validateExecutionPlan({ turnSpec, route, parsed: parse([readExtra]) })).toMatchObject({
      valid: true,
      ignoredExtraReadCount: 1,
    });
    expect(validateExecutionPlan({ turnSpec, route, parsed: parse([writeExtra]) }).issues).toContain(
      'extra_tool_call_blocked',
    );
  });

  it('T-03：缺 required slot 时失败关闭，不让 Planner 猜默认参数', () => {
    const parsed = {
      invalid: false,
      extraCalls: [],
      plan: {
        version: '2.0',
        turnSpecDigest: 'digest-1',
        steps: [
          {
            id: 'read-step',
            goalId: 'read-target',
            toolName: 'query_todos',
            arguments: {},
            dependsOn: [],
            expectedResultKind: 'todo_list',
          },
        ],
        deferredGoalIds: ['write-target'],
        unsupportedGoalIds: [],
      },
    };
    expect(validateExecutionPlan({ turnSpec, route, parsed }).issues).toContain('TOOL_ARGUMENT_REQUIRED');
  });

  it('依赖目标被提前填写时丢弃该步骤并继续安全的前置读取', () => {
    const parsed = {
      invalid: false,
      extraCalls: [],
      plan: {
        version: '2.0',
        turnSpecDigest: 'digest-1',
        steps: [
          {
            id: 'read-step',
            goalId: 'read-target',
            toolName: 'query_todos',
            arguments: { keyword: '报告' },
            dependsOn: [],
            expectedResultKind: 'todo_list',
          },
          {
            id: 'write-step',
            goalId: 'write-target',
            toolName: 'set_todo_status',
            arguments: { todoId: 'guessed', status: 'completed' },
            dependsOn: ['read-step'],
            expectedResultKind: 'confirmation',
          },
        ],
        deferredGoalIds: [],
        unsupportedGoalIds: [],
      },
    };
    const result = validateExecutionPlan({ turnSpec, route, parsed });
    expect(result.valid).toBe(true);
    expect(result.toolCalls.map((call) => call.function.name)).toEqual(['query_todos']);
  });

  it('服务端时间约束从 Planner schema 移除并在校验阶段权威注入', () => {
    const temporalTool = {
      name: 'query_notes',
      isWrite: false,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: { timeRange: { type: 'string' }, limit: { type: 'integer' } },
        required: ['timeRange'],
      },
    };
    const temporalSpec = {
      ...turnSpec,
      version: '3.0',
      requestKind: 'answer',
      goals: [{ id: 'notes', kind: 'read', capabilityDomain: 'note', dependsOn: [] }],
      temporalConstraints: [
        {
          goalId: 'notes',
          slot: 'timeRange',
          kind: 'range',
          expression: '今天',
          argumentValue: '今天',
          resolved: {
            start: '2026-08-21 00:00:00',
            endExclusive: '2026-08-21 12:00:01',
            timeZone: 'Asia/Shanghai',
          },
          implicit: true,
        },
      ],
    };
    const temporalRoute = {
      state: 'ready',
      candidates: [temporalTool],
      goalRoutes: [{ goalId: 'notes', status: 'ready', toolNames: ['query_notes'] }],
      capabilityByTool: new Map([
        [
          'query_notes',
          {
            resultKind: 'note_list',
            temporalSlots: [{ name: 'timeRange', kind: 'range', autoBind: true }],
          },
        ],
      ]),
    };
    const stepSchema = buildExecutionPlanToolDefinition({
      turnSpec: temporalSpec,
      route: temporalRoute,
      candidateTools: [temporalTool],
    }).function.parameters.properties.steps.items;
    expect(stepSchema.properties.arguments.properties).not.toHaveProperty('timeRange');
    expect(stepSchema.properties.arguments.required).not.toContain('timeRange');
    expect(stepSchema.properties.expectedResultKind).toEqual({ type: 'string', enum: ['note_list'] });

    const parsed = {
      invalid: false,
      extraCalls: [],
      plan: {
        version: '2.0',
        turnSpecDigest: 'digest-1',
        steps: [
          {
            id: 'notes-step',
            goalId: 'notes',
            toolName: 'query_notes',
            arguments: { timeRange: '最近7天', limit: 50 },
            dependsOn: [],
            expectedResultKind: 'note_list',
          },
        ],
        deferredGoalIds: [],
        unsupportedGoalIds: [],
      },
    };
    const validated = validateExecutionPlan({ turnSpec: temporalSpec, route: temporalRoute, parsed });
    expect(validated.valid).toBe(true);
    expect(JSON.parse(validated.toolCalls[0].function.arguments)).toEqual({ timeRange: '今天', limit: 50 });
    expect(validated.temporalBindingsByCallId).toMatchObject({
      'execution-plan-notes-step': {
        timeRange: {
          expression: '今天',
          range: {
            start: '2026-08-21 00:00:00',
            endExclusive: '2026-08-21 12:00:01',
          },
        },
      },
    });

    parsed.plan.steps[0].expectedResultKind = 'bookmark_list';
    expect(validateExecutionPlan({ turnSpec: temporalSpec, route: temporalRoute, parsed }).issues).toContain(
      'execution_step_result_kind_mismatch',
    );
  });

  it('Manifest 声明的时间参数即使 TurnSpec 尚无值，也不交给模型猜测', () => {
    const temporalTool = {
      name: 'query_notes',
      isWrite: false,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: { timeRange: { type: 'string' }, limit: { type: 'integer' } },
        required: ['timeRange'],
      },
    };
    const specWithoutTime = {
      ...turnSpec,
      version: '3.0',
      requestKind: 'answer',
      goals: [{ id: 'notes', kind: 'read', capabilityDomain: 'note', dependsOn: [] }],
      temporalConstraints: [],
    };
    const temporalRoute = {
      state: 'ready',
      candidates: [temporalTool],
      goalRoutes: [{ goalId: 'notes', status: 'ready', toolNames: ['query_notes'] }],
      capabilityByTool: new Map([
        [
          'query_notes',
          {
            resultKind: 'note_list',
            temporalSlots: [{ name: 'timeRange', kind: 'range', autoBind: true }],
          },
        ],
      ]),
    };
    const stepSchema = buildExecutionPlanToolDefinition({
      turnSpec: specWithoutTime,
      route: temporalRoute,
      candidateTools: [temporalTool],
    }).function.parameters.properties.steps.items;
    expect(stepSchema.properties.arguments.properties).not.toHaveProperty('timeRange');

    const parsed = {
      invalid: false,
      extraCalls: [],
      plan: {
        version: '2.0',
        turnSpecDigest: 'digest-1',
        steps: [
          {
            id: 'notes-step',
            goalId: 'notes',
            toolName: 'query_notes',
            arguments: { limit: 10 },
            dependsOn: [],
            expectedResultKind: 'note_list',
          },
        ],
        deferredGoalIds: [],
        unsupportedGoalIds: [],
      },
    };
    expect(validateExecutionPlan({ turnSpec: specWithoutTime, route: temporalRoute, parsed }).issues).toContain(
      'TOOL_ARGUMENT_REQUIRED',
    );
  });
});
