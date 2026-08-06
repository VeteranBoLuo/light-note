import { beforeEach, describe, expect, it, vi } from 'vitest';

const poolQuery = vi.fn();
const ensureNotVisitor = vi.fn(() => true);
const createExportTicket = vi.fn(async () => ({ token: 'ticket-token', expiresIn: 180 }));
const consumeExportTicket = vi.fn();

vi.mock('../db/index.js', () => ({ default: { getConnection: vi.fn(), query: poolQuery } }));
vi.mock('../util/common.js', () => ({
  resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }),
  L: (_req, zh) => zh,
}));
vi.mock('../util/auth.js', () => ({ ensureNotVisitor }));
vi.mock('../util/services/todoService.js', () => ({
  createTodo: vi.fn(),
  batchDeleteTodos: vi.fn(),
  batchRestoreTodos: vi.fn(),
  batchSetTodoStatus: vi.fn(),
  deleteTodo: vi.fn(),
  listTodos: vi.fn(),
  queryTodoPendingCount: vi.fn(),
  reorderTodos: vi.fn(),
  restoreTodo: vi.fn(),
  setTodoStatus: vi.fn(),
  snoozeTodo: vi.fn(),
  updateTodo: vi.fn(),
}));
vi.mock('../util/growthTaskCompletion.js', () => ({ completeGrowthTask: vi.fn() }));
vi.mock('../util/noteExportTickets.js', () => ({ createExportTicket, consumeExportTicket }));

const { createTodoCalendarTicket, downloadTodoCalendarFile } = await import('./todoHandle.js');

function mockRes() {
  return {
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
}

const ICS = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
const ownedTodo = () => poolQuery.mockResolvedValueOnce([[{ id: 'todo-1' }]]);
const noTodo = () => poolQuery.mockResolvedValueOnce([[]]);

beforeEach(() => {
  vi.clearAllMocks();
  ensureNotVisitor.mockReturnValue(true);
  createExportTicket.mockResolvedValue({ token: 'ticket-token', expiresIn: 180 });
});

describe('createTodoCalendarTicket', () => {
  const req = (body) => ({ body, user: { id: 'user-1', role: 'user' }, headers: {} });

  it('把 .ics 换成带 token 的下载地址，token 走 query 不进路径', async () => {
    ownedTodo();
    const res = mockRes();

    await createTodoCalendarTicket(
      req({ id: 'todo-1', fileName: '交周报.ics', contentBase64: Buffer.from(ICS).toString('base64') }),
      res,
    );

    expect(res.body.status).toBe(200);
    // 路径段带随机 token 会让每次导出都是「新路径」，触发安全中间件的接口枚举检测
    expect(res.body.data.downloadUrl).toBe('/api/todo/exportCalendar?token=ticket-token');
    expect(createExportTicket).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', resourceId: 'todo-1', format: 'ics', fileName: '交周报.ics' }),
    );
  });

  it('别人的待办一律 404，不能靠导出接口把别人的日程读出来', async () => {
    noTodo();
    const res = mockRes();

    await createTodoCalendarTicket(req({ id: 'todo-other', contentBase64: Buffer.from(ICS).toString('base64') }), res);

    expect(res.body.status).toBe(404);
    expect(createExportTicket).not.toHaveBeenCalled();
  });

  it('超限内容在解码前就拒掉，不先解成大 Buffer', async () => {
    const res = mockRes();

    await createTodoCalendarTicket(req({ id: 'todo-1', contentBase64: 'A'.repeat(120 * 1024) }), res);

    expect(res.body.status).toBe(413);
    // 归属查询都不该发生：体积在解码前就判掉了
    expect(poolQuery).not.toHaveBeenCalled();
    expect(createExportTicket).not.toHaveBeenCalled();
  });

  it('缺参数直接 400', async () => {
    const res = mockRes();
    await createTodoCalendarTicket(req({ id: '', contentBase64: 'x' }), res);
    expect(res.body.status).toBe(400);

    const res2 = mockRes();
    await createTodoCalendarTicket(req({ id: 'todo-1' }), res2);
    expect(res2.body.status).toBe(400);
  });

  it('文件名不可信：清掉路径分隔符并补 .ics —— 它会被当落盘路径用', async () => {
    ownedTodo();
    const res = mockRes();

    await createTodoCalendarTicket(
      req({ id: 'todo-1', fileName: '../../etc/passwd', contentBase64: Buffer.from(ICS).toString('base64') }),
      res,
    );

    const { fileName } = createExportTicket.mock.calls[0][0];
    expect(fileName).not.toContain('/');
    expect(fileName).not.toContain('\\');
    expect(fileName.endsWith('.ics')).toBe(true);
  });

  it('文件名为空时给兜底名，不产出一个只有扩展名的文件', async () => {
    ownedTodo();
    const res = mockRes();

    await createTodoCalendarTicket(
      req({ id: 'todo-1', fileName: '   ', contentBase64: Buffer.from(ICS).toString('base64') }),
      res,
    );

    expect(createExportTicket.mock.calls[0][0].fileName).toBe('待办.ics');
  });

  it('游客被 ensureNotVisitor 拦住', async () => {
    ensureNotVisitor.mockReturnValue(false);
    const res = mockRes();

    await createTodoCalendarTicket(req({ id: 'todo-1', contentBase64: 'x' }), res);

    expect(createExportTicket).not.toHaveBeenCalled();
  });
});

describe('downloadTodoCalendarFile', () => {
  /*
   * 这个端点由系统 DownloadManager 直接请求，不是页面 fetch：
   * 必须用真实 HTTP 状态码，否则「HTTP 200 + body.status」那套惯例会把一段 JSON
   * 原样存成用户的日历文件。
   */
  it('取到票据时按 text/calendar 直出，Android 才会提「用日历打开」', async () => {
    const content = Buffer.from(ICS);
    consumeExportTicket.mockResolvedValue({ resourceId: 'todo-1', format: 'ics', fileName: '交周报.ics', content });
    const res = mockRes();

    await downloadTodoCalendarFile({ query: { token: 'ticket-token' }, user: { id: 'user-1', role: 'user' } }, res);

    expect(res.headers['Content-Type']).toBe('text/calendar; charset=utf-8');
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(res.headers['Content-Length']).toBe(String(content.length));
    expect(res.headers['Content-Disposition']).toContain(`filename*=UTF-8''${encodeURIComponent('交周报.ics')}`);
    expect(res.body).toBe(content);
  });

  it('票据过期用 410 而不是 404：404 会把用户 IP 喂给扫描器判定', async () => {
    consumeExportTicket.mockResolvedValue(null);
    const res = mockRes();

    await downloadTodoCalendarFile({ query: { token: 'expired' }, user: { id: 'user-1', role: 'user' } }, res);

    expect(res.statusCode).toBe(410);
    expect(res.contentType).toBe('text/plain');
  });

  it('未登录/游客是真的 403，不能回 JSON 让它被存成日历文件', async () => {
    const res = mockRes();
    await downloadTodoCalendarFile({ query: { token: 't' }, user: null }, res);
    expect(res.statusCode).toBe(403);
    expect(res.contentType).toBe('text/plain');

    const res2 = mockRes();
    await downloadTodoCalendarFile({ query: { token: 't' }, user: { id: 'u', role: 'visitor' } }, res2);
    expect(res2.statusCode).toBe(403);
    expect(consumeExportTicket).not.toHaveBeenCalled();
  });
});
