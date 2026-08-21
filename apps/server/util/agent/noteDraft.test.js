import { describe, expect, it, vi } from 'vitest';
import {
  buildNoteDraftWorkspaceQueryCalls,
  classifyNoteDraftTask,
  classifyPendingNoteDraftFollowUp,
  countNoteDraftCharacters,
  createNoteDraftPrivateContext,
  extractMinimumNoteDraftCharacters,
  generateNoteDraft,
  isNoteDraftRequest,
  normalizeNoteDraftPrivateContext,
  normalizeNoteDraftRefinement,
  requestsNoteDraftTitleChange,
  requestsRichTextNote,
  shouldClassifyNoteDraftTask,
} from './noteDraft.js';

function response(args, overrides = {}) {
  return {
    content: '',
    toolCalls: [
      {
        id: 'draft-call',
        type: 'function',
        function: { name: 'submit_note_draft', arguments: JSON.stringify(args) },
      },
    ],
    usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    usageStatus: 'reported',
    finishReason: 'tool_calls',
    ...overrides,
  };
}

function taskResponse(args, overrides = {}) {
  const normalizedArgs = Object.prototype.hasOwnProperty.call(args, 'workspaceQueries')
    ? args
    : { ...args, workspaceQueries: [] };
  return {
    content: '',
    toolCalls: [
      {
        id: 'task-call',
        type: 'function',
        function: { name: 'classify_note_draft_task', arguments: JSON.stringify(normalizedArgs) },
      },
    ],
    usage: { promptTokens: 9, completionTokens: 3, totalTokens: 12 },
    usageStatus: 'reported',
    finishReason: 'tool_calls',
    ...overrides,
  };
}

function intentResponse(decision, overrides = {}) {
  return {
    content: '',
    toolCalls: [
      {
        id: 'intent-call',
        type: 'function',
        function: {
          name: 'classify_pending_note_draft_intent',
          arguments: JSON.stringify({ decision }),
        },
      },
    ],
    usage: { promptTokens: 8, completionTokens: 2, totalTokens: 10 },
    usageStatus: 'reported',
    finishReason: 'tool_calls',
    ...overrides,
  };
}

const noteCreateIntent = {
  kind: 'action',
  resolution: 'enabled',
  capabilities: [{ id: 'note.create' }],
  toolNames: ['create_note'],
};

