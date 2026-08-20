export type AdminTodayMetricKey =
  'users' | 'resources' | 'bookmarks' | 'notes' | 'files' | 'todos' | 'activeUsers' | 'aiCalls';
export type AdminTodayInsightMetricKey = 'users' | 'resources';
export type AdminTodayResourceMetricKey = 'bookmarks' | 'notes' | 'files';

export interface AdminTodayBaselineMetric {
  yesterday: number;
  average7d: number;
}
export interface AdminTodayBaseline {
  available: boolean;
  timezone: string;
  mode: 'same_elapsed_time';
  cutoffTime: string;
  sampleDays: number;
  metrics: Partial<Record<AdminTodayMetricKey, AdminTodayBaselineMetric>>;
}

export interface AdminTodayMetricValues {
  users: number;
  resources: number;
  bookmarks: number;
  notes: number;
  files: number;
  todos: number;
}

export interface AdminTodayInsight {
  metric: AdminTodayInsightMetricKey;
  focus?: AdminTodayResourceMetricKey;
  direction: 'up' | 'down';
  current: number;
  average7d: number;
  changePercent: number | null;
  cause?: AdminTodayResourceMetricKey;
}

const INSIGHT_RULES: Record<AdminTodayInsightMetricKey, { minimumAbsoluteDelta: number }> = {
  users: { minimumAbsoluteDelta: 3 },
  resources: { minimumAbsoluteDelta: 10 },
};

function finiteCount(value: unknown): number {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, count) : 0;
}

/**
 * 最多解释“用户 + 一条资源信号”：资源合计异常优先，否则只取一个最强构成异常。
 * 主指标需同时满足 50% 相对变化与最小绝对差；构成需达到 100%，避免合计与三类构成重复报同一波动。
 */
export function buildAdminTodayInsights(
  current: AdminTodayMetricValues,
  baseline: AdminTodayBaseline | null | undefined,
): AdminTodayInsight[] {
  if (!baseline?.available || baseline.mode !== 'same_elapsed_time' || baseline.sampleDays < 3) return [];

  const primaryInsights = (['users', 'resources'] as const).flatMap((metric) => {
    const average7d = finiteCount(baseline.metrics[metric]?.average7d);
    const currentValue = finiteCount(current[metric]);
    const delta = currentValue - average7d;
    const { minimumAbsoluteDelta } = INSIGHT_RULES[metric];

    if (average7d === 0) {
      if (currentValue < minimumAbsoluteDelta) return [];
      return [{ metric, direction: 'up' as const, current: currentValue, average7d, changePercent: null }];
    }

    const relativeDelta = delta / average7d;
    if (Math.abs(delta) < minimumAbsoluteDelta || Math.abs(relativeDelta) < 0.5) return [];

    const direction = delta > 0 ? 'up' : 'down';
    const insight: AdminTodayInsight = {
      metric,
      direction,
      current: currentValue,
      average7d,
      changePercent: Math.round(Math.abs(relativeDelta) * 100),
    };

    if (metric === 'resources') {
      const cause = (['bookmarks', 'notes', 'files'] as const)
        .map((key) => ({
          key,
          delta: finiteCount(current[key]) - finiteCount(baseline.metrics[key]?.average7d),
        }))
        .filter((item) => (direction === 'up' ? item.delta > 0 : item.delta < 0))
        .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))[0];
      if (cause) insight.cause = cause.key;
    }

    return [insight];
  });

  if (primaryInsights.some((insight) => insight.metric === 'resources')) return primaryInsights;

  const componentInsight = (['bookmarks', 'notes', 'files'] as const)
    .map((focus) => {
      const average7d = finiteCount(baseline.metrics[focus]?.average7d);
      const currentValue = finiteCount(current[focus]);
      const delta = currentValue - average7d;
      if (average7d === 0) {
        return currentValue >= 5
          ? {
              insight: {
                metric: 'resources' as const,
                focus,
                direction: 'up' as const,
                current: currentValue,
                average7d,
                changePercent: null,
              },
              score: Number.POSITIVE_INFINITY,
            }
          : null;
      }
      const relativeDelta = delta / average7d;
      if (Math.abs(delta) < 5 || Math.abs(relativeDelta) < 1) return null;
      return {
        insight: {
          metric: 'resources' as const,
          focus,
          direction: delta > 0 ? ('up' as const) : ('down' as const),
          current: currentValue,
          average7d,
          changePercent: Math.round(Math.abs(relativeDelta) * 100),
        },
        score: Math.abs(relativeDelta),
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate != null)
    .sort((left, right) =>
      right.score === left.score ? right.insight.current - left.insight.current : right.score - left.score,
    )[0]?.insight;

  return componentInsight ? [...primaryInsights, componentInsight] : primaryInsights;
}
