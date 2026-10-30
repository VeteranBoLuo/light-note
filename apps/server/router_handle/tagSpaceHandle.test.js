import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureUserOrAdminPolicy: vi.fn(() => true),
  ensureNotVisitor: vi.fn(() => false),
  queryTagSpaceList: vi.fn(),
  getTagSpaceOverview: vi.fn(),
  queryTagSpaceResources: vi.fn(),
}));

vi.mock('../db/index.js', () => ({ default: {} }));
vi.mock('../util/auth.js', () => ({
  ensureUserOrAdminPolicy: mocks.ensureUserOrAdminPolicy,
  ensureNotVisitor: mocks.ensureNotVisitor,
}));
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

  it('续页元数据选项透传给领域服务', async () => {
    await queryTagSpaces({ user: { id: 'user-1' }, body: { page: 2, includeMetadata: false } }, createResponse());
    expect(mocks.queryTagSpaceList).toHaveBeenCalledWith(
      expect.anything(), expect.objectContaining({ userId: 'user-1', page: 2, includeMetadata: false }),
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

  it('游客只读共享游客账号的标签空间，与旧标签列表一致', async () => {
    const request = { user: { id: 'visitor-1', role: 'visitor' }, body: { id: 'tag-1' } };
    await queryTagSpaces(request, createResponse());
    await getTagSpace(request, createResponse());
    await queryTagSpaceResourceList(request, createResponse());
    expect(mocks.queryTagSpaceList).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: 'visitor-1' }),
    );
    expect(mocks.getTagSpaceOverview).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: 'visitor-1', tagId: 'tag-1' }),
    );
    expect(mocks.queryTagSpaceResources).toHaveBeenCalled();
    // 游客读取不是写操作，不能触发注册软引导与 wall_hit 统计。
    expect(mocks.ensureNotVisitor).not.toHaveBeenCalled();
    expect(mocks.ensureUserOrAdminPolicy).not.toHaveBeenCalled();
  });

  it('管理员上下文仍按读取策略授权，拒绝时不查询', async () => {
    mocks.ensureUserOrAdminPolicy.mockReturnValue(false);
    await queryTagSpaces(
      { user: { id: 'root-1' }, resourceUser: { id: 'subject-1' }, adminContext: { mode: 'maintain' }, body: {} },
      createResponse(),
    );
    expect(mocks.queryTagSpaceList).not.toHaveBeenCalled();
  });

  it('没有任何身份时交给游客守卫拦截，不查询', async () => {
    await queryTagSpaces({ body: {} }, createResponse());
    expect(mocks.ensureNotVisitor).toHaveBeenCalled();
    expect(mocks.queryTagSpaceList).not.toHaveBeenCalled();
  });
});
