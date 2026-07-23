import { describe, expect, it } from 'vitest';
import {
  adjudicateSemanticPlan,
  buildSemanticPolicyMessage,
  buildSemanticPlanToolDefinition,
  normalizeReadCompletionToolCalls,
  parseSemanticPlannerResponse,
  SEMANTIC_PLAN_TOOL_NAME,
} from './semanticPlanner.js';

const catalog = [
  {
    id: 'read.query_todos',
    effect: 'read',
    status: 'enabled',
    toolNames: ['query_todos'],
    description: '查询待办',
  },
  {
    id: 'todo.status.set',
    effect: 'write',
    status: 'enabled',
    toolNames: ['set_todo_status'],
    description: '修改待办状态',
  },
  {
    id: 'note.delete',
    effect: 'write',
    status: 'planned',
    toolNames: [],
    description: '删除笔记',
  },
];
const tools = [
  {
    name: 'query_todos',
    description: '查询待办',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        status: { type: 'string', enum: ['pending', 'completed'] },
      },
    },
  },
  {
    name: 'set_todo_status',
    description: '修改待办状态',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        keyword: { type: 'string' },
        status: { type: 'string', enum: ['pending', 'completed'] },
      },
      required: ['status'],
    },
  },
];

function call(name, args, id = name) {
  return {
    id,
    type: 'function',
    function: { name, arguments: JSON.stringify(args) },
  };
}

function plan(overrides = {}) {
  return {
    version: '1.0',
    requestClass: 'data_query',
    confidence: 'high',
    intents: [
      {
        kind: 'read',
        capabilityId: 'read.query_todos',
        goal: '查询已完成待办',
        targetDescription: '当前用户的已完成待办',
        dependsOn: [],
      },
    ],
    needsClarification: false,
    clarificationQuestion: '',
    toolCalls: [],
    ...overrides,
  };
}

