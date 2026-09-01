<template>
  <figure
    class="organize-donut-chart"
    :class="{ 'organize-donut-chart--empty': isEmpty }"
    role="group"
    :aria-label="ariaLabel || centerLabel || undefined"
  >
    <div class="organize-donut-chart__visual">
      <svg class="organize-donut-chart__svg" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
        <circle class="organize-donut-chart__track" cx="60" cy="60" r="46" pathLength="100" />
        <circle
          v-for="segment in visibleSegments"
          :key="segment.key"
          class="organize-donut-chart__segment"
          cx="60"
          cy="60"
          r="46"
          pathLength="100"
          :style="{
            stroke: segment.color,
            strokeDasharray: `${segment.arcLength} ${100 - segment.arcLength}`,
            strokeDashoffset: `${-segment.offset}`,
          }"
          :data-segment-key="segment.key"
        />
      </svg>

      <div class="organize-donut-chart__center">
        <strong :title="centerValueTitle">{{ displayedCenterValue }}</strong>
        <span v-if="centerLabel">{{ centerLabel }}</span>
      </div>
    </div>

    <ul v-if="normalizedItems.length" class="organize-donut-chart__legend">
      <li v-for="item in normalizedItems" :key="item.key" class="organize-donut-chart__legend-item">
        <span
          class="organize-donut-chart__legend-dot"
          :style="{ backgroundColor: item.color }"
          aria-hidden="true"
        ></span>
        <span class="organize-donut-chart__legend-label">{{ item.label }}</span>
        <span class="organize-donut-chart__legend-value" :title="formatFullCount(item.value)">
          {{ formatCount(item.value) }}
        </span>
        <span class="organize-donut-chart__legend-percent">{{ formatPercent(item.ratio) }}</span>
      </li>
    </ul>
    <figcaption v-if="isEmpty && emptyLabel" class="organize-donut-chart__mobile-empty">
      {{ emptyLabel }}
    </figcaption>
  </figure>
</template>

<script setup lang="ts">
  import { computed } from 'vue';

  export interface OrganizeDonutChartItem {
    key: string;
    label: string;
    value: number;
    color: string;
  }

  interface NormalizedItem extends OrganizeDonutChartItem {
    ratio: number;
  }

  interface DonutSegment extends NormalizedItem {
    arcLength: number;
    offset: number;
  }

  const props = withDefaults(
    defineProps<{
      total?: number | null;
      items: OrganizeDonutChartItem[];
      centerLabel?: string;
      centerValue?: string | number;
      emptyLabel?: string;
      ariaLabel?: string;
    }>(),
    {
      total: null,
      centerLabel: '',
      centerValue: undefined,
      emptyLabel: '',
      ariaLabel: '',
    },
  );

  const MAX_DISPLAY_COUNT = Number.MAX_SAFE_INTEGER;
  const FALLBACK_COLOR = 'var(--primary-color)';

  function normalizeCount(value: unknown) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.min(parsed, MAX_DISPLAY_COUNT);
  }

  function normalizeText(value: unknown, fallback: string) {
    const text = String(value ?? '').trim();
    return text || fallback;
  }

  function createNumberFormatter(options: Intl.NumberFormatOptions) {
    try {
      return new Intl.NumberFormat(undefined, options);
    } catch {
      return new Intl.NumberFormat('zh-CN', options);
    }
  }

  const compactNumberFormatter = createNumberFormatter({
    notation: 'compact',
    maximumFractionDigits: 1,
  });
  const fullNumberFormatter = createNumberFormatter({ maximumFractionDigits: 2 });
  const percentFormatter = createNumberFormatter({
    style: 'percent',
    maximumFractionDigits: 1,
  });

  const preparedItems = computed(() =>
    (Array.isArray(props.items) ? props.items : []).map((item, index) => ({
      key: normalizeText(item?.key, `segment-${index}`),
      label: normalizeText(item?.label, '—'),
      value: normalizeCount(item?.value),
      color: normalizeText(item?.color, FALLBACK_COLOR),
    })),
  );

  const itemTotal = computed(() => {
    const sum = preparedItems.value.reduce((total, item) => total + item.value, 0);
    return Number.isFinite(sum) ? sum : MAX_DISPLAY_COUNT;
  });

  // total 是权威分母；若调用方传入的 total 缺失或小于互斥分项之和，
  // 回退到分项总和，避免环段超过 100% 或产生无效 SVG 数值。
  const chartTotal = computed(() => Math.max(normalizeCount(props.total), itemTotal.value));
  const isEmpty = computed(() => chartTotal.value <= 0);

  const normalizedItems = computed<NormalizedItem[]>(() =>
    preparedItems.value.map((item) => ({
      ...item,
      ratio: chartTotal.value > 0 ? item.value / chartTotal.value : 0,
    })),
  );

  const visibleSegments = computed<DonutSegment[]>(() => {
    let offset = 0;
    return normalizedItems.value.flatMap((item) => {
      if (item.ratio <= 0) return [];
      const arcLength = Math.min(100, Math.max(0, item.ratio * 100));
      const segment = { ...item, arcLength, offset };
      offset = Math.min(100, offset + arcLength);
      return [segment];
    });
  });

  function formatCount(value: number) {
    return compactNumberFormatter.format(normalizeCount(value));
  }

  function formatFullCount(value: number) {
    return fullNumberFormatter.format(normalizeCount(value));
  }

  function formatPercent(ratio: number) {
    if (!Number.isFinite(ratio) || ratio <= 0) return percentFormatter.format(0);
    if (ratio < 0.001) return '<0.1%';
    return percentFormatter.format(Math.min(ratio, 1));
  }

  const displayedCenterValue = computed(() => {
    if (isEmpty.value) {
      if (props.emptyLabel) return props.emptyLabel;
      if (props.centerValue !== undefined && props.centerValue !== null) return String(props.centerValue);
      return formatCount(0);
    }
    if (props.centerValue !== undefined && props.centerValue !== null) return String(props.centerValue);
    return formatCount(chartTotal.value);
  });

  const centerValueTitle = computed(() =>
    props.centerValue === undefined || props.centerValue === null
      ? formatFullCount(chartTotal.value)
      : String(props.centerValue),
  );
