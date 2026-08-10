import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock('../db/index.js', () => ({
  default: { query: mocks.query, getConnection: vi.fn() },
}));
vi.mock('../util/common.js', () => ({
  snakeCaseKeys: (value) => value,
  resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }),
  insertData: (value) => value,
  INTERNAL_ROLES: ['root', 'test'],
}));
vi.mock('../util/auth.js', () => ({ ensureNotVisitor: vi.fn() }));
vi.mock('../util/notification.js', () => ({ createNotification: vi.fn() }));
vi.mock('../util/agent/logSafety.js', () => ({ stableAgentErrorCode: () => 'TEST_ERROR' }));

const { recordOpinion } = await import('./opinionHandle.js');

function createResponse() {
  return { send: vi.fn() };
}

describe('recordOpinion feedback validation', () => {
  beforeEach(() => mocks.query.mockReset());

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
