import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getConnection: vi.fn(),
  grantItem: vi.fn(),
}));

vi.mock('../db/index.js', () => ({ default: { query: mocks.query, getConnection: mocks.getConnection } }));
vi.mock('./items.js', () => ({ grantItem: mocks.grantItem }));

const originalC4Flag = process.env.POINTS_ECONOMY_C4_ENABLED;
process.env.POINTS_ECONOMY_C4_ENABLED = 'true';
const { FRAME_CATALOG, SHOP_ITEMS, buyItem, equipFrame, getOwnedCosmetics } = await import('./points.js');

afterAll(() => {
  if (originalC4Flag === undefined) delete process.env.POINTS_ECONOMY_C4_ENABLED;
  else process.env.POINTS_ECONOMY_C4_ENABLED = originalC4Flag;
});

describe('头像框商店目录', () => {
  const frames = SHOP_ITEMS.filter((item) => item.type === 'cosmetic' && item.effect === 'frame');
  const achievementFrames = FRAME_CATALOG.filter((item) => item.acquisition === 'achievement');

  it('提供 13 款唯一头像框，覆盖从基础到传说的四档', () => {
    expect(frames).toHaveLength(13);
    expect(new Set(frames.map((item) => item.id)).size).toBe(frames.length);
    expect(new Set(frames.map((item) => item.rarity))).toEqual(new Set(['basic', 'rare', 'epic', 'legendary']));
  });

  it('价格覆盖低门槛和高阶长期目标', () => {
    const costs = frames.map((item) => item.cost);
    expect(Math.min(...costs)).toBe(220);
    expect(Math.max(...costs)).toBe(16000);
    expect(frames.find((item) => item.id === 'frame_celestial')).toMatchObject({ minLevel: 6, rarity: 'legendary' });
    expect(frames.find((item) => item.id === 'frame_neon')).toMatchObject({
      minLevel: 3,
      rarity: 'legendary',
      cost: 6000,
    });
    expect(frames.find((item) => item.id === 'frame_moonstone')).toMatchObject({
      minLevel: 0,
      rarity: 'basic',
      cost: 480,
    });
  });

  it('积分框按视觉等级形成严格递增的价格与等级阶梯', () => {
    const ordered = [...frames].sort((left, right) => left.cost - right.cost);
    const costs = ordered.map((item) => item.cost);
    const levels = ordered.map((item) => item.minLevel);

    expect(costs).toEqual([220, 320, 480, 700, 1000, 1400, 2000, 2800, 3800, 6000, 9000, 12000, 16000]);
    expect(levels).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 4, 5, 6]);
  });

  it('四档价格区间单调递增，不出现低档比高档更贵', () => {
    const rangeOf = (rarity) => {
      const costs = frames.filter((item) => item.rarity === rarity).map((item) => item.cost);
      return { min: Math.min(...costs), max: Math.max(...costs) };
    };
    const basic = rangeOf('basic');
    const rare = rangeOf('rare');
    const epic = rangeOf('epic');
    const legendary = rangeOf('legendary');
    expect(basic.max).toBeLessThan(rare.min);
    expect(rare.max).toBeLessThan(epic.min);
    expect(epic.max).toBeLessThan(legendary.min);
  });

  it('完整目录额外提供 12 款成就专属框，且不会混入积分购买目录', () => {
    const achievementKeys = achievementFrames.map((item) => item.achievementKey);

    expect(FRAME_CATALOG).toHaveLength(25);
    expect(new Set(FRAME_CATALOG.map((item) => item.id)).size).toBe(FRAME_CATALOG.length);
    expect(achievementFrames).toHaveLength(12);
    expect(new Set(achievementKeys).size).toBe(achievementKeys.length);
    expect(new Set(achievementKeys)).toEqual(
      new Set([
        'streak_1',
        'streak_7',
        'streak_30',
        'bookmark_20',
        'note_10',
        'file_10',
        'bookmark_500',
        'note_200',
        'note_500',
        'file_200',
        'file_500',
        'streak_365',
      ]),
    );
    expect(
      achievementFrames.reduce((result, item) => {
        result[item.rarity] = (result[item.rarity] || 0) + 1;
        return result;
      }, {}),
    ).toEqual({ basic: 2, rare: 3, epic: 3, legendary: 4 });
    expect(achievementFrames.every((item) => item.cost === undefined && item.achievementKey)).toBe(true);
    expect(achievementFrames.find((item) => item.id === 'frame_first_light')).toMatchObject({
      rarity: 'basic',
      achievementKey: 'streak_1',
    });
    expect(SHOP_ITEMS.some((item) => item.id === 'frame_first_light')).toBe(false);
    expect(achievementFrames.find((item) => item.id === 'frame_streak_seed')).toMatchObject({
      rarity: 'rare',
      achievementKey: 'streak_7',
    });
    expect(achievementFrames.find((item) => item.id === 'frame_streak_month')).toMatchObject({
      rarity: 'epic',
      achievementKey: 'streak_30',
    });
  });

  it('完整目录按基础、进阶、炫彩、传说稳定递增', () => {
    const rarityOrder = { basic: 0, rare: 1, epic: 2, legendary: 3 };
    const ranks = FRAME_CATALOG.map((item) => rarityOrder[item.rarity]);
    expect(ranks).toEqual([...ranks].sort((left, right) => left - right));
  });

  it('保留完整中间阶梯，并为笔记与文件各提供一款 500 门槛传说框', () => {
    const counts = FRAME_CATALOG.reduce((result, item) => {
      result[item.rarity] = (result[item.rarity] || 0) + 1;
      return result;
    }, {});

    expect(counts).toEqual({ basic: 5, rare: 6, epic: 6, legendary: 8 });
    expect(frames.reduce((result, item) => ({ ...result, [item.rarity]: (result[item.rarity] || 0) + 1 }), {})).toEqual(
      { basic: 3, rare: 3, epic: 3, legendary: 4 },
    );
    expect(achievementFrames.find((item) => item.id === 'frame_note_masterpiece')).toMatchObject({
      rarity: 'epic',
      achievementKey: 'note_200',
    });
    expect(achievementFrames.find((item) => item.id === 'frame_file_vault')).toMatchObject({
      rarity: 'epic',
      achievementKey: 'file_200',
    });
    expect(achievementFrames.find((item) => item.id === 'frame_note_constellation')).toMatchObject({
      rarity: 'legendary',
      achievementKey: 'note_500',
    });
    expect(achievementFrames.find((item) => item.id === 'frame_file_constellation')).toMatchObject({
      rarity: 'legendary',
      achievementKey: 'file_500',
    });
  });

  it('购买接口拒绝成就专属头像框，不会创建扣款事务', async () => {
    vi.clearAllMocks();
    await expect(buyItem('user-1', 'frame_first_light')).resolves.toMatchObject({
      ok: false,
      reason: 'not_found',
    });
    expect(mocks.getConnection).not.toHaveBeenCalled();
  });
});