describe('semanticPlanner', () => {
  it('生成强约束 Intent Envelope 工具定义', () => {
    const definition = buildSemanticPlanToolDefinition(catalog, tools);
    expect(definition.function.name).toBe(SEMANTIC_PLAN_TOOL_NAME);
    expect(definition.function.parameters.properties.intents.items.properties.capabilityId.enum).toEqual(
      expect.arrayContaining(['read.query_todos', 'todo.status.set', 'note.delete', 'unknown']),
    );
    const variants = definition.function.parameters.properties.toolCalls.items.oneOf;
    expect(variants.map((item) => item.properties.toolName.enum[0])).toEqual(['query_todos', 'set_todo_status']);
    const setTodoVariant = variants.find((item) => item.properties.toolName.enum[0] === 'set_todo_status');
    expect(setTodoVariant.properties.arguments).toMatchObject({
      additionalProperties: false,
      required: ['status'],
      properties: {
        status: { enum: ['pending', 'completed'] },
      },
    });
    expect(setTodoVariant.properties.arguments.properties).not.toHaveProperty('completed');
  });

  it('从唯一元计划调用中展开真实工具调用', () => {
    const response = {
      toolCalls: [
        call(
          SEMANTIC_PLAN_TOOL_NAME,
          plan({
            toolCalls: [{ toolName: 'query_todos', arguments: { status: 'completed' } }],
          }),
          'plan-1',
        ),
      ],
    };
    const parsed = parseSemanticPlannerResponse(response, catalog);
    expect(parsed.source).toBe('semantic');
    expect(parsed.plan.requestClass).toBe('data_query');
    expect(parsed.toolCalls.map((item) => item.function.name)).toEqual(['query_todos']);
    expect(adjudicateSemanticPlan({ plan: parsed.plan, toolCalls: parsed.toolCalls, catalog })).toMatchObject({
      state: 'ready',
      resolution: 'enabled',
      toolCalls: [expect.objectContaining({ id: 'semantic-plan-tool-1' })],
    });
    expect(JSON.parse(parsed.toolCalls[0].function.arguments)).toEqual({ status: 'completed' });
  });

  it('读取补全只接受目录内的只读真实工具，并重写调用 ID', () => {
    const normalized = normalizeReadCompletionToolCalls(
      [
        call('query_todos', { status: 'completed' }, 'provider-read'),
        call('set_todo_status', { status: 'completed' }, 'provider-write'),
        call('unknown_tool', {}, 'provider-unknown'),
        {
          id: 'provider-invalid',
          type: 'function',
          function: { name: 'query_todos', arguments: '{bad-json' },
        },
      ],
      catalog,
      { toolCallIdPrefix: 'completion-2' },
    );

    expect(normalized).toEqual([
      {
        id: 'completion-2-1',
        type: 'function',
        function: {
          name: 'query_todos',
          arguments: JSON.stringify({ status: 'completed' }),
        },
      },
    ]);
  });

  it('查询意图没有真实查询调用时失败关闭', () => {
    const parsed = parseSemanticPlannerResponse({ toolCalls: [call(SEMANTIC_PLAN_TOOL_NAME, plan())] }, catalog);
    expect(adjudicateSemanticPlan({ plan: parsed.plan, toolCalls: [], catalog })).toMatchObject({
      state: 'blocked',
      resolution: 'unverified_query',
      partialToolCalls: [],
      missingCapabilityIds: ['read.query_todos'],
    });
  });

  it('多读取计划遗漏部分调用时保留已核验调用，并明确列出待补全能力', () => {
    const multiReadCatalog = [
      catalog[0],
      {
        id: 'read.query_notes',
        effect: 'read',
        status: 'enabled',
        toolNames: ['query_notes'],
        description: '查询笔记',
      },
    ];
    const multiReadPlan = plan({
      intents: [
        {
          kind: 'read',
          capabilityId: 'read.query_todos',
          goal: '查询待办',
          targetDescription: '当前用户的待办',
          dependsOn: [],
        },
        {
          kind: 'read',
          capabilityId: 'read.query_notes',
          goal: '查询笔记',
          targetDescription: '当前用户的笔记',
          dependsOn: [],
        },
      ],
    });
    const existingCall = call('query_todos', { status: 'completed' }, 'query-todos-1');

    expect(
      adjudicateSemanticPlan({
        plan: multiReadPlan,
        toolCalls: [existingCall],
        catalog: multiReadCatalog,
      }),
    ).toMatchObject({
      state: 'blocked',
      resolution: 'unverified_query',
      partialToolCalls: [existingCall],
      missingCapabilityIds: ['read.query_notes'],
    });
  });

  it('未获语义授权的额外只读调用会被丢弃，不拖垮已验证的读取计划', () => {
    const multiReadCatalog = [
      catalog[0],
      {
        id: 'read.query_notes',
        effect: 'read',
        status: 'enabled',
        toolNames: ['query_notes'],
        description: '查询笔记',
      },
    ];
    const queryPlan = plan({
      intents: [
        {
          kind: 'read',
          capabilityId: 'read.query_todos',
          goal: '查询待办',
          targetDescription: '当前用户的待办',
          dependsOn: [],
        },
      ],
    });
    const intendedCall = call('query_todos', { status: 'completed' }, 'query-todos-1');
    const unrelatedReadCall = call('query_notes', { timeRange: '最近7天' }, 'query-notes-1');

    expect(
      adjudicateSemanticPlan({
        plan: queryPlan,
        toolCalls: [unrelatedReadCall, intendedCall],
        catalog: multiReadCatalog,
      }),
    ).toMatchObject({
      state: 'ready',
      toolCalls: [intendedCall],
      ignoredReadToolNames: ['query_notes'],
    });
  });

  it('纯动作请求的前置查询同样必须真实调用，不能直接落到未核验写入', () => {
    const parsed = parseSemanticPlannerResponse(
      {
        toolCalls: [
          call(
            SEMANTIC_PLAN_TOOL_NAME,
            plan({
              requestClass: 'data_action',
              intents: [
                {
                  kind: 'read',
                  capabilityId: 'read.query_todos',
                  goal: '查询第一条待办',
                  targetDescription: '第一条待办',
                  dependsOn: [],
                },
                {
                  kind: 'write',
                  capabilityId: 'todo.status.set',
                  goal: '完成查询到的待办',
                  targetDescription: '查询结果',
                  dependsOn: [0],
                },
              ],
              toolCalls: [],
            }),
          ),
        ],
      },
      catalog,
    );

    expect(adjudicateSemanticPlan({ plan: parsed.plan, toolCalls: parsed.toolCalls, catalog })).toMatchObject({
      state: 'blocked',
      resolution: 'unverified_query',
      toolCalls: [],
    });
  });

  it('产品用法与混合请求必须声明对应读取/写入能力', () => {
    const productHelp = parseSemanticPlannerResponse(
      {
        toolCalls: [call(SEMANTIC_PLAN_TOOL_NAME, plan({ requestClass: 'product_help', intents: [] }))],
      },
      catalog,
    );
    expect(adjudicateSemanticPlan({ plan: productHelp.plan, toolCalls: [], catalog })).toMatchObject({
      state: 'blocked',
      resolution: 'unknown_query',
    });

    const mixed = parseSemanticPlannerResponse(
      {
        toolCalls: [call(SEMANTIC_PLAN_TOOL_NAME, plan({ requestClass: 'mixed' })), call('query_todos', {})],
      },
      catalog,
    );
    expect(adjudicateSemanticPlan({ plan: mixed.plan, toolCalls: mixed.toolCalls, catalog })).toMatchObject({
      state: 'blocked',
      resolution: 'unknown_mutation',
    });
  });

  it('计划中写能力由服务端阻断，不能落入自由回答', () => {
    const parsed = parseSemanticPlannerResponse(
      {
        toolCalls: [
          call(
            SEMANTIC_PLAN_TOOL_NAME,
            plan({
              requestClass: 'data_action',
              intents: [
                {
                  kind: 'write',
                  capabilityId: 'note.delete',
                  goal: '删除笔记',
                  targetDescription: '指定笔记',
                  dependsOn: [],
                },
              ],
            }),
          ),
        ],
      },
      catalog,
    );
    expect(adjudicateSemanticPlan({ plan: parsed.plan, toolCalls: [], catalog })).toMatchObject({
      state: 'blocked',
      resolution: 'planned',
      capabilities: [expect.objectContaining({ id: 'note.delete' })],
    });
  });

  it('策略提示正确读取结构化双语引导，不泄漏对象字符串', () => {
    const capability = {
      labels: { zh: '删除笔记', en: 'delete a note' },
      guidance: {
        zh: '请前往笔记库手动删除。',
        en: 'Delete it manually from the note library.',
      },
    };
    expect(buildSemanticPolicyMessage({ resolution: 'planned', capabilities: [capability] }, 'zh-CN')).toBe(
      '当前 AI 暂不支持“删除笔记”，因此没有执行任何操作。 请前往笔记库手动删除。',
    );
    expect(buildSemanticPolicyMessage({ resolution: 'planned', capabilities: [capability] }, 'en-US')).toBe(
      'AI does not currently support delete a note, so nothing was executed.',
    );
    expect(buildSemanticPolicyMessage({ resolution: 'planned', capabilities: [capability] }, 'zh-CN')).not.toContain(
      '[object Object]',
    );
  });

  it('语义能力和实际调用冲突时丢弃全部调用', () => {
    const parsed = parseSemanticPlannerResponse(
      {
        toolCalls: [
          call(
            SEMANTIC_PLAN_TOOL_NAME,
            plan({
              toolCalls: [
                {
                  toolName: 'set_todo_status',
                  arguments: { keyword: '测试', status: 'completed' },
                },
              ],
            }),
          ),
        ],
      },
      catalog,
    );
    expect(adjudicateSemanticPlan({ plan: parsed.plan, toolCalls: parsed.toolCalls, catalog })).toMatchObject({
      state: 'blocked',
      resolution: 'semantic_conflict',
      toolCalls: [],
    });
  });

  it('同一写 intent 不能借重复工具调用生成批量确认', () => {
    const parsed = parseSemanticPlannerResponse(
      {
        toolCalls: [
          call(
            SEMANTIC_PLAN_TOOL_NAME,
            plan({
              requestClass: 'data_action',
              intents: [
                {
                  kind: 'write',
                  capabilityId: 'todo.status.set',
                  goal: '完成一条待办',
                  targetDescription: '指定待办',
                  dependsOn: [],
                },
              ],
              toolCalls: [
                {
                  toolName: 'set_todo_status',
                  arguments: { keyword: '测试一', status: 'completed' },
                },
                {
                  toolName: 'set_todo_status',
                  arguments: { keyword: '测试二', status: 'completed' },
                },
              ],
            }),
          ),
        ],
      },
      catalog,
    );

    expect(adjudicateSemanticPlan({ plan: parsed.plan, toolCalls: parsed.toolCalls, catalog })).toMatchObject({
      state: 'blocked',
      resolution: 'semantic_conflict',
      toolCalls: [],
    });
  });

  it('低置信或歧义请求只返回澄清，不执行工具', () => {
    const parsed = parseSemanticPlannerResponse(
      {
        toolCalls: [
          call(
            SEMANTIC_PLAN_TOOL_NAME,
            plan({
              requestClass: 'ambiguous',
              confidence: 'low',
              intents: [],
              needsClarification: true,
              clarificationQuestion: '你希望查看待办，还是修改待办状态？',
            }),
          ),
        ],
      },
      catalog,
    );
    expect(adjudicateSemanticPlan({ plan: parsed.plan, toolCalls: [], catalog })).toMatchObject({
      state: 'clarification',
      resolution: 'ambiguous',
      message: '你希望查看待办，还是修改待办状态？',
    });
  });

  it('写动作依赖查询结果时只执行就绪查询，并把写能力留给后续轮', () => {
    const mixedPlan = plan({
      requestClass: 'mixed',
      intents: [
        {
          kind: 'read',
          capabilityId: 'read.query_todos',
          goal: '列出待办',
          targetDescription: '当前待办',
          dependsOn: [],
        },
        {
          kind: 'write',
          capabilityId: 'todo.status.set',
          goal: '完成查询结果中的第一条',
          targetDescription: '第一条',
          dependsOn: [0],
        },
      ],
    });
    const parsed = parseSemanticPlannerResponse(
      {
        toolCalls: [
          call(SEMANTIC_PLAN_TOOL_NAME, {
            ...mixedPlan,
            toolCalls: [
              { toolName: 'query_todos', arguments: {} },
              {
                toolName: 'set_todo_status',
                arguments: { keyword: '第一条', status: 'completed' },
              },
            ],
          }),
        ],
      },
      catalog,
    );

    expect(adjudicateSemanticPlan({ plan: parsed.plan, toolCalls: parsed.toolCalls, catalog })).toMatchObject({
      state: 'ready',
      resolution: 'enabled',
      toolCalls: [expect.objectContaining({ function: expect.objectContaining({ name: 'query_todos' }) })],
      deferredCapabilityIds: ['todo.status.set'],
      writeToolNames: ['set_todo_status'],
    });
  });

  it('纯动作请求允许读取能力作为写入前置条件，但拒绝与写入无关的并行读取', () => {
    const dependentAction = plan({
      requestClass: 'data_action',
      intents: [
        {
          kind: 'read',
          capabilityId: 'read.query_todos',
          goal: '定位第一条待办',
          targetDescription: '当前第一条待办',
          dependsOn: [],
        },
        {
          kind: 'write',
          capabilityId: 'todo.status.set',
          goal: '完成定位到的待办',
          targetDescription: '查询结果',
          dependsOn: [0],
        },
      ],
    });
    const ready = adjudicateSemanticPlan({
      plan: dependentAction,
      toolCalls: [call('query_todos', { status: 'pending', limit: 1 })],
      catalog,
    });
    expect(ready).toMatchObject({
      state: 'ready',
      toolCalls: [expect.objectContaining({ function: expect.objectContaining({ name: 'query_todos' }) })],
      deferredCapabilityIds: ['todo.status.set'],
    });

    const unrelatedRead = adjudicateSemanticPlan({
      plan: {
        ...dependentAction,
        intents: [
          dependentAction.intents[0],
          {
            ...dependentAction.intents[1],
            dependsOn: [],
          },
        ],
      },
      toolCalls: [
        call('query_todos', { status: 'pending' }),
        call('set_todo_status', { keyword: '测试', status: 'completed' }),
      ],
      catalog,
    });
    expect(unrelatedRead).toMatchObject({ state: 'blocked', resolution: 'semantic_conflict' });
  });

  it('依赖只能指向前序 intent，未来依赖和循环依赖使计划整体无效', () => {
    const parsed = parseSemanticPlannerResponse(
      {
        toolCalls: [
          call(
            SEMANTIC_PLAN_TOOL_NAME,
            plan({
              requestClass: 'mixed',
              intents: [
                {
                  kind: 'read',
                  capabilityId: 'read.query_todos',
                  goal: '查询待办',
                  targetDescription: '当前待办',
                  dependsOn: [1],
                },
                {
                  kind: 'write',
                  capabilityId: 'todo.status.set',
                  goal: '修改待办',
                  targetDescription: '查询结果',
                  dependsOn: [0],
                },
              ],
            }),
          ),
        ],
      },
      catalog,
    );
    expect(parsed).toMatchObject({ source: 'missing', plan: null, invalidPlan: true });
  });

  it('服务端已证明依赖满足的受限轮会清除模型复述的旧依赖下标', () => {
    const writeCatalog = catalog.filter((entry) => entry.id === 'todo.status.set');
    const writeTools = tools.filter((tool) => tool.name === 'set_todo_status');
    const definition = buildSemanticPlanToolDefinition(writeCatalog, writeTools, {
      dependenciesAlreadySatisfied: true,
    });
    expect(definition.function.parameters.properties.intents.items.properties.dependsOn).toMatchObject({ maxItems: 0 });

    const parsed = parseSemanticPlannerResponse(
      {
        toolCalls: [
          call(
            SEMANTIC_PLAN_TOOL_NAME,
            plan({
              // 依赖子轮偶尔沿用上一轮的查询分类；服务端已经把目录收窄为就绪写能力，
              // 因此应以本轮已校验 intent 重新归一，而不是把它误判成查询/写入冲突。
              requestClass: 'data_query',
              intents: [
                {
                  kind: 'write',
                  capabilityId: 'todo.status.set',
                  goal: '完成已查询到的待办',
                  targetDescription: 'todo-1',
                  // Provider 偶尔沿用原始 DAG 的 read intent 下标；该下标不属于受限子计划。
                  dependsOn: [0],
                },
              ],
              toolCalls: [
                {
                  toolName: 'set_todo_status',
                  arguments: { todoId: 'todo-1', status: 'completed' },
                },
              ],
            }),
          ),
        ],
      },
      writeCatalog,
      { dependenciesAlreadySatisfied: true },
    );

    expect(parsed).toMatchObject({
      source: 'semantic',
      plan: {
        requestClass: 'data_action',
        intents: [{ capabilityId: 'todo.status.set', dependsOn: [] }],
      },
    });
  });

  it('重复能力和超过三轮的依赖链都使计划整体无效', () => {
    const duplicated = parseSemanticPlannerResponse(
      {
        toolCalls: [
          call(
            SEMANTIC_PLAN_TOOL_NAME,
            plan({
              requestClass: 'data_query',
              intents: [
                {
                  kind: 'read',
                  capabilityId: 'read.query_todos',
                  goal: '查询待办一',
                  targetDescription: '待办一',
                  dependsOn: [],
                },
                {
                  kind: 'read',
                  capabilityId: 'read.query_todos',
                  goal: '查询待办二',
                  targetDescription: '待办二',
                  dependsOn: [0],
                },
              ],
            }),
          ),
        ],
      },
      catalog,
    );
    expect(duplicated).toMatchObject({ source: 'missing', plan: null, invalidPlan: true });

    const extendedCatalog = [
      ...catalog,
      {
        id: 'read.step_two',
        effect: 'read',
        status: 'enabled',
        toolNames: ['query_step_two'],
        description: '第二步查询',
      },
      {
        id: 'read.step_three',
        effect: 'read',
        status: 'enabled',
        toolNames: ['query_step_three'],
        description: '第三步查询',
      },
    ];
    const tooDeep = parseSemanticPlannerResponse(
      {
        toolCalls: [
          call(
            SEMANTIC_PLAN_TOOL_NAME,
            plan({
              requestClass: 'mixed',
              intents: [
                {
                  kind: 'read',
                  capabilityId: 'read.query_todos',
                  goal: '第一步',
                  targetDescription: '第一步',
                  dependsOn: [],
                },
                {
                  kind: 'read',
                  capabilityId: 'read.step_two',
                  goal: '第二步',
                  targetDescription: '第二步',
                  dependsOn: [0],
                },
                {
                  kind: 'read',
                  capabilityId: 'read.step_three',
                  goal: '第三步',
                  targetDescription: '第三步',
                  dependsOn: [1],
                },
                {
                  kind: 'write',
                  capabilityId: 'todo.status.set',
                  goal: '第四步',
                  targetDescription: '第四步',
                  dependsOn: [2],
                },
              ],
            }),
          ),
        ],
      },
      extendedCatalog,
    );
    expect(tooDeep).toMatchObject({ source: 'missing', plan: null, invalidPlan: true });
  });

  it('写入不能成为后续步骤的依赖，受限轮也不接受越界旧下标', () => {
    const dependsOnWrite = parseSemanticPlannerResponse(
      {
        toolCalls: [
          call(
            SEMANTIC_PLAN_TOOL_NAME,
            plan({
              requestClass: 'data_action',
              intents: [
                {
                  kind: 'write',
                  capabilityId: 'todo.status.set',
                  goal: '完成待办',
                  targetDescription: '测试待办',
                  dependsOn: [],
                },
                {
                  kind: 'read',
                  capabilityId: 'read.query_todos',
                  goal: '读取修改结果',
                  targetDescription: '修改后的待办',
                  dependsOn: [0],
                },
              ],
            }),
          ),
        ],
      },
      catalog,
    );
    expect(dependsOnWrite).toMatchObject({ source: 'missing', plan: null, invalidPlan: true });

    const restricted = parseSemanticPlannerResponse(
      {
        toolCalls: [
          call(
            SEMANTIC_PLAN_TOOL_NAME,
            plan({
              requestClass: 'data_action',
              intents: [
                {
                  kind: 'write',
                  capabilityId: 'todo.status.set',
                  goal: '完成已查询到的待办',
                  targetDescription: 'todo-1',
                  dependsOn: [99],
                },
              ],
              toolCalls: [
                {
                  toolName: 'set_todo_status',
                  arguments: { keyword: '测试', status: 'completed' },
                },
              ],
            }),
          ),
        ],
      },
      catalog.filter((entry) => entry.id === 'todo.status.set'),
      { dependenciesAlreadySatisfied: true },
    );
    expect(restricted).toMatchObject({ source: 'missing', plan: null, invalidPlan: true });
  });

  it('Provider 缺失语义计划但给出真实工具调用时可保守派生计划', () => {
    const parsed = parseSemanticPlannerResponse({ toolCalls: [call('query_todos', { status: 'completed' })] }, catalog);
    expect(parsed).toMatchObject({
      source: 'tool_calls',
      invalidPlan: true,
      plan: { requestClass: 'data_query', confidence: 'medium' },
    });
  });

  it('缺失或无效语义计划时绝不从写工具反推可执行动作', () => {
    const missing = parseSemanticPlannerResponse(
      {
        toolCalls: [call('set_todo_status', { keyword: '测试', status: 'completed' })],
      },
      catalog,
    );
    expect(missing).toMatchObject({
      source: 'missing',
      plan: null,
      invalidPlan: true,
    });

    const invalid = parseSemanticPlannerResponse(
      {
        toolCalls: [call(SEMANTIC_PLAN_TOOL_NAME, { version: 'invalid' }), call('query_todos', {})],
      },
      catalog,
    );
    expect(invalid).toMatchObject({
      source: 'missing',
      plan: null,
      invalidPlan: true,
    });
  });

  it('内嵌与独立业务调用同时存在时视为冲突并失败关闭', () => {
    const parsed = parseSemanticPlannerResponse(
      {
        toolCalls: [
          call(
            SEMANTIC_PLAN_TOOL_NAME,
            plan({
              toolCalls: [{ toolName: 'query_todos', arguments: { status: 'completed' } }],
            }),
          ),
          call('query_todos', { status: 'pending' }),
        ],
      },
      catalog,
    );
    expect(parsed).toMatchObject({
      source: 'missing',
      plan: null,
      invalidPlan: true,
    });
  });

  it('独立通道只兼容旧只读调用，写工具必须封装在唯一语义计划中', () => {
    const parsed = parseSemanticPlannerResponse(
      {
        toolCalls: [
          call(
            SEMANTIC_PLAN_TOOL_NAME,
            plan({
              requestClass: 'data_action',
              intents: [
                {
                  kind: 'write',
                  capabilityId: 'todo.status.set',
                  goal: '完成待办',
                  targetDescription: '测试待办',
                  dependsOn: [],
                },
              ],
              toolCalls: [],
            }),
          ),
          call('set_todo_status', { keyword: '测试', status: 'completed' }),
        ],
      },
      catalog,
    );

    expect(parsed).toMatchObject({
      source: 'missing',
      plan: null,
      invalidPlan: true,
    });
  });

  it('内嵌未知工具或非对象参数时不生成可执行计划', () => {
    const unknown = parseSemanticPlannerResponse(
      {
        toolCalls: [
          call(
            SEMANTIC_PLAN_TOOL_NAME,
            plan({
              toolCalls: [{ toolName: 'unknown_tool', arguments: {} }],
            }),
          ),
        ],
      },
      catalog,
    );
    expect(unknown).toMatchObject({ source: 'missing', plan: null, invalidPlan: true });

    const invalidArgs = parseSemanticPlannerResponse(
      {
        toolCalls: [
          call(
            SEMANTIC_PLAN_TOOL_NAME,
            plan({
              toolCalls: [{ toolName: 'query_todos', arguments: 'completed' }],
            }),
          ),
        ],
      },
      catalog,
    );
    expect(invalidArgs).toMatchObject({ source: 'missing', plan: null, invalidPlan: true });
  });
});
