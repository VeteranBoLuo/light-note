import { describe, expect, it } from 'vitest';
import { buildAdminTodayInsights, type AdminTodayBaseline, type AdminTodayMetricValues } from './adminTodayInsights.ts';

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
