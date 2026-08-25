import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

// growth.js 顶层 import pool from '../db/index.js';纯逻辑测试不碰库,mock 掉以免 import 期连真库
vi.mock('../db/index.js', () => ({
  default: { query: vi.fn(), getConnection: vi.fn() },
}));
vi.mock('./points.js', () => ({
  earnPoints: vi.fn(),
  earnStorage: vi.fn(),
  getAchievementFrameByKey: vi.fn(),
  titleName: vi.fn(),
}));
vi.mock('./items.js', () => ({
  grantItem: vi.fn(),
}));
vi.mock('./notification.js', () => ({
  createNotification: vi.fn(),
}));
import pool from '../db/index.js';
import { grantItem } from './items.js';
import { earnPoints, getAchievementFrameByKey } from './points.js';
import { createNotification } from './notification.js';
import {
  adminAdjustGrowth,
  getMakeupCandidateDays,
  isMakeupCandidateDay,
  levelForExp,
  rankOf,
  RANKS,
  MAX_LEVEL,
  MAKEUP_WINDOW_DAYS,
  STREAK_MILESTONES,
  ACHIEVEMENTS,
  meetsAchievementRequirement,
  useProtectCard,
  claimDailyQuestBonus,
  claimAchievement,
  getGrowthDashboard,
  getActivityHeatmap,
  hashRef,
  grantExp,
  getGrowth,
  getDailyQuestState,
  generateGrowthNudges,
} from './growth.js';
import { POINTS_EARNING_C6_POLICY_VERSION } from './pointsEarningPolicy.js';

function accountCalendar(dayKey, makeupDays = []) {
  return {
    timezone: 'Asia/Shanghai',
    utcOffsetMinutes: 480,
    serverOffsetMinutes: 480,
    shiftMinutes: 0,
    dayKey,
    weekKey: '202632',
    previousDayKey: makeupDays[0] || null,
    makeupDays,
  };
}

afterEach(() => vi.useRealTimers());

describe('growth 段位表', () => {
  it('书签判重键在 Node 运行时稳定生成 SHA-256', () => {
    expect(hashRef('https://example.com')).toMatch(/^[a-f0-9]{64}$/);
    expect(hashRef('https://example.com')).toBe(hashRef('https://example.com'));
    expect(hashRef('https://example.com')).not.toBe(hashRef('https://example.org'));
  });

  it('15 级、cumExp 从 0 严格递增到 50000', () => {
    expect(RANKS).toHaveLength(15);
    expect(MAX_LEVEL).toBe(15);
    expect(RANKS[0].cumExp).toBe(0);
    expect(RANKS[14].cumExp).toBe(50000);
    for (let i = 1; i < RANKS.length; i++) {
      expect(RANKS[i].cumExp).toBeGreaterThan(RANKS[i - 1].cumExp);
    }
  });

  it('权益(容量/AI token)随等级单调不降,端点符合当前方案', () => {
    expect(RANKS.map((rank) => rank.spaceMb)).toEqual([
      1024, 1280, 1536, 1792, 2048, 2560, 3072, 4096, 5120, 6144, 8192, 10752, 13824, 16896, 20480,
    ]);
    expect(RANKS.map((rank) => rank.aiTokenDaily)).toEqual([
      300_000, 350_000, 400_000, 450_000, 500_000, 600_000, 700_000, 800_000, 900_000, 1_050_000, 1_200_000, 1_400_000,
      1_600_000, 1_800_000, 2_000_000,
    ]);
    for (let i = 1; i < RANKS.length; i++) {
      expect(RANKS[i].spaceMb).toBeGreaterThanOrEqual(RANKS[i - 1].spaceMb);
      expect(RANKS[i].aiTokenDaily).toBeGreaterThanOrEqual(RANKS[i - 1].aiTokenDaily);
    }
  });

  it('补签卡只在 7/30 天连签里程碑供给且单次各 1 张', () => {
    expect(STREAK_MILESTONES.filter((milestone) => milestone.cards).map(({ days, cards }) => [days, cards])).toEqual([
      [7, 1],
      [30, 1],
    ]);
  });
});

