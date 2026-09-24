export interface TrendPoint {
  day: string;
  count: number;
}
const dayMs = 86400000;
export function buildTrend(points: TrendPoint[], from = '', to = '') {
  const values = points
    .map((p) => ({ day: String(p.day).slice(0, 10), count: Number(p.count) || 0 }))
    .sort((a, b) => a.day.localeCompare(b.day));
  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const start = Date.parse(from || values[0]?.day || today);
  const end = Date.parse(to || values[values.length - 1]?.day || from || today);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return [];
  // Bound chart complexity while retaining every submission in explicitly labelled date intervals.
  const step = Math.max(1, Math.ceil(((end - start) / dayMs + 1) / 31));
  const bins = Array.from({ length: Math.ceil(((end - start) / dayMs + 1) / step) }, (_, i) => {
    const a = new Date(start + i * step * dayMs).toISOString().slice(0, 10);
    const b = new Date(Math.min(end, start + ((i + 1) * step - 1) * dayMs)).toISOString().slice(0, 10);
    return { day: a, end: b, label: a === b ? a : `${a} – ${b}`, count: 0 };
  });
  for (const point of values) {
    const index = Math.floor((Date.parse(point.day) - start) / dayMs / step);
    if (index >= 0 && index < bins.length && Date.parse(point.day) <= end) bins[index].count += point.count;
  }
  return bins;
}
