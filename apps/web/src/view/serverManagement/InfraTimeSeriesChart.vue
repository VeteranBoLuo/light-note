<template>
  <section class="infra-chart">
    <div class="infra-chart__toolbar">
      <div class="infra-chart__legend"
        ><BButton
          v-for="series in seriesList"
          :key="series.key"
          size="small"
          :aria-pressed="!hidden.has(series.key)"
          :class="{ muted: hidden.has(series.key) }"
          @click="toggle(series.key)"
          ><i :style="{ background: series.color }" />{{ series.label }}</BButton
        ></div
      >
      <div class="infra-chart__ranges"
        ><BButton
          v-for="range in [15, 30, 60]"
          :key="range"
          size="small"
          :type="minutes === range ? 'primary' : undefined"
          :aria-pressed="minutes === range"
          @click="
            minutes = range;
            selected = null;
          "
          >{{ t('serverManagement.workspace.minutes', { count: range }) }}</BButton
        ></div
      >
    </div>
    <div class="infra-chart__coverage"
      >{{ t('serverManagement.workspace.coverage') }}
      {{ samples.length ? `${timeLabel(samples[0].time)} – ${timeLabel(samples[samples.length - 1].time)}` : '—'
      }}<span v-if="mode === 'io'"> · {{ t('serverManagement.workspace.peak') }} {{ formatRate(peak) }}</span></div
    >
    <div v-if="!samples.length" class="infra-chart__empty">{{ t('serverManagement.historyEmpty') }}</div>
    <div v-else-if="!hasMeasurements" class="infra-chart__empty">{{
      t('serverManagement.workspace.noMeasurements')
    }}</div>
    <div
      v-else
      ref="canvas"
      class="infra-chart__canvas"
      tabindex="0"
      role="group"
      :aria-label="t('serverManagement.workspace.chartHelp')"
      @keydown="onKey"
      @pointermove="onPointer"
      @pointerdown="onPointer"
      @pointerleave="onLeave"
      @blur="selected = null"
    >
      <svg :viewBox="`0 0 ${width} ${height}`" :style="{ height: `${height}px` }" aria-hidden="true">
        <g v-for="fraction in [0, 0.25, 0.5, 0.75, 1]" :key="fraction">
          <line :x1="left" :x2="width - right" :y1="y(maxValue * fraction)" :y2="y(maxValue * fraction)" class="grid" />
          <text :x="left - dimension(8)" :y="y(maxValue * fraction) + dimension(4)" text-anchor="end">
            {{ mode === 'io' ? formatRate(maxValue * fraction) : Math.round(100 * fraction) }}
          </text>
        </g>
        <g v-for="tick in ticks" :key="tick">
          <text
            :x="x(tick)"
            :y="height - dimension(6)"
            :text-anchor="tick === start ? 'start' : tick === end ? 'end' : 'middle'"
          >
            {{ timeLabel(tick) }}
          </text>
        </g>
        <g v-for="series in activeSeries" :key="series.key">
          <path
            :d="path(series.key)"
            fill="none"
            :stroke="series.color"
            :stroke-width="dimension(2)"
            stroke-linejoin="round"
          />
          <circle
            v-for="sample in isolatedSamples(series.key)"
            :key="sample.time"
            :cx="x(sample.time)"
            :cy="y(sampleValue(sample.point, series.key)!)"
            :r="dimension(3)"
            :fill="series.color"
          />
        </g>
        <g v-if="selectedSample">
          <line
            :x1="x(selectedSample.time)"
            :x2="x(selectedSample.time)"
            :y1="top"
            :y2="height - bottom"
            class="cursor"
          />
          <template v-for="series in activeSeries" :key="series.key">
            <circle
              v-if="sampleValue(selectedSample.point, series.key) !== null"
              :cx="x(selectedSample.time)"
              :cy="y(sampleValue(selectedSample.point, series.key)!)"
              :r="dimension(4)"
              :fill="series.color"
            />
          </template>
        </g>
      </svg>
      <aside
        v-if="selectedSample"
        class="infra-chart__tooltip"
        :style="{ left: `clamp(0px, ${x(selectedSample.time)}px, calc(100% - var(--ui-layout-200, 200px)))` }"
        aria-live="polite"
      >
        <time>{{ timeLabel(selectedSample.time, true) }}</time
        ><div v-for="series in activeSeries" :key="series.key"
          ><span><i :style="{ background: series.color }" />{{ series.label }}</span
          ><strong>{{
            mode === 'io'
              ? formatRate(sampleValue(selectedSample.point, series.key))
              : formatPercent(sampleValue(selectedSample.point, series.key))
          }}</strong></div
        >
      </aside>
    </div>
  </section>
