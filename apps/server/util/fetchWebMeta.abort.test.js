import { beforeEach, describe, expect, it, vi } from 'vitest';

const axiosGet = vi.hoisted(() => vi.fn());
vi.mock('axios', () => ({ default: { get: (...args) => axiosGet(...args) } }));

const { checkUrlLiveness, classifyWebPageSnapshot, extractReadableBodyText, fetchWebMeta } =
  await import('./fetchWebMeta.js');

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

  it('把响应体超过预算与普通网络失败区分开', async () => {
    axiosGet.mockRejectedValueOnce({
      code: 'ERR_BAD_RESPONSE',
      message: 'maxContentLength size of 1572864 exceeded',
    });

    await expect(fetchWebMeta('https://large.example.com/article')).resolves.toEqual({
      ok: false,
      reason: 'CONTENT_TOO_LARGE',
    });
  });

  it('允许显式正文读取提高响应预算，但不超过 4MB 绝对上限', async () => {
    axiosGet.mockResolvedValue({
      headers: { 'content-type': 'text/html; charset=utf-8' },
      data: Buffer.from('<html><head><title>长文章</title></head><body><article>有效正文</article></body></html>'),
    });

    await expect(
      fetchWebMeta('https://example.com/large-article', { maxContentBytes: 4 * 1024 * 1024 }),
    ).resolves.toMatchObject({ ok: true, title: '长文章' });
    expect(axiosGet).toHaveBeenLastCalledWith(
      'https://example.com/large-article',
      expect.objectContaining({ maxContentLength: 4 * 1024 * 1024 }),
    );

    await fetchWebMeta('https://example.com/bounded-article', { maxContentBytes: 20 * 1024 * 1024 });
    expect(axiosGet).toHaveBeenLastCalledWith(
      'https://example.com/bounded-article',
      expect.objectContaining({ maxContentLength: 4 * 1024 * 1024 }),
    );
  });

  it('识别微信公众号环境验证页，不把验证文案当成文章正文', async () => {
    axiosGet.mockResolvedValueOnce({
      headers: { 'content-type': 'text/html; charset=utf-8' },
      data: Buffer.from(`
        <html><body>
          <h2>环境异常</h2>
          <a id="js_verify">去验证</a>
          <script>var PAGE_MID='mmbizwap:secitptpage/verify.html';</script>
        </body></html>`),
      request: {
        res: {
          responseUrl: 'https://mp.weixin.qq.com/mp/wappoc_appmsgcaptcha?poc_token=test',
        },
      },
    });

    await expect(fetchWebMeta('https://mp.weixin.qq.com/s/article')).resolves.toEqual({
      ok: false,
      reason: 'ACCESS_CHALLENGE',
    });
  });

  it('按通用脚本与 Cookie/reload 特征识别访问挑战，不依赖站点域名', async () => {
    axiosGet.mockResolvedValueOnce({
      headers: { 'content-type': 'text/html; charset=utf-8' },
      data: Buffer.from(`
        <html><head></head><body></body><script>
          document.cookie = '__ac_signature=' + createSignature();
          window.location.reload();
        </script></html>`),
    });

    await expect(fetchWebMeta('https://video.example.com/share/1')).resolves.toEqual({
      ok: false,
      reason: 'ACCESS_CHALLENGE',
    });
  });

  it('静态 HTML 是脚本空壳时调用通用渲染兜底，并标记 rendered_dom 来源', async () => {
    axiosGet.mockResolvedValueOnce({
      headers: { 'content-type': 'text/html; charset=utf-8' },
      data: Buffer.from('<html><body><div id="app"></div><script src="/app.js"></script></body></html>'),
    });
    const renderer = vi.fn().mockResolvedValue({
      ok: true,
      url: 'https://video.example.com/video/1',
      status: 200,
      contentType: 'text/html; charset=utf-8',
      documentTitle: '浏览器渲染标题',
      meta: { 'og:description': '浏览器渲染后得到的真实描述' },
      jsonLd: [],
      bodyText: '这是浏览器执行页面脚本后得到的真实正文内容。',
      signals: { scriptCount: 3, diagnosticText: '真实正文', noscriptText: '', passwordInput: false },
    });

    await expect(
      fetchWebMeta('https://video.example.com/share/1', { renderFallback: true, renderer }),
    ).resolves.toMatchObject({
      ok: true,
      url: 'https://video.example.com/video/1',
      title: '浏览器渲染标题',
      description: '浏览器渲染后得到的真实描述',
      source: 'rendered_dom',
    });
    expect(renderer).toHaveBeenCalledWith(
      'https://video.example.com/share/1',
      expect.objectContaining({ bodyLimit: 2000, timeout: 12000 }),
    );
  });

  it('浏览器渲染后仍是访问验证页时返回真实失败原因，不把验证文案当元信息', async () => {
    axiosGet.mockResolvedValueOnce({
      headers: { 'content-type': 'text/html; charset=utf-8' },
      data: Buffer.from('<html><body><div id="app"></div><script src="/app.js"></script></body></html>'),
    });
    const renderer = vi.fn().mockResolvedValue({
      ok: true,
      url: 'https://video.example.com/verify',
      status: 200,
      documentTitle: '安全验证',
      meta: {},
      jsonLd: [],
      bodyText: '请完成人机验证',
      signals: { scriptCount: 4, diagnosticText: 'captcha security check', passwordInput: false },
    });

    await expect(
      fetchWebMeta('https://video.example.com/share/1', { renderFallback: true, renderer }),
    ).resolves.toEqual({ ok: false, reason: 'ACCESS_CHALLENGE', staticReason: 'JS_REQUIRED' });
  });

  it('桌面渲染仍是加载空壳时，用同一通用规则尝试移动页面', async () => {
    axiosGet.mockResolvedValueOnce({
      headers: { 'content-type': 'text/html; charset=utf-8' },
      data: Buffer.from('<html><body><div id="app"></div><script src="/app.js"></script></body></html>'),
    });
    const renderer = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        url: 'https://example.com/content/1',
        status: 200,
        documentTitle: '',
        meta: {},
        jsonLd: [],
        bodyText: '视频数据加载中',
        signals: { scriptCount: 10, diagnosticText: 'loading' },
      })
      .mockResolvedValueOnce({
        ok: true,
        url: 'https://m.example.com/content/1?tracking=1',
        status: 200,
        documentTitle: '移动页真实标题',
        meta: { description: '移动页面提供的真实内容描述' },
        canonicalUrl: 'https://example.com/content/1',
        jsonLd: [],
        bodyText: '移动页面中已经渲染完成的真实正文内容。',
        signals: { scriptCount: 3, diagnosticText: '真实正文' },
      });

    await expect(
      fetchWebMeta('https://example.com/share/1', { renderFallback: true, renderer }),
    ).resolves.toMatchObject({
      ok: true,
      url: 'https://example.com/content/1',
      title: '移动页真实标题',
      source: 'rendered_dom',
    });
    expect(renderer.mock.calls.map(([, options]) => options.profile)).toEqual(['desktop', 'mobile']);
  });

  it('从标准 JSON-LD 补全静态页面元信息和正文', async () => {
    axiosGet.mockResolvedValueOnce({
      headers: { 'content-type': 'text/html; charset=utf-8' },
      data: Buffer.from(
        `<html><body><script type="application/ld+json">${JSON.stringify({
          '@type': 'VideoObject',
          name: '结构化视频标题',
          description: '结构化视频描述',
          text: '结构化数据中提供的正文摘要。',
          keywords: ['视频', '教程'],
        })}</script></body></html>`,
      ),
    });

    await expect(fetchWebMeta('https://example.com/video/1')).resolves.toMatchObject({
      ok: true,
      title: '结构化视频标题',
      description: '结构化视频描述',
      bodyText: '结构化数据中提供的正文摘要。',
      keywords: '视频, 教程',
      source: 'static_html',
    });
  });

  it('登录表单与脚本空壳分开判型', () => {
    expect(
      classifyWebPageSnapshot({
        bodyText: '请先登录后查看',
        passwordInput: true,
        scriptCount: 2,
        diagnosticText: '<form action="/login"><input type="password"></form>',
      }),
    ).toBe('AUTH_REQUIRED');
    expect(
      classifyWebPageSnapshot({
        title: '通用页面标题',
        description: '这是一段看似完整但其实来自错误页的默认描述',
        bodyText: '抱歉出错了，请尝试在客户端内观看',
        scriptCount: 20,
      }),
    ).toBe('ACCESS_DENIED');
  });

  it('只把短错误页判为拒绝访问，不误伤正文里引用错误提示的文章', () => {
    expect(
      classifyWebPageSnapshot({
        title: '客户端错误处理指南',
        bodyText: `页面可能显示“抱歉出错了”，这通常表示客户端未完成初始化。${'后续排查步骤与恢复建议。'.repeat(20)}`,
      }),
    ).toBe('');
  });

  it('在发起网络请求前拒绝带账号密码的 URL', async () => {
    await expect(fetchWebMeta('https://user:password@example.com/private')).resolves.toEqual({
      ok: false,
      reason: 'URL_CREDENTIALS_FORBIDDEN',
    });
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('把小红书短链重定向收敛为可保存且可站外打开的真实 HTTPS 地址', async () => {
    const responseUrl =
      'https://www.xiaohongshu.com/discovery/item/6a753a7c00000000050305b0?xsec_token=token-value%3D&xsec_source=app_share&share_id=tracking';
    axiosGet.mockResolvedValueOnce({
      headers: { 'content-type': 'text/html; charset=utf-8' },
      data: Buffer.from('<html><head><title>真实笔记</title></head><body><article>正文内容</article></body></html>'),
      request: { res: { responseUrl } },
    });

    await expect(fetchWebMeta('https://xhslink.cn/o/7rNw5RKnE8e')).resolves.toMatchObject({
      ok: true,
      url: 'https://www.xiaohongshu.com/explore/6a753a7c00000000050305b0?xsec_token=token-value%3D&xsec_source=app_share',
      title: '真实笔记',
    });
  });

  it('探活阶段也返回小红书短链的真实落地地址，供直接保存流程使用', async () => {
    const destroy = vi.fn();
    axiosGet.mockResolvedValueOnce({
      status: 200,
      data: { destroy },
      request: {
        res: {
          responseUrl:
            'https://www.xiaohongshu.com/discovery/item/6a753a7c00000000050305b0?xsec_token=token-value%3D&xsec_source=app_share&share_id=tracking',
        },
      },
    });

    await expect(checkUrlLiveness('https://xhslink.cn/o/7rNw5RKnE8e')).resolves.toEqual({
      status: 'alive',
      code: 200,
      resolvedUrl:
        'https://www.xiaohongshu.com/explore/6a753a7c00000000050305b0?xsec_token=token-value%3D&xsec_source=app_share',
    });
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
