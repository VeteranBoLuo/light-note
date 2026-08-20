<template>
  <div class="server-metric-chart">
    <div class="server-metric-chart__legend" :aria-label="t('serverManagement.historyLegend')">
      <span v-for="series in chartSeries" :key="series.key">
        <i :style="{ background: series.color }" aria-hidden="true"></i>{{ series.label }}
      </span>
    </div>
    <div v-if="hasData" class="server-metric-chart__canvas">
      <svg viewBox="0 0 720 190" role="img" :aria-label="t('serverManagement.historyChartLabel')">
        <g class="server-metric-chart__grid" aria-hidden="true">
          <line v-for="value in [0, 25, 50, 75, 100]" :key="value" x1="42" x2="708" :y1="y(value)" :y2="y(value)" />
          <text v-for="value in [0, 25, 50, 75, 100]" :key="`label-${value}`" x="34" :y="y(value) + 4">
            {{ value }}
          </text>
        </g>
        <path
          v-for="series in chartSeries"
          :key="series.key"
          class="server-metric-chart__line"
          :d="pathFor(series.key)"
          :stroke="series.color"
        />
      </svg>
    </div>
    <div v-else class="server-metric-chart__empty">
      <SvgIcon :src="icon.infrastructure.network" size="24" aria-hidden="true" />
      <span>{{ t('serverManagement.historyEmpty') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { HostAgentMetricPoint } from '@lightnote/shared/host-agent-protocol';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';

  const props = defineProps<{ points: HostAgentMetricPoint[] }>();
  const { t } = useI18n();
  type PercentKey = 'cpuPercent' | 'memoryPercent' | 'diskPercent';
  const chartSeries = computed<Array<{ key: PercentKey; label: string; color: string }>>(() => [
    { key: 'cpuPercent', label: t('serverManagement.cpu'), color: 'var(--primary-color, #615ced)' },
    { key: 'memoryPercent', label: t('serverManagement.memory'), color: 'var(--success-color, #27965b)' },
    { key: 'diskPercent', label: t('serverManagement.disk'), color: 'var(--warning-color, #ad6800)' },
  ]);
  const hasData = computed(() =>
    props.points.some((point) => chartSeries.value.some((series) => Number.isFinite(point[series.key]))),
  );

  function y(value: number) {
    return 12 + (100 - value) * 1.58;
  }

  function pathFor(key: PercentKey) {
    const count = Math.max(1, props.points.length - 1);
    let drawing = false;
    return props.points
      .map((point, index) => {
        const value = point[key];
        if (!Number.isFinite(value)) {
          drawing = false;
          return '';
        }
        const command = drawing ? 'L' : 'M';
        drawing = true;
        return `${command}${42 + (index / count) * 666},${y(Number(value))}`;
      })
      .filter(Boolean)
      .join(' ');
  }
</script>

<style scoped lang="less">
  .server-metric-chart {
    display: grid;
    min-height: 230px;
    gap: 12px;
  }
  .server-metric-chart__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    color: var(--desc-color);
    font-size: 12px;
  }
  .server-metric-chart__legend span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .server-metric-chart__legend i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .server-metric-chart__canvas {
    min-width: 0;
    overflow-x: auto;
  }
  .server-metric-chart__canvas svg {
    width: 100%;
    min-width: 560px;
    height: 190px;
    overflow: visible;
  }
  .server-metric-chart__grid line {
    stroke: var(--surface-divider-color, var(--card-border-color));
    stroke-width: 1;
  }
  .server-metric-chart__grid text {
    fill: var(--desc-color);
    font-size: 10px;
    text-anchor: end;
  }
  .server-metric-chart__line {
    fill: none;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }
  .server-metric-chart__empty {
    min-height: 170px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--desc-color);
    border: 1px dashed var(--surface-border-color);
    border-radius: 12px;
  }
  @media (max-width: 767px) {
    .server-metric-chart {
      min-height: 205px;
    }
    .server-metric-chart__canvas svg {
      min-width: 480px;
      height: 170px;
    }
  }
</style>
