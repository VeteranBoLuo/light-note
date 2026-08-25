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
        tagSuggestions: [],
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
      content: JSON.stringify({
        tagSuggestions: [
          { name: '已有标签', source: 'existing', relevance: 'strong', confidence: 0.97, evidence: '数据库学习' },
          { name: '新标签', source: 'new', relevance: 'strong', confidence: 0.91, evidence: '学习笔记' },
        ],
      }),
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

  it('只保留有原文依据的强相关候选，并保持模型相关性顺序而不是数据库顺序', async () => {
    mocks.requestAi.mockResolvedValueOnce({
      content: JSON.stringify({
        tagSuggestions: [
          { name: '搜索', source: 'existing', relevance: 'strong', confidence: 0.97, evidence: '实时联网搜索' },
          { name: '工具', source: 'existing', relevance: 'strong', confidence: 0.72, evidence: '搜索助手' },
          { name: 'AI', source: 'unknown', relevance: 'strong', confidence: 0.99, evidence: 'AI问答' },
          { name: 'AI', source: 'existing', relevance: 'strong', confidence: 0.9, evidence: 'AI问答' },
          { name: '宽泛标签', source: 'new', relevance: 'strong', confidence: 0.99, evidence: '正文中不存在' },
        ],
      }),
    });

    await expect(
      suggestTagsFromText({
        text: 'QwQ 是一款 AI问答搜索助手，支持实时联网搜索并附来源。',
        userTags: [
          { id: 'tag-tool', name: '工具' },
          { id: 'tag-ai', name: 'AI' },
          { id: 'tag-search', name: '搜索' },
        ],
      }),
    ).resolves.toEqual({ matchedTagIds: ['tag-search', 'tag-ai'], newTags: [] });
  });

  it('网页不可读取时名称描述仍可推测，但标签失败关闭为空', async () => {
    mocks.fetchWebMeta.mockResolvedValueOnce({ ok: false, reason: 'FETCH_FAILED' });
    mocks.requestAi.mockResolvedValueOnce({
      content: JSON.stringify({
        name: '推测名称',
        description: '推测描述',
        tagSuggestions: [
          { name: '工具', source: 'existing', relevance: 'strong', confidence: 0.99, evidence: 'example.com' },
        ],
      }),
    });

    await expect(
      suggestBookmarkMeta({
        url: 'https://example.com',
        userTags: [{ id: 'tag-tool', name: '工具' }],
      }),
    ).resolves.toMatchObject({ matchedTagIds: [], newTags: [], metadataSource: 'inferred' });
  });

  it('明确告诉模型 0-3 是上限而不是目标数量', async () => {
    await expect(suggestTagsFromText({ text: '单一主题内容', userTags: [] })).resolves.toEqual({
      matchedTagIds: [],
      newTags: [],
    });
    const messages = mocks.requestAi.mock.calls[0][0];
    expect(messages[1].content).toContain('0-3 个候选');
    expect(messages[1].content).toContain('绝对上限而不是目标数量');
    expect(messages[1].content).toContain('禁止用新标签补足数量');
    expect(messages[1].content).toContain('confidence >= 0.86');
  });

  it('即使模型返回四个合格候选，用户可见建议也只保留前三个', async () => {
    mocks.requestAi.mockResolvedValueOnce({
      content: JSON.stringify({
        tagSuggestions: ['主题一', '主题二', '主题三', '主题四'].map((name) => ({
          name,
          source: 'new',
          relevance: 'strong',
          confidence: 0.95,
          evidence: name,
        })),
      }),
    });

    await expect(suggestTagsFromText({ text: '主题一 主题二 主题三 主题四', userTags: [] })).resolves.toEqual({
      matchedTagIds: [],
      newTags: ['主题一', '主题二', '主题三'],
    });
  });
});
