import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  requestAi: vi.fn(),
  fetchWebMeta: vi.fn(),
  invalidatePersonalKnowledgeCache: vi.fn(),
}));

vi.mock('../db/index.js', () => ({ default: { query: mocks.poolQuery } }));
vi.mock('./agent/aiGateway.js', () => ({ requestAi: mocks.requestAi }));
vi.mock('./fetchWebMeta.js', () => ({
  EXPLICIT_WEB_READ_MAX_BYTES: 4 * 1024 * 1024,
  fetchWebMeta: mocks.fetchWebMeta,
}));
vi.mock('./personalKnowledgeSearch.js', () => ({
  invalidatePersonalKnowledgeCache: mocks.invalidatePersonalKnowledgeCache,
}));

const { archiveBookmark, summarizeBookmark } = await import('./snapshot.js');

describe('archiveBookmark 网页读取预算', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('生成网页正文快照时使用显式网页读取预算', async () => {
    mocks.poolQuery
      .mockResolvedValueOnce([[{ id: 'bookmark-1', url: 'https://example.com/article', name: '示例文章' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    mocks.fetchWebMeta.mockResolvedValueOnce({
      ok: true,
      title: '真实文章标题',
      bodyText: '真实网页正文。'.repeat(20),
    });

    await expect(archiveBookmark('user-1', 'bookmark-1')).resolves.toMatchObject({
      ok: true,
      title: '真实文章标题',
    });
    expect(mocks.fetchWebMeta).toHaveBeenCalledWith('https://example.com/article', {
      bodyLimit: 200_000,
      maxContentBytes: 4 * 1024 * 1024,
      timeout: 15_000,
    });
  });
});

describe('summarizeBookmark AI Gateway', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.poolQuery.mockResolvedValueOnce([
      [
        {
          bookmark_id: 'bookmark-1',
          title: '示例文章',
          content: '正文内容',
          summary: null,
        },
      ],
    ]);
  });

  it('摘要模型调用经过禁用工具的统一 Gateway，并保留 trace', async () => {
    mocks.requestAi.mockResolvedValue({ content: '一句话摘要\n- 要点' });
    mocks.poolQuery.mockResolvedValueOnce([{}]);

    const result = await summarizeBookmark('user-1', 'bookmark-1', {
      trace: { traceId: 'trace-summary-1' },
    });

    expect(mocks.requestAi).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        toolChoice: 'none',
        maxTokens: 800,
        trace: expect.objectContaining({
          traceId: 'trace-summary-1',
          taskType: 'bookmark_summary',
          stage: 'bookmark_summary',
        }),
        governance: expect.objectContaining({
          quotaPolicy: 'system',
          systemId: 'bookmark_summary',
          taskType: 'bookmark_summary',
        }),
      }),
    );
    expect(result).toEqual({ ok: true, summary: '一句话摘要\n- 要点', cached: false });
    expect(mocks.poolQuery).toHaveBeenLastCalledWith(expect.stringContaining('UPDATE bookmark_snapshot SET summary'), [
      '一句话摘要\n- 要点',
      'bookmark-1',
      'user-1',
    ]);
  });

  it('只读管理员上下文可生成摘要，但不归档网页或写入摘要缓存', async () => {
    mocks.requestAi.mockResolvedValue({ content: '只读摘要' });

    const result = await summarizeBookmark('user-1', 'bookmark-1', {
      persist: false,
      archiveIfMissing: false,
    });

    expect(result).toEqual({ ok: true, summary: '只读摘要', cached: false });
    expect(mocks.poolQuery).toHaveBeenCalledTimes(1);
    expect(mocks.fetchWebMeta).not.toHaveBeenCalled();
  });

  it('供应商异常只返回稳定错误分类，不透传上游细节', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.requestAi.mockRejectedValue(new Error('Authorization: Bearer secret-provider-token'));

    const result = await summarizeBookmark('user-1', 'bookmark-1');

    expect(result).toEqual({ ok: false, reason: 'ai_error', msg: 'AI 服务暂时不可用,请稍后再试' });
    warning.mockRestore();
  });

  it('额度 gate 拒绝时返回可识别的 quota_exceeded 分支', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.requestAi.mockRejectedValue(Object.assign(new Error('今日 AI 额度已用完'), { code: 'AI_QUOTA_EXCEEDED' }));

    await expect(summarizeBookmark('user-1', 'bookmark-1')).resolves.toEqual({
      ok: false,
      reason: 'quota_exceeded',
      msg: '今日 AI 额度已用完，请明天再试',
    });
    warning.mockRestore();
  });
});
