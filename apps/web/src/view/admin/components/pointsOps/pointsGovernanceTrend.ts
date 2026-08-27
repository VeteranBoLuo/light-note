export interface PointsGovernanceTrendInput {
  day?: unknown;
  issued?: unknown;
  stable?: unknown;
  oneTime?: unknown;
  random?: unknown;
  operations?: unknown;
  spent?: unknown;
  net?: unknown;
}

export interface PointsGovernanceTrendPoint {
  day: string;
  label: string;
  issued: number;
  stable: number;
  oneTime: number;
  random: number;
  operations: number;
  spent: number;
  net: number;
  issuedHeight: number;
  spentHeight: number;
  netY: number;
  x: number;
}

export interface PointsGovernanceTrendChart {
  points: PointsGovernanceTrendPoint[];
  baselineY: number;
  linePoints: string;
  hasActivity: boolean;
}

function finiteNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nonNegative(value: unknown) {
  return Math.max(0, finiteNumber(value));
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function buildPointsGovernanceTrend(rows: PointsGovernanceTrendInput[] = []): PointsGovernanceTrendChart {
  const normalized = rows.map((row) => {
    const spent = nonNegative(row.spent);
    const rawNet = Number(row.net);
    const explicitIssued = Number(row.issued);
    const issued = Number.isFinite(explicitIssued)
      ? Math.max(0, explicitIssued)
      : Math.max(0, finiteNumber(rawNet) + spent);
    const net = Number.isFinite(rawNet) ? rawNet : issued - spent;
    return {
      day: String(row.day || ''),
      issued,
      stable: nonNegative(row.stable),
      oneTime: nonNegative(row.oneTime),
      random: nonNegative(row.random),
      operations: nonNegative(row.operations),
      spent,
      net,
    };
  });
  const positiveMaximum = Math.max(0, ...normalized.map((row) => row.issued));
  const negativeMaximum = Math.max(0, ...normalized.map((row) => row.spent));
  const hasActivity = positiveMaximum > 0 || negativeMaximum > 0;
  const rawSpan = positiveMaximum + negativeMaximum;
  const padding = hasActivity ? Math.max(1, rawSpan * 0.06) : 1;
  const domainMaximum = positiveMaximum + padding;
  const domainMinimum = -(negativeMaximum + padding);
  const domainSpan = domainMaximum - domainMinimum;
  const valueToY = (value: number) => clampPercent(((domainMaximum - value) / domainSpan) * 100);
  const baselineY = valueToY(0);
  const points = normalized.map((row, index) => ({
    ...row,
    label: row.day.slice(5),
    issuedHeight: (row.issued / domainSpan) * 100,
    spentHeight: (row.spent / domainSpan) * 100,
    netY: valueToY(row.net),
    x: normalized.length ? ((index + 0.5) / normalized.length) * 100 : 50,
  }));
  return {
    points,
    baselineY,
    linePoints: points.map((point) => `${point.x.toFixed(3)},${point.netY.toFixed(3)}`).join(' '),
    hasActivity,
  };
}