describe('levelForExp 边界', () => {
  it('阈值处即升级(含=阈值)', () => {
    expect(levelForExp(0)).toBe(1);
    expect(levelForExp(499)).toBe(1);
    expect(levelForExp(500)).toBe(2); // 正好达阈值算升级
    expect(levelForExp(999)).toBe(2);
    expect(levelForExp(1000)).toBe(3);
    expect(levelForExp(1699)).toBe(3);
    expect(levelForExp(1700)).toBe(4);
  });
  it('满级与超满级钳制到 15', () => {
    expect(levelForExp(49999)).toBe(14);
    expect(levelForExp(50000)).toBe(15);
    expect(levelForExp(9_999_999)).toBe(15);
  });
});

describe('rankOf 越界钳制', () => {
  it('1..15 正常,越界钳到端点', () => {
    expect(rankOf(1).name).toBe('蒙童');
    expect(rankOf(3).name).toBe('秀才');
    expect(rankOf(15).name).toBe('文圣');
    expect(rankOf(0).name).toBe('蒙童');
    expect(rankOf(99).name).toBe('文圣');
  });
});

describe('C6 每日任务状态', () => {
  it('成长看板返回签到和两个具体随机任务，不再返回重复知识行动槽', async () => {
    const db = { query: vi.fn().mockResolvedValue([[]]) };
    const state = await getDailyQuestState(
      'user-1',
      { checkedInToday: false },
      {
        db,
        calendar: accountCalendar('20260820'),
        policyVersion: POINTS_EARNING_C6_POLICY_VERSION,
      },
    );

    expect(state.policyVersion).toBe('points-earning-c6');
    expect(state.quests[0].key).toBe('checkin');
    expect(state.quests.slice(1).every((quest) => quest.key.startsWith('daily_') && quest.random)).toBe(true);
    expect(new Set(state.quests.map((quest) => quest.key)).size).toBe(3);
    expect(state.quests.some((quest) => quest.key.startsWith('knowledge_action_'))).toBe(false);
  });
});

