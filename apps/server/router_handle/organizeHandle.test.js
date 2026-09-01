import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getConnection: vi.fn(),
  ensureNotVisitor: vi.fn(() => true),
  getOrganizeSummary: vi.fn(),
  listUntaggedResources: vi.fn(),
  listDuplicateBookmarkGroups: vi.fn(),
  listBookmarkHealthIssues: vi.fn(),
}));

vi.mock('../db/index.js', () => ({
  default: { getConnection: mocks.getConnection, query: vi.fn() },
}));
vi.mock('../util/common.js', () => ({
  resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }),
}));
vi.mock('../util/auth.js', () => ({ ensureNotVisitor: mocks.ensureNotVisitor }));
vi.mock('../util/services/organizeSummaryService.js', () => ({ getOrganizeSummary: mocks.getOrganizeSummary }));
vi.mock('../util/services/resourceInventoryService.js', () => ({
  listUntaggedResources: mocks.listUntaggedResources,
  isOwnedUntaggedResource: vi.fn(),
  normalizeOrganizableResourceType: vi.fn((value) => (['bookmark', 'note', 'file'].includes(value) ? value : '')),
}));
vi.mock('../util/services/bookmarkDuplicateService.js', () => ({
  getDuplicateBookmarkPreview: vi.fn(),
  ignoreDuplicateBookmarkGroup: vi.fn(),
  listDuplicateBookmarkGroups: mocks.listDuplicateBookmarkGroups,
  resolveDuplicateBookmarkGroup: vi.fn(),
  unignoreDuplicateBookmarkGroup: vi.fn(),
}));
vi.mock('../util/linkHealth.js', () => ({
  checkBookmarkHealth: vi.fn(),
  getHealthSummary: vi.fn(),
  listBookmarkHealthIssues: mocks.listBookmarkHealthIssues,
  markLinkNormal: vi.fn(),
  recheckBookmarkHealth: vi.fn(),
  unmarkLinkNormal: vi.fn(),
}));
vi.mock('../util/services/organizeSuppressionService.js', () => ({
  deleteOrganizeSuppression: vi.fn(),
  ORGANIZE_SUPPRESSION_TYPES: { UNTAGGED: 'untagged.ignore', DUPLICATE: 'duplicate.ignore' },
  upsertOrganizeSuppression: vi.fn(),
}));

const { ignoreUntagged, listIssues, summary } = await import('./organizeHandle.js');

function mockRes() {
  const res = { status: vi.fn(), send: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

describe('organizeHandle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureNotVisitor.mockReturnValue(true);
    mocks.getOrganizeSummary.mockResolvedValue({ totals: { findingTotal: 0 } });
    mocks.listUntaggedResources.mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
  });

  it('只读接口使用 resourceUser，游客也可以浏览自己的只读示例', async () => {
    const req = {
      user: { id: 'root-1', role: 'root' },
      resourceUser: { id: 'visitor-target', role: 'visitor' },
      query: {},
      params: { issueType: 'untagged' },
    };
    const res = mockRes();

    await summary(req, res);
    await listIssues(req, res);

    expect(mocks.getOrganizeSummary).toHaveBeenCalledWith('visitor-target');
    expect(mocks.listUntaggedResources).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: 'visitor-target' }),
    );
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }));
  });

  it('缺少资源主体时返回稳定认证错误', async () => {
    const res = mockRes();
    await summary({ user: null }, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.send).toHaveBeenCalledWith({
      data: { code: 'ORGANIZE_AUTH_REQUIRED' },
      status: 401,
      msg: '登录后才能查看整理中心',
    });
  });

  it('服务异常不把数据库原始详情返回给客户端', async () => {
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.getOrganizeSummary.mockRejectedValueOnce(
      Object.assign(new Error('sensitive database detail'), { code: 'ER_SECRET' }),
    );
    const res = mockRes();

    try {
      await summary({ user: { id: 'user-1', role: 'user' } }, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith({
        data: { code: 'ER_SECRET' },
        status: 500,
        msg: '整理中心暂时不可用，请稍后重试',
      });
      expect(JSON.stringify(res.send.mock.calls)).not.toContain('sensitive database detail');
    } finally {
      logSpy.mockRestore();
    }
  });

  it('游客写入在获取事务连接前被拦截', async () => {
    mocks.ensureNotVisitor.mockReturnValueOnce(false);
    await ignoreUntagged(
      {
        user: { id: 'visitor', role: 'visitor' },
        body: { resourceType: 'note', resourceId: 'note-1' },
      },
      mockRes(),
    );

    expect(mocks.getConnection).not.toHaveBeenCalled();
  });
});