</template>
<script setup lang="ts">
  import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { HostAgentMetricPoint } from '@lightnote/shared/host-agent-protocol';
  import { useUiDensity } from '@/composables/useUiDensity';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import { formatRate, formatPercent } from './serverManagementFormat';
  import { normalizeHistory, numericSample, historyGapLimit, timeSeriesPath, samplePeak } from './infraTimeSeries';
  const props = withDefaults(defineProps<{ points: HostAgentMetricPoint[]; mode?: 'percent' | 'io' }>(), {
    mode: 'percent',
  });
  const { t, locale } = useI18n();
  const { dimension } = useUiDensity();
  const minutes = ref(60);
  const hidden = ref(new Set<string>());
  const selected = ref<number | null>(null);
  const canvas = ref<HTMLElement | null>(null);
  const width = ref(900);
  const height = computed(() => dimension(260, 'layout'));
  const left = computed(() => dimension(props.mode === 'io' ? 80 : 38, 'layout'));
  const right = computed(() => dimension(12));
  const top = computed(() => dimension(12));
  const bottom = computed(() => dimension(30));
  const normalized = computed(() => normalizeHistory(props.points));
  const end = computed(() => normalized.value.at(-1)?.time || Date.now());
  const start = computed(() => end.value - minutes.value * 60_000);
  const samples = computed(() => normalized.value.filter((p) => p.time >= start.value));
  const seriesList = computed(() =>
    props.mode === 'io'
      ? [
          {
            key: 'diskReadBytesPerSecond',
            label: t('serverManagement.storagePage.read'),
            color: 'var(--primary-color)',
          },
          {
            key: 'diskWriteBytesPerSecond',
            label: t('serverManagement.storagePage.write'),
            color: 'var(--warning-color, #b76a00)',
          },
        ]
      : [
          { key: 'cpuPercent', label: t('serverManagement.cpu'), color: 'var(--primary-color)' },
          { key: 'memoryPercent', label: t('serverManagement.memory'), color: 'var(--success-color, #168457)' },
          { key: 'diskPercent', label: t('serverManagement.disk'), color: 'var(--warning-color, #b76a00)' },
        ],
  );
  const activeSeries = computed(() => seriesList.value.filter((s) => !hidden.value.has(s.key)));
  const peak = computed(() =>
    samplePeak(samples.value.flatMap((p) => activeSeries.value.map((series) => sampleValue(p.point, series.key)))),
  );
  const hasMeasurements = computed(() => peak.value !== null);
  const maxValue = computed(() => (props.mode === 'percent' ? 100 : Math.max(1, peak.value ?? 1)));
  const gapLimit = computed(() => historyGapLimit(normalized.value.map((p) => p.time)));
  function isolatedSamples(key: string) {
    return samples.value.filter(
      (sample, i) =>
        sampleValue(sample.point, key) !== null &&
        (!samples.value[i - 1] ||
          sampleValue(samples.value[i - 1].point, key) === null ||
          sample.time - samples.value[i - 1].time > gapLimit.value) &&
        (!samples.value[i + 1] ||
          sampleValue(samples.value[i + 1].point, key) === null ||
          samples.value[i + 1].time - sample.time > gapLimit.value),
    );
  }
  const ticks = computed(() => {
    const count = width.value < 500 ? 4 : 7;
    return Array.from({ length: count }, (_, i) => start.value + ((end.value - start.value) * i) / (count - 1));
  });
  const selectedSample = computed(() =>
    selected.value === null ? null : samples.value[Math.min(selected.value, samples.value.length - 1)],
  );
  function sampleValue(point: HostAgentMetricPoint, key: string) {
    const n = numericSample(point[key as keyof HostAgentMetricPoint]);
    return props.mode === 'percent' && n !== null ? Math.min(100, n) : n;
  }
  function x(time: number) {
    return (
      left.value +
      ((time - start.value) / (end.value - start.value)) * Math.max(1, width.value - left.value - right.value)
    );
  }
  function y(value: number) {
    return top.value + (1 - value / maxValue.value) * (height.value - top.value - bottom.value);
  }
  function path(key: string) {
    return timeSeriesPath(
      samples.value.map((p) => ({ time: p.time, value: sampleValue(p.point, key) })),
      x,
      y,
      gapLimit.value,
    );
  }
  function toggle(key: string) {
    const next = new Set(hidden.value);
    if (next.has(key)) next.delete(key);
    else if (activeSeries.value.length > 1) next.add(key);
    hidden.value = next;
  }
  function timeLabel(time: number, seconds = false) {
    return new Intl.DateTimeFormat(locale.value, {
      timeZone: 'Asia/Shanghai',
      hour: '2-digit',
      minute: '2-digit',
      ...(seconds ? { second: '2-digit' } : {}),
    }).format(time);
  }
  function onPointer(event: PointerEvent) {
    const rect = canvas.value?.getBoundingClientRect();
    if (!rect) return;
    const time =
      start.value +
      ((event.clientX - rect.left - left.value) / Math.max(1, width.value - left.value - right.value)) *
        (end.value - start.value);
    let best = 0;
    samples.value.forEach((p, i) => {
      if (Math.abs(p.time - time) < Math.abs(samples.value[best].time - time)) best = i;
    });
    selected.value = best;
  }
  function onLeave(event: PointerEvent) {
    if (event.pointerType !== 'touch') selected.value = null;
  }
  function onKey(event: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Escape') selected.value = null;
    else if (event.key === 'Home') selected.value = 0;
    else if (event.key === 'End') selected.value = samples.value.length - 1;
    else
      selected.value = Math.max(
        0,
        Math.min(samples.value.length - 1, (selected.value ?? 0) + (event.key === 'ArrowRight' ? 1 : -1)),
      );
  }
  let observer: ResizeObserver | null = null;
  onMounted(() => {
    observer = new ResizeObserver((entries) => {
      if (entries[0]) width.value = entries[0].contentRect.width;
    });
    if (canvas.value) observer.observe(canvas.value);
  });
  // Canvas can appear after the initial empty snapshot.
  watch(canvas, (element) => {
    observer?.disconnect();
    if (element) observer?.observe(element);
  });
  onBeforeUnmount(() => observer?.disconnect());
