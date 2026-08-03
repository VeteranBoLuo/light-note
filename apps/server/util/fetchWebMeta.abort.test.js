import { beforeEach, describe, expect, it, vi } from 'vitest';

const axiosGet = vi.hoisted(() => vi.fn());
vi.mock('axios', () => ({ default: { get: (...args) => axiosGet(...args) } }));

const { extractReadableBodyText, fetchWebMeta } = await import('./fetchWebMeta.js');

describe('fetchWebMeta', () => {
  beforeEach(() => {
    axiosGet.mockReset();
  });

  it('不把取消请求吞成普通抓取失败', async () => {
    axiosGet.mockRejectedValueOnce({ name: 'CanceledError', code: 'ERR_CANCELED' });

    await expect(fetchWebMeta('https://example.com')).rejects.toMatchObject({
      name: 'CanceledError',
      code: 'ERR_CANCELED',
    });
  });

  it('优先提取文章正文而不是页面顶部导航和侧栏', () => {
    const html = `
      <html><body>
        <nav>${'导航链接 '.repeat(120)}</nav>
        <aside>${'推荐内容 '.repeat(100)}</aside>
        <article>
          <h1>真正标题</h1>
          <p>第一段真正正文，介绍项目的核心用途。</p>
          <p>第二段真正正文，包含安装方式和注意事项。</p>
        </article>
      </body></html>`;

    const text = extractReadableBodyText(html, 2000);

    expect(text).toContain('第一段真正正文');
    expect(text).toContain('第二段真正正文');
    expect(text).not.toContain('导航链接');
    expect(text).not.toContain('推荐内容');
  });

  it('把超时、拒绝访问和域名解析失败区分为可操作原因', async () => {
    axiosGet.mockRejectedValueOnce({ code: 'ECONNABORTED', message: 'timeout of 8000ms exceeded' });
    await expect(fetchWebMeta('https://slow.example.com')).resolves.toEqual({ ok: false, reason: 'TIMEOUT' });

    axiosGet.mockRejectedValueOnce({ response: { status: 403 } });
    await expect(fetchWebMeta('https://blocked.example.com')).resolves.toEqual({
      ok: false,
      reason: 'ACCESS_DENIED',
    });

    axiosGet.mockRejectedValueOnce({ code: 'ENOTFOUND' });
    await expect(fetchWebMeta('https://missing.example.com')).resolves.toEqual({
      ok: false,
      reason: 'DNS_FAILED',
    });
  });

  it('在发起网络请求前拒绝带账号密码的 URL', async () => {
    await expect(fetchWebMeta('https://user:password@example.com/private')).resolves.toEqual({
      ok: false,
      reason: 'URL_CREDENTIALS_FORBIDDEN',
    });
    expect(axiosGet).not.toHaveBeenCalled();
  });
});
