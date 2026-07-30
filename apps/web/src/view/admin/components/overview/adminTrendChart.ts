/**
 * 后台「近 7 天新增趋势」的纯计算层。
 * 图表本身用手写 SVG(不为一张小图引入图表库),把坐标与摘要的数学放在这里以便单测覆盖。
 */

export interface AdminTrendDay {
  date?: string;
  label?: string;
  users?: number;
  bookmarks?: number;
  notes?: number;
  files?: number;
  contentTotal?: number;
  /** 旧字段,前后端部署错位时兜底 */
  d?: string;
  content?: number;
}

export interface TrendSeries {
  key: string;
  label: string;
  colorVar: string;
  values: number[];
}

export interface TrendSummary {
  sum: number;
  dailyAverage: number;
  peakValue: number;
  peakLabel: string;
}

export const CHART_VIEWBOX = { width: 100, height: 42 } as const;

export function normalizeTrendDays(rows: AdminTrendDay[] | null | undefined): Required<
  Pick<AdminTrendDay, 'label' | 'users' | 'bookmarks' | 'notes' | 'files' | 'contentTotal'>
>[] {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const bookmarks = Number(row.bookmarks || 0);
    const notes = Number(row.notes || 0);
    const files = Number(row.files || 0);
    // 旧接口只给 content 合计,拆不出构成时至少保证总量图可用
    const contentTotal = Number(row.contentTotal ?? row.content ?? bookmarks + notes + files);
    return {
      label: String(row.label || row.d || ''),
      users: Number(row.users || 0),
      bookmarks,
      notes,
      files,
      contentTotal,
    };
  });
}

/** Y 轴上界:留出 ~15% 余量并向上取整到好读的刻度,全零时给 1 以免除零。 */
export function resolveAxisMax(values: number[]): number {
  const peak = Math.max(0, ...values.map((value) => Number(value) || 0));
  if (peak <= 0) return 1;
  const padded = peak * 1.15;
  const magnitude = Math.pow(10, Math.floor(Math.log10(padded)));
  const step = padded / magnitude <= 2 ? magnitude / 2 : magnitude;
  return Math.max(1, Math.ceil(padded / step) * step);
}

/** 均分 4 段的 Y 轴刻度值,从大到小(与 SVG 自上而下的绘制顺序一致)。 */
export function buildAxisTicks(axisMax: number, segments = 4): number[] {
  const max = Math.max(1, axisMax);
  return Array.from({ length: segments + 1 }, (_, index) => {
    const value = (max / segments) * (segments - index);
    return Number(value.toFixed(2));
  });
}

export function buildLinePoints(values: number[], axisMax: number): string {
  const count = values.length;
  if (!count) return '';
  const max = Math.max(1, axisMax);
  return values
    .map((value, index) => {
      const x = count === 1 ? CHART_VIEWBOX.width / 2 : (index / (count - 1)) * CHART_VIEWBOX.width;
      const y = CHART_VIEWBOX.height - (Math.max(0, Number(value) || 0) / max) * CHART_VIEWBOX.height;
      return `${Number(x.toFixed(2))},${Number(y.toFixed(2))}`;
    })
    .join(' ');
}

/** 面积填充:折线两端垂直落到基线再闭合。 */
export function buildAreaPoints(values: number[], axisMax: number): string {
  const line = buildLinePoints(values, axisMax);
  if (!line) return '';
  const count = values.length;
  const lastX = count === 1 ? CHART_VIEWBOX.width / 2 : CHART_VIEWBOX.width;
  const firstX = count === 1 ? CHART_VIEWBOX.width / 2 : 0;
  return `${firstX},${CHART_VIEWBOX.height} ${line} ${lastX},${CHART_VIEWBOX.height}`;
}

export function summarizeSeries(values: number[], labels: string[]): TrendSummary {
  const safe = values.map((value) => Number(value) || 0);
  const sum = safe.reduce((total, value) => total + value, 0);
  let peakIndex = 0;
  safe.forEach((value, index) => {
    if (value > safe[peakIndex]) peakIndex = index;
  });
  return {
    sum,
    dailyAverage: safe.length ? Number((sum / safe.length).toFixed(1)) : 0,
    peakValue: safe.length ? safe[peakIndex] : 0,
    peakLabel: labels[peakIndex] || '',
  };
}

/** 悬浮命中区:每个数据点占据等宽一列,首尾各占半列。 */
export function buildHitAreas(count: number): { x: number; width: number }[] {
  if (count <= 0) return [];
  if (count === 1) return [{ x: 0, width: CHART_VIEWBOX.width }];
  const step = CHART_VIEWBOX.width / (count - 1);
  return Array.from({ length: count }, (_, index) => {
    const start = Math.max(0, index * step - step / 2);
    const end = Math.min(CHART_VIEWBOX.width, index * step + step / 2);
    return { x: Number(start.toFixed(2)), width: Number((end - start).toFixed(2)) };
  });
}

/** Tooltip 贴边时向内收,避免越出容器。 */
export function resolveTooltipAnchor(index: number, count: number): { left: number; align: 'start' | 'center' | 'end' } {
  if (count <= 1) return { left: 50, align: 'center' };
  const left = (index / (count - 1)) * 100;
  if (left <= 15) return { left, align: 'start' };
  if (left >= 85) return { left, align: 'end' };
  return { left, align: 'center' };
}