describe('每日经验上限与一次性奖励隔离', () => {
  function makeGrantConnection({ used = 0, exp = 100, level = 1 } = {}) {
    return {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        if (sql.includes('INSERT IGNORE INTO growth_events')) return [{ affectedRows: 1, insertId: 11 }];
        if (sql.includes('INSERT INTO user_growth (user_id) VALUES')) return [{ affectedRows: 0 }];
        if (sql.includes('SELECT exp, level FROM user_growth')) return [[{ exp, level }]];
        if (sql.includes('SUM(amount)')) return [[{ used }]];
        return [{ affectedRows: 1 }];
      }),
    };
  }

  it('可重复来源只使用剩余每日额度，并从统计中排除一次性来源', async () => {
    vi.clearAllMocks();
    const connection = makeGrantConnection({ used: 195 });
    pool.getConnection.mockResolvedValue(connection);

    const result = await grantExp('user-1', 'note', {
      refId: 'note-1',
      amount: 15,
      userRole: 'user',
    });

    expect(result.granted).toBe(5);
    const capQuery = connection.query.mock.calls.find(([sql]) => sql.includes('SUM(amount)'));
    expect(capQuery?.[0]).toContain('source NOT IN (?, ?, ?, ?, ?)');
    expect(capQuery?.[1]).toEqual([
      'user-1',
      'growth_task',
      'first_own_resource',
      'milestone',
      'manual',
      'profile_done',
    ]);
    const lockCall = connection.query.mock.calls.findIndex(([sql]) => sql.includes('FOR UPDATE'));
    const capCall = connection.query.mock.calls.findIndex(([sql]) => sql.includes('SUM(amount)'));
    expect(lockCall).toBeGreaterThan(-1);
    expect(lockCall).toBeLessThan(capCall);
  });

  it('一次性成长奖励全额发放，不读取也不占用每日额度', async () => {
    vi.clearAllMocks();
    const connection = makeGrantConnection({ used: 200 });
    pool.getConnection.mockResolvedValue(connection);

    const result = await grantExp('user-1', 'growth_task', {
      refId: 'first_note',
      amount: 50,
      userRole: 'user',
    });

    expect(result.granted).toBe(50);
    expect(connection.query.mock.calls.some(([sql]) => sql.includes('SUM(amount)'))).toBe(false);
  });

  it('root 与 user 共用经验账本，不再因角色跳过发放', async () => {
    vi.clearAllMocks();
    const connection = makeGrantConnection({ exp: 50_000, level: 15 });
    pool.getConnection.mockResolvedValue(connection);

    const result = await grantExp('root-1', 'note', {
      refId: 'root-note-1',
      amount: 15,
      userRole: 'root',
    });

    expect(result).toMatchObject({ granted: 15, exp: 50_015, level: 15 });
    expect(connection.query).toHaveBeenCalledWith(expect.stringContaining('INSERT IGNORE INTO growth_events'), [
      'root-1',
      'note',
      'root-note-1',
      null,
      null,
    ]);
  });

  it('页面今日经验与发放端使用同一份受限来源口径', async () => {
    vi.clearAllMocks();
    pool.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT exp, streak, last_checkin_date')) {
        return [
          [
            {
              exp: 800,
              streak: 0,
              last_checkin_date: null,
              last_notified_level: 2,
              streak_protect_cards: 0,
              points: 0,
              equipped_title: null,
              equipped_frame: null,
              storage_bonus_mb: 0,
            },
          ],
        ];
      }
      if (sql.includes('SUM(amount)')) return [[{ used: 86 }]];
      throw new Error(`未预期的查询: ${sql}`);
    });

    const growth = await getGrowth('user-1', { userRole: 'user', calendar: accountCalendar('20260806') });

    expect(growth).toMatchObject({ dailyExp: 86, dailyCap: 200, dailyCapReached: false });
    const capQuery = pool.query.mock.calls.find(([sql]) => sql.includes('SUM(amount)'));
    expect(capQuery?.[1]).toEqual([
      'user-1',
      0,
      '20260806',
      'growth_task',
      'first_own_resource',
      'milestone',
      'manual',
      'profile_done',
    ]);
  });
});

describe('成就体系职责', () => {
  it('仅用首签成就承接新用户赠框，其余仍保持长期积累目标', () => {
    const retiredKeys = ['first_checkin', 'first_bookmark', 'first_note', 'first_file'];
    const keys = ACHIEVEMENTS.map((achievement) => achievement.key);

    expect(keys).toHaveLength(39);
    expect(keys).not.toEqual(expect.arrayContaining(retiredKeys));
    expect(ACHIEVEMENTS.filter((achievement) => achievement.target === 1)).toEqual([
      expect.objectContaining({ key: 'streak_1', metric: 'maxStreak', reward: 10 }),
    ]);
    expect(
      ACHIEVEMENTS.filter((achievement) => achievement.key !== 'streak_1').every(
        (achievement) => achievement.target > 1,
      ),
    ).toBe(true);
    expect(
      ACHIEVEMENTS.reduce((counts, achievement) => {
        counts[achievement.group] = (counts[achievement.group] || 0) + 1;
        return counts;
      }, {}),
    ).toEqual({ checkin: 7, create: 17, action: 4, organize: 4, level: 3, tenure: 4 });
  });

  it('为书签、笔记和文件提供基础与进阶两级静态头像框门槛', () => {
    expect(ACHIEVEMENTS.find((achievement) => achievement.key === 'bookmark_10')).toMatchObject({
      metric: 'bookmarkCount',
      target: 10,
    });
    expect(ACHIEVEMENTS.find((achievement) => achievement.key === 'bookmark_50')).toMatchObject({
      metric: 'bookmarkCount',
      target: 50,
    });
    expect(ACHIEVEMENTS.find((achievement) => achievement.key === 'note_10')).toMatchObject({
      metric: 'noteCount',
      target: 10,
    });
    expect(ACHIEVEMENTS.find((achievement) => achievement.key === 'note_30')).toMatchObject({
      metric: 'noteCount',
      target: 30,
    });
    expect(ACHIEVEMENTS.find((achievement) => achievement.key === 'file_5')).toMatchObject({
      metric: 'fileCount',
      target: 5,
    });
    expect(ACHIEVEMENTS.find((achievement) => achievement.key === 'file_30')).toMatchObject({
      metric: 'fileCount',
      target: 30,
    });
  });

  it('资源头像框只叠加等级门槛：200 档 Lv.5，500 档 Lv.8', () => {
    expect(ACHIEVEMENTS.find((achievement) => achievement.key === 'note_200')).toMatchObject({ minLevel: 5 });
    expect(ACHIEVEMENTS.find((achievement) => achievement.key === 'file_200')).toMatchObject({ minLevel: 5 });
    for (const key of ['bookmark_500', 'note_500', 'file_500']) {
      expect(ACHIEVEMENTS.find((achievement) => achievement.key === key)).toMatchObject({ minLevel: 8 });
    }

    const note200 = ACHIEVEMENTS.find((achievement) => achievement.key === 'note_200');
    expect(meetsAchievementRequirement(note200, { noteCount: 200, level: 4 })).toBe(false);
    expect(meetsAchievementRequirement(note200, { noteCount: 199, level: 5 })).toBe(false);
    expect(meetsAchievementRequirement(note200, { noteCount: 200, level: 5 })).toBe(true);
  });
});

