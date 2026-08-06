import { describe, expect, it, vi } from 'vitest';
import { getTodoPlanDiagnostics } from './todoPlanDiagnosticsService.js';

describe('todoPlanDiagnosticsService', () => {
  it('聚合系列、提醒任务与运行时指标，并解析规则 JSON', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([
          [
            {
              activeSeriesCount: 3,
              pausedSeriesCount: 1,
              seriesWithError: 1,
              seriesGenerationLagSeconds: 42,
              reminderJobsOverdue: 2,
              reminderDeliveryLatencySeconds: 8.5,
            },
          ],
        ])
        .mockResolvedValueOnce([
          [
            { status: 'pending', count: 7 },
            { status: 'unknown', count: 1 },
            { status: 'failed', count: 2 },
          ],
        ])
        .mockResolvedValueOnce([
          [
            { metricName: 'series_generation_failures', metricValue: 4 },
            { metricName: 'reminder_duplicate_prevented', metricValue: 6 },
          ],
        ])
        .mockResolvedValueOnce([
          [
            {
              id: 'series-1',
              userId: 'user-1',
              userLabel: '小轻',
              title: '每日复盘',
              repeatMode: 'scheduled',
              status: 'active',
              timezone: 'Asia/Shanghai',
              scheduleRule: '{"plan":{"frequency":"daily"}}',
              version: 2,
              nextOccurrenceNo: 9,
              generatedThroughDate: '2026-10-05',
              parentSeriesId: null,
              splitFromOccurrenceNo: null,
              lastGenerationError: null,
              updateTime: '2026-08-06 12:00:00',
              instanceCount: 8,
              completedCount: 3,
              skippedCount: 1,
              nextOccurrenceDate: '2026-08-07',
              reminderJobCount: 16,
              pendingJobCount: 7,
              failedJobCount: 2,
              unknownJobCount: 1,
              nextReminderAt: '2026-08-07 09:00:00',
            },
          ],
        ]),
    };

    const result = await getTodoPlanDiagnostics(db, { status: 'active', keyword: '100%_复盘', limit: 500 });

    expect(result.metrics).toMatchObject({
      active_series_count: 3,
      reminder_jobs_pending: 7,
      reminder_jobs_overdue: 2,
      reminder_jobs_unknown: 1,
      reminder_jobs_failed: 2,
      series_generation_failures: 4,
      reminder_duplicate_prevented: 6,
    });
    expect(result.series[0]).toMatchObject({
      id: 'series-1',
      scheduleRule: { plan: { frequency: 'daily' } },
      nextOccurrenceNo: 9,
      completedCount: 3,
    });
    expect(db.query.mock.calls[3][0]).toContain('LIMIT 100');
    expect(db.query.mock.calls[3][1]).toEqual([
      'active',
      'active',
      '100%_复盘',
      '%100\\%\\_复盘%',
      '%100\\%\\_复盘%',
      '%100\\%\\_复盘%',
      '%100\\%\\_复盘%',
      '%100\\%\\_复盘%',
    ]);
  });

  it('非法状态回退为全部，空结果返回零指标', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]]),
    };

    const result = await getTodoPlanDiagnostics(db, { status: 'broken', limit: -1 });

    expect(result.metrics.active_series_count).toBe(0);
    expect(result.metrics.reminder_jobs_processing).toBe(0);
    expect(result.series).toEqual([]);
    expect(db.query.mock.calls[3][0]).toContain('LIMIT 1');
    expect(db.query.mock.calls[3][1].slice(0, 2)).toEqual(['all', 'all']);
  });
});
