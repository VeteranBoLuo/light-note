import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), getConnection: vi.fn() }));
vi.mock('../db/index.js', () => ({ default: dbMocks }));

const { extractTokens, invalidateKnowledgeCache, retrieve, splitKnowledgeContent } = await import(
  './knowledgeService.js'
);

const row = (overrides = {}) => ({
  id: 'knowledge-id',
  title: '游客模式有什么限制',
  category: '帮助中心',
  status: 'public',
  type: 'html',
  content: '<p>游客可以浏览公开内容，并使用基础 AI 额度。</p>',
  ...overrides,
});

describe('extractTokens（知识库中文分词）', () => {
  it('真实线上样例不再产出“怎”“么”等噪声单字', () => {
    const tokens = extractTokens('怎么联系官方呢？');
    expect(tokens).not.toContain('怎');
    expect(tokens).not.toContain('么');
    expect(tokens).toContain('联系');
    expect(tokens).toContain('官方');
  });

  it('存在多字 token 时完全不产出单字', () => {
    const tokens = extractTokens('忘记密码怎么办');
    expect(tokens.every((token) => token.length >= 2)).toBe(true);
    expect(tokens).toContain('忘记');
    expect(tokens).toContain('密码');
  });

  it('纯单字查询保留兜底，停用单字仍被过滤', () => {
    expect(extractTokens('笔')).toEqual(['笔']);
    expect(extractTokens('的')).toEqual([]);
  });

  it('英文单词与中文二字词可以共存', () => {
    const tokens = extractTokens('GitHub 仓库地址');
    expect(tokens).toContain('github');
    expect(tokens).toContain('仓库');
  });

  it('空字符串和纯符号不生成 token', () => {
    expect(extractTokens('')).toEqual([]);
    expect(extractTokens('？！。')).toEqual([]);
  });
});

describe('splitKnowledgeContent（知识正文分块）', () => {
  it('按 HTML 标题切分，并限制单块长度', () => {
    const chunks = splitKnowledgeContent(
      `<h1>功能总览</h1><p>${'这是较长的功能介绍。'.repeat(120)}</p><h2>共建入口</h2><p>地址是 https://boluo66.top/co-build</p>`,
      'html',
    );
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((chunk) => chunk.content.length <= 850)).toBe(true);
    expect(chunks.some((chunk) => chunk.heading === '共建入口' && chunk.content.includes('/co-build'))).toBe(true);
  });

  it('识别 Markdown 标题并去掉常用标记', () => {
    const chunks = splitKnowledgeContent('# 账号安全\n\n## 修改密码\n\n**设置页**可以修改密码。', 'markdown');
    expect(chunks).toEqual([
      expect.objectContaining({ heading: '修改密码', content: '设置页可以修改密码。' }),
    ]);
  });
});