</script>

<style scoped lang="less">
  .organize-donut-chart {
    width: 100%;
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
    align-items: center;
    gap: 18px;
    margin: 0;
    color: var(--text-color);
  }

  .organize-donut-chart__visual {
    width: min(100%, 174px);
    aspect-ratio: 1;
    position: relative;
    justify-self: center;
  }

  .organize-donut-chart__svg {
    width: 100%;
    height: 100%;
    display: block;
    overflow: visible;
    transform: rotate(-90deg);
  }

  .organize-donut-chart__track,
  .organize-donut-chart__segment {
    fill: none;
    stroke-width: 10;
  }

  .organize-donut-chart__track {
    stroke: var(--surface-divider-color, var(--surface-border-color));
  }

  .organize-donut-chart__segment {
    stroke-linecap: butt;
    transition:
      stroke-dasharray 0.24s ease,
      stroke-dashoffset 0.24s ease,
      stroke 0.18s ease;
  }

  .organize-donut-chart__center {
    position: absolute;
    inset: 27%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 2px;
    border-radius: 50%;
    color: var(--text-color);
    text-align: center;
    pointer-events: none;
  }

  .organize-donut-chart__center strong {
    max-width: 100%;
    overflow: hidden;
    font-size: clamp(20px, 2.4vw, 28px);
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .organize-donut-chart__center span {
    max-width: 100%;
    overflow: hidden;
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .organize-donut-chart__legend {
    min-width: 0;
    display: grid;
    gap: 9px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .organize-donut-chart__legend-item {
    min-width: 0;
    display: grid;
    grid-template-columns: 9px minmax(0, 1fr) auto minmax(42px, auto);
    align-items: center;
    gap: 8px;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.35;
  }

  .organize-donut-chart__legend-dot {
    width: 8px;
    height: 8px;
    border: 1px solid var(--workspace-panel-bg-color, var(--card-background));
    border-radius: 50%;
    box-shadow: 0 0 0 1px var(--surface-border-color);
  }

  .organize-donut-chart__legend-label {
    min-width: 0;
    overflow: hidden;
    color: var(--text-color);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .organize-donut-chart__legend-value,
  .organize-donut-chart__legend-percent {
    font-variant-numeric: tabular-nums;
    text-align: right;
    white-space: nowrap;
  }

  .organize-donut-chart__legend-value {
    color: var(--text-color);
    font-weight: 650;
  }

  .organize-donut-chart__legend-percent {
    color: var(--desc-color);
  }

  .organize-donut-chart--empty .organize-donut-chart__track {
    stroke: var(--surface-border-color);
  }

  .organize-donut-chart__mobile-empty {
    display: none;
    color: var(--desc-color);
    font-size: 12px;
    text-align: center;
  }

  @media (max-width: 767px) {
    .organize-donut-chart__mobile-empty {
      display: block;
      grid-column: 1 / -1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .organize-donut-chart__segment {
      transition: none;
    }
  }

  :global(html.light-note-mobile-rendering .organize-donut-chart__legend-dot) {
    box-shadow: none;
  }
</style>
