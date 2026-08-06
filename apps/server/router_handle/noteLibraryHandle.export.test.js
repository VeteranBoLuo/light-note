import { beforeEach, describe, expect, it, vi } from 'vitest';

const poolQuery = vi.fn();
const ensureNotVisitor = vi.fn(() => true);
const createExportTicket = vi.fn(async () => ({ token: 'ticket-token', expiresIn: 180 }));
const consumeExportTicket = vi.fn();

vi.mock('../db/index.js', () => ({ default: { getConnection: vi.fn(), query: poolQuery } }));
vi.mock('../util/common.js', () => ({
  resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }),
  snakeCaseKeys: vi.fn((obj) => obj),
  mergeExistingProperties: vi.fn((obj) => obj),
  insertData: vi.fn((obj) => obj),
  L: (_req, zh) => zh,
}));
vi.mock('../util/auth.js', () => ({ ensureNotVisitor }));
vi.mock('../util/resourceTags.js', () => ({
  RESOURCE_TYPE: { NOTE: 'note' },
  replaceResourceTagRelations: vi.fn(),
  validateUserTags: vi.fn(),
}));
vi.mock('../util/resourceInbox.js', () => ({
  attachPendingStatus: vi.fn(),
  removeInboxRelations: vi.fn(),
}));
vi.mock('../util/services/noteService.js', () => ({ createNote: vi.fn() }));
vi.mock('../util/services/tagService.js', () => ({ createTag: vi.fn() }));
vi.mock('../util/noteImages.js', () => ({
  cleanupOrphanNoteImages: vi.fn(),
  extractNoteImageUrls: vi.fn(() => []),
  filterOwnedImageUrls: vi.fn(),
}));
vi.mock('../util/noteExportTickets.js', () => ({
  EXPORT_FORMATS: { md: 'text/markdown', html: 'text/html', pdf: 'application/pdf' },
  MAX_EXPORT_BYTES: 6 * 1024 * 1024,
  createExportTicket,
  consumeExportTicket,
}));

const { createNoteExportTicket, downloadNoteExportFile } = await import('./noteLibraryHandle.js');

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    contentType: undefined,
    send: vi.fn(function (payload) {
      this.body = payload;
      return this;
    }),
    end: vi.fn(function (payload) {
      this.body = payload;
      return this;
    }),
    status: vi.fn(function (code) {
      this.statusCode = code;
      return this;
    }),
    type: vi.fn(function (value) {
      this.contentType = value;
      return this;
    }),
    setHeader: vi.fn(function (key, value) {
      this.headers[key] = value;
      return this;
    }),
  };
  return res;
}

const ownedNote = () => poolQuery.mockResolvedValueOnce([[{ id: 'note-1' }]]);

beforeEach(() => {
  vi.clearAllMocks();
  ensureNotVisitor.mockReturnValue(true);
  createExportTicket.mockResolvedValue({ token: 'ticket-token', expiresIn: 180 });
});

