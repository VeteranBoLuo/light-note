<template>
  <div class="disk-io-chart" role="img" :aria-label="t('serverManagement.storagePage.chartLabel')">
    <div class="disk-io-chart__legend">
      <span><i class="is-read"></i>{{ t('serverManagement.storagePage.read') }}</span>
      <span><i class="is-write"></i>{{ t('serverManagement.storagePage.write') }}</span>
    </div>
    <svg v-if="sampled.length > 1" viewBox="0 0 900 220" preserveAspectRatio="none" aria-hidden="true">
      <line v-for="y in [20, 110, 200]" :key="y" x1="0" :y1="y" x2="900" :y2="y" class="grid-line" />
      <path :d="readPath" class="series is-read" />
      <path :d="writePath" class="series is-write" />
    </svg>
    <div v-else class="disk-io-chart__empty">{{ t('serverManagement.historyEmpty') }}</div>
    <small v-if="sampled.length > 1">0 B/s · {{ formatRate(maxValue) }}</small>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { HostAgentMetricPoint } from '@lightnote/shared/host-agent-protocol';
  import { formatRate } from './serverManagementFormat';

  const props = defineProps<{ points: HostAgentMetricPoint[] }>();
  const { t } = useI18n();
  const sampled = computed(() => {
    const source = Array.isArray(props.points) ? props.points : [];
    if (source.length <= 180) return source;
    const step = (source.length - 1) / 179;
    return Array.from({ length: 180 }, (_, index) => source[Math.round(index * step)]).filter(Boolean);
  });
  const maxValue = computed(() =>
    Math.max(
      1,
      ...sampled.value.flatMap((point) => [
        Number(point.diskReadBytesPerSecond || 0),
        Number(point.diskWriteBytesPerSecond || 0),
      ]),
    ),
  );
  function pathFor(key: 'diskReadBytesPerSecond' | 'diskWriteBytesPerSecond') {
    return sampled.value
      .map((point, index) => {
        const x = sampled.value.length <= 1 ? 0 : (index / (sampled.value.length - 1)) * 900;
        const y = 200 - (Math.max(0, Number(point[key] || 0)) / maxValue.value) * 180;
        return `${index ? 'L' : 'M'} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');
  }
  const readPath = computed(() => pathFor('diskReadBytesPerSecond'));
  const writePath = computed(() => pathFor('diskWriteBytesPerSecond'));
</script>

<style scoped lang="less">
  .disk-io-chart {
    position: relative;
    min-height: 250px;
  }
  .disk-io-chart__legend {
    display: flex;
    gap: 16px;
    color: var(--desc-color);
    font-size: 12px;
  }
  .disk-io-chart__legend span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .disk-io-chart__legend i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #615ced;
  }
  .disk-io-chart__legend i.is-write {
    background: #e88a2e;
  }
  svg {
    width: 100%;
    height: 210px;
    margin-top: 10px;
    overflow: visible;
  }
  .grid-line {
    stroke: var(--surface-divider-color, var(--card-border-color));
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }
  .series {
    fill: none;
    stroke: #615ced;
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
  }
  .series.is-write {
    stroke: #e88a2e;
  }
  .disk-io-chart__empty {
    height: 210px;
    display: grid;
    place-items: center;
    color: var(--desc-color);
  }
  small {
    position: absolute;
    right: 0;
    top: 0;
    color: var(--desc-color);
  }
</style>
