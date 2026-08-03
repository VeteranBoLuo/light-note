import { describe, expect, it, vi } from 'vitest';
import {
  createNoteDraftPrivateContext,
  generateNoteDraft,
  isNoteDraftRefinement,
  isNoteDraftRequest,
  normalizeNoteDraftPrivateContext,
  normalizeNoteDraftRefinement,
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

  it('识别草稿扩写并只接受格式正确的确认引用', () => {
    expect(isNoteDraftRefinement('写得太短了，重新生成长一点')).toBe(true);
    expect(isNoteDraftRefinement('写的太少了，详细一点')).toBe(true);
    expect(isNoteDraftRefinement('今天天气怎么样')).toBe(false);
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
