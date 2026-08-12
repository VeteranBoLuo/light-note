import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getConnection: vi.fn(),
  connectionQuery: vi.fn(),
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
  ensureNotVisitor: vi.fn(),
  createNotification: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock('../db/index.js', () => ({
  default: { query: mocks.query, getConnection: mocks.getConnection },
}));
vi.mock('../util/common.js', () => ({
  resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }),
  insertData: (value) => value,
  INTERNAL_ROLES: ['root', 'test'],
  L: (_req, zh) => zh,
}));
vi.mock('../util/auth.js', () => ({ ensureNotVisitor: mocks.ensureNotVisitor }));
vi.mock('../util/notification.js', () => ({ createNotification: mocks.createNotification }));
vi.mock('../util/agent/logSafety.js', () => ({ stableAgentErrorCode: () => 'TEST_ERROR' }));
vi.mock('../util/adminOperationAudit.js', () => ({ recordAdminOperationAudit: mocks.recordAudit }));

const { delOpinion, getOpinionList, opinionHandleInternals, recordOpinion, replyOpinion } =
  await import('./opinionHandle.js');

function createResponse() {
  return { send: vi.fn() };
}

function useConnection() {
  const connection = {
    query: mocks.connectionQuery,
    beginTransaction: mocks.beginTransaction,
    commit: mocks.commit,
    rollback: mocks.rollback,
    release: mocks.release,
  };
  mocks.getConnection.mockResolvedValue(connection);
  return connection;
}

