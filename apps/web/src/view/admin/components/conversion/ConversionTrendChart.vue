<template>
  <div class="conversion-trend" role="img" aria-label="访问、打开注册和注册成功的每日趋势">
    <div class="conversion-trend__legend">
      <span v-for="series in seriesList" :key="series.key">
        <i :style="{ background: series.color }"></i>{{ series.label }}
      </span>
    </div>
    <div class="conversion-trend__body">
      <div class="conversion-trend__axis" aria-hidden="true">
        <span>{{ axisMax }}</span
        ><span>{{ Math.round(axisMax / 2) }}</span
        ><span>0</span>
      </div>
      <div class="conversion-trend__plot">
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
          <line v-for="y in [0, 20, 40]" :key="y" x1="0" x2="100" :y1="y" :y2="y" class="grid" />
          <polyline
            v-for="series in seriesList"
            :key="series.key"
            :points="points(series.key)"
            :style="{ stroke: series.color }"
            class="line"
          />
        </svg>
      </div>
    </div>
    <div class="conversion-trend__labels">
      <span v-for="(row, index) in rows" :key="row.d">{{ showLabel(index) ? row.d.slice(5) : '' }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';

  interface TrendRow {
    d: string;
    pv: number;
    signupOpen: number;
    reg: number;
  }

  const props = withDefaults(defineProps<{ rows?: TrendRow[] }>(), { rows: () => [] });
  const seriesList = [
    { key: 'pv' as const, label: '访问', color: 'var(--primary-color)' },
    { key: 'signupOpen' as const, label: '打开注册', color: 'var(--warning-color)' },
    { key: 'reg' as const, label: '注册成功', color: 'var(--success-color)' },
  ];
  const axisMax = computed(() => Math.max(1, ...props.rows.flatMap((row) => [row.pv, row.signupOpen, row.reg])));

  function points(key: 'pv' | 'signupOpen' | 'reg') {
    const count = props.rows.length;
    if (!count) return '';
    return props.rows
      .map((row, index) => {
        const x = count === 1 ? 50 : (index / (count - 1)) * 100;
        const y = 40 - (Math.max(0, Number(row[key]) || 0) / axisMax.value) * 40;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }

  function showLabel(index: number) {
    const count = props.rows.length;
    const step = Math.max(1, Math.ceil(count / 8));
    return index === 0 || index === count - 1 || index % step === 0;
  }
</script>

<style scoped lang="less">
  .conversion-trend {
    min-width: 0;
  }

  .conversion-trend__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 10px;
    color: var(--desc-color);
    font-size: 12px;

    span {
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }

    i {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
  }

  .conversion-trend__body {
    display: flex;
    gap: 8px;
    height: 180px;
  }

  .conversion-trend__axis {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    color: var(--desc-color);
    font-size: 10px;
    font-variant-numeric: tabular-nums;
  }

  .conversion-trend__plot {
    min-width: 0;
    flex: 1;

    svg {
      display: block;
      width: 100%;
      height: 100%;
      overflow: visible;
    }

    .grid {
      stroke: var(--surface-border-color);
      stroke-width: 1;
      vector-effect: non-scaling-stroke;
    }

    .line {
      fill: none;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
      vector-effect: non-scaling-stroke;
    }
  }

  .conversion-trend__labels {
    display: flex;
    justify-content: space-between;
    margin-top: 6px;
    padding-left: 24px;
    color: var(--desc-color);
    font-size: 10px;
  }
</style>
