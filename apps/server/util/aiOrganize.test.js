import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchWebMeta: vi.fn(),
  requestAi: vi.fn(),
}));

vi.mock('./fetchWebMeta.js', () => ({ fetchWebMeta: mocks.fetchWebMeta }));
vi.mock('./agent/aiGateway.js', () => ({ requestAi: mocks.requestAi }));

const { suggestBookmarkMeta, suggestTagsFromText } = await import('./aiOrganize.js');

describe('suggestBookmarkMeta cancellation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchWebMeta.mockResolvedValue({
      ok: true,
      title: '示例站点',
      description: '示例描述',
      bodyText: '正文',
    });
    mocks.requestAi.mockResolvedValue({
      content: JSON.stringify({
        name: '示例',
        description: '示例描述',
        matchedTags: [],
        newTags: [],
      }),
    });
  });

  it('把同一个停止信号传给网页抓取与模型请求', async () => {
    const controller = new AbortController();

    await suggestBookmarkMeta({
      url: 'https://example.com',
      userTags: [],
      signal: controller.signal,
    });

    expect(mocks.fetchWebMeta).toHaveBeenCalledWith('https://example.com', {
      signal: controller.signal,
    });
    expect(mocks.requestAi).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        signal: controller.signal,
        toolChoice: 'none',
        maxTokens: 600,
        trace: expect.objectContaining({ taskType: 'organize', stage: 'organize_bookmark_meta' }),
        governance: expect.objectContaining({
          quotaPolicy: 'system',
          systemId: 'organize',
          taskType: 'organize_bookmark_meta',
        }),
      }),
    );
  });

  it('请求开始前已经停止时不再抓网页或调用模型', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(suggestBookmarkMeta({ url: 'https://example.com', signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(mocks.fetchWebMeta).not.toHaveBeenCalled();
    expect(mocks.requestAi).not.toHaveBeenCalled();
  });

  it('笔记标签建议也经过禁用工具的 Gateway', async () => {
    mocks.requestAi.mockResolvedValueOnce({
      content: JSON.stringify({ matchedTags: ['已有标签'], newTags: ['新标签'] }),
    });

    const result = await suggestTagsFromText({
      text: '一篇数据库学习笔记',
      userTags: [{ id: 'tag-1', name: '已有标签' }],
      trace: { traceId: 'trace-note-tags' },
    });

    expect(mocks.requestAi).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        toolChoice: 'none',
        maxTokens: 400,
        trace: expect.objectContaining({
          traceId: 'trace-note-tags',
          taskType: 'organize',
          stage: 'organize_note_tags',
        }),
        governance: expect.objectContaining({
          quotaPolicy: 'system',
          systemId: 'organize',
          taskType: 'organize_note_tags',
        }),
      }),
    );
    expect(result).toEqual({ matchedTagIds: ['tag-1'], newTags: ['新标签'] });
  });
});
