import { describe, expect, it, vi } from 'vitest';
import {
  generateBookmarkNoteDraft,
  isBookmarkNoteDraftRefinement,
  isBookmarkNoteDraftRequest,
  normalizeBookmarkNoteDraftRefinement,
} from './bookmarkNoteDraft.js';

function response(args, overrides = {}) {
  return {
    content: '',
    toolCalls: [
      {
        id: 'draft-call',
        type: 'function',
        function: { name: 'submit_bookmark_note_draft', arguments: JSON.stringify(args) },
      },
    ],
    usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    usageStatus: 'reported',
    finishReason: 'tool_calls',
    ...overrides,
  };
}

describe('bookmarkNoteDraft', () => {
  it('只把单个书签上的明确笔记写入请求交给专用流程', () => {
    const bookmark = [{ type: 'bookmark', id: 'b1' }];
    expect(isBookmarkNoteDraftRequest('请分析这个书签的内容，生成一篇笔记。', bookmark)).toBe(true);
    expect(isBookmarkNoteDraftRequest('这个书签讲了什么？', bookmark)).toBe(false);
    expect(isBookmarkNoteDraftRequest('生成一篇笔记', [...bookmark, { type: 'note', id: 'n1' }])).toBe(false);
  });

  it('识别草稿扩写并只接受格式正确的确认引用', () => {
    expect(isBookmarkNoteDraftRefinement('写得太短了，重新生成长一点')).toBe(true);
    expect(isBookmarkNoteDraftRefinement('写的太少了，详细一点')).toBe(true);
    expect(isBookmarkNoteDraftRefinement('今天天气怎么样')).toBe(false);
    expect(
      normalizeBookmarkNoteDraftRefinement({
        confirmationId: 'confirmation-1',
        confirmationToken: 'a'.repeat(43),
      }),
    ).toEqual({ confirmationId: 'confirmation-1', confirmationToken: 'a'.repeat(43) });
    expect(normalizeBookmarkNoteDraftRefinement({ confirmationId: 'confirmation-1', confirmationToken: 'short' })).toBe(
      null,
    );
  });

  it('强制使用单一草稿协议并返回完整 Markdown', async () => {
    const request = vi.fn().mockResolvedValue(
      response({
        title: 'TypeORM 使用笔记',
        content: `# TypeORM\n\n${'正文内容。'.repeat(80)}`,
      }),
    );
    const onResponse = vi.fn();

    const result = await generateBookmarkNoteDraft({
      bookmark: { title: 'TypeORM 官方文档', url: 'https://typeorm.io' },
      sourceText: '这是 TypeORM 的官方文档正文。'.repeat(60),
      instruction: '分析这个书签并生成笔记',
      request,
      onResponse,
    });

    expect(result.title).toBe('TypeORM 使用笔记');
    expect(result.content).toContain('# TypeORM');
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][1]).toMatchObject({
      toolChoice: { type: 'function', function: { name: 'submit_bookmark_note_draft' } },
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

    const result = await generateBookmarkNoteDraft({
      bookmark: { title: '示例', url: 'https://example.com' },
      sourceText: '有效正文。'.repeat(100),
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

    const result = await generateBookmarkNoteDraft({
      bookmark: { title: '示例', url: 'https://example.com' },
      instruction: '太短了，重新写长一点、更详细一点',
      previousDraft: { title: '旧标题', content: previousContent },
      request,
    });

    expect(result.attempts).toBe(2);
    expect(result.content.length).toBeGreaterThan(previousContent.length);
  });
});
