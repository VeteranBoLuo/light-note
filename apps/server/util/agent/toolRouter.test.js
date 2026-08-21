import { describe, expect, it } from 'vitest';
import { matchAgentWriteActionToolNames, selectAgentTools } from './toolRouter.js';

const tools = [
  { name: 'search_content' },
  { name: 'search_knowledge_base' },
  { name: 'get_user_info' },
  { name: 'get_ai_quota' },
  { name: 'get_recap' },
  { name: 'get_insights' },
  { name: 'query_bookmarks' },
  { name: 'create_bookmark', isWrite: true },
  { name: 'query_link_health' },
  { name: 'start_link_health_check' },
  { name: 'query_notes' },
  { name: 'read_note' },
  { name: 'analyze_resource_images' },
  { name: 'create_note', isWrite: true },
  { name: 'create_image_note', isWrite: true },
  { name: 'query_files' },
  { name: 'query_cloud_folders' },
  { name: 'get_storage_usage' },
  { name: 'get_growth' },
  { name: 'get_points_summary' },
  { name: 'save_attachment_to_cloud', isWrite: true },
  { name: 'query_tags' },
  { name: 'query_users', requireRoot: true },
  { name: 'get_resource_creation_ranking', requireRoot: true },
  { name: 'get_checkin_ranking', requireRoot: true },
  { name: 'get_security_events', requireRoot: true },
  { name: 'query_api_logs', requireRoot: true },
  { name: 'query_todos' },
  { name: 'set_todo_status', isWrite: true },
  { name: 'delete_todo', isWrite: true },
  { name: 'query_inbox' },
  { name: 'enqueue_inbox', isWrite: true },
  { name: 'complete_inbox', isWrite: true },
  { name: 'set_resource_tags', isWrite: true },
];
const registry = new Map(tools.map((tool) => [tool.name, tool]));

