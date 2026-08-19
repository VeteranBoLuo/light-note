import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi.fn(),
  };
  return {
    connection,
    pool: { getConnection: vi.fn(async () => connection), query: vi.fn() },
    issueNoteShareTicket: vi.fn(),
    readNoteShareTicket: vi.fn(),
    getSharedNotePage: vi.fn(),
    listSharedNoteChildren: vi.fn(),
  };
});

vi.mock('../db/index.js', () => ({ default: mocks.pool }));
vi.mock('../util/noteShareTicket.js', () => ({
  issueNoteShareTicket: mocks.issueNoteShareTicket,
  readNoteShareTicket: mocks.readNoteShareTicket,
}));
vi.mock('../util/services/noteShareService.js', () => {
  class NoteShareScopeError extends Error {}
  return {
    NoteShareScopeError,
    getSharedNotePage: mocks.getSharedNotePage,
    listSharedNoteChildren: mocks.listSharedNoteChildren,
  };
});

const { getNoteSharePage, resolveNoteShare } = await import('./noteShareHandle.js');

function mockRes() {
  const res = { headers: new Map(), body: null };
  res.set = vi.fn((name, value) => {
    res.headers.set(name, value);
    return res;
  });
  res.send = vi.fn((body) => {
    res.body = body;
    return res;
  });
  return res;
}

function activeShareRow(overrides = {}) {
  return {
    id: 'share-1',
    root_note_id: 'root-1',
    owner_user_id: 'owner-1',
    scope_type: 'subtree',
    root_title: '公开项目',
    root_type: 'markdown',
    root_del_flag: 0,
    creator_name: 'Alice',
    description: '只读资料',
    access_code_hash: null,
    expires_at: new Date(Date.now() + 60_000),
    status: 'active',
    revoked_at: null,
    access_count: 0,
    max_access_count: null,
    ...overrides,
  };
}

