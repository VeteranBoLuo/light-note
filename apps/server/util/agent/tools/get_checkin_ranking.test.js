import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../../db/index.js', () => ({ default: { query: mocks.query } }));

const { default: tool } = await import('./get_checkin_ranking.js');

const rows = [
  { user_id: 'user-alpha', alias: '甲', day: '20260720', is_makeup: 0 },
  { user_id: 'user-alpha', alias: '甲', day: '20260721', is_makeup: 1 },
  { user_id: 'user-alpha', alias: '甲', day: '20260722', is_makeup: 0 },
  { user_id: 'user-beta', alias: '乙', day: '20260725', is_makeup: 0 },
  { user_id: 'user-beta', alias: '乙', day: '20260726', is_makeup: 0 },
  { user_id: 'user-beta', alias: '乙', day: '20260727', is_makeup: 0 },
  { user_id: 'user-gamma', alias: '丙', day: '20260719', is_makeup: 0 },
  { user_id: 'user-gamma', alias: '丙', day: '20260720', is_makeup: 0 },
  { user_id: 'user-gamma', alias: '丙', day: '20260721', is_makeup: 0 },
  { user_id: 'user-gamma', alias: '丙', day: '20260722', is_makeup: 0 },
  { user_id: 'user-gamma', alias: '丙', day: '20260723', is_makeup: 0 },
  { user_id: 'user-gamma', alias: '丙', day: '20260724', is_makeup: 0 },
  { user_id: 'user-gamma', alias: '丙', day: '20260725', is_makeup: 0 },
  { user_id: 'user-gamma', alias: '丙', day: '20260726', is_makeup: 0 },
  { user_id: 'user-gamma', alias: '丙', day: '20260727', is_makeup: 0 },
];

describe('get_checkin_ranking 工具', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 27, 12, 0, 0));
    vi.clearAllMocks();
    mocks.query.mockResolvedValue([rows]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('按有效签到账本统计累计签到天数，保留并列、补签和三类上下文指标', async () => {
    const raw = await tool.execute({});
    const [sql, params] = mocks.query.mock.calls[0];

    expect(sql).toContain("ge.source = 'checkin'");
    expect(sql).toContain("ge.status = 'granted'");
    expect(sql).toContain('u.del_flag = 0');
    expect(sql).toContain('u.role NOT IN (?, ?)');
    expect(sql).toContain('ORDER BY ge.user_id ASC, ge.day ASC');
    expect(params).toEqual(['root', 'test']);
    expect(raw).toMatchObject({
      rankingType: 'checkin_days',
      timeRange: '全部',
      businessDay: '20260727',
      eligibleUserCount: 3,
      rankedUserCount: 3,
      items: [
        {
          rank: 1,
          alias: '丙',
          rankingValue: 9,
          totalCheckinDays: 9,
          maxStreak: 9,
          currentStreak: 9,
          checkedInToday: true,
        },
        {
          rank: 2,
          alias: '甲',
          rankingValue: 3,
          totalCheckinDays: 3,
          maxStreak: 3,
          currentStreak: 0,
          makeupCheckinDays: 1,
        },
        {
          rank: 2,
          alias: '乙',
          rankingValue: 3,
          totalCheckinDays: 3,
          maxStreak: 3,
          currentStreak: 3,
          checkedInToday: true,
        },
      ],
    });
    expect(raw.items.some((item) => 'userId' in item)).toBe(false);
  });

  it('支持指定周期的签到天数排行和注册用户分群', async () => {
    const raw = await tool.execute({
      rankingType: 'checkin_days',
      timeRange: '本周',
      registeredWithin: '本月',
      includeInternal: true,
      limit: 1,
    });
    const [sql, params] = mocks.query.mock.calls[0];

    expect(sql).not.toContain('u.role NOT IN');
    expect(sql).toContain('u.create_time >= ? AND u.create_time <= ?');
    expect(params).toHaveLength(2);
    expect(raw).toMatchObject({
      rankingType: 'checkin_days',
      timeRange: '本周',
      registeredWithin: '本月',
      includeInternal: true,
      rankedUserCount: 2,
      items: [{ rank: 1, alias: '丙', rankingValue: 1, periodCheckinDays: 1, periodMakeupCheckinDays: 0 }],
    });
  });

  it.each([
    ['max_streak', '丙', 9],
    ['current_streak', '丙', 9],
  ])('按 %s 正确计算榜单而非使用积分或资源数据', async (rankingType, alias, rankingValue) => {
    const raw = await tool.execute({ rankingType });

    expect(raw.items[0]).toMatchObject({ rank: 1, alias, rankingValue });
    if (rankingType === 'current_streak') {
      expect(raw.items.map((item) => item.alias)).not.toContain('甲');
    }
  });

  it('当前连签允许截至昨天仍可续签的用户上榜，并排除更早断签的快照', async () => {
    mocks.query.mockResolvedValue([
      [
        { user_id: 'user-active', alias: '昨日连续', day: '20260725', is_makeup: 0 },
        { user_id: 'user-active', alias: '昨日连续', day: '20260726', is_makeup: 0 },
        { user_id: 'user-stale', alias: '已断签', day: '20260724', is_makeup: 0 },
        { user_id: 'user-stale', alias: '已断签', day: '20260725', is_makeup: 0 },
      ],
    ]);

    const raw = await tool.execute({ rankingType: 'current_streak' });

    expect(raw.items).toEqual([
      expect.objectContaining({ rank: 1, alias: '昨日连续', currentStreak: 2, checkedInToday: false }),
    ]);
  });

  it('拒绝无法识别的时间范围，以及不具备周期语义的连签排行时间筛选', async () => {
    await expect(tool.execute({ timeRange: '随便某天' })).rejects.toThrow('签到统计时间范围无法识别');
    await expect(tool.execute({ rankingType: 'current_streak', timeRange: '本周' })).rejects.toThrow(
      '当前连签仅支持全量排行',
    );
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('返回文案显示统计口径、并列名次和补签审计摘要，不展示邮箱或用户 ID', () => {
    const text = tool.transform({
      rankingType: 'checkin_days',
      timeRange: '全部',
      businessDay: '20260727',
      rankedUserCount: 2,
      items: [
        {
          rank: 1,
          alias: '甲',
          totalCheckinDays: 10,
          maxStreak: 6,
          currentStreak: 2,
          lastCheckinDate: '20260727',
          checkedInToday: true,
          makeupCheckinDays: 1,
        },
      ],
    });

    expect(text).toContain('累计签到天数排行');
    expect(text).toContain('1. 甲');
    expect(text).toContain('含补签 1 天');
    expect(text).not.toContain('@');
    expect(text).not.toContain('user-');
  });
});
