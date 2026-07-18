import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchWebMeta: vi.fn(),
  requestDeepSeek: vi.fn(),
}));

vi.mock('./fetchWebMeta.js', () => ({ fetchWebMeta: mocks.fetchWebMeta }));
vi.mock('./agent/deepseekClient.js', () => ({ requestDeepSeek: mocks.requestDeepSeek }));

const { suggestBookmarkMeta } = await import('./aiOrganize.js');

describe('suggestBookmarkMeta cancellation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchWebMeta.mockResolvedValue({
      ok: true,
      title: '示例站点',
      description: '示例描述',
      bodyText: '正文',
    });
    mocks.requestDeepSeek.mockResolvedValue({
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
    expect(mocks.requestDeepSeek).toHaveBeenCalledWith(expect.any(Array), {
      signal: controller.signal,
    });
  });

  it('请求开始前已经停止时不再抓网页或调用模型', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      suggestBookmarkMeta({ url: 'https://example.com', signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.fetchWebMeta).not.toHaveBeenCalled();
    expect(mocks.requestDeepSeek).not.toHaveBeenCalled();
  });
});
