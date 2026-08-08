import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getConnection: vi.fn(),
  grantItem: vi.fn(),
}));

vi.mock('../db/index.js', () => ({ default: { query: mocks.query, getConnection: mocks.getConnection } }));
vi.mock('./items.js', () => ({ grantItem: mocks.grantItem }));

const { SHOP_ITEMS, equipFrame } = await import('./points.js');

describe('头像框商店目录', () => {
  const frames = SHOP_ITEMS.filter((item) => item.type === 'cosmetic' && item.effect === 'frame');

  it('提供 12 款唯一头像框，覆盖从基础到传说的四档', () => {
    expect(frames).toHaveLength(12);
    expect(new Set(frames.map((item) => item.id)).size).toBe(frames.length);
    expect(new Set(frames.map((item) => item.rarity))).toEqual(new Set(['basic', 'rare', 'epic', 'legendary']));
  });

  it('价格覆盖低门槛和高阶长期目标', () => {
    const costs = frames.map((item) => item.cost);
    expect(Math.min(...costs)).toBe(220);
    expect(Math.max(...costs)).toBe(3200);
    expect(frames.find((item) => item.id === 'frame_celestial')).toMatchObject({ minLevel: 12, rarity: 'legendary' });
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
});

describe('头像框佩戴校验', () => {
  beforeEach(() => vi.clearAllMocks());

  it('拒绝不在当前商店目录的装扮 id', async () => {
    await expect(equipFrame('user-1', 'frame_removed')).resolves.toMatchObject({
      ok: false,
      reason: 'invalid_frame',
    });
    expect(mocks.query).not.toHaveBeenCalled();
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
});
