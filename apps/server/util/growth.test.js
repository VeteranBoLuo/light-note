import { afterEach, describe, it, expect, vi } from 'vitest';

// growth.js 顶层 import pool from '../db/index.js';纯逻辑测试不碰库,mock 掉以免 import 期连真库
vi.mock('../db/index.js', () => ({
  default: { query: vi.fn(), getConnection: vi.fn() },
}));
vi.mock('./points.js', () => ({
  earnPoints: vi.fn(),
  earnStorage: vi.fn(),
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
import { earnPoints } from './points.js';
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
  useProtectCard,
  getGrowthDashboard,
  getActivityHeatmap,
} from './growth.js';

afterEach(() => vi.useRealTimers());

describe('growth 段位表', () => {
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
    expect(RANKS[0].spaceMb).toBe(512);
    expect(RANKS[9].spaceMb).toBe(5120);
    expect(RANKS[14].spaceMb).toBe(20480);
    expect(RANKS[0].aiTokenDaily).toBe(250_000);
    expect(RANKS[14].aiTokenDaily).toBe(2_000_000);
    for (let i = 1; i < RANKS.length; i++) {
      expect(RANKS[i].spaceMb).toBeGreaterThanOrEqual(RANKS[i - 1].spaceMb);
      expect(RANKS[i].aiTokenDaily).toBeGreaterThanOrEqual(RANKS[i - 1].aiTokenDaily);
    }
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
    expect(heatmap.summary).toEqual({ activeDays: 0, longestStreak: 0, weekCount: 0 });
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

    const heatmap = await getActivityHeatmap('user-1', { userRole: 'user', year: 2026 });

    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(pool.query.mock.calls[0][0]).toContain("source = 'checkin'");
    expect(pool.query.mock.calls[0][0]).toContain("'bookmark' AS activity_type");
    expect(pool.query.mock.calls[0][0]).toContain('onboarding_seed_resources');
    expect(pool.query.mock.calls[1][0]).toContain('onboarding_seed_resources');
    expect(heatmap.days).toEqual([
      { day: '2026-07-20', count: 1, breakdown: { bookmark: 1, note: 0, file: 0, checkin: 0 } },
      { day: '2026-07-21', count: 4, breakdown: { bookmark: 0, note: 3, file: 0, checkin: 1 } },
      { day: '2026-07-22', count: 2, breakdown: { bookmark: 1, note: 0, file: 1, checkin: 0 } },
    ]);
    expect(heatmap.summary).toEqual({ activeDays: 3, longestStreak: 3, weekCount: 7 });
    expect(heatmap.availableYears).toEqual([2026, 2024]);
    expect(heatmap.includedTypes).toEqual(['bookmark', 'note', 'file', 'checkin']);
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

    const result = await useProtectCard('user-1', { date: '20260715' });

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
});
