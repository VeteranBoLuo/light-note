import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getPointsLog: vi.fn() }));

vi.mock('../../points.js', () => ({ getPointsLog: mocks.getPointsLog }));

const { default: queryPointsLog } = await import('./query_points_log.js');

describe('query_points_log 结果契约', () => {
  beforeEach(() => vi.clearAllMocks());

  it('把精确总量与当前返回量分开投影', async () => {
    mocks.getPointsLog.mockResolvedValue({
      total: 7,
      rows: [{ id: 'points-1', delta: 5, reason: 'checkin', create_time: null }],
    });

    const raw = await queryPointsLog.execute({ limit: 1 }, { userId: 'user-1' });

    expect(mocks.getPointsLog).toHaveBeenCalledWith('user-1', { limit: 1 });
    expect(raw.resultMetadata).toMatchObject({
      totalCount: 7,
      returned: 1,
      totalExact: true,
      completeness: 'partial',
    });
    expect(queryPointsLog.transform(raw)).toContain('共 7 条积分流水,最近 1 条');
  });
});
