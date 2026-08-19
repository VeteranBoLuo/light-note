import { describe, expect, it } from 'vitest';
import { routeTurnSpecCapabilities } from './capabilityRouter.js';

const tools = ['query_notes', 'read_note', 'create_note', 'query_todos', 'set_todo_status'].map((name) => ({
  name,
}));
const catalog = [
  {
    id: 'read.query_notes',
    domain: 'note',
    effect: 'read',
    status: 'enabled',
    operations: ['read'],
    toolNames: ['query_notes'],
    description: '查询笔记列表',
  },
  {
    id: 'read.read_note',
    domain: 'note',
    effect: 'read',
    status: 'enabled',
    operations: ['read'],
    toolNames: ['read_note'],
    description: '读取单篇笔记正文',
  },
  {
    id: 'note.create',
    domain: 'note',
    effect: 'write',
    status: 'enabled',
    operations: ['create'],
    toolNames: ['create_note'],
    description: '创建笔记',
  },
  {
    id: 'note.delete',
    domain: 'note',
    effect: 'write',
    status: 'planned',
    operations: ['delete'],
    toolNames: [],
    description: '删除笔记',
  },
  {
    id: 'read.query_todos',
    domain: 'todo',
    effect: 'read',
    status: 'enabled',
    operations: ['read'],
    toolNames: ['query_todos'],
    description: '查询待办',
  },
  {
    id: 'todo.status.set',
    domain: 'todo',
    effect: 'write',
    status: 'enabled',
    operations: ['update'],
    toolNames: ['set_todo_status'],
    description: '修改待办状态',
  },
];

function spec(goals) {
  return { confidence: 'high', missingSlots: [], goals };
}

describe('Capability Router V2', () => {
  it('按 TurnSpec 域和 effect 收窄候选，不再暴露完整工具目录', () => {
    const route = routeTurnSpecCapabilities({
      turnSpec: spec([
        {
          id: 'g1',
          kind: 'read',
          capabilityDomain: 'note',
          description: '读取单篇笔记正文',
          targetDescription: '',
          dependsOn: [],
        },
      ]),
      catalog,
      tools,
    });
    expect(route.state).toBe('ready');
    expect(route.candidates.map((item) => item.name)).toEqual(['read_note']);
    expect(route.candidateToolCount).toBe(1);
  });

  it('I-04：未开放的删除笔记不会错误路由到创建笔记', () => {
    const route = routeTurnSpecCapabilities({
      turnSpec: spec([
        {
          id: 'g1',
          kind: 'write',
          capabilityDomain: 'note',
          description: '删除笔记',
          targetDescription: '那篇笔记',
          dependsOn: [],
        },
      ]),
      catalog,
      tools,
    });
    expect(route.state).toBe('unsupported');
    expect(route.candidates).toEqual([]);
    expect(route.goalRoutes[0]).toMatchObject({ capabilityIds: ['note.delete'], status: 'planned' });
  });

  it('create_artifact + transform 按注册 operation 选择创建能力，不依赖模型描述措辞', () => {
    const turnSpec = spec([
      {
        id: 'g1',
        kind: 'transform',
        capabilityDomain: 'note',
        description: '生成内容产物',
        targetDescription: '周会记录',
        dependsOn: [],
      },
    ]);
    turnSpec.requestKind = 'create_artifact';
    const route = routeTurnSpecCapabilities({ turnSpec, catalog, tools });
    expect(route).toMatchObject({ state: 'ready', candidateToolCount: 1 });
    expect(route.candidates.map((item) => item.name)).toEqual(['create_note']);
  });

  it('T-10：候选超过预算时澄清而不是截断后执行半份任务', () => {
    const manyTools = Array.from({ length: 13 }, (_, index) => ({ name: `query_${index}` }));
    const manyCatalog = manyTools.map((tool) => ({
      id: `read.${tool.name}`,
      domain: 'admin',
      effect: 'read',
      status: 'enabled',
      toolNames: [tool.name],
      description: '查询平台统计',
    }));
    const route = routeTurnSpecCapabilities({
      turnSpec: spec(
        Array.from({ length: 4 }, (_, index) => ({
          id: `g${index}`,
          kind: 'read',
          capabilityDomain: 'admin',
          description: '查询平台统计',
          targetDescription: String(index),
          dependsOn: [],
        })),
      ),
      catalog: manyCatalog,
      tools: manyTools,
      maxTools: 2,
    });
    expect(route).toMatchObject({ state: 'clarification', reason: 'candidate_budget_exceeded' });
    expect(route.candidates).toEqual([]);
  });

  it('任一 forbidden 写目标都会阻断整轮，不能先执行同轮读取再诱导危险操作', () => {
    const route = routeTurnSpecCapabilities({
      turnSpec: spec([
        {
          id: 'read',
          kind: 'read',
          capabilityDomain: 'note',
          description: '查询笔记',
          targetDescription: '',
          dependsOn: [],
        },
        {
          id: 'delete',
          kind: 'write',
          capabilityDomain: 'content',
          description: '永久删除并清空全部数据',
          targetDescription: '全部数据',
          dependsOn: ['read'],
        },
      ]),
      catalog: [
        ...catalog,
        {
          id: 'data.permanent_delete',
          domain: 'content',
          appliesToDomains: ['content', 'note', 'bookmark', 'file', 'todo', 'tag'],
          effect: 'write',
          status: 'forbidden',
          toolNames: [],
          description: '永久删除或批量清空数据',
        },
      ],
      tools,
    });
    expect(route).toMatchObject({ state: 'unsupported', reason: 'forbidden_goal' });
  });

  it('跨领域禁用能力按适用领域拦截，不依赖模型输出固定的 content 域', () => {
    const route = routeTurnSpecCapabilities({
      turnSpec: spec([
        {
          id: 'delete',
          kind: 'write',
          capabilityDomain: 'note',
          description: '永久删除全部笔记',
          targetDescription: '全部笔记',
          dependsOn: [],
        },
      ]),
      catalog: [
        ...catalog,
        {
          id: 'data.permanent_delete',
          domain: 'content',
          appliesToDomains: ['content', 'note', 'bookmark', 'file', 'todo', 'tag'],
          effect: 'write',
          status: 'forbidden',
          toolNames: [],
          description: '永久删除或批量清空数据',
        },
      ],
      tools,
    });
    expect(route).toMatchObject({ state: 'unsupported', reason: 'forbidden_goal', candidateToolCount: 0 });
    expect(route.goalRoutes[0]).toMatchObject({
      capabilityIds: ['data.permanent_delete'],
      status: 'forbidden',
    });
  });
});