describe('成就头像框领取', () => {
  let connection;

  beforeEach(() => {
    vi.clearAllMocks();
    connection = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue([{ affectedRows: 1 }]),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    pool.getConnection.mockResolvedValue(connection);
    getAchievementFrameByKey.mockReturnValue({ id: 'frame_first_light' });
    earnPoints.mockResolvedValue(true);
    pool.query
      .mockResolvedValueOnce([
        [
          {
            exp: 0,
            streak: 1,
            last_checkin_date: '20260811',
            last_notified_level: 1,
            streak_protect_cards: 0,
            points: 30,
            equipped_title: null,
            equipped_frame: null,
            storage_bonus_mb: 0,
          },
        ],
      ])
      .mockResolvedValueOnce([[{ s: 5 }]]);
  });

  afterEach(() => {
    getAchievementFrameByKey.mockReset();
    earnPoints.mockReset();
  });

  it('在同一事务发放积分和头像框，并返回奖励 frameId', async () => {
    const result = await claimAchievement('user-1', 'streak_1', {
      userRole: 'user',
      dashboard: { achievements: [{ key: 'streak_1', unlocked: true }] },
    });

    expect(earnPoints).toHaveBeenCalledWith('user-1', 10, 'achievement', 'streak_1', connection);
    expect(connection.query).toHaveBeenCalledWith(
      'INSERT IGNORE INTO user_cosmetics (user_id, cosmetic_id) VALUES (?, ?)',
      ['user-1', 'frame_first_light'],
    );
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ ok: true, key: 'streak_1', reward: 10, frameId: 'frame_first_light' });
  });

  it('头像框入库失败时回滚成就积分事务', async () => {
    connection.query.mockRejectedValueOnce(new Error('insert failed'));

    await expect(
      claimAchievement('user-1', 'streak_1', {
        userRole: 'user',
        dashboard: { achievements: [{ key: 'streak_1', unlocked: true }] },
      }),
    ).rejects.toThrow('insert failed');

    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.release).toHaveBeenCalledOnce();
  });
});

