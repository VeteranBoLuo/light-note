import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../db/index.js', () => ({ default: { query: mocks.query } }));

const { resolveAgentTargetUser } = await import('./userLookup.js');

/** 第一条 SQL 查精确身份（ID/邮箱），第二条按昵称查。 */
function mockLookup({ exact = [], byAlias = [] }) {
  mocks.query.mockImplementation((sql) => Promise.resolve([sql.includes('alias = ?') ? byAlias : exact]));
}

describe('resolveAgentTargetUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('空指代不查库', async () => {
    await expect(resolveAgentTargetUser('  ')).resolves.toBeNull();
    await expect(resolveAgentTargetUser(undefined)).resolves.toBeNull();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('邮箱或 ID 命中时直接返回，不再按昵称找', async () => {
    mockLookup({ exact: [{ id: 'u-1', alias: '默认昵称', email: 'a@example.test' }] });

    await expect(resolveAgentTargetUser('a@example.test')).resolves.toMatchObject({ id: 'u-1' });
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it('昵称唯一时正常解析', async () => {
    mockLookup({ byAlias: [{ id: 'u-2', alias: '于怀', email: 'b@example.test' }] });

    await expect(resolveAgentTargetUser('于怀')).resolves.toMatchObject({ id: 'u-2', alias: '于怀' });
  });

  it('找不到人返回 null', async () => {
    mockLookup({});
    await expect(resolveAgentTargetUser('查无此人')).resolves.toBeNull();
  });

  it('昵称撞多个账号时抛歧义错误，绝不静默取第一条', async () => {
    mockLookup({
      byAlias: [
        { id: 'u-3', alias: '默认昵称', email: 'c@example.test' },
        { id: 'u-4', alias: '默认昵称', email: 'd@example.test' },
      ],
    });

    await expect(resolveAgentTargetUser('默认昵称')).rejects.toThrow(/^USER_AMBIGUOUS: /);
    // 候选邮箱要带出去，AI 才能追问「是哪一位」而不是干瞪眼。
    await expect(resolveAgentTargetUser('默认昵称')).rejects.toThrow(/c@example\.test、d@example\.test/);
  });

  it('候选过多时只列前五个并标注还有更多', async () => {
    mockLookup({
      byAlias: Array.from({ length: 6 }, (_, index) => ({
        id: `u-${index}`,
        alias: '默认昵称',
        email: `user${index}@example.test`,
      })),
    });

    const error = await resolveAgentTargetUser('默认昵称').catch((err) => err);
    expect(error.message).toContain('user4@example.test 等');
    expect(error.message).not.toContain('user5@example.test');
  });

  it('候选没有邮箱时退回展示用户 ID', async () => {
    mockLookup({
      byAlias: [
        { id: 'u-7', alias: '默认昵称', email: null },
        { id: 'u-8', alias: '默认昵称', email: null },
      ],
    });

    await expect(resolveAgentTargetUser('默认昵称')).rejects.toThrow(/u-7、u-8/);
  });
});
