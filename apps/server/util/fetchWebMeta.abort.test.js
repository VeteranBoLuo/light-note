import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const axiosGet = vi.hoisted(() => vi.fn());
vi.mock('axios', () => ({ default: { get: (...args) => axiosGet(...args) } }));

const { checkUrlLiveness, classifyWebPageSnapshot, extractReadableBodyText, fetchWebMeta } =
  await import('./fetchWebMeta.js');

/** 模拟按需下载的超大网页：头部与正文在前，其后是大量内联脚本，记录实际被读取的字节数。 */
function largeHtmlStream({ head, article, paddingBytes }) {
  const prefix = Buffer.from(`<html><head>${head}</head><body>${article}<script>`);
  const chunk = Buffer.alloc(64 * 1024, 'x');
  let served = 0;
  let sentPrefix = false;
  const stream = new Readable({
    read() {
      if (!sentPrefix) {
        sentPrefix = true;
        served += prefix.length;
        this.push(prefix);
        return;
      }
      if (served >= prefix.length + paddingBytes) {
        this.push(Buffer.from('</script></body></html>'));
        this.push(null);
        return;
      }
      served += chunk.length;
      this.push(chunk);
    },
  });
  return { stream, bytesServed: () => served };
}

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
  it('retries an early dual-stack failure over guarded IPv4 within the original timeout', async () => {
    const failures = [
      { code: 'ETIMEDOUT', address: '93.184.216.34' },
      { code: 'ENETUNREACH', address: '2606:4700:4700::1111' },
    ];
    axiosGet.mockRejectedValueOnce({ code: 'ETIMEDOUT', cause: { errors: failures } }).mockResolvedValueOnce({
      headers: { 'content-type': 'text/html' },
      data: Buffer.from('<html><title>Real article</title><article>Real readable article content.</article></html>'),
    });
    expect(await fetchWebMeta('https://example.com', { timeout: 8000 })).toMatchObject({
      ok: true,
      source: 'static_html',
    });
    expect(axiosGet).toHaveBeenCalledTimes(2);
    const options = axiosGet.mock.calls[1][1];
    expect(options.httpsAgent.options).toMatchObject({ family: 4, autoSelectFamily: false });
    expect(options.timeout).toBeGreaterThan(0);
    expect(options.timeout).toBeLessThanOrEqual(8000);
  });
  it('does not retry a cancelled dual-stack request', async () => {
    const controller = new AbortController();
    controller.abort();
    axiosGet.mockRejectedValue({
      code: 'ETIMEDOUT',
      cause: {
        errors: [
          { code: 'ETIMEDOUT', address: '93.184.216.34' },
          { code: 'ENETUNREACH', address: '2606:4700:4700::1111' },
        ],
      },
    });
    await expect(fetchWebMeta('https://example.com', { signal: controller.signal })).rejects.toMatchObject({
      code: 'ETIMEDOUT',
    });
    expect(axiosGet).toHaveBeenCalledOnce();
  });
  it('does not retry ordinary timeouts or repeat a failed IPv4 fallback', async () => {
    axiosGet.mockRejectedValueOnce({ code: 'ECONNABORTED' });
    expect(await fetchWebMeta('https://example.com')).toEqual({ ok: false, reason: 'TIMEOUT' });
    expect(axiosGet).toHaveBeenCalledOnce();
    axiosGet.mockReset();
    axiosGet.mockRejectedValue({
      code: 'ETIMEDOUT',
      cause: {
        errors: [
          { code: 'ETIMEDOUT', address: '93.184.216.34' },
          { code: 'ENETUNREACH', address: '2606:4700:4700::1111' },
        ],
      },
    });
    expect(await fetchWebMeta('https://example.com')).toEqual({ ok: false, reason: 'TIMEOUT' });
    expect(axiosGet).toHaveBeenCalledTimes(2);
  });
  it('classifies nonstandard HTTP challenge pages and uses the existing renderer fallback', async () => {
    axiosGet.mockRejectedValueOnce({
      response: {
        status: 850,
        headers: { 'content-type': 'text/html' },
        data: Buffer.from('<html><title>Access verification</title><body>Checking your browser</body></html>'),
      },
    });
    const renderer = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      url: 'https://example.com',
      documentTitle: 'Real article',
      bodyText: 'Readable article content '.repeat(10),
      meta: {},
      signals: {},
    });
    expect(await fetchWebMeta('https://example.com', { renderFallback: true, renderer })).toMatchObject({
      ok: true,
      source: 'rendered_dom',
    });
    expect(renderer).toHaveBeenCalledOnce();
    expect(
      classifyWebPageSnapshot({
        status: 850,
        title: 'Website',
        description: 'Default description',
        bodyText: 'Unavailable',
      }),
    ).toBe('ACCESS_DENIED');
    expect(classifyWebPageSnapshot({ status: 503, title: 'Error', bodyText: 'Unavailable' })).toBe('FETCH_FAILED');
  });

  it('超过读取预算的长网页按预算截断后照常提取，不再整篇失败', async () => {
    const page = largeHtmlStream({
      head: '<meta property="og:title" content="图很多的长文章"><meta property="og:description" content="文章开头的分享描述">',
      article: '<article><p>位于预算之内的真实正文内容，足够用于识别网页。</p></article>',
      paddingBytes: 3 * 1024 * 1024,
    });
    axiosGet.mockResolvedValueOnce({ headers: { 'content-type': 'text/html; charset=utf-8' }, data: page.stream });

    await expect(fetchWebMeta('https://large.example.com/article')).resolves.toMatchObject({
      ok: true,
      title: '图很多的长文章',
      description: '文章开头的分享描述',
      bodyText: expect.stringContaining('真实正文内容'),
      source: 'static_html',
    });
    expect(axiosGet.mock.calls[0][1]).toMatchObject({ responseType: 'stream' });
    expect(axiosGet.mock.calls[0][1]).not.toHaveProperty('maxContentLength');
    // 默认 1.5MB 预算：读到预算即停止并销毁响应，不继续下载剩余内容。
    expect(page.bytesServed()).toBeLessThan(2 * 1024 * 1024);
    expect(page.stream.destroyed).toBe(true);
  });

  it('显式正文读取可提高预算，但不超过 4MB 绝对上限', async () => {
    const page = largeHtmlStream({
      head: '<title>长文章</title>',
      article: '<article><p>有效正文内容，足够用于识别网页的长度。</p></article>',
      paddingBytes: 8 * 1024 * 1024,
    });
    axiosGet.mockResolvedValueOnce({ headers: { 'content-type': 'text/html; charset=utf-8' }, data: page.stream });

    await expect(
      fetchWebMeta('https://example.com/bounded-article', { maxContentBytes: 20 * 1024 * 1024 }),
    ).resolves.toMatchObject({ ok: true, title: '长文章' });
    expect(page.bytesServed()).toBeGreaterThanOrEqual(4 * 1024 * 1024);
    expect(page.bytesServed()).toBeLessThan(5 * 1024 * 1024);
  });

  it('响应头到达后正文迟迟读不完时按原时限返回超时', async () => {
    const stream = new Readable({ read() {} });
    stream.push('<html><head><title>慢网页</title>');
    axiosGet.mockResolvedValueOnce({ headers: { 'content-type': 'text/html' }, data: stream });

    await expect(fetchWebMeta('https://slow.example.com/article', { timeout: 30 })).resolves.toEqual({
      ok: false,
      reason: 'TIMEOUT',
    });
    expect(stream.destroyed).toBe(true);
  });

  it('读取正文期间用户取消时继续向上传播取消', async () => {
    const controller = new AbortController();
    const stream = new Readable({ read() {} });
    stream.push('<html><head><title>读取中</title>');
    axiosGet.mockResolvedValueOnce({ headers: { 'content-type': 'text/html' }, data: stream });

    const pending = fetchWebMeta('https://example.com/article', { signal: controller.signal });
    setTimeout(() => controller.abort(), 5);
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(stream.destroyed).toBe(true);
  });

  it('按流读取非标准状态码的错误页并判型', async () => {
    axiosGet.mockRejectedValueOnce({
      response: {
        status: 850,
        headers: { 'content-type': 'text/html' },
        data: Readable.from([Buffer.from('<html><title>Access verification</title><body>Checking your browser</body></html>')]),
      },
    });
    expect(await fetchWebMeta('https://example.com')).toEqual({ ok: false, reason: 'ACCESS_CHALLENGE' });
  });

  it('不读取的错误响应会被销毁，不占用连接', async () => {
    const stream = new Readable({ read() {} });
    axiosGet.mockRejectedValueOnce({ response: { status: 404, headers: { 'content-type': 'text/html' }, data: stream } });
    expect(await fetchWebMeta('https://example.com/missing')).toEqual({ ok: false, reason: 'NOT_FOUND' });
    expect(stream.destroyed).toBe(true);
  });

  it('带分享标题的图文短文章不因页面脚本里的 Cookie/跳转代码被判为验证页', async () => {
    axiosGet.mockResolvedValueOnce({
      headers: { 'content-type': 'text/html; charset=utf-8' },
      data: Buffer.from(`
        <html><head>
          <meta property="og:title" content="周末出游的十张照片">
          <meta property="og:description" content="随手拍">
          <script>if (document.cookie.indexOf('lang') < 0) { setLang(); } function go(u) { location.href = u; }</script>
        </head><body>
          <div id="js_content"><p>${'这一段是图片之间的简短配文。'.repeat(8)}</p><img data-src="a.jpg"><img data-src="b.jpg"></div>
        </body></html>`),
    });

    await expect(fetchWebMeta('https://example.com/s/photo-post')).resolves.toMatchObject({
      ok: true,
      title: '周末出游的十张照片',
      source: 'static_html',
    });
  });

  it('带分享标题但正文显示验证文案时仍判为访问验证', async () => {
    axiosGet.mockResolvedValueOnce({
      headers: { 'content-type': 'text/html; charset=utf-8' },
      data: Buffer.from(`
        <html><head><meta property="og:title" content="站点首页"></head>
        <body><p>当前环境异常，完成验证后即可继续访问。</p>
        <script>document.cookie = 'token=' + sign(); location.reload();</script></body></html>`),
    });

    await expect(fetchWebMeta('https://example.com/s/verify')).resolves.toEqual({
      ok: false,
      reason: 'ACCESS_CHALLENGE',
    });
  });

  it('渲染结果带分享标题时同样不被页面脚本特征误判', async () => {
    axiosGet.mockResolvedValueOnce({
      headers: { 'content-type': 'text/html; charset=utf-8' },
      data: Buffer.from('<html><body><div id="app"></div><script src="/app.js"></script></body></html>'),
    });
    const renderer = vi.fn().mockResolvedValue({
      ok: true,
      url: 'https://example.com/post/1',
      status: 200,
      documentTitle: '页面标题',
      meta: { 'og:title': '渲染后的分享标题' },
      jsonLd: [],
      bodyText: '图片之间的简短配文。'.repeat(10),
      signals: { scriptCount: 6, diagnosticText: "document.cookie = 'a=1'; window.location.hash = '#top';" },
    });

    await expect(fetchWebMeta('https://example.com/post/1', { renderFallback: true, renderer })).resolves.toMatchObject({
      ok: true,
      title: '渲染后的分享标题',
      source: 'rendered_dom',
    });
    expect(renderer).toHaveBeenCalledOnce();
  });

  it('内容已被删除的提示页判为不存在，而不是访问验证', () => {
    expect(
      classifyWebPageSnapshot({
        bodyText: '该内容已被发布者删除',
        scriptCount: 5,
        diagnosticText: "document.cookie = 'a=1'; location.href = '/';",
      }),
    ).toBe('NOT_FOUND');
    expect(
      classifyWebPageSnapshot({
        title: '如何恢复误删的文件',
        bodyText: `如果文件已被删除，可以先检查回收站。${'接着按照步骤逐项排查并恢复备份。'.repeat(20)}`,
      }),
    ).toBe('');
    expect(
      classifyWebPageSnapshot({
        title: '这条视频已被平台删除',
        description: '平台回应了用户的质疑',
        bodyText: '平台今日回应称，相关视频因违反社区规范下架，用户可通过申诉渠道反馈。',
      }),
    ).toBe('');
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

describe('archive error page quality', () => {
  it('rejects an error JSON returned with HTTP 200 regardless of useful metadata', () => {
    expect(
      classifyWebPageSnapshot({
        title: '知乎',
        description: '有问题就会有答案',
        bodyText: JSON.stringify({
          error: { message: '您当前请求存在异常，暂时限制本次访问。'.repeat(6), code: 40362 },
        }),
        minimumBodyLength: 100,
      }),
    ).toBe('ACCESS_DENIED');
  });
  it('recognizes a rendered framework 404 with no whitespace', () => {
    expect(
      classifyWebPageSnapshot({
        title: 'Hoppscotch',
        bodyText: '404This page could not be foundHome',
        scriptCount: 8,
        minimumBodyLength: 100,
      }),
    ).toBe('NOT_FOUND');
  });
  it('keeps an article discussing errors readable', () => {
    expect(
      classifyWebPageSnapshot({
        title: '错误处理指南',
        bodyText: '本文介绍如何处理 404 页面以及 error JSON 返回值。'.repeat(30),
        minimumBodyLength: 100,
      }),
    ).toBe('');
  });
});
