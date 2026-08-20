import { describe, expect, it } from 'vitest';
import { buildAgentSemanticCapabilityCatalog } from '../capabilityRegistry.js';
import registeredTools from '../tools/index.js';
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

  it('已选资源通过声明式绑定满足参数时，优先使用可执行工具而不是不可用的宽查询', () => {
    const selectedTools = registeredTools.filter((tool) => tool.name === 'read_url');
    const selectedCatalog = buildAgentSemanticCapabilityCatalog(registeredTools, {
      availableToolNames: new Set(selectedTools.map((tool) => tool.name)),
    });
    const turnSpec = spec([
      {
        id: 'read-selected-bookmark-url',
        kind: 'read',
        operation: 'read',
        capabilityDomain: 'bookmark',
        description: '分析用户选中的书签地址',
        targetDescription: '当前选中的一个书签资源',
        dependsOn: [],
      },
    ]);
    turnSpec.requestKind = 'answer';

    const route = routeTurnSpecCapabilities({
      turnSpec,
      catalog: selectedCatalog,
      tools: selectedTools,
      message: '分析这个地址',
      contextTypes: ['bookmark'],
    });

    expect(route).toMatchObject({ state: 'ready', candidateToolCount: 1 });
    expect(route.candidates.map((item) => item.name)).toEqual(['read_url']);
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

  it.each([
    {
      message: '今天有多少新用户？',
      description: '查询今天新增用户数量',
      expected: 'query_users',
    },
    {
      message: '今天新增的用户今天新增了哪些资源？',
      description: '查询今天新注册用户创建的资源明细',
      expected: 'query_new_user_resources',
    },
    {
      message: '今天新增的用户中谁新增的资源最多？',
      description: '统计今天新注册用户的资源创建排行',
      expected: 'get_resource_creation_ranking',
    },
    {
      message: '今天全平台新增的笔记标题有哪些？',
      description: '列出今天平台新增笔记明细',
      expected: 'query_platform_resources',
    },
  ])('管理员相邻统计语义精确路由：$message', ({ message, description, expected }) => {
    const adminTools = [
      'query_users',
      'query_new_user_resources',
      'get_resource_creation_ranking',
      'query_platform_resources',
    ].map((name) => ({ name }));
    const adminCatalog = [
      {
        id: 'read.query_users',
        domain: 'admin',
        effect: 'read',
        status: 'enabled',
        toolNames: ['query_users'],
        description: '查询平台用户列表和注册数量',
        routing: {
          preferAny: [/(?:新增|注册).{0,16}(?:用户|账号)|(?:用户|账号).{0,16}(?:新增|注册)/u],
          excludeAny: [/(?:新增|注册).{0,24}(?:用户|账号).{0,40}(?:资源|书签|笔记|文件)/u],
        },
      },
      {
        id: 'read.query_new_user_resources',
        domain: 'admin',
        effect: 'read',
        status: 'enabled',
        toolNames: ['query_new_user_resources'],
        description: '查询新注册用户创建的资源明细',
        routing: {
          requireAny: [/(?:新增|注册).{0,24}(?:用户|账号).{0,48}(?:资源|书签|笔记|文件)/u],
          preferAny: [/(?:新增|注册).{0,24}(?:用户|账号).{0,48}(?:资源|书签|笔记|文件)/u],
          excludeAny: [/(?:最多|排行|排名)/u],
        },
      },
      {
        id: 'read.get_resource_creation_ranking',
        domain: 'admin',
        effect: 'read',
        status: 'enabled',
        toolNames: ['get_resource_creation_ranking'],
        description: '按用户统计资源创建数量排行',
        routing: { requireAny: [/(?:最多|排行|排名)/u], preferAny: [/(?:最多|排行|排名)/u] },
      },
      {
        id: 'read.query_platform_resources',
        domain: 'admin',
        effect: 'read',
        status: 'enabled',
        toolNames: ['query_platform_resources'],
        description: '列出全平台资源标题明细',
        routing: {
          requireAny: [/(?:平台|大家|所有用户).{0,28}(?:资源|书签|笔记|文件)/u],
          preferAny: [/(?:哪些|清单|明细|标题)/u],
          excludeAny: [/(?:最多|排行|排名)/u],
        },
      },
    ];
    const turnSpec = spec([
      {
        id: 'admin-read',
        kind: 'read',
        capabilityDomain: 'admin',
        description,
        targetDescription: '今天',
        dependsOn: [],
      },
    ]);
    turnSpec.requestKind = 'answer';
    const route = routeTurnSpecCapabilities({ turnSpec, catalog: adminCatalog, tools: adminTools, message });
    expect(route).toMatchObject({ state: 'ready', candidateToolCount: 1 });
    expect(route.candidates.map((item) => item.name)).toEqual([expected]);
  });

  it.each([
    {
      message: '列出我今天新增的笔记数量和标题。',
      expected: 'query_notes',
    },
    {
      message: '今天全平台新增的笔记标题分别是什么？',
      expected: 'query_platform_resources',
    },
  ])('单一归属与平台范围不会交叉路由：$message', ({ message, expected }) => {
    const scopedTools = [{ name: 'query_notes' }, { name: 'query_platform_resources' }];
    const scopedCatalog = [
      {
        id: 'read.query_notes',
        domain: 'note',
        appliesToDomains: ['note'],
        effect: 'read',
        status: 'enabled',
        toolNames: ['query_notes'],
        description: '查询单一用户的笔记标题和数量',
        routing: { targetScope: 'single_owner', preferAny: [/笔记/u] },
      },
      {
        id: 'read.query_platform_resources',
        domain: 'admin',
        appliesToDomains: ['admin', 'content', 'note', 'bookmark', 'file'],
        effect: 'read',
        status: 'enabled',
        toolNames: ['query_platform_resources'],
        description: '查询全平台资源标题明细',
        routing: { targetScope: 'platform', requireAny: [/笔记/u], preferAny: [/标题/u] },
      },
    ];
    const turnSpec = spec([
      {
        id: 'note-read',
        kind: 'read',
        capabilityDomain: 'note',
        description: '查询笔记标题和数量',
        targetDescription: '今天',
        dependsOn: [],
      },
    ]);
    turnSpec.requestKind = 'answer';
    const route = routeTurnSpecCapabilities({
      turnSpec,
      catalog: scopedCatalog,
      tools: scopedTools,
      message,
    });
    expect(route).toMatchObject({ state: 'ready', candidateToolCount: 1 });
    expect(route.candidates.map((item) => item.name)).toEqual([expected]);
  });

  it.each([
    ['列出我的待整理箱里最近加入的内容。', 'todo', 'read', 'read', 'query_inbox'],
    ['查询回收站里今天删除的笔记。', 'note', 'read', 'read', 'query_trash'],
    ['查询今天的安全攻击事件明细。', 'admin', 'read', 'read', 'get_security_events'],
    ['给我当前安全风险概览，包括高风险 IP 和账号。', 'admin', 'read', 'read', 'get_security_summary'],
    ['今天平台最活跃的用户排行是什么？', 'admin', 'read', 'read', 'get_active_users'],
    ['今天全平台新增笔记数量排行前三是谁？', 'admin', 'read', 'read', 'get_resource_creation_ranking'],
    ['我今天还有免费抽奖次数吗，距离保底还有几抽？', 'growth', 'read', 'read', 'get_lottery_status'],
    ['查询我最近登录过的设备。', 'account', 'read', 'read', 'query_my_devices'],
    ['分析我的收藏总量、本月新增、高频标签和未打标签书签。', 'content', 'read', 'read', 'get_insights'],
    ['查询用户 ID user-1 的成长等级和积分详情。', 'admin', 'read', 'read', 'get_user_detail'],
    ['只查看上一次书签死链体检结果，不要重新检查。', 'bookmark', 'read', 'read', 'query_link_health'],
    ['立即检查我现在有哪些失效书签链接。', 'bookmark', 'write', 'create', 'start_link_health_check'],
    ['我今天还剩多少 AI 额度？', 'account', 'read', 'read', 'get_ai_quota'],
    ['查看我最近的积分收入和支出明细。', 'growth', 'read', 'read', 'query_points_log'],
    ['总结我最近的积分来源、节奏和目标进度。', 'growth', 'read', 'read', 'get_points_summary'],
    ['查看积分商店、我已有的装扮和可以领取的头像框。', 'growth', 'read', 'read', 'get_shop_status'],
    ['把本轮上传的图片创建成一篇图片笔记。', 'note', 'write', 'create', 'create_image_note'],
    ['把本轮附件原文件保存到云空间文件夹“资料”。', 'file', 'write', 'save', 'save_attachment_to_cloud'],
    ['查询名称包含“项目”的云空间文件夹。', 'file', 'read', 'read', 'query_cloud_folders'],
    ['从回收站恢复笔记 [note:note-1]。', 'note', 'write', 'restore', 'restore_trash'],
    ['只预览不要创建：为重复提醒计划安排每天上午 09:00 提醒。', 'todo', 'read', 'read', 'preview_todo_plan'],
    ['生成我的本周内容回顾。', 'growth', 'read', 'read', 'get_recap'],
    ['向系统知识库新增一条 Markdown 知识条目。', 'note', 'write', 'create', 'write_knowledge_base'],
  ])('真实能力目录精确区分相邻工具：%s', (message, domain, kind, operation, expected) => {
    const actualCatalog = buildAgentSemanticCapabilityCatalog(registeredTools);
    const turnSpec = spec([
      {
        id: 'goal',
        kind,
        operation,
        capabilityDomain: domain,
        description: message,
        targetDescription: '',
        dependsOn: [],
      },
    ]);
    turnSpec.requestKind = kind === 'read' ? 'answer' : 'action';
    const route = routeTurnSpecCapabilities({
      turnSpec,
      catalog: actualCatalog,
      tools: registeredTools,
      message,
    });
    expect(route).toMatchObject({ state: 'ready' });
    expect(route.goalRoutes[0].toolNames).toEqual([expected]);
  });

  it('启动后台体检按操作目标路由，但仍保留无需确认的工具执行语义', () => {
    const actualCatalog = buildAgentSemanticCapabilityCatalog(registeredTools);
    const startTool = registeredTools.find((tool) => tool.name === 'start_link_health_check');
    const turnSpec = spec([
      {
        id: 'start-health-check',
        kind: 'write',
        operation: 'create',
        capabilityDomain: 'bookmark',
        description: '立即启动当前账号全部书签死链体检',
        targetDescription: '当前账号的全部书签',
        dependsOn: [],
      },
    ]);
    turnSpec.requestKind = 'action';
    const route = routeTurnSpecCapabilities({
      turnSpec,
      catalog: actualCatalog,
      tools: registeredTools,
      message: '立即检查我现在有哪些失效书签链接。',
    });
    expect(startTool.isWrite).not.toBe(true);
    expect(route).toMatchObject({ state: 'ready', candidateToolCount: 1 });
    expect(route.candidates.map((item) => item.name)).toEqual(['start_link_health_check']);
  });

  it('用户原话中的第一人称优先于模型改写，不能把个人积分摘要扩成管理员查人', () => {
    const actualCatalog = buildAgentSemanticCapabilityCatalog(registeredTools);
    const turnSpec = spec([
      {
        id: 'points-source',
        kind: 'read',
        operation: 'read',
        capabilityDomain: 'growth',
        description: '查询当前用户积分来源和节奏',
        targetDescription: '当前用户账号及积分目标',
        dependsOn: [],
      },
    ]);
    turnSpec.requestKind = 'answer';
    const route = routeTurnSpecCapabilities({
      turnSpec,
      catalog: actualCatalog,
      tools: registeredTools,
      message: '总结我最近的积分来源、节奏和目标进度。',
    });
    expect(route).toMatchObject({ state: 'ready', candidateToolCount: 1 });
    expect(route.candidates.map((item) => item.name)).toEqual(['get_points_summary']);
  });
});
