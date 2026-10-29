import type { HostAgentMetricPoint } from '@lightnote/shared/host-agent-protocol';
export function normalizeHistory(points: HostAgentMetricPoint[]) {
  const byTime = new Map<number, HostAgentMetricPoint>();
  for (const point of points) {
    const time = Date.parse(point.sampledAt);
    if (Number.isFinite(time)) byTime.set(time, point);
  }
  return [...byTime].sort(([a], [b]) => a - b).map(([time, point]) => ({ time, point }));
}
export function numericSample(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
export function historyGapLimit(times: number[]) {
  const intervals = times
    .slice(1)
    .map((time, i) => time - times[i])
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  return Math.min(60_000, Math.max(10_000, (intervals[Math.floor(intervals.length / 2)] || 3000) * 4));
}
export function timeSeriesPath(
  samples: Array<{ time: number; value: number | null }>,
  x: (time: number) => number,
  y: (value: number) => number,
  gapLimit: number,
) {
  let previous: number | null = null;
  return samples
    .map((sample) => {
      if (sample.value === null) {
        previous = null;
        return '';
      }
      const command = previous === null || sample.time - previous > gapLimit ? 'M' : 'L';
      previous = sample.time;
      return `${command}${x(sample.time).toFixed(2)},${y(sample.value).toFixed(2)}`;
    })
    .join(' ');
}

export function samplePeak(values: unknown[]): number | null {
  const samples = values.map(numericSample).filter((value): value is number => value !== null);
  return samples.length ? Math.max(...samples) : null;
}
