import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureUserOrAdminPolicy: vi.fn(() => true),
  queryTagSpaceList: vi.fn(),
  getTagSpaceOverview: vi.fn(),
  queryTagSpaceResources: vi.fn(),
}));

vi.mock('../db/index.js', () => ({ default: {} }));
vi.mock('../util/auth.js', () => ({ ensureUserOrAdminPolicy: mocks.ensureUserOrAdminPolicy }));
vi.mock('../util/services/tagSpaceService.js', () => ({
  queryTagSpaceList: mocks.queryTagSpaceList,
  getTagSpaceOverview: mocks.getTagSpaceOverview,
  queryTagSpaceResources: mocks.queryTagSpaceResources,
}));

const { getTagSpace, queryTagSpaceResourceList, queryTagSpaces } = await import('./tagSpaceHandle.js');

function createResponse() {
  return {
    send: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };
}

describe('tagSpaceHandle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureUserOrAdminPolicy.mockReturnValue(true);
    mocks.queryTagSpaceList.mockResolvedValue({ items: [] });
    mocks.getTagSpaceOverview.mockResolvedValue({ tag: { id: 'tag-1' }, relatedTags: [] });
    mocks.queryTagSpaceResources.mockResolvedValue({ items: [], total: 0 });
  });

  it('普通用户读取自己的标签空间', async () => {
    await queryTagSpaces({ user: { id: 'user-1' }, body: {} }, createResponse());
    expect(mocks.queryTagSpaceList).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: 'user-1' }),
    );
  });

  it('管理员代看时统一读取 subject，而不是管理员自己的资源', async () => {
    const request = {
      user: { id: 'root-1' },
      resourceUser: { id: 'subject-1' },
      adminContext: { mode: 'readonly' },
      adminCapability: { policy: 'read' },
      body: { id: 'tag-1', sort: 'added' },
    };

    await getTagSpace(request, createResponse());
    await queryTagSpaceResourceList(request, createResponse());

    expect(mocks.getTagSpaceOverview).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: 'subject-1', tagId: 'tag-1' }),
    );
    expect(mocks.queryTagSpaceResources).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: 'subject-1', tagId: 'tag-1', sort: 'added' }),
    );
  });

  it('访客被二次守卫拦截后不查询私人数据', async () => {
    mocks.ensureUserOrAdminPolicy.mockReturnValue(false);
    await queryTagSpaces({ user: { id: 'visitor-1', role: 'visitor' }, body: {} }, createResponse());
    expect(mocks.queryTagSpaceList).not.toHaveBeenCalled();
  });
});
