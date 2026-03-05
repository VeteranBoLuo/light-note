<template>
  <div class="chart-grid">
    <div class="chart-card" :class="cardThemeClass">
      <div class="chart-title">{{ t('workbench.chart.trend', '近 7 天内容趋势') }}</div>
      <div v-if="loading" class="chart-skeleton"></div>
      <div v-else-if="trendData.length" ref="trendRef" class="chart-body"></div>
      <div v-else class="chart-empty">{{ t('workbench.chart.empty', '暂无数据') }}</div>
    </div>

    <div class="chart-card" :class="cardThemeClass">
      <div class="chart-title">{{ t('workbench.chart.fileType', '文件类型分布') }}</div>
      <div v-if="loading" class="chart-skeleton"></div>
      <div v-else-if="fileTypeData.length" ref="typeRef" class="chart-body"></div>
      <div v-else class="chart-empty">{{ t('workbench.chart.empty', '暂无数据') }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { Line, Pie } from '@antv/g2plot';
  import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';

  interface TrendItem {
    date: string;
    type: string;
    value: number;
  }

  interface FileTypeItem {
    type: string;
    value: number;
  }

  const props = defineProps<{
    loading: boolean;
    themeKey: string;
    trendData: TrendItem[];
    fileTypeData: FileTypeItem[];
  }>();

  const { t } = useI18n();
  const cardThemeClass = computed(() => (props.themeKey === 'night' ? 'chart-card--night' : 'chart-card--day'));
  const trendRef = ref<HTMLElement | null>(null);
  const typeRef = ref<HTMLElement | null>(null);

  let trendPlot: Line | null = null;
  let typePlot: Pie | null = null;

  function getThemeVar(name: string, fallback = '#666') {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  }

  function getColors() {
    const isNight = props.themeKey === 'night';
    if (isNight) {
      return ['#7C5CFF', '#00E5FF', '#FF6EC7', '#54F29E', '#FFC857', '#7DD3FC', '#F472B6'];
    }
    return ['#6C63FF', '#00C2FF', '#FF5FA2', '#22C55E', '#F59E0B', '#14B8A6', '#8B5CF6'];
  }

  function getCommonConfig() {
    const textColor = getThemeVar('--text-color', '#161824');
    const descColor = getThemeVar('--desc-color', '#71717a');
    const gridColor = getThemeVar('--bl-input-noBorder-bg-color', '#f4f4f5');
    const tooltipBg = props.themeKey === 'night' ? 'rgba(36, 38, 46, 0.96)' : 'rgba(255,255,255,0.98)';
    const tooltipBorder = props.themeKey === 'night' ? '#4b5563' : '#e5e7eb';
    return {
      legend: {
        position: 'top' as const,
        itemName: {
          style: {
            fill: descColor,
            fontSize: 12,
            fontWeight: 400,
          },
        },
      },
      xAxis: {
        label: {
          style: {
            fill: descColor,
            fontSize: 12,
          },
        },
        grid: {
          line: {
            style: {
              stroke: gridColor,
            },
          },
        },
      },
      yAxis: {
        label: {
          style: {
            fill: descColor,
            fontSize: 12,
          },
        },
        grid: {
          line: {
            style: {
              stroke: gridColor,
            },
          },
        },
      },
      tooltip: {
        shared: true,
        domStyles: {
          'g2-tooltip': {
            background: tooltipBg,
            color: textColor,
            border: `1px solid ${tooltipBorder}`,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          },
        },
      },
    };
  }

  function destroyAll() {
    trendPlot?.destroy();
    typePlot?.destroy();
    trendPlot = null;
    typePlot = null;
  }

  async function renderCharts() {
    destroyAll();
    if (props.loading) {
      return;
    }
    await nextTick();

    const colors = getColors();
    const common = getCommonConfig();

    if (trendRef.value && props.trendData.length) {
      trendPlot = new Line(trendRef.value, {
        data: props.trendData,
        xField: 'date',
        yField: 'value',
        seriesField: 'type',
        color: colors,
        smooth: true,
        lineStyle: {
          lineWidth: 3,
        },
        point: {
          size: 3,
          shape: 'circle',
          style: {
            lineWidth: 1,
            stroke: getThemeVar('--menu-body-bg-color', '#fff'),
          },
        },
        ...common,
      });
      trendPlot.render();
    }

    if (typeRef.value && props.fileTypeData.length) {
      const textColor = getThemeVar('--text-color', '#161824');
      const descColor = getThemeVar('--desc-color', '#71717a');
      typePlot = new Pie(typeRef.value, {
        data: props.fileTypeData,
        angleField: 'value',
        colorField: 'type',
        radius: 0.9,
        innerRadius: 0.55,
        color: colors,
        label: {
          type: 'spider',
          content: '{name}',
          style: {
            fill: descColor,
            fontSize: 12,
            fontWeight: 400,
          },
        },
        statistic: {
          title: false,
          content: {
            style: {
              whiteSpace: 'pre-wrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontSize: '13px',
              fontWeight: 600,
              color: descColor,
            },
            formatter: () => t('workbench.chart.fileType', '文件类型分布'),
          },
        },
        legend: {
          position: 'right',
          itemName: {
            style: {
              fill: descColor,
              fontSize: 12,
              fontWeight: 400,
            },
          },
        },
        interactions: [{ type: 'element-active' }],
      });
      typePlot.render();
    }
  }

  function handleResize() {
    if (trendRef.value && trendPlot) {
      trendPlot.changeSize(trendRef.value.clientWidth, trendRef.value.clientHeight);
    }
    if (typeRef.value && typePlot) {
      typePlot.changeSize(typeRef.value.clientWidth, typeRef.value.clientHeight);
    }
  }

  watch(
    () => [props.loading, props.themeKey, props.trendData, props.fileTypeData],
    () => {
      renderCharts();
    },
    { deep: true, immediate: true },
  );

  window.addEventListener('resize', handleResize);

  onBeforeUnmount(() => {
    window.removeEventListener('resize', handleResize);
    destroyAll();
  });
</script>

<style scoped lang="less">
  .chart-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .chart-card {
    position: relative;
    border-radius: 12px;
    padding: 12px;
    height: 300px;
    background: linear-gradient(150deg, var(--menu-body-bg-color), var(--bl-input-noBorder-bg-color));
    border: 1px solid var(--bl-input-noBorder-bg-color);
    box-shadow: var(--ant-table-boxShadow);
    display: flex;
    flex-direction: column;
    overflow: hidden;

    &::before {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: inherit;
      pointer-events: none;
      transition: opacity 0.2s ease;
      opacity: 0.9;
    }

    &:hover::before {
      opacity: 1;
    }
  }

  .chart-card--day {
    background:
      linear-gradient(160deg, var(--menu-body-bg-color), var(--bl-input-noBorder-bg-color)),
      linear-gradient(20deg, var(--noteType-hover-bg-color), var(--menu-body-bg-color));

    &::before {
      background:
        radial-gradient(circle at 100% 0%, rgba(108, 99, 255, 0.1), transparent 44%),
        radial-gradient(circle at 0% 100%, rgba(0, 194, 255, 0.09), transparent 50%);
    }
  }

  .chart-card--night {
    background:
      linear-gradient(155deg, var(--menu-body-bg-color), var(--bl-input-noBorder-bg-color)),
      linear-gradient(20deg, var(--noteType-hover-bg-color), var(--menu-body-bg-color));
    border-color: rgba(124, 92, 255, 0.25);
    box-shadow:
      0 0 0 1px rgba(124, 92, 255, 0.2),
      0 16px 32px rgba(0, 0, 0, 0.35);

    &::before {
      background:
        radial-gradient(circle at 100% 0%, rgba(124, 92, 255, 0.22), transparent 46%),
        radial-gradient(circle at 0% 100%, rgba(0, 229, 255, 0.16), transparent 56%);
    }
  }

  .chart-title {
    font-size: 13px;
    opacity: 0.9;
    font-weight: 600;
    position: relative;
    z-index: 1;
    padding-left: 10px;

    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 3px;
      width: 3px;
      height: 14px;
      border-radius: 999px;
      background: var(--noteType-hover-color);
    }
  }

  .chart-body {
    margin-top: 10px;
    flex: 1;
    min-height: 0;
    position: relative;
    z-index: 1;
  }

  .chart-empty {
    margin-top: 10px;
    flex: 1;
    border-radius: 10px;
    border: 1px dashed var(--bl-input-noBorder-bg-color);
    background-color: var(--bl-input-noBorder-bg-color);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    color: var(--desc-color);
    opacity: 0.9;
    position: relative;
    z-index: 1;
  }

  .chart-skeleton {
    margin-top: 10px;
    flex: 1;
    border-radius: 10px;
    background: linear-gradient(
      90deg,
      var(--bl-input-noBorder-bg-color) 20%,
      var(--skeleton-body-bg-color) 50%,
      var(--bl-input-noBorder-bg-color) 80%
    );
    background-size: 200% 100%;
    animation: workbench-chart-shine 1.2s infinite;
  }

  @keyframes workbench-chart-shine {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  @media (max-width: 1200px) {
    .chart-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
