import { describe, expect, it, vi } from 'vitest';
import {
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
      currentDate: '2026-08-19',
      currentDateTime: '2026-08-19 20:34:56',
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
    ).toContain('TOOL_ATTACHMENT_SELECTION_INVALID');

    expect(
      validateExecutionPlan({
        turnSpec: attachmentSpec,
        route: attachmentRoute,
        parsed,
        executionContext: { attachmentIds: [] },
      }).issues,
    ).toContain('TOOL_ATTACHMENT_CONTEXT_REQUIRED');
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
});
