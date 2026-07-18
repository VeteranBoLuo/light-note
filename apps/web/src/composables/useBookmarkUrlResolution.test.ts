import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiBasePost = vi.fn();
const requestBookmarkUrlDecision = vi.fn();
const errorMessage = vi.fn();

vi.mock('@/http/request', () => ({ apiBasePost: (...args: any[]) => apiBasePost(...args) }));
vi.mock('@/utils/bookmarkUrlDecision', () => ({
  requestBookmarkUrlDecision: (...args: any[]) => requestBookmarkUrlDecision(...args),
}));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { error: (...args: any[]) => errorMessage(...args) },
}));

const { preflightBookmarkUrl } = await import('./useBookmarkUrlResolution');

describe('preflightBookmarkUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('直接返回服务端权威规范化地址', async () => {
    apiBasePost.mockResolvedValueOnce({
      status: 200,
      data: { state: 'normalized', canonicalUrl: 'https://example.com', candidates: [], liveness: { status: 'alive' } },
    });
    await expect(preflightBookmarkUrl('example.com')).resolves.toMatchObject({
      ok: true,
      url: 'https://example.com',
    });
    expect(requestBookmarkUrlDecision).not.toHaveBeenCalled();
  });

  it('分享文案先让用户选候选，再用所选地址重新做权威校验', async () => {
    apiBasePost
      .mockResolvedValueOnce({
        status: 200,
        data: {
          state: 'needs_confirmation',
          canonicalUrl: '',
          candidates: [{ url: 'https://boluo66.top', source: 'explicit' }],
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: { state: 'valid', canonicalUrl: 'https://boluo66.top', candidates: [], liveness: { status: 'alive' } },
      });
    requestBookmarkUrlDecision.mockResolvedValueOnce('https://boluo66.top');

    await expect(preflightBookmarkUrl('分享内容 https:// boluo66.top')).resolves.toMatchObject({
      ok: true,
      url: 'https://boluo66.top',
    });
    expect(apiBasePost).toHaveBeenCalledTimes(2);
    expect(apiBasePost.mock.calls[1][1]).toMatchObject({ url: 'https://boluo66.top' });
  });

  it('疑似失效时默认建议返回修改，但允许用户明确仍然保存', async () => {
    apiBasePost.mockResolvedValue({
      status: 200,
      data: {
        state: 'valid',
        canonicalUrl: 'https://missing.invalid',
        candidates: [],
        liveness: { status: 'suspect', code: 'ENOTFOUND' },
      },
    });
    requestBookmarkUrlDecision.mockResolvedValueOnce('save');
    await expect(preflightBookmarkUrl('https://missing.invalid')).resolves.toMatchObject({
      ok: true,
      url: 'https://missing.invalid',
    });

    requestBookmarkUrlDecision.mockResolvedValueOnce('edit');
    await expect(preflightBookmarkUrl('https://missing.invalid')).resolves.toMatchObject({
      ok: false,
      cancelled: true,
    });
  });

  it('无候选的非法地址在请求前硬拦截，不提供“仍然保存”', async () => {
    await expect(preflightBookmarkUrl('不是网址')).resolves.toMatchObject({ ok: false });
    expect(apiBasePost).not.toHaveBeenCalled();
    expect(requestBookmarkUrlDecision).not.toHaveBeenCalled();
    expect(errorMessage).toHaveBeenCalledTimes(1);
  });

  it('危险协议在请求前给出明确错误，避免被网关收口成 403', async () => {
    await expect(preflightBookmarkUrl('javascript:alert(1)')).resolves.toMatchObject({
      ok: false,
      resolution: { state: 'invalid', code: 'UNSUPPORTED_PROTOCOL' },
    });
    expect(apiBasePost).not.toHaveBeenCalled();
    expect(requestBookmarkUrlDecision).not.toHaveBeenCalled();
    expect(errorMessage).toHaveBeenCalledTimes(1);
  });

  it('网络异常收口成可展示结果，不把 Promise 异常泄漏给页面事件', async () => {
    apiBasePost.mockRejectedValueOnce({ message: '网络连接异常' });
    await expect(preflightBookmarkUrl('https://example.com')).resolves.toMatchObject({
      ok: false,
      message: '网络连接异常',
    });
    expect(errorMessage).toHaveBeenCalledWith('网络连接异常');
  });

  it('外部停止信号会中止地址解析，并且不误报为网络异常', async () => {
    apiBasePost.mockImplementationOnce((_url, _data, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject({ code: 'ERR_CANCELED' }), { once: true });
      }),
    );
    const controller = new AbortController();
    const pending = preflightBookmarkUrl('https://example.com', { signal: controller.signal });

    controller.abort();

    await expect(pending).resolves.toMatchObject({ ok: false, cancelled: true });
    expect(errorMessage).not.toHaveBeenCalled();
  });
});