describe('历史成就头像框权益兼容', () => {
  beforeEach(() => vi.clearAllMocks());

  it('把旧成就领取流水对应的头像框合并为已拥有，但读取过程不写装扮表', async () => {
    mocks.query
      .mockResolvedValueOnce([[{ cosmetic_id: 'frame_mint' }]])
      .mockResolvedValueOnce([[{ achievementKey: 'streak_7' }]])
      .mockResolvedValueOnce([[{ achievementKey: 'bookmark_20' }, { achievementKey: 'unknown_achievement' }]]);

    await expect(getOwnedCosmetics('user-1')).resolves.toEqual([
      'frame_mint',
      'frame_streak_seed',
      'frame_bookmark_seed',
    ]);
    expect(mocks.query).toHaveBeenCalledTimes(3);
    expect(String(mocks.query.mock.calls[1][0])).not.toContain('UNION');
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes('INSERT'))).toBe(false);
  });

  it('新成就表尚未建立的滚动更新窗口仍可只读回退旧领取账本', async () => {
    const missingTable = Object.assign(new Error('table missing'), { code: 'ER_NO_SUCH_TABLE' });
    mocks.query
      .mockResolvedValueOnce([[]])
      .mockRejectedValueOnce(missingTable)
      .mockResolvedValueOnce([[{ achievementKey: 'note_10' }]]);

    await expect(getOwnedCosmetics('user-1')).resolves.toEqual(['frame_note_seed']);
    expect(mocks.query).toHaveBeenCalledTimes(3);
  });
});