describe('note share public resolve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.beginTransaction.mockResolvedValue();
    mocks.connection.commit.mockResolvedValue();
    mocks.connection.rollback.mockResolvedValue();
    mocks.pool.query.mockResolvedValue([{ affectedRows: 0 }]);
    mocks.issueNoteShareTicket.mockResolvedValue({ token: 'ticket-value', expiresIn: 1800 });
    mocks.readNoteShareTicket.mockResolvedValue(null);
    mocks.getSharedNotePage.mockResolvedValue({
      page: {
        id: 'root-1',
        parent_id: null,
        title: '公开项目',
        content: '# 内容',
        type: 'markdown',
        revision: 2,
      },
      breadcrumb: [{ id: 'root-1', title: '公开项目' }],
    });
    mocks.listSharedNoteChildren.mockResolvedValue([]);
  });

  it('只用令牌摘要查库，成功后一次计数并返回短时阅读票据与安全响应头', async () => {
    mocks.connection.query
      .mockResolvedValueOnce([[activeShareRow()]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const token = 't'.repeat(43);
    const res = mockRes();

    await resolveNoteShare(
      { body: { token }, ip: '203.0.113.8', headers: { 'accept-language': 'zh-CN' }, socket: {} },
      res,
    );

    expect(mocks.connection.query.mock.calls[0][0]).toContain('s.token_hash = ?');
    expect(mocks.connection.query.mock.calls[0][1][0]).toMatch(/^[a-f0-9]{64}$/u);
    expect(mocks.connection.query.mock.calls[0][1][0]).not.toContain(token);
    expect(
      mocks.connection.query.mock.calls.some(([sql]) => String(sql).includes('access_count = access_count + 1')),
    ).toBe(true);
    expect(mocks.connection.commit).toHaveBeenCalledTimes(1);
    expect(mocks.issueNoteShareTicket).toHaveBeenCalledWith({
      shareId: 'share-1',
      rootNoteId: 'root-1',
      ownerUserId: 'owner-1',
      scopeType: 'subtree',
    });
    expect(res.headers).toEqual(
      new Map([
        ['Cache-Control', 'no-store'],
        ['Referrer-Policy', 'no-referrer'],
        ['X-Robots-Tag', 'noindex, nofollow, noarchive'],
      ]),
    );
    expect(res.body).toMatchObject({
      status: 200,
      data: {
        accessTicket: 'ticket-value',
        share: { rootNoteId: 'root-1', rootType: 'markdown', scopeType: 'subtree' },
        page: { id: 'root-1', content: '# 内容', type: 'markdown' },
      },
    });
  });

  it('访问次数耗尽时不读取正文、不签发票据也不增加计数', async () => {
    mocks.connection.query
      .mockResolvedValueOnce([[activeShareRow({ access_count: 1, max_access_count: 1 })]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = mockRes();

    await resolveNoteShare({ body: { token: 't'.repeat(43) }, ip: '203.0.113.8', headers: {}, socket: {} }, res);

    expect(mocks.getSharedNotePage).not.toHaveBeenCalled();
    expect(mocks.issueNoteShareTicket).not.toHaveBeenCalled();
    expect(
      mocks.connection.query.mock.calls.some(([sql]) => String(sql).includes('access_count = access_count + 1')),
    ).toBe(false);
    expect(mocks.connection.commit).toHaveBeenCalledTimes(1);
    expect(res.body).toMatchObject({ status: 410, data: { errorCode: 'SHARE_ACCESS_LIMIT_REACHED' } });
  });

  it('同一阅读会话刷新时不重复计数，达到上限后仍可继续当前会话', async () => {
    const existingTicket = {
      shareId: 'share-1',
      rootNoteId: 'root-1',
      ownerUserId: 'owner-1',
      scopeType: 'subtree',
    };
    mocks.readNoteShareTicket.mockResolvedValue(existingTicket);
    mocks.connection.query
      .mockResolvedValueOnce([
        [activeShareRow({ access_count: 1, max_access_count: 1, access_code_hash: 'protected' })],
      ])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = mockRes();

    await resolveNoteShare(
      {
        body: { token: 't'.repeat(43), accessTicket: 'a'.repeat(43) },
        ip: '203.0.113.8',
        headers: {},
        socket: {},
      },
      res,
    );

    expect(mocks.readNoteShareTicket).toHaveBeenCalledWith('a'.repeat(43));
    expect(mocks.getSharedNotePage).toHaveBeenCalled();
    expect(mocks.issueNoteShareTicket).toHaveBeenCalledWith(existingTicket);
    expect(
      mocks.connection.query.mock.calls.some(([sql]) => String(sql).includes('access_count = access_count + 1')),
    ).toBe(false);
    expect(
      mocks.connection.query.mock.calls.some(
        ([sql, params]) => String(sql).includes('INSERT INTO note_share_events') && params?.[2] === 'session_resumed',
      ),
    ).toBe(true);
    expect(res.body).toMatchObject({ status: 200, data: { accessTicket: 'ticket-value' } });
  });

  it('其他分享的阅读票据不能绕过当前分享的访问上限', async () => {
    mocks.readNoteShareTicket.mockResolvedValue({
      shareId: 'share-2',
      rootNoteId: 'root-2',
      ownerUserId: 'owner-1',
      scopeType: 'subtree',
    });
    mocks.connection.query
      .mockResolvedValueOnce([[activeShareRow({ access_count: 1, max_access_count: 1 })]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = mockRes();

    await resolveNoteShare(
      {
        body: { token: 't'.repeat(43), accessTicket: 'a'.repeat(43) },
        ip: '203.0.113.8',
        headers: {},
        socket: {},
      },
      res,
    );

    expect(mocks.getSharedNotePage).not.toHaveBeenCalled();
    expect(mocks.issueNoteShareTicket).not.toHaveBeenCalled();
    expect(res.body).toMatchObject({ status: 410, data: { errorCode: 'SHARE_ACCESS_LIMIT_REACHED' } });
  });

  it('短时票据读取把分享状态与正文范围校验放在同一事务连接', async () => {
    const ticket = {
      shareId: 'share-1',
      rootNoteId: 'root-1',
      ownerUserId: 'owner-1',
      scopeType: 'subtree',
    };
    mocks.readNoteShareTicket.mockResolvedValue(ticket);
    mocks.connection.query.mockResolvedValueOnce([[activeShareRow()]]);
    const res = mockRes();

    await getNoteSharePage({ body: { accessTicket: 'a'.repeat(43), noteId: 'root-1' }, headers: {} }, res);

    expect(mocks.getSharedNotePage).toHaveBeenCalledWith({ db: mocks.connection, ticket, noteId: 'root-1' });
    expect(mocks.connection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.connection.commit).toHaveBeenCalledTimes(1);
    expect(mocks.connection.rollback).not.toHaveBeenCalled();
    expect(mocks.connection.release).toHaveBeenCalledTimes(1);
    expect(res.body).toMatchObject({ status: 200, data: { page: { id: 'root-1' } } });
  });
});
