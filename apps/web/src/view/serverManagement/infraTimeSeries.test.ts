import { describe, it, expect } from 'vitest';
import type { HostAgentMetricPoint } from '@lightnote/shared/host-agent-protocol';
import { normalizeHistory, numericSample, timeSeriesPath, historyGapLimit, samplePeak } from './infraTimeSeries';
describe('server metric time series', () => {
  it('sorts timestamps, ignores invalid timestamps and uses the latest duplicate', () => {
    const p = (sampledAt: string, cpuPercent: number) => ({ sampledAt, cpuPercent }) as HostAgentMetricPoint;
    const result = normalizeHistory([
      p('bad', 1),
      p('2026-10-29T02:01:00Z', 2),
      p('2026-10-29T02:00:00Z', 1),
      p('2026-10-29T02:01:00Z', 3),
    ]);
    expect(result.map((p) => p.point.cpuPercent)).toEqual([1, 3]);
  });
  it('keeps missing measurements as gaps instead of inventing zero', () => {
    expect(numericSample(null)).toBeNull();
    expect(numericSample(NaN)).toBeNull();
    expect(numericSample(0)).toBe(0);
    const points = [
      { time: 0, value: 4 },
      { time: 3, value: null },
      { time: 6, value: 8 },
      { time: 60, value: 12 },
    ];
    expect(
      timeSeriesPath(
        points,
        (n) => n,
        (n) => n,
        10,
      ),
    ).toBe('M0.00,4.00  M6.00,8.00 M60.00,12.00');
  });
  it('derives a gap threshold from collection cadence rather than connecting outages', () => {
    expect(historyGapLimit([0, 3000, 6000, 9000, 60000])).toBe(12000);
  });
  it('never presents absent measurements as zero or a fabricated peak', () => {
    expect(samplePeak([null, undefined, NaN])).toBeNull();
    expect(samplePeak([0, null])).toBe(0);
    expect(samplePeak([1200, 450, null])).toBe(1200);
    expect(historyGapLimit([0, 3600000])).toBe(60000);
  });
});