describe('selectAgentTools', () => {
  it('按意图选择相关工具而不是按注册顺序先塞通用工具', () => {
    const selected = selectAgentTools(registry, {
      message: '帮我找一下最近收藏的书签',
      userRole: 'user',
      maxTools: 8,
    });
    const names = selected.map((tool) => tool.name);
    expect(names).toContain('query_bookmarks');
    expect(names).not.toContain('query_notes');
    expect(names.length).toBeLessThanOrEqual(8);
  });

  it.each([
    ['帮我回顾很久没看的收藏', 'get_recap'],
    ['帮我分析下我的收藏', 'get_insights'],
  ])('%s 路由到只读洞察工具且不暴露创建书签', (message, expectedTool) => {
    const selected = selectAgentTools(registry, {
      message,
      userRole: 'user',
      maxTools: 12,
    });
    expect(selected.map((tool) => tool.name)).toContain(expectedTool);
    expect(selected.map((tool) => tool.name)).toContain('query_bookmarks');
    expect(selected.map((tool) => tool.name)).not.toContain('create_bookmark');
    expect(matchAgentWriteActionToolNames(message)).toEqual([]);
  });

  it('死链意图同时提供真实体检与历史结果工具给 Planner 区分', () => {
    const selected = selectAgentTools(registry, {
      message: '我有哪些书签链接失效了？',
      userRole: 'user',
      maxTools: 12,
    });
    expect(selected.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['query_link_health', 'start_link_health_check']),
    );
  });

  it('非 root 永远拿不到 root 工具 schema', () => {
    const selected = selectAgentTools(registry, {
      message: '查询用户和安全事件',
      userRole: 'user',
    });
    expect(selected.some((tool) => tool.requireRoot)).toBe(false);
  });

  it('Semantic Planner 模式不按关键词预裁剪，稳定提供当前身份全部可用工具', () => {
    const candidateSets = [
      '帮我回顾很久没看的收藏',
      '把待办标记为完成',
      '今天新增了哪些笔记？',
      '分析刚才引用的网页',
      '整理一份最近资料的长总结',
    ].map((message) =>
      selectAgentTools(registry, { message, userRole: 'user', semanticPlanner: true }).map((tool) => tool.name),
    );

    for (const candidates of candidateSets.slice(1)) expect(candidates).toEqual(candidateSets[0]);
    expect(candidateSets[0]).toEqual(
      [...candidateSets[0]].sort((left, right) => left.localeCompare(right)),
    );
    expect(candidateSets[0].some((name) => registry.get(name)?.requireRoot)).toBe(false);
  });

  it('Semantic Planner 模式仍在模型前过滤 visitor 写工具', () => {
    const selected = selectAgentTools(registry, {
      message: '创建笔记',
      userRole: 'visitor',
      allowWrite: true,
      allowVisitorWrite: false,
      semanticPlanner: true,
    });

    expect(selected.some((tool) => tool.isWrite)).toBe(false);
  });

  it('root 的后台意图可获得相应只读工具，但仍受上限约束', () => {
    const selected = selectAgentTools(registry, {
      message: '帮我查看安全事件和后台日志',
      userRole: 'root',
      maxTools: 4,
    });
    expect(selected.some((tool) => tool.name === 'get_security_events')).toBe(true);
    expect(selected.some((tool) => tool.name === 'query_api_logs')).toBe(true);
    expect(selected.length).toBeLessThanOrEqual(4);
  });

  it('资源新增排行只向 root 提供专用聚合工具', () => {
    const root = selectAgentTools(registry, {
      message: '昨天谁新增的资源最多？',
      userRole: 'root',
      maxTools: 4,
    });
    const user = selectAgentTools(registry, {
      message: '昨天谁新增的资源最多？',
      userRole: 'user',
      maxTools: 4,
    });

    expect(root.map((tool) => tool.name)).toContain('get_resource_creation_ranking');
    expect(user.map((tool) => tool.name)).not.toContain('get_resource_creation_ranking');
  });

  it('签到排行只向 root 提供专用聚合工具，同时普通用户仍可读取自己的成长信息', () => {
    const root = selectAgentTools(registry, {
      message: '目前签到天数排名和最长连签排名是什么？',
      userRole: 'root',
      maxTools: 4,
    });
    const user = selectAgentTools(registry, {
      message: '我当前连签几天？',
      userRole: 'user',
      maxTools: 4,
    });

    expect(root.map((tool) => tool.name)).toContain('get_checkin_ranking');
    expect(user.map((tool) => tool.name)).toContain('get_growth');
    expect(user.map((tool) => tool.name)).not.toContain('get_checkin_ranking');
  });

  it('积分目标与获取节奏问题优先提供服务端口径的只读摘要', () => {
    const selected = selectAgentTools(registry, {
      message: '按我最近的积分节奏，距离兑换天穹还差多久？',
      userRole: 'user',
      maxTools: 6,
    });
    expect(selected.map((tool) => tool.name)).toContain('get_points_summary');
  });

  it('游客和只读上下文不下发写工具 schema', () => {
    const visitor = selectAgentTools(registry, {
      message: '帮我收藏这个书签',
      userRole: 'visitor',
    });
    const readonly = selectAgentTools(registry, {
      message: '创建一篇笔记',
      userRole: 'user',
      allowWrite: false,
    });
    expect(visitor.some((tool) => tool.isWrite)).toBe(false);
    expect(readonly.some((tool) => tool.isWrite)).toBe(false);
  });

  it('仅管理员维护上下文可显式向游客下发写工具 schema', () => {
    const selected = selectAgentTools(registry, {
      message: '创建一篇笔记',
      userRole: 'visitor',
      allowWrite: true,
      allowVisitorWrite: true,
    });
    expect(selected.some((tool) => tool.name === 'create_note')).toBe(true);
  });

  it('用户显式选择笔记后，即使问题省略“笔记”二字也提供精确读取工具', () => {
    const selected = selectAgentTools(registry, {
      message: '这里面还有哪些没完成？',
      contextTypes: ['note'],
      userRole: 'user',
    });
    expect(selected.some((tool) => tool.name === 'read_note')).toBe(true);
  });

  it('显式附件操作优先提供对应动作与必要依赖，不混入另一种写操作', () => {
    const saveTools = selectAgentTools(registry, {
      message: '把这个文件保存到云空间',
      contextTypes: ['file'],
      userRole: 'user',
      maxTools: 12,
    });
    const noteTools = selectAgentTools(registry, {
      message: '创建图片笔记并插入这张图',
      contextTypes: ['file'],
      userRole: 'user',
      maxTools: 12,
    });
    expect(saveTools.some((tool) => tool.name === 'save_attachment_to_cloud')).toBe(true);
    expect(saveTools.some((tool) => tool.name === 'query_cloud_folders')).toBe(true);
    expect(noteTools.some((tool) => tool.name === 'create_image_note')).toBe(true);
    expect(noteTools.some((tool) => tool.name === 'query_cloud_folders')).toBe(true);
    expect(saveTools.some((tool) => tool.name === 'create_image_note')).toBe(false);
    expect(noteTools.some((tool) => tool.name === 'save_attachment_to_cloud')).toBe(false);
    expect(noteTools.some((tool) => tool.name === 'create_note')).toBe(false);
    expect(saveTools.length).toBeLessThanOrEqual(12);
    expect(noteTools.length).toBeLessThanOrEqual(12);
  });

  it('明确写动作在单个 schema 名额内优先于通用检索', () => {
    const selected = selectAgentTools(registry, {
      message: '创建一篇笔记',
      userRole: 'user',
      maxTools: 1,
    });
    expect(selected.map((tool) => tool.name)).toEqual(['create_note']);
  });

  it('工具注册顺序变化不会改变同一请求的候选顺序', () => {
    const reversedRegistry = new Map([...tools].reverse().map((tool) => [tool.name, tool]));
    const input = {
      message: '帮我恢复回收站里的笔记',
      userRole: 'user',
      maxTools: 8,
    };
    expect(selectAgentTools(registry, input).map((tool) => tool.name)).toEqual(
      selectAgentTools(reversedRegistry, input).map((tool) => tool.name),
    );
  });

  it('待办状态动作与其必要查询工具在紧张上限下仍优先保留', () => {
    const selected = selectAgentTools(registry, {
      message: '把待办“整理发票”标记为完成',
      userRole: 'user',
      maxTools: 2,
    });
    expect(selected.map((tool) => tool.name)).toEqual(['set_todo_status', 'query_todos']);
  });

  it('待办删除动作与其必要查询工具在紧张上限下仍优先保留', () => {
    const selected = selectAgentTools(registry, {
      message: '把刚才那个待办删掉',
      userRole: 'user',
      maxTools: 2,
    });
    expect(selected.map((tool) => tool.name)).toEqual(['delete_todo', 'query_todos']);
  });

  it('“任务”这一常用说法同样路由到待办查询工具', () => {
    const selected = selectAgentTools(registry, {
      message: '我的任务有哪些？',
      userRole: 'user',
      maxTools: 2,
    });
    expect(selected.map((tool) => tool.name)).toContain('query_todos');
  });

  it.each([
    ['我目前已完成的待办有哪些？', 'query_todos', 'set_todo_status'],
    ['列出我创建的笔记', 'query_notes', 'create_note'],
    ['我收藏的书签有多少？', 'query_bookmarks', 'create_bookmark'],
    ['显示已经上传的文件', 'query_files', 'save_attachment_to_cloud'],
    ['查看已创建的标签', 'query_tags', 'add_tag'],
  ])('%s 只下发对应查询工具，不暴露写工具', (message, queryTool, writeTool) => {
    const selected = selectAgentTools(registry, {
      message,
      userRole: 'user',
      maxTools: 12,
    });
    expect(selected.map((tool) => tool.name)).toContain(queryTool);
    expect(selected.map((tool) => tool.name)).not.toContain(writeTool);
  });

  it('明确写命令进入通用无回执安全门，只读筛选和状态询问不会误判为写动作', () => {
    expect(matchAgentWriteActionToolNames('把待办“整理发票”标记为完成')).toContain('set_todo_status');
    expect(matchAgentWriteActionToolNames('把刚才那个待办删掉')).toContain('delete_todo');
    expect(matchAgentWriteActionToolNames('帮我收藏这个链接')).toContain('create_bookmark');
    expect(matchAgentWriteActionToolNames('创建一篇笔记')).toContain('create_note');
    expect(matchAgentWriteActionToolNames('这个待办完成了吗？')).toEqual([]);
    expect(matchAgentWriteActionToolNames('我目前已完成的待办有哪些？')).toEqual([]);
    expect(matchAgentWriteActionToolNames('列出我创建的笔记')).toEqual([]);
  });

  it('计划中但未注册的标签写能力不会因为 registry 里出现同名占位而被下发', () => {
    const selected = selectAgentTools(registry, {
      message: '给这个书签添加标签',
      contextTypes: ['bookmark'],
      userRole: 'user',
      maxTools: 2,
    });
    expect(selected.map((tool) => tool.name)).not.toContain('set_resource_tags');
    expect(selected.map((tool) => tool.name)).toContain('query_tags');
  });

  it('非数值工具上限安全回退到默认值', () => {
    const selected = selectAgentTools(registry, {
      message: '我的书签有哪些？',
      userRole: 'user',
      maxTools: Number.NaN,
    });
    expect(selected.length).toBeGreaterThan(0);
    expect(selected.length).toBeLessThanOrEqual(10);
  });

  it('过大的工具上限仍不会超过 provider 硬上限', () => {
    const selected = selectAgentTools(registry, {
      message: '帮我查看成长、通知和设备',
      userRole: 'user',
      maxTools: 99,
    });
    expect(selected.length).toBeLessThanOrEqual(12);
  });
});
