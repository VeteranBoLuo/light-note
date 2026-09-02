import { describe, expect, it, vi } from 'vitest';
import bookmarkParseSkill from './bookmarkParseSkill.js';

describe('bookmark.parse_url', () => {
  it('复用统一书签识别能力，只返回字段建议预览', async () => {
    const database = { query: vi.fn().mockResolvedValue([[{ id: 'tag-1', name: '搜索' }]]) };
    const suggestBookmarkMeta = vi.fn().mockResolvedValue({
      resolvedUrl: 'https://www.baidu.com/',
      name: '百度一下，你就知道',
      description: '搜索服务',
      matchedTagIds: ['tag-1'],
      newTags: [],
      metadataSource: 'page',
    });
    const prepared = await bookmarkParseSkill.prepare({
      input: bookmarkParseSkill.validateInput({ url: 'baidu.com' }),
      context: { identity: { subjectUserId: 'u-1' } },
      request: {},
      dependencies: { database, suggestBookmarkMeta },
    });
    const result = await prepared.callModel({ trace: { traceId: 'trace' } });
    expect(database.query).toHaveBeenCalledWith(expect.stringContaining('FROM tag'), ['u-1']);
    expect(suggestBookmarkMeta).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://baidu.com' }));
    expect(result).toMatchObject({ kind: 'field_suggestions', writeCommitted: false });
    expect(prepared.availableActions[0]).toMatchObject({ requiresConfirmation: true });
  });

  it('已有与新标签合计最多返回三个，而不是分别最多三个', async () => {
    const database = { query: vi.fn().mockResolvedValue([[]]) };
    const suggestBookmarkMeta = vi.fn().mockResolvedValue({
      resolvedUrl: 'https://example.com/',
      name: '示例',
      description: '示例描述',
      matchedTagIds: ['tag-1', 'tag-2'],
      newTags: ['新标签一', '新标签二', '新标签三'],
      metadataSource: 'fetched',
    });
    const prepared = await bookmarkParseSkill.prepare({
      input: bookmarkParseSkill.validateInput({ url: 'example.com' }),
      context: { identity: { subjectUserId: 'u-1' } },
      request: {},
      dependencies: { database, suggestBookmarkMeta },
    });

    const result = await prepared.callModel({ trace: { traceId: 'trace-cap' } });

    expect(result.fields.matchedTagIds).toEqual(['tag-1', 'tag-2']);
    expect(result.fields.newTags).toEqual(['新标签一']);
  });

  it('网页没有可靠内容时保留可公开的读取失败，不包装成 AI 输出错误', async () => {
    const database = { query: vi.fn().mockResolvedValue([[]]) };
    const error = Object.assign(new Error('网页触发了访问验证'), {
      code: 'BOOKMARK_PAGE_ACCESS_PROTECTED',
      status: 422,
    });
    const prepared = await bookmarkParseSkill.prepare({
      input: bookmarkParseSkill.validateInput({ url: 'example.com' }),
      context: { identity: { subjectUserId: 'u-1' } },
      request: {},
      dependencies: { database, suggestBookmarkMeta: vi.fn().mockRejectedValue(error) },
    });

    await expect(prepared.callModel({ trace: { traceId: 'trace-failed-read' } })).rejects.toBe(error);
  });

  it('接受同一网址的浏览器显式捕获内容并传给统一整理能力', async () => {
    const database = { query: vi.fn().mockResolvedValue([[]]) };
    const suggestBookmarkMeta = vi.fn().mockResolvedValue({
      resolvedUrl: 'https://example.com/article',
      name: '真实标题',
      description: '真实描述',
      matchedTagIds: [],
      newTags: [],
      metadataSource: 'browser_capture',
    });
    const input = bookmarkParseSkill.validateInput({
      url: 'https://example.com/article',
      pageContext: {
        url: 'https://example.com/article',
        title: '当前页标题',
        text: '当前页可见正文',
      },
    });
    const prepared = await bookmarkParseSkill.prepare({
      input,
      context: { identity: { subjectUserId: 'u-1' } },
      request: {},
      dependencies: { database, suggestBookmarkMeta },
    });

    await prepared.callModel({ trace: { traceId: 'trace-browser-capture' } });

    expect(suggestBookmarkMeta).toHaveBeenCalledWith(
      expect.objectContaining({
        pageContext: {
          url: 'https://example.com/article',
          title: '当前页标题',
          text: '当前页可见正文',
        },
      }),
    );
  });

  it('拒绝把另一个标签页的正文作为当前网址证据', async () => {
    await expect(
      bookmarkParseSkill.prepare({
        input: bookmarkParseSkill.validateInput({
          url: 'https://example.com/article',
          pageContext: { url: 'https://other.example/article', title: '其他页面', text: '其他正文' },
        }),
        context: { identity: { subjectUserId: 'u-1' } },
        request: {},
        dependencies: { database: { query: vi.fn() } },
      }),
    ).rejects.toMatchObject({ code: 'AI_SKILL_BOOKMARK_CONTEXT_URL_MISMATCH' });
  });
});