describe('opinion handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureNotVisitor.mockReturnValue(true);
    mocks.beginTransaction.mockResolvedValue(undefined);
    mocks.commit.mockResolvedValue(undefined);
    mocks.rollback.mockResolvedValue(undefined);
    mocks.recordAudit.mockResolvedValue('audit-opinion-1');
    mocks.createNotification.mockResolvedValue({ id: 'notification-1' });
  });

  describe('recordOpinion', () => {
    it('rejects feedback shorter than six trimmed characters without writing', async () => {
      const res = createResponse();
      await recordOpinion({ user: { id: 'user-1' }, body: { type: '产品建议', content: '  太短  ' } }, res);

      expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
      expect(mocks.query).not.toHaveBeenCalled();
    });

    it('trims valid content and keeps server-owned status fields', async () => {
      mocks.query.mockResolvedValueOnce([{ insertId: 1 }]);
      const res = createResponse();
      await recordOpinion(
        {
          user: { id: 'user-1' },
          body: {
            type: ' 产品建议 ',
            content: '  希望优化移动端反馈页面  ',
            status: 'viewed',
            replyViewed: 1,
          },
        },
        res,
      );

      const inserted = mocks.query.mock.calls[0][1][0];
      expect(inserted).toMatchObject({
        userId: 'user-1',
        type: '产品建议',
        content: '希望优化移动端反馈页面',
        status: 'pending',
        replyViewed: 0,
      });
      expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }));
    });
  });

  describe('getOpinionList', () => {
    it('reuses the list endpoint for an exact deep link and caps the page size', async () => {
      mocks.query.mockImplementation(async (sql) => {
        const statement = String(sql);
        if (statement.includes('COUNT(*) AS total')) return [[{ total: 1 }]];
        if (statement.includes('COALESCE(SUM')) {
          return [[{ pending_total: 1, replied_total: 2, viewed_total: 3 }]];
        }
        return [[{ id: 'opinion-1', status: 'pending' }]];
      });
      const res = createResponse();

      await getOpinionList(
        {
          user: { id: 'root-1', role: 'root' },
          body: { currentPage: 1, pageSize: 999, filters: { opinionId: 'opinion-1', hideInternal: false } },
        },
        res,
      );

      const itemQuery = mocks.query.mock.calls.find(([sql]) => String(sql).includes('ORDER BY o.create_time'));
      expect(itemQuery[1]).toEqual(['opinion-1', opinionHandleInternals.MAX_PAGE_SIZE, 0]);
      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 200, data: expect.objectContaining({ total: 1 }) }),
      );
    });

    it('rejects unknown status filters before querying', async () => {
      const res = createResponse();
      await getOpinionList(
        {
          user: { id: 'root-1', role: 'root' },
          body: { currentPage: 1, pageSize: 20, filters: { status: 'closed' } },
        },
        res,
      );

      expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
      expect(mocks.query).not.toHaveBeenCalled();
    });
  });

  describe('replyOpinion', () => {
    it('returns the updated state and trace receipt, then creates the user notification', async () => {
      useConnection();
      mocks.connectionQuery
        .mockResolvedValueOnce([[{ id: 'opinion-1', user_id: 'user-1', status: 'pending', notify_pref: 'true' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([
          [
            {
              id: 'opinion-1',
              status: 'replied',
              reply_content: '我们已经收到建议',
              reply_time: '2026-08-12 18:00:00',
              reply_viewed: 0,
            },
          ],
        ]);
      const res = createResponse();

      await replyOpinion(
        {
          requestId: 'request-opinion-reply',
          ip: '127.0.0.1',
          user: { id: 'root-1', role: 'root' },
          body: { id: 'opinion-1', replyContent: '我们已经收到建议', reason: '管理员回复用户反馈' },
        },
        res,
      );

      expect(mocks.commit).toHaveBeenCalledTimes(1);
      expect(mocks.recordAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'opinion.reply',
          targetId: 'opinion-1',
          outcome: 'succeeded',
          requestId: 'request-opinion-reply',
          metadata: expect.objectContaining({ previousStatus: 'pending', resultingStatus: 'replied' }),
        }),
        expect.objectContaining({ db: expect.any(Object) }),
      );
      expect(JSON.stringify(mocks.recordAudit.mock.calls[0][0])).not.toContain('我们已经收到建议');
      expect(mocks.createNotification).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ type: 'opinion_reply', meta: { opinionId: 'opinion-1' } }),
      );
      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 200,
          data: expect.objectContaining({
            affectedRows: 1,
            auditId: 'audit-opinion-1',
            requestId: 'request-opinion-reply',
            notificationCreated: true,
          }),
        }),
      );
    });

    it('does not report success or notify when the feedback no longer exists', async () => {
      useConnection();
      mocks.connectionQuery.mockResolvedValueOnce([[]]);
      const res = createResponse();

      await replyOpinion(
        {
          user: { id: 'root-1', role: 'root' },
          body: { id: 'missing', replyContent: '这是一条有效回复' },
        },
        res,
      );

      expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
      expect(mocks.createNotification).not.toHaveBeenCalled();
      expect(mocks.recordAudit).not.toHaveBeenCalled();
    });
  });

  describe('delOpinion', () => {
    it('requires an explicit reason for an administrator delete', async () => {
      const res = createResponse();
      await delOpinion({ user: { id: 'root-1', role: 'root' }, body: { id: 'opinion-1' } }, res);

      expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
      expect(mocks.getConnection).not.toHaveBeenCalled();
    });

    it('soft deletes with a required audit receipt', async () => {
      useConnection();
      mocks.connectionQuery
        .mockResolvedValueOnce([[{ id: 'opinion-1', user_id: 'user-1', status: 'pending' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);
      const res = createResponse();

      await delOpinion(
        {
          requestId: 'request-opinion-delete',
          ip: '127.0.0.1',
          user: { id: 'root-1', role: 'root' },
          body: { id: 'opinion-1', reason: '重复测试反馈，需要移除' },
        },
        res,
      );

      expect(mocks.recordAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'opinion.delete', outcome: 'succeeded', reason: '重复测试反馈，需要移除' }),
        expect.objectContaining({ required: true }),
      );
      expect(mocks.commit).toHaveBeenCalledTimes(1);
      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 200,
          data: expect.objectContaining({ affectedRows: 1, auditId: 'audit-opinion-1' }),
        }),
      );
    });

    it('rolls back the delete when the required audit cannot be written', async () => {
      useConnection();
      mocks.connectionQuery
        .mockResolvedValueOnce([[{ id: 'opinion-1', user_id: 'user-1', status: 'pending' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);
      mocks.recordAudit.mockRejectedValueOnce(
        Object.assign(new Error('audit unavailable'), { code: 'ADMIN_AUDIT_UNAVAILABLE' }),
      );
      const res = createResponse();

      await delOpinion(
        {
          requestId: 'request-opinion-delete',
          user: { id: 'root-1', role: 'root' },
          body: { id: 'opinion-1', reason: '重复测试反馈，需要移除' },
        },
        res,
      );

      expect(mocks.rollback).toHaveBeenCalledTimes(1);
      expect(mocks.commit).not.toHaveBeenCalled();
      expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 503 }));
    });
  });
});
