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

  it('生产项目 URL 模板化项目 ID 并移除包含位置标识的游标', () => {
    const url = sanitizeLogUrl(
      '/api/toolbox/projects/project-private/revisions/?limit=20&cursor=encoded-project-private',
    );

    expect(url).toBe('/api/toolbox/projects/:projectId/revisions/?limit=20');
    expect(url).not.toContain('project-private');
    expect(url).not.toContain('cursor');
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

  it.each([
    {
      url: '/api/toolbox/projects',
      payload: {
        projectType: 'document',
        title: '私密项目标题',
        metadata: { description: '私密项目说明' },
        content: {
          type: 'document',
          schemaVersion: 1,
          body: { format: 'markdown', value: '私密项目正文' },
          page: { size: 'auto', orientation: 'portrait' },
          extensions: {},
        },
      },
      expected: { projectType: 'document', pageCount: 1 },
    },
    {
      url: '/api/toolbox/projects/project-1/revisions',
      payload: {
        expectedVersion: 3,
        expectedRevision: 2,
        changeKind: 'autosave',
        content: {
          type: 'presentation',
          schemaVersion: 1,
          slides: [{ title: '私密页标题', notes: '私密备注', body: { value: '私密页正文' } }],
        },
      },
      expected: {
        projectType: 'presentation',
        expectedVersion: 3,
        expectedRevision: 2,
        changeKind: 'autosave',
        pageCount: 1,
      },
    },
    {
      url: '/api/toolbox/projects/project-1/revisions',
      payload: {
        expectedVersion: 5,
        expectedRevision: 4,
        changeKind: 'named',
        content: {
          type: 'workbook',
          schemaVersion: 1,
          sheets: [{ name: '私密表名', cells: { A1: { value: '私密值' }, B2: { formula: '私密公式' } } }],
        },
      },
      expected: {
        projectType: 'workbook',
        expectedVersion: 5,
        expectedRevision: 4,
        changeKind: 'named',
        sheetCount: 1,
        cellCount: 2,
      },
    },
  ])('生产项目日志仅保留内容摘要：$url', ({ url, payload, expected }) => {
    const summary = summarizeApiLogPayload(url, payload);
    expect(summary).toMatchObject({
      payloadSummary: 'toolbox_project_content_omitted',
      ...expected,
      contentBytes: expect.any(Number),
      contentHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    expect(JSON.stringify(summary)).not.toContain('私密');
  });

  it('Express 可接受的尾斜杠路径仍只记录生产项目内容摘要', () => {
    const summary = summarizeApiLogPayload('/api/toolbox/projects/project-1/revisions/', {
      title: '私密标题',
      metadata: { coverResourceId: 'note-private' },
      expectedVersion: 2,
      expectedRevision: 2,
      changeKind: 'autosave',
      content: {
        type: 'workbook',
        schemaVersion: 1,
        sheets: [{ id: 'sheet-private', name: '私密工作表', cells: { A1: { formula: 'PRIVATE()' } } }],
      },
    });

    expect(summary).toMatchObject({
      payloadSummary: 'toolbox_project_content_omitted',
      projectType: 'workbook',
      expectedVersion: 2,
      expectedRevision: 2,
      changeKind: 'autosave',
      sheetCount: 1,
      cellCount: 1,
    });
    expect(JSON.stringify(summary)).not.toContain('私密');
    expect(JSON.stringify(summary)).not.toContain('note-private');
    expect(JSON.stringify(summary)).not.toContain('PRIVATE()');
  });

  it.each([
    ['/api/toolbox/projects/project-1', { expectedVersion: 3, title: '私密标题', metadata: { description: '私密' } }],
    ['/api/toolbox/projects/project-1/open', {}],
    [
      '/api/toolbox/projects/project-1/revisions/2/restore',
      { expectedVersion: 3, expectedRevision: 2, sourceRevisionId: 'private-source-id' },
    ],
  ])('生产项目无正文写入也不会记录标题或 metadata：%s', (url, payload) => {
    const summary = summarizeApiLogPayload(url, payload);
    expect(summary).toMatchObject({ payloadSummary: 'toolbox_project_content_omitted' });
    expect(JSON.stringify(summary)).not.toContain('私密');
    expect(JSON.stringify(summary)).not.toContain('private-source-id');
  });

  it('生产项目摘要只接受协议枚举和正整数 CAS，不让伪造字段借日志保存原文', () => {
    expect(
      summarizeApiLogPayload('/api/toolbox/projects/project-1/revisions', {
        projectType: '私密类型',
        expectedVersion: '私密版本',
        expectedRevision: -1,
        changeKind: '私密操作',
        title: '私密标题',
        metadata: { description: '私密说明' },
      }),
    ).toEqual({ payloadSummary: 'toolbox_project_content_omitted' });
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

  it('日志中间件写库时实际使用生产项目摘要', async () => {
    let finish = () => {};
    const res = {
      statusCode: 201,
      on: vi.fn((event, callback) => {
        if (event === 'finish') finish = callback;
      }),
      send: vi.fn(),
    };
    const next = vi.fn();

    await logFunction(
      {
        user: { id: 'user-1', role: 'user' },
        originalUrl: '/api/toolbox/projects/project-1/revisions',
        method: 'POST',
        body: {
          clientRequestId: 'project-save-request',
          expectedVersion: 2,
          expectedRevision: 2,
          changeKind: 'autosave',
          content: {
            type: 'workbook',
            schemaVersion: 1,
            sheets: [{ name: '私密工作表', cells: { A1: { value: '私密值', formula: 'SUM(私密公式)' } } }],
          },
        },
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
    expect(JSON.parse(stored.req)).toMatchObject({
      payloadSummary: 'toolbox_project_content_omitted',
      projectType: 'workbook',
      expectedVersion: 2,
      expectedRevision: 2,
      changeKind: 'autosave',
      sheetCount: 1,
      cellCount: 1,
      contentBytes: expect.any(Number),
      contentHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    expect(stored.req).not.toContain('私密');
    expect(stored.req).not.toContain('project-save-request');
    expect(stored.url).toBe('/api/toolbox/projects/:projectId/revisions');
  });
});