describe('createNoteExportTicket', () => {
  const req = (body) => ({ body, user: { id: 'user-1', role: 'user' }, headers: {} });

  it('把导出件换成带 token 的下载地址，token 走 query 不进路径', async () => {
    ownedNote();
    const res = mockRes();

    await createNoteExportTicket(
      req({ id: 'note-1', format: 'md', fileName: '周报.md', contentBase64: Buffer.from('# 周报').toString('base64') }),
      res,
    );

    expect(res.body.status).toBe(200);
    // 路径段带随机 token 会让每次导出都是「新路径」，触发安全中间件的接口枚举检测
    expect(res.body.data.downloadUrl).toBe('/api/note/exportFile?token=ticket-token');
    expect(res.body.data.expiresIn).toBe(180);
    expect(createExportTicket).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', resourceId: 'note-1', format: 'md', fileName: '周报.md' }),
    );
  });

  it('拒绝白名单外的格式，且不查库不发票据', async () => {
    const res = mockRes();

    await createNoteExportTicket(req({ id: 'note-1', format: 'exe', contentBase64: 'AAAA' }), res);

    expect(res.body.status).toBe(400);
    expect(poolQuery).not.toHaveBeenCalled();
    expect(createExportTicket).not.toHaveBeenCalled();
  });

  it('别人的笔记导不出来', async () => {
    poolQuery.mockResolvedValueOnce([[]]);
    const res = mockRes();

    await createNoteExportTicket(req({ id: 'note-x', format: 'md', contentBase64: 'AAAA' }), res);

    expect(res.body.status).toBe(404);
    expect(createExportTicket).not.toHaveBeenCalled();
  });

  it('超限内容在解码前就被拦下', async () => {
    const res = mockRes();
    const oversized = 'A'.repeat(9 * 1024 * 1024);

    await createNoteExportTicket(req({ id: 'note-1', format: 'pdf', contentBase64: oversized }), res);

    expect(res.body.status).toBe(413);
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it('文件名里的换行与路径分隔符会被清掉，避免响应头注入', async () => {
    ownedNote();
    const res = mockRes();

    await createNoteExportTicket(
      req({
        id: 'note-1',
        format: 'md',
        fileName: '周报\r\nX-Injected: 1/../../etc/passwd.md',
        contentBase64: Buffer.from('# 周报').toString('base64'),
      }),
      res,
    );

    const { fileName } = createExportTicket.mock.calls[0][0];
    expect(fileName).not.toMatch(/[\r\n\\/]/);
    expect(fileName.endsWith('.md')).toBe(true);
  });

  it('游客被 ensureNotVisitor 拦下', async () => {
    ensureNotVisitor.mockReturnValue(false);
    const res = mockRes();

    await createNoteExportTicket(req({ id: 'note-1', format: 'md', contentBase64: 'AAAA' }), res);

    expect(createExportTicket).not.toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
  });
});

describe('downloadNoteExportFile', () => {
  const req = (overrides = {}) => ({
    query: { token: 'ticket-token' },
    user: { id: 'user-1', role: 'user' },
    headers: {},
    ...overrides,
  });

  it('票据有效时直出文件，且强制 octet-stream + nosniff', async () => {
    const content = Buffer.from('# 周报');
    consumeExportTicket.mockResolvedValue({ noteId: 'note-1', format: 'md', fileName: '周报.md', content });
    const res = mockRes();

    await downloadNoteExportFile(req(), res);

    // 导出的 HTML 是用户可控内容，绝不能带 text/html 在主站域名下被渲染
    expect(res.headers['Content-Type']).toBe('application/octet-stream');
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(res.headers['Content-Length']).toBe(String(content.length));
    expect(res.headers['Content-Disposition']).toContain("filename*=UTF-8''");
    expect(res.headers['Content-Disposition']).toContain(encodeURIComponent('周报.md'));
    expect(res.end).toHaveBeenCalledWith(content);
  });

  it('票据无效时返回 410 而不是 404', async () => {
    consumeExportTicket.mockResolvedValue(null);
    const res = mockRes();

    await downloadNoteExportFile(req(), res);

    // 安全中间件按 5 分钟内 404 次数判「扫描器」并累积 IP 信誉分：
    // 用户重复点导出踩到过期票据不该把自己的 IP 送进封禁名单
    expect(res.statusCode).toBe(410);
    expect(res.contentType).toBe('text/plain');
  });

  it('未登录/游客拿到真的 403 文本，而不是 200 + JSON', async () => {
    const res = mockRes();

    // DownloadManager 会把「HTTP 200 + JSON」原样存成用户的笔记文件
    await downloadNoteExportFile(req({ user: { id: 'visitor-1', role: 'visitor' } }), res);

    expect(res.statusCode).toBe(403);
    expect(res.contentType).toBe('text/plain');
    expect(consumeExportTicket).not.toHaveBeenCalled();
  });

  it('消费票据抛错时返回 500 文本而不是挂起', async () => {
    consumeExportTicket.mockRejectedValue(new Error('redis down'));
    const res = mockRes();

    await downloadNoteExportFile(req(), res);

    expect(res.statusCode).toBe(500);
    expect(res.contentType).toBe('text/plain');
  });
});
