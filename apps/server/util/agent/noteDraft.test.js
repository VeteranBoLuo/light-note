import { describe, expect, it, vi } from 'vitest';
import {
  classifyNoteDraftTask,
  classifyPendingNoteDraftFollowUp,
  createNoteDraftPrivateContext,
  generateNoteDraft,
  isNoteDraftRequest,
  normalizeNoteDraftPrivateContext,
  normalizeNoteDraftRefinement,
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
  return {
    content: '',
    toolCalls: [
      {
        id: 'task-call',
        type: 'function',
        function: { name: 'classify_note_draft_task', arguments: JSON.stringify(args) },
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
    expect(
      isNoteDraftRequest('请根据材料生成一篇笔记，并新建一个待办提醒我明天查看。', noteCreateIntent),
    ).toBe(false);
  });

  it('只接受格式正确的待确认草稿引用', () => {
    expect(
      normalizeNoteDraftRefinement({
        confirmationId: 'confirmation-1',
        confirmationToken: 'a'.repeat(43),
      }),
    ).toEqual({ confirmationId: 'confirmation-1', confirmationToken: 'a'.repeat(43) });
    expect(normalizeNoteDraftRefinement({ confirmationId: 'confirmation-1', confirmationToken: 'short' })).toBe(
      null,
    );
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
    // 材料问答是高频场景：有材料但只要一段回答时不得多付一次分类调用。
    expect(shouldClassifyNoteDraftTask({ message: '总结文件', attachmentCount: 1 })).toBe(false);
    expect(shouldClassifyNoteDraftTask({ message: '这些材料讲了什么？', contextTypes: ['bookmark', 'note'] })).toBe(
      false,
    );
    expect(shouldClassifyNoteDraftTask({ message: '', contextTypes: ['note'] })).toBe(false);
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

  it('语义分类接管笔记入口，复合写请求交回 Semantic Planner', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(taskResponse({ producesNote: true, otherMutations: false }))
      .mockResolvedValueOnce(taskResponse({ producesNote: true, otherMutations: true }))
      .mockResolvedValueOnce(taskResponse({ producesNote: false, otherMutations: false }));
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
    expect(request.mock.calls[0][0][1].content).toContain('合并这两个资源为一条笔记');
    expect(request.mock.calls[0][0][1].content).toContain('bookmark');
    expect(request.mock.calls[0][1]).toMatchObject({
      toolChoice: { type: 'function', function: { name: 'classify_note_draft_task' } },
      maxTokens: 256,
      temperature: 0,
    });
    expect(onResponse).toHaveBeenCalledTimes(3);
  });

  it('笔记任务分类协议不完整时显式失败，由调用方决定降级', async () => {
    const cases = [
      { content: '大概是要笔记吧', toolCalls: [] },
      taskResponse({ producesNote: true }),
      taskResponse({ producesNote: 'yes', otherMutations: false }),
      taskResponse({ producesNote: true, otherMutations: false, extra: 1 }),
      taskResponse(
        { producesNote: true, otherMutations: false },
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
      .mockResolvedValueOnce(intentResponse('separate_request'));
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

    expect(revision.decision).toBe('revise_pending_draft');
    expect(separate.decision).toBe('separate_request');
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][0][0].content).toContain('整体含义、指代和最近对话');
    expect(request.mock.calls[0][0][1].content).toContain('面向刚入门的人重新组织一下');
    expect(request.mock.calls[0][0][1].content).toContain('正文里包含安装步骤和使用示例');
    expect(request.mock.calls[0][1]).toMatchObject({
      toolChoice: { type: 'function', function: { name: 'classify_pending_note_draft_intent' } },
      maxTokens: 256,
      temperature: 0,
    });
    expect(onResponse).toHaveBeenCalledTimes(2);
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
      attachmentIds: ['file-source-1'],
    });
    expect(normalizeNoteDraftPrivateContext(context)).toEqual(context);
    expect(normalizeNoteDraftPrivateContext({ ...context, kind: 'other' })).toBe(null);
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
});
