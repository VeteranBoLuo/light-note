import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchWebMeta: vi.fn(),
  requestAi: vi.fn(),
}));

vi.mock('./fetchWebMeta.js', () => ({
  EXPLICIT_WEB_READ_MAX_BYTES: 4 * 1024 * 1024,
  fetchWebMeta: mocks.fetchWebMeta,
}));
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
      maxContentBytes: 4 * 1024 * 1024,
    });
    expect(mocks.requestAi).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        signal: controller.signal,
        toolChoice: 'none',
        maxTokens: 600,
        trace: expect.objectContaining({ taskType: 'organize', stage: 'organize_bookmark_meta' }),
      }),
    );
  });

  it('把网页抓取得到的真实落地地址返回给书签编辑器', async () => {
    mocks.fetchWebMeta.mockResolvedValueOnce({
      ok: true,
      url: 'https://www.xiaohongshu.com/explore/6a753a7c00000000050305b0?xsec_token=token',
      title: '真实笔记',
      description: '真实描述',
      bodyText: '正文',
    });

    await expect(suggestBookmarkMeta({ url: 'https://xhslink.cn/o/7rNw5RKnE8e', userTags: [] })).resolves.toMatchObject(
      {
        resolvedUrl: 'https://www.xiaohongshu.com/explore/6a753a7c00000000050305b0?xsec_token=token',
        metadataSource: 'fetched',
      },
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
      }),
    );
    expect(result).toEqual({ matchedTagIds: ['tag-1'], newTags: ['新标签'] });
  });
});