describe('noteDraft', () => {
  it('接管单一创建笔记请求，不限制材料类型，但不接管查询或复合写操作', () => {
    expect(isNoteDraftRequest('请根据这些材料生成一篇笔记。', noteCreateIntent)).toBe(true);
    expect(isNoteDraftRequest('请把下面的文字写成笔记。', noteCreateIntent)).toBe(true);
    expect(
      isNoteDraftRequest('这个材料讲了什么？', {
        kind: 'query',
        resolution: 'none',
        capabilities: [],
        toolNames: [],
      }),
    ).toBe(false);
    expect(
      isNoteDraftRequest('生成笔记并修改待办。', {
        ...noteCreateIntent,
        capabilities: [{ id: 'note.create' }, { id: 'todo.status.set' }],
        toolNames: ['create_note', 'set_todo_status'],
      }),
    ).toBe(false);
    expect(isNoteDraftRequest('请根据材料生成一篇笔记，并新建一个待办提醒我明天查看。', noteCreateIntent)).toBe(false);
  });

  it('只接受格式正确的待确认草稿引用', () => {
    expect(
      normalizeNoteDraftRefinement({
        confirmationId: 'confirmation-1',
        confirmationToken: 'a'.repeat(43),
      }),
    ).toEqual({ confirmationId: 'confirmation-1', confirmationToken: 'a'.repeat(43) });
    expect(normalizeNoteDraftRefinement({ confirmationId: 'confirmation-1', confirmationToken: 'short' })).toBe(null);
    expect(normalizeNoteDraftRefinement({ artifactVersionId: '10000000-0000-4000-8000-000000000001' })).toEqual({
      artifactVersionId: '10000000-0000-4000-8000-000000000001',
    });
    expect(normalizeNoteDraftRefinement({ artifactVersionId: 'not-an-artifact-id' })).toBe(null);
  });

  it('开放的笔记产出表达在旧正则下会漏判，这是语义路由必须接管入口的原因', () => {
    // 这些表达语义上都是“材料 → 一篇笔记”，但 NOTE_WRITE_PATTERN 与 note.create 的
    // actionPatterns 都不含合并/汇总/归并类动词，旧门禁一律判否。
    for (const message of [
      '合并这两个资源为一条笔记',
      '把这些材料汇总进同一份记录',
      '归并成新的 Markdown 笔记',
      'Combine these sources into one note',
    ]) {
      expect(isNoteDraftRequest(message, noteCreateIntent)).toBe(false);
    }
  });

  it('传感器对开放产出表达高召回，对纯查询和闲聊不触发分类', () => {
    for (const message of [
      '合并这两个资源为一条笔记',
      '把这些材料汇总进同一份记录',
      '综合上面的内容，整理成一篇文档',
      '归并成新的 Markdown 笔记',
      'Combine these sources into one note',
      '请根据这些材料生成一篇笔记。',
      '把这三个文件总结成一篇笔记', // 产出动词不在词表内，但产物指向明确
      '帮我把这些整理成笔记，好吗？', // 带疑问语气仍有产出动词，不能被问句规则排除
    ]) {
      expect(shouldClassifyNoteDraftTask({ message })).toBe(true);
    }
    for (const message of [
      '你好',
      '深圳今天会下雨吗？',
      '我的笔记里有没有讲遗传的那篇？',
      '轻笺怎么导出数据？',
      // 产物词不能单独成立：以下都提到笔记，但都不是产出笔记的任务。
      '帮我删除我的笔记：引用测试',
      '彻底删除全部笔记',
      '总结我最近 7 天新增的书签和笔记',
      '把这篇笔记的标题改成新版',
    ]) {
      expect(shouldClassifyNoteDraftTask({ message })).toBe(false);
    }
    // 已选材料时，省略宾语的产出说法要进入分类。
    expect(
      shouldClassifyNoteDraftTask({ message: 'Consolidate the selected materials', contextTypes: ['bookmark'] }),
    ).toBe(true);
    expect(shouldClassifyNoteDraftTask({ message: '帮我整理一下', attachmentCount: 2 })).toBe(true);
    expect(shouldClassifyNoteDraftTask({ message: 'Consolidate these', scopeCount: 1 })).toBe(true);
    // 材料问答是高频场景：有材料但只要一段回答时不得多付一次分类调用。
    expect(shouldClassifyNoteDraftTask({ message: '总结文件', attachmentCount: 1 })).toBe(false);
    expect(shouldClassifyNoteDraftTask({ message: '这些材料讲了什么？', contextTypes: ['bookmark', 'note'] })).toBe(
      false,
    );
    expect(shouldClassifyNoteDraftTask({ message: '', contextTypes: ['note'] })).toBe(false);
  });

  it('已绑定材料时把草稿扩写要求送入封闭语义分类，不把纯材料问答误判为写入', () => {
    expect(
      shouldClassifyNoteDraftTask({
        message: '内容太少，字数要至少 2000 字',
        contextTypes: ['note'],
      }),
    ).toBe(true);
    expect(shouldClassifyNoteDraftTask({ message: '重新生成并润色一下', attachmentCount: 1 })).toBe(true);
    expect(shouldClassifyNoteDraftTask({ message: '内容讲了什么？', contextTypes: ['note'] })).toBe(false);
    expect(shouldClassifyNoteDraftTask({ message: '字数要至少 2000 字' })).toBe(false);
  });

  it('专用写能力已明确命中时不会被通用笔记草稿传感器抢走', () => {
    expect(
      shouldClassifyNoteDraftTask({
        message: '把本轮上传的图片创建成一篇图片笔记',
        attachmentCount: 1,
        actionIntent: {
          kind: 'action',
          resolution: 'enabled',
          toolNames: ['create_image_note'],
        },
      }),
    ).toBe(false);
    expect(
      shouldClassifyNoteDraftTask({
        message: '把本轮附件原文件保存到云空间',
        attachmentCount: 1,
        actionIntent: {
          kind: 'action',
          resolution: 'enabled',
          toolNames: ['save_attachment_to_cloud'],
        },
      }),
    ).toBe(false);
    expect(
      shouldClassifyNoteDraftTask({
        message: '根据这些材料创建一篇新笔记',
        contextTypes: ['note'],
        actionIntent: noteCreateIntent,
      }),
    ).toBe(true);
  });

  it('传感器严格宽于旧正则，避免传感器不命中时回落正则又漏判', () => {
    // 主链在传感器不命中时会回落到 isNoteDraftRequest。只要存在“正则命中但传感器
    // 不命中”的表达，那条请求就既不分类也不接管，等于静默漏判。
    for (const message of [
      '请根据这些材料生成一篇笔记。',
      '请把下面的文字写成笔记。',
      '整理成一份 markdown 笔记',
      '把这个转换为笔记',
      'create a note from these sources',
    ]) {
      if (isNoteDraftRequest(message, noteCreateIntent)) {
        expect(shouldClassifyNoteDraftTask({ message })).toBe(true);
      }
    }
  });

  it('识别富文本/HTML 笔记要求，供调用方披露只能产出 Markdown', () => {
    for (const message of ['归并成新的 html 笔记', '把这些整理成一篇富文本笔记', 'Combine these into an HTML note']) {
      expect(requestsRichTextNote(message)).toBe(true);
    }
    for (const message of ['归并成新的 Markdown 笔记', '把这两个资源合并成一条笔记', '生成一篇笔记']) {
      expect(requestsRichTextNote(message)).toBe(false);
    }
  });

  it('改稿默认保持已确认范围的标题，只有用户明确要求时才允许改标题', async () => {
    expect(requestsNoteDraftTitleChange('重新生成，内容更详细，至少 2500 字')).toBe(false);
    expect(requestsNoteDraftTitleChange('标题改为“新的复盘标题”')).toBe(true);
    expect(requestsNoteDraftTitleChange('use a better title and expand the content')).toBe(true);

    const previousDraft = { title: '今日笔记总结', content: '旧稿。'.repeat(300) };
    const preserved = await generateNoteDraft({
      materials: [{ type: 'note', id: 'n1', title: '来源', content: '材料。'.repeat(200) }],
      instruction: '重新生成，内容更详细',
      previousDraft,
      request: vi
        .fn()
        .mockResolvedValue(
          response({ title: '模型擅自改掉的标题', content: `${previousDraft.content}${'补充。'.repeat(200)}` }),
        ),
    });
    expect(preserved.title).toBe('今日笔记总结');

    const renamed = await generateNoteDraft({
      materials: [{ type: 'note', id: 'n1', title: '来源', content: '材料。'.repeat(200) }],
      instruction: '把标题改为“新的复盘标题”，并扩写正文',
      previousDraft,
      request: vi
        .fn()
        .mockResolvedValue(
          response({ title: '新的复盘标题', content: `${previousDraft.content}${'补充。'.repeat(200)}` }),
        ),
    });
    expect(renamed.title).toBe('新的复盘标题');
  });

  it('语义分类接管笔记入口，复合写请求交回 Semantic Planner', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        taskResponse({ producesNote: true, otherMutations: false, needsWorkspaceRetrieval: false }),
      )
      .mockResolvedValueOnce(taskResponse({ producesNote: true, otherMutations: true, needsWorkspaceRetrieval: false }))
      .mockResolvedValueOnce(
        taskResponse({ producesNote: false, otherMutations: false, needsWorkspaceRetrieval: false }),
      );
    const onResponse = vi.fn();

    const merge = await classifyNoteDraftTask({
      message: '合并这两个资源为一条笔记',
      contextTypes: ['bookmark', 'note'],
      request,
      onResponse,
    });
    const compound = await classifyNoteDraftTask({
      message: '生成一篇笔记，并新建一个待办提醒我明天查看',
      request,
      onResponse,
    });
    const query = await classifyNoteDraftTask({ message: '这些材料讲了什么？', request, onResponse });

    expect(merge).toMatchObject({ producesNote: true, otherMutations: false });
    expect(compound).toMatchObject({ producesNote: true, otherMutations: true });
    expect(query).toMatchObject({ producesNote: false });
    expect(request.mock.calls[0][0][0].content).toContain('合并、汇总、归并');
    expect(request.mock.calls[0][0][0].content).toContain('不要依赖固定词语');
    expect(request.mock.calls[0][0][1].content).toContain('合并这两个资源为一条笔记');
    expect(request.mock.calls[0][0][1].content).toContain('bookmark');
    expect(request.mock.calls[0][1]).toMatchObject({
      toolChoice: { type: 'function', function: { name: 'classify_note_draft_task' } },
      maxTokens: 256,
      temperature: 0,
    });
    expect(request.mock.calls[0][1].tools[0].function.parameters.required).toContain('workspaceQueries');
    expect(
      request.mock.calls[0][1].tools[0].function.parameters.properties.workspaceQueries.items.properties.resourceType
        .enum,
    ).toEqual(['note', 'bookmark', 'file', 'todo']);
    expect(onResponse).toHaveBeenCalledTimes(3);
  });

  it('语义分类通用识别尚未绑定的工作区材料，不枚举时间或资源问法', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        taskResponse({
          producesNote: true,
          otherMutations: false,
          needsWorkspaceRetrieval: true,
          workspaceQueries: [{ resourceType: 'note', keyword: '项目', timeRange: '刚刚' }],
        }),
      )
      .mockResolvedValueOnce(
        taskResponse({ producesNote: true, otherMutations: false, needsWorkspaceRetrieval: false }),
      );

    const implicit = await classifyNoteDraftTask({
      message: '把我刚刚整理过的那些项目资料浓缩成一篇复盘',
      contextTypes: [],
      contextCount: 0,
      scopeCount: 0,
      attachmentCount: 0,
      request,
    });
    const selected = await classifyNoteDraftTask({
      message: '把选中的内容浓缩成一篇复盘',
      contextTypes: ['note'],
      contextCount: 2,
      scopeCount: 1,
      request,
    });

    expect(implicit.needsWorkspaceRetrieval).toBe(true);
    expect(implicit.workspaceQueries).toEqual([{ resourceType: 'note', keyword: '项目', timeRange: '刚刚' }]);
    expect(selected.needsWorkspaceRetrieval).toBe(false);
    expect(JSON.parse(request.mock.calls[1][0][1].content)).toMatchObject({
      selectedMaterialCount: 2,
      selectedScopeCount: 1,
    });
  });

  it('把结构化材料范围映射到现有只读工具，不能静默丢掉不受支持的筛选', () => {
    expect(
      buildNoteDraftWorkspaceQueryCalls([
        { resourceType: 'note', timeRange: '今天' },
        { resourceType: 'bookmark', keyword: 'AI', tag: '稍后读', timeRange: '最近7天' },
        { resourceType: 'file', keyword: '复盘', fileType: 'document' },
        { resourceType: 'todo', keyword: '发布', todoStatus: 'all' },
      ]),
    ).toEqual([
      { toolName: 'query_notes', args: { timeRange: '今天', limit: 50 } },
      {
        toolName: 'query_bookmarks',
        args: { keyword: 'AI', timeRange: '最近7天', tag: '稍后读', limit: 50 },
      },
      { toolName: 'query_files', args: { keyword: '复盘', type: 'document', limit: 50 } },
      { toolName: 'query_todos', args: { status: 'all', keyword: '发布', sort: 'newest', limit: 50 } },
    ]);
    expect(buildNoteDraftWorkspaceQueryCalls([{ resourceType: 'todo', timeRange: '今天' }])).toEqual([]);
    expect(buildNoteDraftWorkspaceQueryCalls([{ resourceType: 'note', tag: '不支持' }])).toEqual([]);
  });

  it('笔记任务分类协议不完整时显式失败，由调用方决定降级', async () => {
    const cases = [
      { content: '大概是要笔记吧', toolCalls: [] },
      taskResponse({ producesNote: true }),
      taskResponse({ producesNote: 'yes', otherMutations: false, needsWorkspaceRetrieval: false }),
      taskResponse({ producesNote: true, otherMutations: false, needsWorkspaceRetrieval: false, extra: 1 }),
      taskResponse({
        producesNote: true,
        otherMutations: false,
        needsWorkspaceRetrieval: false,
        workspaceQueries: [{ resourceType: 'note', timeRange: '今天' }],
      }),
      taskResponse({
        producesNote: true,
        otherMutations: false,
        needsWorkspaceRetrieval: true,
        workspaceQueries: [{ resourceType: 'unknown' }],
      }),
      taskResponse(
        { producesNote: true, otherMutations: false, needsWorkspaceRetrieval: false },
        {
          toolCalls: [
            {
              id: 'task-call',
              type: 'function',
              function: { name: 'submit_note_draft', arguments: '{"title":"x","content":"y"}' },
            },
          ],
        },
      ),
    ];
    for (const mocked of cases) {
      await expect(
        classifyNoteDraftTask({ message: '合并这些材料', request: vi.fn().mockResolvedValue(mocked) }),
      ).rejects.toMatchObject({ code: 'NOTE_DRAFT_TASK_INVALID' });
    }
    await expect(classifyNoteDraftTask({ message: '   ', request: vi.fn() })).rejects.toMatchObject({
      code: 'NOTE_DRAFT_TASK_INVALID',
    });
  });

  it('用受约束语义协议判断草稿承接，不由调用方枚举用户句式', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(intentResponse('revise_pending_draft'))
      .mockResolvedValueOnce(intentResponse('separate_request'))
      .mockResolvedValueOnce(intentResponse('replace_pending_draft_scope'));
    const onResponse = vi.fn();

    const revision = await classifyPendingNoteDraftFollowUp({
      message: '这一版读起来还是像说明书，面向刚入门的人重新组织一下，语气自然些。',
      history: [
        { role: 'user', content: '请根据材料整理一篇笔记。' },
        { role: 'assistant', content: '笔记草稿已准备好。' },
      ],
      sourceMessage: '综合所选材料生成一篇技术笔记。',
      draftTitle: '原草稿',
      draftContent: '正文里包含安装步骤和使用示例。',
      request,
      onResponse,
    });
    const separate = await classifyPendingNoteDraftFollowUp({
      message: '深圳今天会下雨吗？',
      request,
      onResponse,
    });
    const newMaterialScope = await classifyPendingNoteDraftFollowUp({
      message: '把我今天的全部笔记总结成一篇新的笔记。',
      sourceMessage: '把最近 7 天的笔记总结成一篇笔记。',
      draftTitle: '最近 7 天笔记总结',
      draftContent: '旧范围草稿正文。',
      request,
      onResponse,
    });

    expect(revision.decision).toBe('revise_pending_draft');
    expect(separate.decision).toBe('separate_request');
    expect(newMaterialScope.decision).toBe('replace_pending_draft_scope');
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls[0][0][0].content).toContain('整体含义、指代和最近对话');
    expect(request.mock.calls[2][0][0].content).toContain('最新范围永远覆盖旧范围');
    expect(request.mock.calls[0][0][1].content).toContain('面向刚入门的人重新组织一下');
    expect(request.mock.calls[0][0][1].content).toContain('正文里包含安装步骤和使用示例');
    expect(request.mock.calls[0][1]).toMatchObject({
      toolChoice: { type: 'function', function: { name: 'classify_pending_note_draft_intent' } },
      maxTokens: 256,
      temperature: 0,
    });
    expect(onResponse).toHaveBeenCalledTimes(3);
  });

  it('语义分类协议缺失时失败关闭，不回退到关键词猜测', async () => {
    await expect(
      classifyPendingNoteDraftFollowUp({
        message: '按刚才说的处理。',
        request: vi.fn().mockResolvedValue({
          content: '普通文本',
          toolCalls: [],
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          usageStatus: 'reported',
        }),
      }),
    ).rejects.toMatchObject({ code: 'NOTE_DRAFT_INTENT_INVALID' });

    await expect(
      classifyPendingNoteDraftFollowUp({
        message: '把这版继续完善。',
        request: vi.fn().mockResolvedValue(
          intentResponse('revise_pending_draft', {
            toolCalls: [
              {
                id: 'intent-call',
                type: 'function',
                function: {
                  name: 'classify_pending_note_draft_intent',
                  arguments: JSON.stringify({ decision: 'revise_pending_draft', unexpected: true }),
                },
              },
            ],
          }),
        ),
      }),
    ).rejects.toMatchObject({ code: 'NOTE_DRAFT_INTENT_INVALID' });
  });

  it('私有上下文只保留稳定引用和原始文本，并过滤重复或无效材料', () => {
    const context = createNoteDraftPrivateContext({
      sourceMessage: '请根据这些材料生成笔记',
      contextRefs: [
        { type: 'bookmark', id: 'b1', title: '客户端标题不可信' },
        { type: 'note', id: 'n1' },
        { type: 'bookmark', id: 'b1' },
        { type: 'unknown', id: 'x1' },
      ],
      scopeRefs: [
        { type: 'note_branch', id: 'branch-1', title: '客户端标题不可信' },
        { type: 'note_branch', id: 'branch-1' },
        { type: 'note', id: 'n1' },
      ],
      attachmentIds: ['file-source-1', 'file-source-1', ''],
    });

    expect(context).toEqual({
      kind: 'note_draft_materials',
      version: 1,
      sourceMessage: '请根据这些材料生成笔记',
      contextRefs: [
        { type: 'bookmark', id: 'b1' },
        { type: 'note', id: 'n1' },
      ],
      scopeRefs: [{ type: 'note_branch', id: 'branch-1' }],
      attachmentIds: ['file-source-1'],
      sourceSetId: '',
    });
    expect(normalizeNoteDraftPrivateContext(context)).toEqual(context);
    expect(normalizeNoteDraftPrivateContext({ ...context, kind: 'other' })).toBe(null);
  });

  it('私有上下文只记录 SourceSet 句柄，不复制 Dialogue Anchor 正文', () => {
    const context = createNoteDraftPrivateContext({
      sourceMessage: '把刚才讨论整理成笔记',
      sourceSetId: '10000000-0000-4000-8000-000000000001',
    });

    expect(context).toMatchObject({
      sourceSetId: '10000000-0000-4000-8000-000000000001',
    });
    expect(JSON.stringify(context)).not.toContain('对话正文');
    expect(normalizeNoteDraftPrivateContext(context)).toEqual(context);
  });

  it('服务端查询生成的私有材料快照最多保留草稿引擎可消费的 12 项', () => {
    const context = createNoteDraftPrivateContext({
      sourceMessage: '总结查询命中的全部笔记',
      contextRefs: Array.from({ length: 20 }, (_, index) => ({ type: 'note', id: `note-${index + 1}` })),
    });

    expect(context.contextRefs).toHaveLength(12);
    expect(context.contextRefs.at(-1)).toEqual({ type: 'note', id: 'note-12' });
  });

  it('统一强制协议可同时接收书签、笔记、待办、文件和粘贴文本', async () => {
    const request = vi.fn().mockResolvedValue(
      response({
        title: '混合材料整理笔记',
        content: `# 混合材料\n\n${'整理后的正文。'.repeat(80)}`,
      }),
    );
    const onResponse = vi.fn();

    const result = await generateNoteDraft({
      materials: [
        { type: 'bookmark', id: 'b1', title: 'TypeORM', url: 'https://typeorm.io', content: '网页正文。'.repeat(80) },
        { type: 'note', id: 'n1', title: '旧笔记', content: '笔记正文。'.repeat(40) },
        { type: 'todo', id: 't1', title: '发布任务', content: '子待办和截止时间。'.repeat(20) },
        { type: 'document', id: 'f1', title: '需求.pdf', content: '文件正文。'.repeat(40) },
        { type: 'text', title: '用户原始输入', content: '额外补充信息。'.repeat(20) },
      ],
      instruction: '综合这些材料生成一篇详细笔记',
      request,
      onResponse,
    });

    expect(result.title).toBe('混合材料整理笔记');
    expect(result.content).toContain('# 混合材料');
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][0][0].content).toContain('统一笔记草稿引擎');
    expect(request.mock.calls[0][0][1].content).toEqual(expect.stringContaining('类型：文件'));
    expect(request.mock.calls[0][1]).toMatchObject({
      toolChoice: { type: 'function', function: { name: 'submit_note_draft' } },
      maxTokens: 8192,
      temperature: 0.25,
    });
    expect(onResponse).toHaveBeenCalledOnce();
  });

  it('协议不完整时只修复一次，不把半截参数当作确认草稿', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ ...response({}), toolCalls: [] })
      .mockResolvedValueOnce(
        response({
          title: '修复后的笔记',
          content: `## 内容\n\n${'完整资料。'.repeat(80)}`,
        }),
      );

    const result = await generateNoteDraft({
      materials: [{ type: 'text', title: '原文', content: '有效正文。'.repeat(100) }],
      instruction: '生成笔记',
      request,
    });

    expect(result.attempts).toBe(2);
    expect(request.mock.calls[1][0][1].content).toContain('上一次草稿未通过完整性检查');
  });

  it('用户要求扩写时，新草稿不比旧稿完整会触发修复', async () => {
    const previousContent = '旧稿内容。'.repeat(100);
    const request = vi
      .fn()
      .mockResolvedValueOnce(response({ title: '旧标题', content: '仍然很短。' }))
      .mockResolvedValueOnce(
        response({ title: '扩写标题', content: `${previousContent}\n\n${'新增分析。'.repeat(60)}` }),
      );

    const result = await generateNoteDraft({
      materials: [{ type: 'note', id: 'n1', title: '来源笔记', content: '来源正文。'.repeat(60) }],
      instruction: '太短了，重新写长一点、更详细一点',
      previousDraft: { title: '旧标题', content: previousContent },
      request,
    });

    expect(result.attempts).toBe(2);
    expect(result.content.length).toBeGreaterThan(previousContent.length);
  });

  it('O-03：800 字旧稿要求更详细时，不能只增加 1 个字符', async () => {
    const previousContent = '旧'.repeat(800);
    const request = vi
      .fn()
      .mockResolvedValueOnce(response({ title: '几乎没扩写', content: `${previousContent}新` }))
      .mockResolvedValueOnce(response({ title: '真正扩写', content: `${previousContent}${'新增分析。'.repeat(80)}` }));

    const result = await generateNoteDraft({
      materials: [{ type: 'note', id: 'n1', title: '来源笔记', content: '可靠来源。'.repeat(100) }],
      instruction: '内容太短了，请写得更详细一点',
      previousDraft: { title: '旧标题', content: previousContent },
      request,
    });

    // PR4 的 OutputContract V2 应把默认目标收敛为 max(旧稿 * 1.4, 旧稿 + 300)。
    expect(result.attempts).toBe(2);
    expect(result.content.length).toBeGreaterThanOrEqual(1120);
  });

  it('确定性解析明确的最少字数，并与确认卡使用同一字符口径', () => {
    expect(extractMinimumNoteDraftCharacters('字数要至少 2000 字')).toBe(2000);
    expect(extractMinimumNoteDraftCharacters('正文不少于 2,000 字')).toBe(2000);
    expect(extractMinimumNoteDraftCharacters('请写 2千字以上')).toBe(2000);
    expect(extractMinimumNoteDraftCharacters('重新生成并至少写到 2000 字')).toBe(2000);
    expect(extractMinimumNoteDraftCharacters('at least 2k characters')).toBe(2000);
    expect(extractMinimumNoteDraftCharacters('至少 800 字，但最终不得少于 2 千字')).toBe(2000);
    expect(extractMinimumNoteDraftCharacters('大约 2000 字即可')).toBeNull();
    expect(countNoteDraftCharacters('  中文\nMarkdown  ')).toBe('中文\nMarkdown'.length);
  });

  it('最少字数是服务端硬约束，短稿会带实际字数定向修复一次', async () => {
    const shortContent = '短稿内容。'.repeat(190);
    const completeContent = `# 完整长文\n\n${'经过材料校验的详细分析。'.repeat(200)}`;
    const request = vi
      .fn()
      .mockResolvedValueOnce(response({ title: '短稿', content: shortContent }))
      .mockResolvedValueOnce(response({ title: '完整长文', content: completeContent }));

    const onValidation = vi.fn();
    const result = await generateNoteDraft({
      materials: [{ type: 'note', id: 'n1', title: '来源', content: '可靠材料。'.repeat(100) }],
      instruction: '内容太少，请重新生成，字数要至少 2000 字',
      request,
      onValidation,
    });

    expect(shortContent.length).toBeLessThan(2000);
    expect(result.attempts).toBe(2);
    expect(countNoteDraftCharacters(result.content)).toBeGreaterThanOrEqual(2000);
    expect(request.mock.calls[0][1].tools[0].function.parameters.properties.content.minLength).toBe(2000);
    expect(request.mock.calls[0][0][1].content).toContain('必须至少 2000 字');
    expect(request.mock.calls[1][0][1].content).toContain(`正文当前约 ${shortContent.length} 字`);
    expect(onValidation).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        lengthMode: 'minimum',
        requiredMinChars: 2000,
        actualChars: shortContent.length,
        validationIssues: ['length_below_minimum'],
      }),
      1,
    );
    expect(result.validation).toMatchObject({
      lengthMode: 'minimum',
      requiredMinChars: 2000,
      actualChars: completeContent.length,
      validationIssues: [],
    });
  });

  it('模型连续两次未达到明确下限时失败关闭，不生成缩水确认卡', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(response({ title: '第一次短稿', content: '不足内容。'.repeat(100) }))
      .mockResolvedValueOnce(response({ title: '第二次短稿', content: '仍然不足。'.repeat(180) }));

    await expect(
      generateNoteDraft({
        materials: [{ type: 'note', id: 'n1', title: '来源', content: '可靠材料。'.repeat(100) }],
        instruction: '正文不得少于 2000 字',
        request,
      }),
    ).rejects.toMatchObject({ code: 'NOTE_DRAFT_INCOMPLETE' });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('O-02：大约 2000 字编译为目标区间，区间外先修复再返回', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(response({ title: '偏短', content: '短'.repeat(1700) }))
      .mockResolvedValueOnce(response({ title: '合格', content: '长'.repeat(1900) }));

    const result = await generateNoteDraft({
      materials: [{ type: 'note', id: 'n1', title: '来源', content: '可靠材料。'.repeat(100) }],
      instruction: '生成一篇大约 2000 字的 Markdown 笔记',
      request,
    });

    expect(result.attempts).toBe(2);
    expect(result.validation).toMatchObject({
      lengthMode: 'target_range',
      requiredMinChars: 1800,
      allowedMaxChars: 2300,
      actualChars: 1900,
      validationIssues: [],
    });
    expect(request.mock.calls[0][1].tools[0].function.parameters.properties.content).toMatchObject({
      minLength: 1800,
      maxLength: 2300,
    });
  });

  it('O-04：只润色不改变长度时按旧稿 ±10% 验收', async () => {
    const previousContent = `原稿链接 https://example.com/source\n\n${'旧'.repeat(1160)}`;
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        response({ title: '错误扩写', content: `https://example.com/source\n\n${'新'.repeat(1600)}` }),
      )
      .mockResolvedValueOnce(
        response({ title: '长度保持', content: `https://example.com/source\n\n${'新'.repeat(1170)}` }),
      );

    const result = await generateNoteDraft({
      materials: [{ type: 'note', id: 'n1', title: '来源', content: '可靠材料。'.repeat(100) }],
      instruction: '只润色，不改变长度',
      previousDraft: { title: '旧标题', content: previousContent },
      request,
    });

    expect(result.attempts).toBe(2);
    expect(result.validation.lengthMode).toBe('preserve_length');
    expect(result.validation.validationIssues).toEqual([]);
  });

  it('超过笔记正文上限的最少字数在调用模型前显式拒绝', async () => {
    const request = vi.fn();
    await expect(
      generateNoteDraft({
        materials: [{ type: 'text', title: '来源', content: '材料正文' }],
        instruction: '至少 70000 字',
        request,
      }),
    ).rejects.toMatchObject({ code: 'NOTE_DRAFT_LENGTH_UNSUPPORTED' });
    expect(request).not.toHaveBeenCalled();
  });

  it('O-08：材料明显不足且禁止引入一般知识时先说明不足，不调用模型编造凑字数', async () => {
    const request = vi.fn();
    await expect(
      generateNoteDraft({
        materials: [{ type: 'text', title: '极短材料', content: '只有一个未经展开的结论。' }],
        instruction: '仅根据这些材料写一篇至少 5000 字的笔记，不得加入外部知识',
        request,
      }),
    ).rejects.toMatchObject({
      code: 'NOTE_DRAFT_MATERIALS_INSUFFICIENT',
      message: expect.stringContaining('补充材料'),
    });
    expect(request).not.toHaveBeenCalled();
  });
});
