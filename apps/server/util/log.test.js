import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
const logExclude = vi.hoisted(() => ({ isSelfTraffic: vi.fn(() => false), rememberInternalDevice: vi.fn() }));

vi.mock('../db/index.js', () => ({ default: { query } }));
vi.mock('./common.js', () => ({
  resultData: (data, status, msg) => ({ data, status, msg }),
  formatDateTime: () => '',
  insertData: (value) => value,
}));
vi.mock('./logExclude.js', () => logExclude);
vi.mock('./logPolicy.js', async (importOriginal) => ({
  ...(await importOriginal()),
  shouldSkipApiLog: () => false,
}));

const { logFunction, sanitizeLogUrl, sanitizeSensitivePayload } = await import('./log.js');
const { summarizeApiLogPayload } = await import('./logPolicy.js');

describe('API 日志脱敏', () => {
  it('公开搜索日志不保存关键词、网址或用户正文',()=>{
    expect(sanitizeLogUrl('/api/public-resources/search?q=private-keyword#body')).toBe('/api/public-resources/search');
    expect(summarizeApiLogPayload('/api/public-resources/search/combined',{keyword:'private',url:'https://private.invalid/',body:'private-text',requestId:'operation'})).toEqual({payloadSummary:'public_resource_content_omitted',requestId:'operation'});
  });
  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue([{}, []]);
  });

  it('按规范化后的字段名屏蔽邮箱、令牌和验证码变体', () => {
    const payload = sanitizeSensitivePayload({
      email: 'alice@example.com',
      access_token: 'access-secret',
      'refresh-token': 'refresh-secret',
      accessCode: 'A12345',
      accessTicket: 'ticket-secret',
      previewTicket: 'preview-secret',
      verifyCode: '123456',
      nested: { authorization: 'Bearer secret-token', value: 'alice@example.com' },
    });

    expect(payload).toMatchObject({
      email: '[REDACTED]',
      access_token: '[REDACTED]',
      'refresh-token': '[REDACTED]',
      accessCode: '[REDACTED]',
      accessTicket: '[REDACTED]',
      previewTicket: '[REDACTED]',
      verifyCode: '[REDACTED]',
      nested: { authorization: '[REDACTED]', value: '[REDACTED_EMAIL]' },
    });
  });

  it('深层对象与循环引用不会回落记录原始值', () => {
    const circular = { next: null };
    circular.next = circular;
    const deep = { a: { b: { c: { d: { secret: 'must-not-leak' } } } } };

    expect(sanitizeSensitivePayload(circular)).toEqual({ next: '[REDACTED_CIRCULAR]' });
    expect(JSON.stringify(sanitizeSensitivePayload(deep))).not.toContain('must-not-leak');
    expect(JSON.stringify(sanitizeSensitivePayload(deep))).toContain('REDACTED_DEPTH_LIMIT');
  });

  it('URL 中的敏感查询参数和凭据会被屏蔽', () => {
    const url = sanitizeLogUrl(
      'https://alice:password@example.test/api?email=alice@example.com&access_token=token-1&ok=yes',
    );

    expect(url).not.toContain('alice@example.com');
    expect(url).not.toContain('password');
    expect(url).not.toContain('token-1');
    expect(url).toContain('ok=yes');
  });

  it('嵌在错误文本中的 JSON 令牌也不会漏记', () => {
    const value = sanitizeSensitivePayload('provider error: {"access_token":"token-from-provider"}');

    expect(value).not.toContain('token-from-provider');
    expect(value).toContain('[REDACTED]');
  });

  it('笔记写入日志只保留轮廓，不复制正文、标题或手绘场景', () => {
    const payload = summarizeApiLogPayload('/api/note/updateNote?source=autosave', {
      id: 'note-1',
      title: '含 emoji 🌟 的私密标题',
      content: '<p>用户私密正文 🌟</p>',
      type: 'html',
      revision: 7,
      tags: ['private-tag'],
    });

    expect(payload).toEqual({
      payloadSummary: 'note_content_omitted',
      id: 'note-1',
      type: 'html',
      revision: 7,
      contentLength: '<p>用户私密正文 🌟</p>'.length,
      titleLength: '含 emoji 🌟 的私密标题'.length,
      tagCount: 1,
    });
    expect(JSON.stringify(payload)).not.toContain('私密');
    expect(JSON.stringify(payload)).not.toContain('private-tag');
  });

  it('手绘缩略图上传日志只记录派生图长度', () => {
    const payload = summarizeApiLogPayload('/api/note/uploadDrawingThumbnail', {
      id: 'drawing-1',
      revision: 4,
      rendererVersion: 2,
      thumbnail: 'data:image/webp;base64,private-bitmap',
    });

    expect(payload).toEqual({
      payloadSummary: 'note_content_omitted',
      id: 'drawing-1',
      revision: 4,
      rendererVersion: 2,
      thumbnailLength: 'data:image/webp;base64,private-bitmap'.length,
    });
    expect(JSON.stringify(payload)).not.toContain('private-bitmap');
  });

  it('非正文类路由继续交给通用脱敏逻辑', () => {
    const payload = { key: 'diagnostic-value' };
    expect(summarizeApiLogPayload('/api/bookmark/getBookmarkList', payload)).toBe(payload);
  });

  it('日志中间件写库时实际使用笔记摘要', async () => {
    let finish = () => {};
    const res = {
      statusCode: 200,
      on: vi.fn((event, callback) => {
        if (event === 'finish') finish = callback;
      }),
      send: vi.fn(),
    };
    const next = vi.fn();

    await logFunction(
      {
        user: { id: 'user-1', role: 'user' },
        originalUrl: '/api/note/updateNote',
        method: 'POST',
        body: { id: 'note-1', title: '私密标题', content: '私密正文', revision: 3 },
        headers: {},
        ip: '127.0.0.1',
        route: {},
      },
      res,
      next,
    );
    await finish();
    await Promise.resolve();

    expect(next).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(1);
    const stored = query.mock.calls[0][1][0];
    expect(JSON.parse(stored.req)).toEqual({
      payloadSummary: 'note_content_omitted',
      id: 'note-1',
      revision: 3,
      contentLength: 4,
      titleLength: 4,
    });
    expect(stored.req).not.toContain('私密');
  });

  it('请求体整体超过 64KB 时只记录体积和开头预览', async () => {
    let finish = () => {};
    const res = {
      statusCode: 200,
      on: vi.fn((event, callback) => {
        if (event === 'finish') finish = callback;
      }),
      send: vi.fn(),
    };
    const items = Array.from({ length: 2000 }, (_, index) => ({ name: `书签-${index}`, url: `https://example.com/${'x'.repeat(60)}` }));

    await logFunction(
      { user: { id: 'user-1', role: 'user' }, originalUrl: '/api/bookmark/importBookmarksExcel', method: 'POST', body: { items }, headers: {}, ip: '127.0.0.1', route: {} },
      res,
      vi.fn(),
    );
    await finish();
    await Promise.resolve();

    const stored = JSON.parse(query.mock.calls[0][1][0].req);
    expect(stored.payloadSummary).toBe('payload_too_large');
    expect(stored.bytes).toBeGreaterThan(64 * 1024);
    expect(stored.preview).toHaveLength(4096);
    expect(stored.preview.startsWith('{"items":[')).toBe(true);
  });
});

