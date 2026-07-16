import { beforeEach, describe, expect, it, vi } from 'vitest';

const listPublicFeatureRequests = vi.fn();
const createFeatureRequest = vi.fn();

vi.mock('../util/common.js', () => ({
  resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }),
}));
vi.mock('../util/services/featureRequestService.js', () => ({
  FeatureRequestError: class FeatureRequestError extends Error {},
  addSubmitterFeatureUpdate: vi.fn(),
  adminEditFeatureRequest: vi.fn(),
  adminMergeFeatureRequest: vi.fn(),
  adminReplyFeatureRequest: vi.fn(),
  adminReviewFeatureRequest: vi.fn(),
  adminUpdateFeatureProgress: vi.fn(),
  createFeatureRequest,
  getFeatureRequestDetail: vi.fn(),
  listAdminFeatureRequests: vi.fn(),
  listMyFeatureRequests: vi.fn(),
  listPublicFeatureRequests,
  notifyFeatureRequestFollowers: vi.fn(async () => {}),
  toggleFeatureRequestVote: vi.fn(),
}));

const { adminCreate, create, listPublic } = await import('./featureRequestHandle.js');

const mockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
};

describe('featureRequestHandle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listPublicFeatureRequests.mockResolvedValue({ items: [], total: 0 });
    createFeatureRequest.mockResolvedValue({ id: 'request-1' });
  });

  it('游客可浏览公开看板，且不会携带游客共享账号作为投票身份', async () => {
    const res = mockRes();
    await listPublic({ user: { id: 'visitor-shared', role: 'visitor' }, body: {} }, res);
    expect(listPublicFeatureRequests).toHaveBeenCalledWith(expect.objectContaining({ viewerUserId: '' }));
    expect(res.send).toHaveBeenCalled();
  });

  it('游客不能直接提交建议', async () => {
    const res = mockRes();
    await create({ user: { id: 'visitor-shared', role: 'visitor' }, body: {} }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(createFeatureRequest).not.toHaveBeenCalled();
  });

  it('Root 创建内容时明确写入官方规划来源', async () => {
    const req = { user: { id: 'root-1', role: 'root' }, body: { title: '官方规划' } };
    await adminCreate(req, mockRes());
    expect(createFeatureRequest).toHaveBeenCalledWith({
      userId: 'root-1',
      input: req.body,
      sourceType: 'official',
    });
  });
});