describe('root 真实等级口径', () => {
  function mockGrowthRow(exp, storedLevel = levelForExp(exp)) {
    pool.query.mockReset();
    pool.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT exp, streak, last_checkin_date')) {
        return [
          [
            {
              exp,
              streak: 0,
              last_checkin_date: null,
              last_notified_level: storedLevel,
              streak_protect_cards: 0,
              points: 0,
              equipped_title: null,
              equipped_frame: null,
              storage_bonus_mb: 0,
            },
          ],
        ];
      }
      if (sql.includes('SUM(amount)')) return [[{ used: 0 }]];
      throw new Error(`未预期的查询: ${sql}`);
    });
  }

  it('已固化的历史 root 按真实 50000 EXP 返回 Lv.15 和 200 万 AI', async () => {
    vi.clearAllMocks();
    mockGrowthRow(50_000, 15);

    const growth = await getGrowth('root-1', { userRole: 'root', calendar: accountCalendar('20260825') });

    expect(growth).toMatchObject({ exp: 50_000, level: 15, aiTokenDaily: 2_000_000, spaceMb: 20_480 });
  });

  it('未经迁移的低经验 root 不再被展示层伪造成 Lv.15', async () => {
    vi.clearAllMocks();
    mockGrowthRow(0, 1);

    const growth = await getGrowth('future-root', { userRole: 'root', calendar: accountCalendar('20260825') });

    expect(growth).toMatchObject({ exp: 0, level: 1, aiTokenDaily: 300_000, spaceMb: 1024 });
  });
});

describe('游客成长数据隔离', () => {
  it('共享游客 ID 不会继承历史成就或变成可领取状态', async () => {
    // 线上游客是 user 表中的共享账号，ID 并非固定字面量 "visitor"。
    // 即使该共享账号残留过历史流水，角色仍应让成长页保持纯演示态。
    pool.query.mockReset();
    pool.getConnection.mockReset();

    const dashboard = await getGrowthDashboard('visitor-shared-id', { userRole: 'visitor' });

    expect(pool.query).not.toHaveBeenCalled();
    expect(dashboard.unlockedCount).toBe(0);
    expect(dashboard.claimableCount).toBe(0);
    expect(
      dashboard.achievements.every(
        (achievement) => !achievement.unlocked && !achievement.claimable && !achievement.claimed,
      ),
    ).toBe(true);
    expect(dashboard.achievements.filter((achievement) => achievement.group === 'level')).toEqual([
      expect.objectContaining({ key: 'level_5', cur: 1, target: 5, unlocked: false, claimable: false }),
      expect.objectContaining({ key: 'level_10', cur: 1, target: 10, unlocked: false, claimable: false }),
      expect.objectContaining({ key: 'level_15', cur: 1, target: 15, unlocked: false, claimable: false }),
    ]);
  });

  it('共享游客 ID 不会读取知识足迹', async () => {
    pool.query.mockReset();

    const heatmap = await getActivityHeatmap('visitor-shared-id', { userRole: 'visitor', year: 2026 });

    expect(pool.query).not.toHaveBeenCalled();
    expect(heatmap.days).toEqual([]);
    expect(heatmap.summary).toEqual({
      activeDays: 0,
      longestStreak: 0,
      weekCount: 0,
      weekActiveDays: 0,
      weeklyTarget: 0,
    });
  });
});

