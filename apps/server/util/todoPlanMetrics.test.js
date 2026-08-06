import { describe, expect, it, vi } from 'vitest';
import { incrementTodoPlanMetric, TODO_PLAN_RUNTIME_METRICS } from './todoPlanMetrics.js';

describe('todoPlanMetrics', () => {
  it('仅累加固定低基数指标', async () => {
    const db = { query: vi.fn().mockResolvedValue([{ affectedRows: 1 }]) };

    await incrementTodoPlanMetric(db, 'quiet_hours_deferred', 2.9);

    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('ON DUPLICATE KEY UPDATE'), [
      'quiet_hours_deferred',
      2,
    ]);
    expect(TODO_PLAN_RUNTIME_METRICS).toContain('quiet_hours_deferred');
  });

  it('零值不写库，未知指标直接拒绝', async () => {
    const db = { query: vi.fn() };

    await incrementTodoPlanMetric(db, 'quiet_hours_skipped', 0);
    expect(db.query).not.toHaveBeenCalled();
    await expect(incrementTodoPlanMetric(db, 'user_supplied_metric', 1)).rejects.toThrow('TODO_PLAN_METRIC_INVALID');
  });
});
