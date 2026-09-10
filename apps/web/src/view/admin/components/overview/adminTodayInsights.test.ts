import { describe, expect, it } from 'vitest';
import {
  formatAdminTodayBaseline,
  buildAdminTodayInsights,
  type AdminTodayBaseline,
  type AdminTodayMetricValues,
} from './adminTodayInsights.ts';

const current: AdminTodayMetricValues = {
  users: 10,
  resources: 60,
  bookmarks: 10,
  notes: 20,
  files: 30,
  todos: 8,
};

function baseline(overrides: Partial<AdminTodayBaseline['metrics']> = {}): AdminTodayBaseline {
  return {
    available: true,
    timezone: 'Asia/Shanghai',
    mode: 'same_elapsed_time',
    cutoffTime: '17:40',
    sampleDays: 7,
    metrics: {
      users: { yesterday: 9, average7d: 8 },
      resources: { yesterday: 58, average7d: 55 },
      bookmarks: { yesterday: 12, average7d: 11 },
      notes: { yesterday: 18, average7d: 19 },
      files: { yesterday: 28, average7d: 25 },
      todos: { yesterday: 7, average7d: 7 },
      ...overrides,
    },
  };
}

describe('今日运营同期波动解释', () => {
  it('过滤低于绝对量或 50% 阈值的正常波动', () => {
    expect(buildAdminTodayInsights(current, baseline())).toEqual([]);
  });

  it('资源显著增长时只提示资源合计，并定位最大贡献构成', () => {
    const result = buildAdminTodayInsights(
      current,
      baseline({
        resources: { yesterday: 22, average7d: 24 },
        bookmarks: { yesterday: 9, average7d: 8 },
        notes: { yesterday: 10, average7d: 10 },
        files: { yesterday: 3, average7d: 6 },
      }),
    );

    expect(result).toEqual([
      {
        metric: 'resources',
        direction: 'up',
        current: 60,
        average7d: 24,
        changePercent: 150,
        cause: 'files',
      },
    ]);
  });

  it('用户显著下降时给出下降幅度', () => {
    const result = buildAdminTodayInsights(
      { ...current, users: 4 },
      baseline({ users: { yesterday: 11, average7d: 10 } }),
    );

    expect(result[0]).toMatchObject({
      metric: 'users',
      direction: 'down',
      current: 4,
      average7d: 10,
      changePercent: 60,
    });
  });

  it('资源合计平稳但单一构成剧烈波动时只提示最显著的一项', () => {
    const result = buildAdminTodayInsights(
      current,
      baseline({
        resources: { yesterday: 58, average7d: 55 },
        bookmarks: { yesterday: 12, average7d: 11 },
        notes: { yesterday: 18, average7d: 19 },
        files: { yesterday: 4, average7d: 4.5 },
      }),
    );

    expect(result).toEqual([
      {
        metric: 'resources',
        focus: 'files',
        direction: 'up',
        current: 30,
        average7d: 4.5,
        changePercent: 567,
      },
    ]);
  });

  it('多个资源构成都从零基线增长时选择当前绝对量最大的一项', () => {
    const result = buildAdminTodayInsights(
      current,
      baseline({
        resources: { yesterday: 55, average7d: 55 },
        bookmarks: { yesterday: 0, average7d: 0 },
        notes: { yesterday: 0, average7d: 0 },
        files: { yesterday: 0, average7d: 0 },
      }),
    );

    expect(result).toEqual([
      {
        metric: 'resources',
        focus: 'files',
        direction: 'up',
        current: 30,
        average7d: 0,
        changePercent: null,
      },
    ]);
  });

  it('零基线达到绝对量阈值时提示新增长，基线不可用时不误报', () => {
    expect(buildAdminTodayInsights(current, baseline({ users: { yesterday: 0, average7d: 0 } }))[0]).toMatchObject({
      metric: 'users',
      direction: 'up',
      changePercent: null,
    });
    expect(buildAdminTodayInsights(current, { ...baseline(), available: false })).toEqual([]);
  });
});

describe('活跃同期展示', () => {
  const t = (key: string, values: Record<string, string | number>) => JSON.stringify({ key, ...values });
  it('昨日数据独立显示，缺失均值不当作零', () => {
    const result = JSON.parse(
      formatAdminTodayBaseline(baseline({ activeUsers: { yesterday: 6, average7d: null } }), 'activeUsers', t),
    );
    expect(result).toEqual({ key: 'adminOverview.todayBaselinePendingAverage', yesterday: '6' });
  });
  it('昨日和均值为零时正常显示', () => {
    expect(
      JSON.parse(formatAdminTodayBaseline(baseline({ activeUsers: { yesterday: 0, average7d: 0 } }), 'activeUsers', t)),
    ).toEqual({ key: 'adminOverview.todayBaseline', yesterday: '0', days: 7, average: '0' });
    expect(
      JSON.parse(
        formatAdminTodayBaseline(baseline({ activeUsers: { yesterday: 0, average7d: null } }), 'activeUsers', t),
      ).yesterday,
    ).toBe('0');
  });
  it('无基线或请求不可用时不生成比较值', () => {
    expect(formatAdminTodayBaseline(baseline(), 'activeUsers', t)).toBe('');
    expect(formatAdminTodayBaseline(undefined, 'activeUsers', t)).toBe('');
    expect(
      formatAdminTodayBaseline(
        { ...baseline({ activeUsers: { yesterday: 6, average7d: null } }), available: false },
        'activeUsers',
        t,
      ),
    ).toBe('');
  });
});