describe('retrieve（MiniSearch 本地分块检索）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    invalidateKnowledgeCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    invalidateKnowledgeCache();
  });

  it('保留知识条目的 ID、分类与可见状态，供来源卡片生成深链', async () => {
    dbMocks.query.mockResolvedValueOnce([[row()]]);

    const result = await retrieve('user-id', '游客模式', 3, true);

    expect(dbMocks.query).toHaveBeenCalledWith(expect.stringContaining("WHERE status = 'public'"));
    expect(result[0]).toEqual(
      expect.objectContaining({
        id: 'knowledge-id',
        title: '游客模式有什么限制',
        category: '帮助中心',
        status: 'public',
      }),
    );
  });

  it('能返回位于长文档后半段的真实命中段落，而不是固定截取开头', async () => {
    dbMocks.query.mockResolvedValueOnce([
      [
        row({
          id: 'co-build',
          title: '功能入口汇总',
          content: `<h1>总览</h1><p>${'普通功能介绍。'.repeat(500)}</p><h2>共建轻笺地址</h2><p>访问 https://boluo66.top/co-build 提交产品建议。</p>`,
        }),
      ],
    ]);

    const result = await retrieve('user-id', '共建轻笺地址', 3, true);

    expect(result[0]).toEqual(
      expect.objectContaining({ id: 'co-build', content: expect.stringContaining('https://boluo66.top/co-build') }),
    );
  });

  it('标题精确命中的文档优先于仅在正文中重复出现关键词的文档', async () => {
    dbMocks.query.mockResolvedValueOnce([
      [
        row({ id: 'title-hit', title: '云空间容量', content: '<p>容量由成长等级决定。</p>' }),
        row({
          id: 'body-hit',
          title: '成长权益',
          content: `<p>${'云空间容量会变化。'.repeat(30)}</p>`,
        }),
      ],
    ]);

    const result = await retrieve('user-id', '云空间容量', 2, true);

    expect(result[0].id).toBe('title-hit');
  });

  it('长问句中的专有英文词命中标题时，不会被低置信度过滤', async () => {
    dbMocks.query.mockResolvedValueOnce([
      [
        row({
          id: 'ocr-help',
          title: '图片型 PDF 与图片 OCR：为什么解析不到文字',
          content: '<p>服务器本机使用 Tesseract 识别，不调用第三方 OCR API。</p>',
        }),
        row({ id: 'privacy', title: '隐私政策', content: '<p>数据在本地处理，不交给第三方。</p>' }),
      ],
    ]);

    const result = await retrieve('user-id', 'OCR 是本地还是第三方', 2, true);

    expect(result[0]?.id).toBe('ocr-help');
  });

  it('同一篇文章命中多个段落时只返回一次', async () => {
    dbMocks.query.mockResolvedValueOnce([
      [
        row({
          id: 'single-doc',
          title: '云空间完整说明',
          content: `<h2>上传文件</h2><p>${'云空间上传文件。'.repeat(100)}</p><h2>上传限制</h2><p>${'云空间上传限制。'.repeat(100)}</p>`,
        }),
      ],
    ]);

    const result = await retrieve('user-id', '云空间上传', 5, true);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('single-doc');
  });

  it('精确检索不足时使用本地别名扩展', async () => {
    dbMocks.query.mockResolvedValueOnce([
      [row({ id: 'cloud', title: '云空间容量', content: '<p>云空间容量由成长等级决定。</p>' })],
    ]);

    const result = await retrieve('user-id', '云盘有多大', 3, true);

    expect(result[0]?.id).toBe('cloud');
  });

  it('精确检索不足时对较长英文词启用一次编辑距离的模糊降级', async () => {
    dbMocks.query.mockResolvedValueOnce([
      [row({ id: 'github', title: 'GitHub 登录说明', content: '<p>使用 GitHub 授权登录。</p>' })],
    ]);

    const result = await retrieve('user-id', 'GitHib 登录', 3, true);

    expect(result[0]?.id).toBe('github');
  });

  it('只有一个弱相关二字词时不返回误导结果', async () => {
    dbMocks.query.mockResolvedValueOnce([
      [row({ id: 'weather', title: '天气说明', content: '<p>页面底部偶尔展示天气信息。</p>' })],
    ]);

    const result = await retrieve('user-id', '火星天气在哪里', 3, true);

    expect(result).toEqual([]);
  });

  it('缓存有效期内只查一次数据库，主动失效后重建索引', async () => {
    dbMocks.query
      .mockResolvedValueOnce([[row({ id: 'first', title: '帮助中心地址' })]])
      .mockResolvedValueOnce([[row({ id: 'second', title: '帮助中心新地址' })]]);

    expect((await retrieve('user-id', '帮助中心地址', 1, true))[0]?.id).toBe('first');
    expect((await retrieve('user-id', '帮助中心地址', 1, true))[0]?.id).toBe('first');
    expect(dbMocks.query).toHaveBeenCalledTimes(1);

    invalidateKnowledgeCache();
    expect((await retrieve('user-id', '帮助中心新地址', 1, true))[0]?.id).toBe('second');
    expect(dbMocks.query).toHaveBeenCalledTimes(2);
  });

  it('建索引期间失效缓存时，不会让旧查询覆盖随后生成的新索引', async () => {
    let resolveFirstQuery;
    dbMocks.query
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstQuery = resolve;
          }),
      )
      .mockResolvedValueOnce([[row({ id: 'fresh', title: '新的知识说明' })]]);

    const staleRequest = retrieve('user-id', '旧的知识说明', 1, true);
    await vi.waitFor(() => expect(dbMocks.query).toHaveBeenCalledTimes(1));
    invalidateKnowledgeCache();
    const freshRequest = retrieve('user-id', '新的知识说明', 1, true);
    resolveFirstQuery([[row({ id: 'stale', title: '旧的知识说明' })]]);

    expect((await staleRequest)[0]?.id).toBe('stale');
    expect((await freshRequest)[0]?.id).toBe('fresh');
    expect((await retrieve('user-id', '新的知识说明', 1, true))[0]?.id).toBe('fresh');
    expect(dbMocks.query).toHaveBeenCalledTimes(2);
  });

  it('可通过环境变量快速回退旧匹配算法', async () => {
    vi.stubEnv('KNOWLEDGE_SEARCH_ENGINE', 'legacy');
    dbMocks.query.mockResolvedValueOnce([[row({ id: 'legacy', title: '回收站说明' })]]);

    const result = await retrieve('user-id', '回收站', 1, true);

    expect(result[0]?.id).toBe('legacy');
  });
});
