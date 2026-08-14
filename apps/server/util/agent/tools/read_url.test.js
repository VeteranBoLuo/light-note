import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ fetchWebMeta: vi.fn() }));

vi.mock('../../fetchWebMeta.js', () => ({
  EXPLICIT_WEB_READ_MAX_BYTES: 4 * 1024 * 1024,
  fetchWebMeta: mocks.fetchWebMeta,
}));

const { default: readUrl } = await import('./read_url.js');

describe('read_url', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('READABILITY_SERVICE_URL', 'off');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('允许读取用户本轮明确提供的 URL', async () => {
    await expect(
      readUrl.prepareArgs(
        { url: 'https://uuye.163.com' },
        {
          question: 'https://uuye.163.com这个链接是干嘛的？',
          agentContentScope: { externalWeb: false },
        },
      ),
    ).resolves.toEqual({ url: 'https://uuye.163.com' });
  });

  it('关闭广泛联网时拒绝模型替换为用户未提供的 URL', async () => {
    await expect(
      readUrl.prepareArgs(
        { url: 'https://other.example.com' },
        {
          question: '总结 https://example.com',
          agentContentScope: { externalWeb: false },
        },
      ),
    ).rejects.toThrow('URL_SCOPE_FORBIDDEN');
  });

  it('允许读取服务端从所引用书签中恢复的 URL', async () => {
    await expect(
      readUrl.prepareArgs(
        { url: 'https://example.com/docs' },
        {
          question: '继续分析刚才那个书签',
          agentContentScope: {
            externalWeb: false,
            allowedWebUrls: ['https://example.com/docs'],
          },
        },
      ),
    ).resolves.toEqual({ url: 'https://example.com/docs' });
  });

  it('保留广泛联网开关对其他有效 URL 的授权', async () => {
    await expect(
      readUrl.prepareArgs(
        { url: 'https://other.example.com' },
        { question: '', agentContentScope: { externalWeb: true } },
      ),
    ).resolves.toEqual({ url: 'https://other.example.com' });
  });

  it('读取正文时使用长正文预算和有界超时', async () => {
    mocks.fetchWebMeta.mockResolvedValueOnce({
      ok: true,
      url: 'https://example.com/article',
      title: '文章标题',
      description: '文章描述',
      siteName: '示例站点',
      bodyText: '正文。'.repeat(200),
    });

    await expect(
      readUrl.execute({ url: 'https://example.com/article' }, { signal: new AbortController().signal }),
    ).resolves.toMatchObject({ title: '文章标题', text: expect.stringContaining('正文') });
    expect(mocks.fetchWebMeta).toHaveBeenCalledWith(
      'https://example.com/article',
      expect.objectContaining({ timeout: 12_000, bodyLimit: 12_000, maxContentBytes: 4 * 1024 * 1024 }),
    );
  });

  it('向上层保留具体网页读取失败原因', async () => {
    mocks.fetchWebMeta.mockResolvedValueOnce({ ok: false, reason: 'ACCESS_DENIED' });

    await expect(readUrl.execute({ url: 'https://example.com' }, {})).resolves.toEqual({
      error: 'ACCESS_DENIED',
      message: '网站拒绝了服务器读取，可能需要登录或存在访问限制',
    });
  });

  it.each([
    ['CONTENT_TOO_LARGE', '网页内容过大，超出 AI 的安全读取上限'],
    ['ACCESS_CHALLENGE', '网站要求完成人机验证，暂时无法由 AI 读取'],
  ])('向用户解释网页读取失败原因 %s', async (reason, message) => {
    mocks.fetchWebMeta.mockResolvedValueOnce({ ok: false, reason });

    await expect(readUrl.execute({ url: 'https://example.com' }, {})).resolves.toEqual({
      error: reason,
      message,
    });
  });

  it('直接提取失败时可由本地 Readability 服务返回正文', async () => {
    vi.stubEnv('READABILITY_SERVICE_URL', 'http://127.0.0.1:3466/');
    mocks.fetchWebMeta.mockResolvedValueOnce({ ok: false, reason: 'ACCESS_DENIED' });
    const readabilityFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json; charset=utf-8' },
      text: async () =>
        JSON.stringify({
          url: 'https://example.com/article',
          title: 'Readability 标题',
          excerpt: '文章摘要',
          textContent: 'Readability 提取的文章正文。'.repeat(30),
        }),
    });
    vi.stubGlobal('fetch', readabilityFetch);

    await expect(readUrl.execute({ url: 'https://example.com/article' }, {})).resolves.toMatchObject({
      title: 'Readability 标题',
      text: expect.stringContaining('Readability 提取的文章正文'),
    });
    expect(readabilityFetch).toHaveBeenCalledWith(
      expect.objectContaining({ href: expect.stringContaining('127.0.0.1:3466') }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('内部提取均失败后才使用显式配置的外部阅读器', async () => {
    vi.stubEnv('WEB_READER_EXTERNAL_FALLBACK_TEMPLATE', 'https://reader.example/read?url={encodedUrl}');
    mocks.fetchWebMeta.mockResolvedValueOnce({ ok: false, reason: 'ACCESS_DENIED' });
    const externalFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'text/markdown; charset=utf-8' },
      text: async () => `# 外部正文\n\n${'经过增强阅读器提取的内容。'.repeat(30)}`,
    });
    vi.stubGlobal('fetch', externalFetch);

    await expect(readUrl.execute({ url: 'https://example.com/article' }, {})).resolves.toMatchObject({
      title: '外部正文',
      text: expect.stringContaining('经过增强阅读器提取的内容'),
    });
    expect(externalFetch).toHaveBeenCalledOnce();
  });

  it('外部降级模板不允许用目标 URL 改变阅读器域名', async () => {
    vi.stubEnv('WEB_READER_EXTERNAL_FALLBACK_TEMPLATE', '{rawUrl}');
    const externalFetch = vi.fn();
    vi.stubGlobal('fetch', externalFetch);
    mocks.fetchWebMeta.mockResolvedValueOnce({ ok: false, reason: 'ACCESS_DENIED' });

    await expect(readUrl.execute({ url: 'https://example.com/private' }, {})).resolves.toEqual({
      error: 'ACCESS_DENIED',
      message: '网站拒绝了服务器读取，可能需要登录或存在访问限制',
    });
    expect(externalFetch).not.toHaveBeenCalled();
  });

  it('带 fragment 的 URL 不进入外部阅读器，避免泄漏客户端令牌', async () => {
    vi.stubEnv('WEB_READER_EXTERNAL_FALLBACK_TEMPLATE', 'https://reader.example/read?url={encodedUrl}');
    const externalFetch = vi.fn();
    vi.stubGlobal('fetch', externalFetch);
    mocks.fetchWebMeta.mockResolvedValueOnce({ ok: false, reason: 'ACCESS_DENIED' });

    await readUrl.execute({ url: 'https://example.com/#access_token=secret' }, {});

    expect(externalFetch).not.toHaveBeenCalled();
  });

  it('内部读取判定为内网地址时不得交给外部阅读器绕过 SSRF 防护', async () => {
    vi.stubEnv('WEB_READER_EXTERNAL_FALLBACK_TEMPLATE', 'https://reader.example/read?url={encodedUrl}');
    const externalFetch = vi.fn();
    vi.stubGlobal('fetch', externalFetch);
    mocks.fetchWebMeta.mockResolvedValueOnce({ ok: false, reason: 'BLOCKED_HOST' });

    await expect(readUrl.execute({ url: 'http://127.0.0.1/private' }, {})).resolves.toEqual({
      error: 'BLOCKED_HOST',
      message: '拒绝访问内网/非法地址',
    });
    expect(externalFetch).not.toHaveBeenCalled();
  });
});
