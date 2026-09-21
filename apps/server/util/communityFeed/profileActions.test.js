import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  feature: vi.fn(),
  access: vi.fn(),
  capabilities: vi.fn(),
  first: vi.fn(),
  pairAllowed: vi.fn(),
}));
vi.mock('./core.js', () => mocks);
const { communityProfileActions } = await import('./profileActions.js');
let db;
beforeEach(() => {
  vi.resetAllMocks();
  db = {};
  mocks.feature.mockReturnValue({ enabled: true });
  mocks.capabilities.mockResolvedValue({ feedEnabled: true });
  mocks.pairAllowed.mockResolvedValue(true);
});
describe('communityProfileActions', () => {
  it('短暂复用结构检查，但每次重新检查权限与关注关系', async () => {
    const input = { user: { id: 'viewer', role: 'user' }, authorUserId: 'author', db };
    await communityProfileActions(input);
    mocks.first.mockResolvedValueOnce({ yes: 1 });
    expect((await communityProfileActions(input)).following).toBe(true);
    expect(mocks.capabilities).toHaveBeenCalledTimes(1);
    expect(mocks.access).toHaveBeenCalledTimes(2);
    expect(mocks.pairAllowed).toHaveBeenCalledTimes(2);
    mocks.feature.mockReturnValue({ enabled: false });
    expect(await communityProfileActions(input)).toBeNull();
  });
  it('合并并发结构检查，缓存到期后重新读取', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
    try {
      const input = { user: { id: 'viewer', role: 'user' }, authorUserId: 'author', db };
      await Promise.all([communityProfileActions(input), communityProfileActions(input)]);
      expect(mocks.capabilities).toHaveBeenCalledTimes(1);
      clock.mockReturnValue(31001);
      await communityProfileActions(input);
      expect(mocks.capabilities).toHaveBeenCalledTimes(2);
    } finally {
      clock.mockRestore();
    }
  });

  it('只读取当前查看者对作者的关注关系', async () => {
    mocks.first.mockResolvedValue({ yes: 1 });
    expect(await communityProfileActions({ user: { id: 'viewer', role: 'user' }, authorUserId: 'author', db })).toEqual(
      { isOwn: false, following: true },
    );
    expect(mocks.first).toHaveBeenCalledWith(db, expect.stringContaining('community_follows'), ['viewer', 'author']);
    expect(mocks.access).toHaveBeenCalled();
  });
  it('本人和游客不查询关注关系', async () => {
    expect(await communityProfileActions({ user: { id: 'author', role: 'user' }, authorUserId: 'author', db })).toEqual(
      { isOwn: true, following: false },
    );
    expect(await communityProfileActions({ user: { role: 'visitor' }, authorUserId: 'author', db })).toEqual({
      isOwn: false,
      following: false,
    });
    expect(mocks.first).not.toHaveBeenCalled();
  });
  it('广场关闭或双向屏蔽时不暴露操作', async () => {
    mocks.capabilities.mockResolvedValueOnce({ feedEnabled: false });
    expect(await communityProfileActions({ user: { id: 'viewer' }, authorUserId: 'author', db })).toBeNull();
    expect(mocks.access).not.toHaveBeenCalled();
    mocks.pairAllowed.mockResolvedValue(false);
    expect(await communityProfileActions({ user: { id: 'viewer' }, authorUserId: 'author', db })).toBeNull();
    expect(mocks.first).not.toHaveBeenCalled();
  });
  it('广场权限不可用时仍允许展示聊天名片', async () => {
    mocks.access.mockRejectedValue({ status: 403 });
    expect(await communityProfileActions({ user: { id: 'viewer' }, authorUserId: 'author', db })).toBeNull();
  });
});
