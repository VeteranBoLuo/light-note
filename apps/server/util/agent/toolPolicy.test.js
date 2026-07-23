import { describe, expect, it, vi } from 'vitest';
import { AgentToolPolicyError, enforceToolPolicy, normalizeRegisteredTool } from './toolPolicy.js';

function makeTool(overrides = {}) {
  return normalizeRegisteredTool({
    name: 'query_demo',
    description: 'demo',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'integer' },
        mode: { type: 'string', enum: ['all', 'recent'] },
      },
    },
    execute: vi.fn(),
    transform: vi.fn(),
    ...overrides,
  });
}

function context(overrides = {}) {
  return {
    userId: 'user-1',
    userRole: 'user',
    billingUserId: 'user-1',
    billingUserRole: 'user',
    request: {},
    ...overrides,
  };
}

describe('Agent Tool Policy', () => {
  it('注册时关闭 object schema 的 additionalProperties', () => {
    const tool = makeTool();
    expect(tool.parameters.additionalProperties).toBe(false);
  });

  it('注册时校验并冻结写工具的结构化依赖绑定', () => {
    const tool = makeTool({
      name: 'set_todo_status',
      isWrite: true,
      riskLevel: 'low',
      confirmationPolicy: 'always',
      parameters: {
        type: 'object',
        properties: { todoId: { type: 'string' }, status: { type: 'string' } },
      },
      dependencyBindings: [{ argument: 'todoId', refType: 'TODO', requireUnique: true }],
    });
    expect(tool.dependencyBindings).toEqual([{ argument: 'todoId', refType: 'todo', requireUnique: true }]);
    expect(Object.isFrozen(tool.dependencyBindings)).toBe(true);
    expect(makeTool({ dependencyBindings: [{ argument: 'limit', refType: 'page' }] }).dependencyBindings).toEqual([
      { argument: 'limit', refType: 'page' },
    ]);
    expect(() => makeTool({ dependencyBindings: [{ argument: 'missing', refType: 'todo' }] })).toThrow(/依赖绑定/);
    expect(() =>
      makeTool({
        name: 'set_todo_status',
        isWrite: true,
        riskLevel: 'low',
        confirmationPolicy: 'always',
        dependencyBindings: [{ argument: 'missing', refType: 'bad type' }],
      }),
    ).toThrow(/依赖绑定/);
    expect(() =>
      makeTool({
        dependencyBindings: [{ argument: 'limit', refType: 'page', requireUnique: 'yes' }],
      }),
    ).toThrow(/依赖绑定/);
  });

  it('拒绝 schema 之外的模型参数', async () => {
    const tool = makeTool();
    await expect(
      enforceToolPolicy({
        registry: new Map([[tool.name, tool]]),
        toolName: tool.name,
        args: { limit: 10, injected: true },
        context: context(),
        phase: 'plan',
      }),
    ).rejects.toMatchObject({ code: 'TOOL_ARGUMENTS_ADDITIONAL_PROPERTY' });
  });

  it('严格校验整数与枚举，兼容旧 admin 角色为普通 user', async () => {
    const tool = makeTool();
    const registry = new Map([[tool.name, tool]]);
    await expect(
      enforceToolPolicy({
        registry,
        toolName: tool.name,
        args: { limit: '10' },
        context: context({ userRole: 'admin', billingUserRole: 'admin' }),
        phase: 'plan',
      }),
    ).rejects.toMatchObject({ code: 'TOOL_ARGUMENTS_INVALID' });
    await expect(
      enforceToolPolicy({
        registry,
        toolName: tool.name,
        args: { mode: 'future' },
        context: context(),
        phase: 'plan',
      }),
    ).rejects.toMatchObject({ code: 'TOOL_ARGUMENTS_INVALID' });
    await expect(
      enforceToolPolicy({
        registry,
        toolName: tool.name,
        args: { limit: 10, mode: 'all' },
        context: context({ userRole: 'admin', billingUserRole: 'admin' }),
        phase: 'plan',
      }),
    ).resolves.toMatchObject({ actorRole: 'user' });
  });

  it('普通会话拒绝 actor/subject 不一致，管理员代管要求 root actor', async () => {
    const tool = makeTool();
    const registry = new Map([[tool.name, tool]]);
    await expect(
      enforceToolPolicy({
        registry,
        toolName: tool.name,
        context: context({ billingUserId: 'root-1', billingUserRole: 'root' }),
        phase: 'plan',
      }),
    ).rejects.toMatchObject({ code: 'TOOL_ACTOR_SUBJECT_FORBIDDEN' });
    await expect(
      enforceToolPolicy({
        registry,
        toolName: tool.name,
        context: context({
          billingUserId: 'actor-1',
          request: { adminContext: { mode: 'readonly' } },
        }),
        phase: 'plan',
      }),
    ).rejects.toMatchObject({ code: 'TOOL_ACTOR_SUBJECT_FORBIDDEN' });
  });

  it('写工具必须确认，inspect 代管不可准备写入，maintain 可生成确认', async () => {
    const tool = makeTool({
      name: 'restore_trash',
      isWrite: true,
      riskLevel: 'medium',
      confirmationPolicy: 'always',
      directAction: true,
    });
    const registry = new Map([[tool.name, tool]]);
    await expect(
      enforceToolPolicy({ registry, toolName: tool.name, context: context(), phase: 'execute' }),
    ).rejects.toMatchObject({ code: 'TOOL_CONFIRMATION_REQUIRED' });
    await expect(
      enforceToolPolicy({
        registry,
        toolName: tool.name,
        context: context({
          billingUserId: 'root-1',
          billingUserRole: 'root',
          request: { adminContext: { mode: 'readonly' } },
        }),
        phase: 'plan',
      }),
    ).rejects.toMatchObject({ code: 'TOOL_CONFIRMATION_FORBIDDEN' });
    await expect(
      enforceToolPolicy({
        registry,
        toolName: tool.name,
        context: context({
          billingUserId: 'root-1',
          billingUserRole: 'root',
          request: { adminContext: { mode: 'maintain' } },
        }),
        phase: 'plan',
      }),
    ).resolves.toMatchObject({ requiresConfirmation: true, riskLevel: 'medium' });
  });

  it('服务端确认参数可以保留 prepareArgs 生成的内部字段', async () => {
    const tool = makeTool({
      name: 'set_todo_status',
      isWrite: true,
      riskLevel: 'low',
      confirmationPolicy: 'always',
      parameters: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
      prepareArgs: async (args) => ({ ...args, internalVersion: 3 }),
    });
    const registry = new Map([[tool.name, tool]]);
    const prepared = await enforceToolPolicy({
      registry,
      toolName: tool.name,
      args: { title: 'demo' },
      context: context(),
      phase: 'plan',
    });
    expect(prepared.args.internalVersion).toBe(3);
    expect(prepared.retryArgs).toEqual({ title: 'demo' });
    await expect(
      enforceToolPolicy({
        registry,
        toolName: tool.name,
        args: prepared.args,
        context: context(),
        phase: 'execute',
        confirmed: true,
        trustedPreparedArgs: true,
        prepare: false,
      }),
    ).resolves.toMatchObject({ args: { title: 'demo', internalVersion: 3 } });
  });

  it('策略错误保留可识别类型和状态码', () => {
    const error = new AgentToolPolicyError('FORBIDDEN', 'no', 403);
    expect(error).toMatchObject({ name: 'AgentToolPolicyError', code: 'FORBIDDEN', status: 403 });
  });
});
