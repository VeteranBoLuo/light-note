import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();

vi.mock('../db/index.js', () => ({ default: { query } }));
vi.mock('./common.js', () => ({
  resultData: (data, status, msg) => ({ data, status, msg }),
  formatDateTime: () => '',
  insertData: (value) => value,
}));
vi.mock('./logExclude.js', () => ({ isSelfTraffic: () => false }));
vi.mock('./logPolicy.js', async (importOriginal) => ({
  ...(await importOriginal()),
  shouldSkipApiLog: () => false,
}));

const { logFunction, sanitizeLogUrl, sanitizeSensitivePayload } = await import('./log.js');
const { summarizeApiLogPayload } = await import('./logPolicy.js');

describe('API 日志脱敏', () => {
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
});