describe('头像框佩戴校验', () => {
  beforeEach(() => vi.clearAllMocks());

  it('拒绝不在当前商店目录的装扮 id', async () => {
    await expect(equipFrame('root-1', 'frame_removed', { userRole: 'root' })).resolves.toMatchObject({
      ok: false,
      reason: 'invalid_frame',
    });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('Root 可直接佩戴当前目录中的任意头像框，不查询或补写装扮所有权', async () => {
    mocks.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await expect(equipFrame('root-1', 'frame_dragon', { userRole: 'root' })).resolves.toEqual({
      ok: true,
      equipped: 'frame_dragon',
    });
    expect(mocks.query).toHaveBeenCalledOnce();
    expect(mocks.query).toHaveBeenCalledWith('UPDATE user_growth SET equipped_frame = ? WHERE user_id = ?', [
      'frame_dragon',
      'root-1',
    ]);
    expect(mocks.getConnection).not.toHaveBeenCalled();
  });

  it('只有已拥有的头像框才能佩戴', async () => {
    mocks.query.mockResolvedValueOnce([[]]);
    await expect(equipFrame('user-1', 'frame_mint')).resolves.toMatchObject({ ok: false, reason: 'not_owned' });

    mocks.query.mockReset();
    mocks.query.mockResolvedValueOnce([[{ owned: 1 }]]).mockResolvedValueOnce([{ affectedRows: 1 }]);
    await expect(equipFrame('user-1', 'frame_mint')).resolves.toEqual({ ok: true, equipped: 'frame_mint' });
    expect(mocks.query).toHaveBeenLastCalledWith('UPDATE user_growth SET equipped_frame = ? WHERE user_id = ?', [
      'frame_mint',
      'user-1',
    ]);
  });

  it('已领取入库的成就头像框可以正常佩戴', async () => {
    mocks.query.mockResolvedValueOnce([[{ owned: 1 }]]).mockResolvedValueOnce([{ affectedRows: 1 }]);
    await expect(equipFrame('user-1', 'frame_first_light')).resolves.toEqual({
      ok: true,
      equipped: 'frame_first_light',
    });
  });

  it('历史成就已领取但装扮记录缺失时，首次佩戴会原子补齐所有权', async () => {
    const connection = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ claimed: 1 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    mocks.query.mockResolvedValueOnce([[]]);
    mocks.getConnection.mockResolvedValueOnce(connection);

    await expect(equipFrame('user-1', 'frame_streak_seed')).resolves.toEqual({
      ok: true,
      equipped: 'frame_streak_seed',
    });
    expect(connection.query).toHaveBeenNthCalledWith(1, expect.stringContaining('SELECT 1 FROM user_achievements'), [
      'user-1',
      'streak_7',
      'user-1',
      'streak_7',
    ]);
    expect(String(connection.query.mock.calls[0][0])).toContain('EXISTS(');
    expect(String(connection.query.mock.calls[0][0])).not.toContain('UNION');
    expect(connection.query).toHaveBeenNthCalledWith(
      2,
      'INSERT IGNORE INTO user_cosmetics (user_id, cosmetic_id) VALUES (?, ?)',
      ['user-1', 'frame_streak_seed'],
    );
    expect(connection.query).toHaveBeenNthCalledWith(3, 'UPDATE user_growth SET equipped_frame = ? WHERE user_id = ?', [
      'frame_streak_seed',
      'user-1',
    ]);
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it('没有对应成就领取流水时不会补发成就头像框', async () => {
    const connection = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValueOnce([[]]),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    mocks.query.mockResolvedValueOnce([[]]);
    mocks.getConnection.mockResolvedValueOnce(connection);

    await expect(equipFrame('user-1', 'frame_streak_seed')).resolves.toMatchObject({
      ok: false,
      reason: 'not_owned',
    });
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledOnce();
  });
});