</script>
<style scoped lang="less">
  .infra-chart {
    min-width: 0;
  }
  .infra-chart__toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-12, 12px);
    flex-wrap: wrap;
  }
  .infra-chart__legend,
  .infra-chart__ranges {
    display: flex;
    gap: var(--ui-space-4, 4px);
    flex-wrap: wrap;
  }
  .infra-chart__legend :deep(button) {
    border-color: transparent;
    background: transparent;
    color: var(--desc-color);
    padding-left: 0;
  }
  .infra-chart__legend :deep(.muted) {
    opacity: 0.45;
  }
  i {
    display: inline-block;
    width: var(--ui-space-8, 8px);
    height: var(--ui-space-8, 8px);
    border-radius: 50%;
    margin-right: var(--ui-space-6, 6px);
  }
  .infra-chart__coverage {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    text-align: right;
    margin: var(--ui-space-8, 8px) 0;
  }
  .infra-chart__canvas {
    position: relative;
    min-width: 0;
    outline-offset: var(--ui-space-4, 4px);
  }
  svg {
    display: block;
    width: 100%;
    overflow: visible;
  }
  text {
    font-size: var(--ui-font-12, 12px);
    fill: var(--desc-color);
  }
  .grid {
    stroke: var(--surface-divider-color);
  }
  .cursor {
    stroke: var(--desc-color);
    stroke-dasharray: 4 3;
  }
  .infra-chart__tooltip {
    pointer-events: none;
    position: absolute;
    top: 0;
    width: var(--ui-layout-200, 200px);
    box-sizing: border-box;
    border: 1px solid var(--surface-border-color);
    background: var(--card-background);
    border-radius: 10px;
    padding: var(--ui-space-12, 12px);
    font-size: var(--ui-font-12, 12px);
    box-shadow: var(--box-shadow);
  }
  .infra-chart__tooltip time {
    color: var(--desc-color);
  }
  .infra-chart__tooltip div {
    display: flex;
    justify-content: space-between;
    gap: var(--ui-space-8, 8px);
    margin-top: var(--ui-space-6, 6px);
  }
  .infra-chart__tooltip strong {
    font-variant-numeric: tabular-nums;
  }
  .infra-chart__empty {
    min-height: var(--ui-layout-200, 200px);
    display: grid;
    place-items: center;
    color: var(--desc-color);
  }
  @media (max-width: 767px) {
    .infra-chart__coverage {
      text-align: left;
    }
    .infra-chart__ranges {
      margin-left: auto;
    }
  }
</style>
