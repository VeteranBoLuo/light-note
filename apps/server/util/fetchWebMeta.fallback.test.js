import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const axiosGet = vi.hoisted(() => vi.fn());
vi.mock('axios', () => ({ default: { get: (...args) => axiosGet(...args) } }));
const { fetchWebMeta } = await import('./fetchWebMeta.js');

const url = 'https://example.com/article';
const readablePage = {
  ok: true,
  url,
  status: 200,
  documentTitle: '浏览器读取的真实标题',
  meta: { description: '网页渲染后提供的真实描述内容' },
  bodyText: '网页渲染后提供的真实正文内容。'.repeat(5),
};
const legacyTlsError = {
  code: 'EPROTO',
  cause: { code: 'EPROTO', message: 'SSL routines:final_renegotiate:unsafe legacy renegotiation disabled' },
};

describe('explicit web read browser fallback', () => {
  beforeEach(() => axiosGet.mockReset());

  it('静态 404 只补一次桌面渲染，读取真实内容并释放错误响应', async () => {
    const body = new Readable({ read() {} });
    axiosGet.mockRejectedValueOnce({ response: { status: 404, data: body } });
    const renderer = vi.fn().mockResolvedValue(readablePage);

    await expect(fetchWebMeta(url, { renderFallback: true, renderer })).resolves.toMatchObject({
      ok: true,
      source: 'rendered_dom',
      title: readablePage.documentTitle,
      description: readablePage.meta.description,
      bodyText: readablePage.bodyText,
    });
    expect(renderer).toHaveBeenCalledExactlyOnceWith(
      url,
      expect.objectContaining({ profile: 'desktop', timeout: 12000 }),
    );
    expect(axiosGet).toHaveBeenCalledOnce();
    expect(body.destroyed).toBe(true);
  });

  it('HTTP 200 的明确删除提示不因同属 NOT_FOUND 而触发浏览器', async () => {
    axiosGet.mockResolvedValueOnce({
      headers: { 'content-type': 'text/html' },
      data: Buffer.from('<html><body>该内容已被发布者删除</body></html>'),
    });
    const renderer = vi.fn();
    await expect(fetchWebMeta(url, { renderFallback: true, renderer })).resolves.toEqual({
      ok: false,
      reason: 'NOT_FOUND',
    });
    expect(renderer).not.toHaveBeenCalled();
  });

  it.each([
    { code: 'ERR_FR_TOO_MANY_REDIRECTS' },
    { response: { status: 406, headers: { 'content-type': 'application/json' } } },
    { response: { status: 412, headers: { 'content-type': 'text/plain' } } },
  ])('跳转超限或已知非 HTML 拦截响应只尝试一次桌面渲染：%j', async (error) => {
    axiosGet.mockRejectedValueOnce(error);
    const renderer = vi.fn().mockResolvedValue(readablePage);
    expect(await fetchWebMeta(url, { renderFallback: true, renderer })).toMatchObject({
      ok: true,
      source: 'rendered_dom',
    });
    expect(renderer).toHaveBeenCalledOnce();
    expect(axiosGet.mock.calls[0][1].maxRedirects).toBe(3);

    axiosGet.mockRejectedValueOnce(error);
    renderer.mockClear().mockResolvedValue({ ok: false, reason: 'ACCESS_DENIED' });
    expect(await fetchWebMeta(url, { renderFallback: true, renderer })).toMatchObject({
      ok: false,
      reason: 'ACCESS_DENIED',
    });
    expect(renderer).toHaveBeenCalledOnce();

    axiosGet.mockRejectedValueOnce(error);
    renderer.mockClear();
    expect(await fetchWebMeta(url, { renderFallback: false, renderer })).toMatchObject({ ok: false });
    expect(renderer).not.toHaveBeenCalled();
  });

  it('带普通标题的 SPA 空壳继续渲染，标题和分享材料完整的短页仍直接读取', async () => {
    const html =
      '<html><head><title>Vite App</title></head><body><div id="app"></div><script src="/app.js"></script></body></html>';
    axiosGet.mockResolvedValueOnce({ headers: { 'content-type': 'text/html' }, data: Buffer.from(html) });
    const renderer = vi.fn().mockResolvedValue(readablePage);
    expect(await fetchWebMeta(url, { renderFallback: true, renderer })).toMatchObject({
      ok: true,
      source: 'rendered_dom',
      title: readablePage.documentTitle,
    });
    expect(renderer).toHaveBeenCalledOnce();

    axiosGet.mockResolvedValueOnce({ headers: { 'content-type': 'text/html' }, data: Buffer.from(html) });
    renderer.mockClear().mockResolvedValue({
      ...readablePage,
      documentTitle: 'Vite App',
      meta: {},
      bodyText: '',
      signals: { scriptCount: 1 },
    });
    expect(await fetchWebMeta(url, { renderFallback: true, renderer })).toMatchObject({
      ok: false,
      reason: 'JS_REQUIRED',
    });
    expect(renderer).toHaveBeenCalledTimes(2);

    axiosGet.mockResolvedValueOnce({
      headers: { 'content-type': 'text/html' },
      data: Buffer.from(html.replace('<title>Vite App</title>', '<meta property="og:title" content="真实分享标题">')),
    });
    renderer.mockClear();
    expect(await fetchWebMeta(url, { renderFallback: true, renderer })).toMatchObject({
      ok: true,
      source: 'static_html',
      title: '真实分享标题',
    });
    expect(renderer).not.toHaveBeenCalled();
  });

  it('仅有 JSON-LD 作者标题的短页保留可靠元信息，不误判成应用空壳', async () => {
    axiosGet.mockResolvedValueOnce({
      headers: { 'content-type': 'text/html' },
      data: Buffer.from(
        '<html><body><script type="application/ld+json">{"@type":"Article","headline":"作者提供的标题"}</script></body></html>',
      ),
    });
    const renderer = vi.fn();
    expect(await fetchWebMeta(url, { renderFallback: true, renderer })).toMatchObject({
      ok: true,
      source: 'static_html',
      title: '作者提供的标题',
    });
    expect(renderer).not.toHaveBeenCalled();
  });

  it.each([
    legacyTlsError,
    { code: 'EPROTO', reason: 'unsafe legacy renegotiation disabled' },
    { code: 'EPROTO', message: 'legacy sigalg disallowed or unsupported' },
  ])('已知 TLS 协商不兼容时复用浏览器，不修改 TLS 或证书选项：%j', async (error) => {
    axiosGet.mockRejectedValueOnce(error);
    const renderer = vi.fn().mockResolvedValue(readablePage);

    await expect(fetchWebMeta(url, { renderFallback: true, renderer })).resolves.toMatchObject({
      ok: true,
      source: 'rendered_dom',
    });
    expect(renderer).toHaveBeenCalledOnce();
    const options = axiosGet.mock.calls[0][1];
    expect(options.httpsAgent.options).not.toHaveProperty('rejectUnauthorized', false);
    expect(options.httpsAgent.options).not.toHaveProperty('secureOptions');
    expect(options.httpsAgent.options.lookup).toBeTypeOf('function');
  });

  it.each([
    [{ response: { status: 404 } }, 'NOT_FOUND'],
    [legacyTlsError, 'TLS_HANDSHAKE_FAILED'],
  ])('轻量读取保持关闭渲染，返回原始分类 %s', async (error, reason) => {
    axiosGet.mockRejectedValueOnce(error);
    const renderer = vi.fn();
    await expect(fetchWebMeta(url, { renderFallback: false, renderer })).resolves.toEqual({ ok: false, reason });
    expect(renderer).not.toHaveBeenCalled();
  });

  it.each([
    [{ code: 'ENOTFOUND' }, 'DNS_FAILED'],
    [{ code: 'EAI_AGAIN' }, 'DNS_FAILED'],
    [{ code: 'ERR_TLS_CERT_ALTNAME_INVALID' }, 'TLS_FAILED'],
    [{ cause: { code: 'ERR_TLS_CERT_ALTNAME_INVALID' } }, 'TLS_FAILED'],
    [{ code: 'CERT_HAS_EXPIRED' }, 'TLS_FAILED'],
    [{ code: 'CERT_NOT_YET_VALID' }, 'TLS_FAILED'],
    [{ code: 'SELF_SIGNED_CERT_IN_CHAIN' }, 'TLS_FAILED'],
    [{ code: 'EPROTO', message: 'unknown protocol failure' }, 'FETCH_FAILED'],
    [{ code: 'ECONNRESET' }, 'FETCH_FAILED'],
    [{ code: 'ECONNABORTED' }, 'TIMEOUT'],
    [{ response: { status: 410 } }, 'NOT_FOUND'],
    [{ response: { status: 429 } }, 'RATE_LIMITED'],
    [{ message: 'BLOCKED_PRIVATE_IP' }, 'BLOCKED_HOST'],
    [{ ...legacyTlsError, code: 'ERR_TLS_CERT_ALTNAME_INVALID' }, 'TLS_FAILED'],
  ])('DNS、证书、安全、限流及未分类网络错误不盲目启动浏览器：%j', async (error, reason) => {
    axiosGet.mockRejectedValueOnce(error);
    const renderer = vi.fn();
    await expect(fetchWebMeta(url, { renderFallback: true, renderer })).resolves.toEqual({ ok: false, reason });
    expect(renderer).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...readablePage, status: 404 }, 'NOT_FOUND'],
    [{ ...readablePage, status: 412 }, 'ACCESS_DENIED'],
    [{ ok: true, status: 200, bodyText: '请先登录后查看', signals: { passwordInput: true } }, 'AUTH_REQUIRED'],
    [{ ok: true, status: 200, signals: { scriptCount: 3 } }, 'JS_REQUIRED'],
    [{ ok: false, reason: 'RENDERER_UNAVAILABLE' }, 'RENDERER_UNAVAILABLE'],
    [{ ok: false, reason: 'TLS_FAILED' }, 'TLS_FAILED'],
  ])('浏览器仍不可读时保留实际原因，不再增加移动重试：%j', async (snapshot, reason) => {
    for (const error of [{ response: { status: 404 } }, legacyTlsError]) {
      axiosGet.mockRejectedValueOnce(error);
      const renderer = vi.fn().mockResolvedValue(snapshot);
      await expect(fetchWebMeta(url, { renderFallback: true, renderer })).resolves.toMatchObject({
        ok: false,
        reason,
        staticReason: error === legacyTlsError ? 'TLS_HANDSHAKE_FAILED' : 'NOT_FOUND',
      });
      expect(renderer).toHaveBeenCalledOnce();
    }
  });

  it.each([
    { name: 'AbortError', code: 'ABORT_ERR' },
    { name: 'CanceledError', code: 'ERR_CANCELED' },
  ])('浏览器读取中取消时继续向上传播，不追加渲染：%j', async (error) => {
    axiosGet.mockRejectedValueOnce(legacyTlsError);
    const renderer = vi.fn().mockRejectedValue(error);
    await expect(fetchWebMeta(url, { renderFallback: true, renderer })).rejects.toBe(error);
    expect(renderer).toHaveBeenCalledOnce();
  });
});