describe('API 日志的内部设备过滤', () => {
  const mockRes = () => ({ statusCode: 200, on: vi.fn(), send: vi.fn() });

  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue([{}, []]);
    logExclude.isSelfTraffic.mockReset().mockReturnValue(false);
    logExclude.rememberInternalDevice.mockReset();
  });

  it('每个请求都先交给内部设备登记，管理员上下文请求也不例外', async () => {
    const req = {
      adminContext: { id: 'ctx-1' },
      user: { id: 'target-1', role: 'user' },
      originalUrl: '/api/note/getNoteList',
      method: 'POST',
      headers: {},
    };
    const res = mockRes();
    const next = vi.fn();

    await logFunction(req, res, next);

    expect(logExclude.rememberInternalDevice).toHaveBeenCalledWith(req);
    expect(next).toHaveBeenCalledOnce();
    expect(res.on).not.toHaveBeenCalled();
  });

  it('自有流量直接放行，不登记 finish 回调也不写库', async () => {
    logExclude.isSelfTraffic.mockReturnValue(true);
    const req = {
      user: { id: 'visitor-1', role: 'visitor', isAuthenticated: false },
      originalUrl: '/api/bookmark/getBookmarkList',
      method: 'POST',
      body: {},
      headers: { 'x-log-device-id': '7f0c2a4e-5b1d-4c2e-9a3f-1d2e3f4a5b6c' },
      ip: '203.0.113.8',
    };
    const res = mockRes();
    const next = vi.fn();

    await logFunction(req, res, next);

    expect(logExclude.isSelfTraffic).toHaveBeenCalledWith(req);
    expect(next).toHaveBeenCalledOnce();
    expect(res.on).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('内部账号登录态不算自有流量时照常写入 API 日志', async () => {
    let finish = () => {};
    const res = {
      statusCode: 200,
      on: vi.fn((event, callback) => {
        if (event === 'finish') finish = callback;
      }),
      send: vi.fn(),
    };

    await logFunction(
      {
        user: { id: 'root-1', role: 'root', isAuthenticated: true },
        originalUrl: '/api/bookmark/getBookmarkList',
        method: 'POST',
        body: {},
        headers: { 'x-log-device-id': '7f0c2a4e-5b1d-4c2e-9a3f-1d2e3f4a5b6c' },
        ip: '203.0.113.8',
        route: {},
      },
      res,
      vi.fn(),
    );
    await finish();
    await Promise.resolve();

    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0][1][0].userId).toBe('root-1');
  });
});