describe('知识活动热力图', () => {
  it('只聚合一手资源与签到，并返回真实有活动的年份', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 22, 12, 0, 0));
    pool.query.mockReset();
    pool.query
      .mockResolvedValueOnce([
        [
          { day: '20260720', activity_type: 'bookmark', cnt: 1 },
          { day: '20260721', activity_type: 'note', cnt: 3 },
          { day: '20260721', activity_type: 'checkin', cnt: 1 },
          { day: '20260722', activity_type: 'bookmark', cnt: 1 },
          { day: '20260722', activity_type: 'file', cnt: 1 },
        ],
      ])
      .mockResolvedValueOnce([[{ y: 2026 }, { y: 2024 }, { y: 2026 }, { y: 1999 }]]);

    const heatmap = await getActivityHeatmap('user-1', {
      userRole: 'user',
      year: 2026,
      calendar: accountCalendar('20260722'),
    });

    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(pool.query.mock.calls[0][0]).toContain("source = 'checkin'");
    expect(pool.query.mock.calls[0][0]).toContain("source = 'todo_complete'");
    expect(pool.query.mock.calls[0][0]).toContain("source = 'organize_complete'");
    expect(pool.query.mock.calls[0][0]).toContain("SHA2(CONCAT('todo:'");
    expect(pool.query.mock.calls[0][0]).toContain("SHA2(CONCAT('organize:'");
    expect(pool.query.mock.calls[0][0]).toContain("'bookmark' AS activity_type");
    expect(pool.query.mock.calls[0][0]).toContain('onboarding_seed_resources');
    expect(pool.query.mock.calls[1][0]).toContain('onboarding_seed_resources');
    expect(heatmap.days).toEqual([
      {
        day: '2026-07-20',
        count: 1,
        breakdown: { bookmark: 1, note: 0, file: 0, todo: 0, organize: 0, checkin: 0 },
      },
      {
        day: '2026-07-21',
        count: 4,
        breakdown: { bookmark: 0, note: 3, file: 0, todo: 0, organize: 0, checkin: 1 },
      },
      {
        day: '2026-07-22',
        count: 2,
        breakdown: { bookmark: 1, note: 0, file: 1, todo: 0, organize: 0, checkin: 0 },
      },
    ]);
    expect(heatmap.summary).toEqual({
      activeDays: 3,
      longestStreak: 3,
      weekCount: 7,
      weekActiveDays: 3,
      weeklyTarget: 0,
    });
    expect(heatmap.availableYears).toEqual([2026, 2024]);
    expect(heatmap.includedTypes).toEqual(['bookmark', 'note', 'file', 'todo', 'organize', 'checkin']);
    expect(heatmap.countingRules).toEqual({
      excludesSeedResources: true,
      preservesDeletedResourceHistory: true,
      todoTimeField: 'completed_at',
      organizeTimeField: 'complete_time',
    });
  });
});

describe('补签窗口', () => {
  it('只包含今天之前最近 3 个自然日，并可跨年', () => {
    const now = new Date(2026, 0, 1, 12, 0, 0);
    expect(MAKEUP_WINDOW_DAYS).toBe(3);
    expect(getMakeupCandidateDays(now)).toEqual(['20251231', '20251230', '20251229']);
  });

  it('拒绝今天、未来、超窗和非法日期', () => {
    const now = new Date(2026, 6, 17, 12, 0, 0);
    expect(isMakeupCandidateDay('20260716', now)).toBe(true);
    expect(isMakeupCandidateDay('20260714', now)).toBe(true);
    expect(isMakeupCandidateDay('20260713', now)).toBe(false);
    expect(isMakeupCandidateDay('20260717', now)).toBe(false);
    expect(isMakeupCandidateDay('20260718', now)).toBe(false);
    expect(isMakeupCandidateDay('20260230', now)).toBe(false);
  });

  it('按选定日期补签，只写零经验签到记录，不发积分或里程碑奖励', async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 17, 12, 0, 0));
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        if (sql.includes('SELECT streak, last_checkin_date'))
          return [[{ streak: 1, last_checkin_date: '20260716', streak_protect_cards: 1 }]];
        if (sql.includes('SELECT exp, streak, last_checkin_date')) {
          return [
            [
              {
                exp: 0,
                streak: 3,
                last_checkin_date: '20260716',
                last_notified_level: 1,
                streak_protect_cards: 0,
                points: 0,
                equipped_title: null,
                equipped_frame: null,
                storage_bonus_mb: 0,
              },
            ],
          ];
        }
        if (sql.includes('SUM(amount)')) return [[{ used: 0 }]];
        if (sql.includes('COUNT(*) AS c')) return [[{ c: 0 }]];
        if (sql.includes('SELECT day FROM growth_events'))
          return [[{ day: '20260716' }, { day: '20260715' }, { day: '20260714' }]];
        return [{}];
      }),
    };
    pool.getConnection.mockResolvedValue(connection);
    pool.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT exp, streak, last_checkin_date')) {
        return [
          [
            {
              exp: 0,
              streak: 3,
              last_checkin_date: '20260716',
              last_notified_level: 1,
              streak_protect_cards: 0,
              points: 0,
              equipped_title: null,
              equipped_frame: null,
              storage_bonus_mb: 0,
            },
          ],
        ];
      }
      if (sql.includes('SUM(amount)')) return [[{ s: 0 }]];
      throw new Error(`未预期的 pool 查询: ${sql}`);
    });

    const result = await useProtectCard('user-1', {
      date: '20260715',
      calendar: accountCalendar('20260717', ['20260716', '20260715', '20260714']),
    });

    expect(result).toMatchObject({ ok: true, date: '20260715', streak: 3 });
    expect(connection.query).toHaveBeenCalledWith(
      expect.stringContaining("VALUES (?, 'checkin', NULL, ?, 0, 'granted', ?)"),
      ['user-1', '20260715', JSON.stringify({ protectCard: true })],
    );
    expect(connection.query.mock.calls.some(([sql]) => sql.includes('UPDATE growth_events SET amount'))).toBe(false);
    expect(earnPoints).not.toHaveBeenCalled();
    expect(grantItem).not.toHaveBeenCalled();
  });
});

describe('后台成长调整的升级通知', () => {
  function makeConnection(preference = 'true') {
    return {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        if (sql.includes('SELECT exp, streak_protect_cards')) return [[{ exp: 490, streak_protect_cards: 0 }]];
        if (sql.includes('JSON_EXTRACT(preferences')) return [[{ v: preference }]];
        return [{}];
      }),
    };
  }

  it('跨多级时只通知最终等级，不补发等级卡', async () => {
    const connection = makeConnection();
    pool.getConnection.mockResolvedValue(connection);

    const result = await adminAdjustGrowth('user-1', { expDelta: 30_000 });

    expect(result).toMatchObject({ ok: true, level: 12, leveledUp: true });
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        type: 'level_up',
        link: '/growth',
        meta: { level: 12, name: '大学士', source: 'admin_adjust' },
      }),
      connection,
    );
    expect(grantItem).not.toHaveBeenCalled();
  });

  it('用户关闭升级提醒时不创建通知', async () => {
    vi.clearAllMocks();
    const connection = makeConnection('false');
    pool.getConnection.mockResolvedValue(connection);

    const result = await adminAdjustGrowth('user-2', { expDelta: 600 });

    expect(result).toMatchObject({ ok: true, level: 3, leveledUp: true });
    expect(createNotification).not.toHaveBeenCalled();
    expect(grantItem).not.toHaveBeenCalled();
  });

  it('后台补签卡调整同样遵守全局库存上限 2', async () => {
    vi.clearAllMocks();
    const connection = makeConnection();
    pool.getConnection.mockResolvedValue(connection);

    const result = await adminAdjustGrowth('user-3', { cardDelta: 99 });

    expect(result).toMatchObject({ ok: true, cards: 2 });
    expect(connection.query).toHaveBeenCalledWith(
      'UPDATE user_growth SET exp = ?, level = ?, streak_protect_cards = ? WHERE user_id = ?',
      [490, 1, 2, 'user-3'],
    );
  });
});

describe('成长提醒', () => {
  it('按二进制用户标识关联新旧排序规则的成长表', async () => {
    vi.clearAllMocks();
    pool.query.mockResolvedValueOnce([[]]);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await generateGrowthNudges();

    logSpy.mockRestore();
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls[0][0]).toContain(
      'LEFT JOIN user_growth_preferences ugp ON BINARY ugp.user_id = BINARY ug.user_id',
    );
  });
});

describe('claimDailyQuestBonus 角色边界', () => {
  it('游客不发经验或积分', async () => {
    vi.clearAllMocks();
    const result = await claimDailyQuestBonus('visitor', { userRole: 'visitor' });
    expect(result).toEqual({ ok: false, reason: 'visitor' });
    expect(earnPoints).not.toHaveBeenCalled();
    expect(pool.getConnection).not.toHaveBeenCalled();
  });
});
