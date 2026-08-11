<template>
  <div class="chart-grid">
    <article class="chart-card chart-card--trend" :class="cardThemeClass">
      <header class="chart-header">
        <div class="chart-heading-copy">
          <h2>{{ trendTitle }}</h2>
          <p>{{ trendHint }}</p>
        </div>
        <BTabs
          v-model:active-tab="activeTrendRange"
          class="trend-range-tabs"
          variant="segment"
          :options="trendRangeOptions"
          @change="handleTrendRangeChange"
        />
      </header>

      <div v-if="loading" class="chart-skeleton chart-skeleton--trend"></div>
      <div v-else-if="visibleTrendData.length" class="trend-content">
        <div class="trend-summary-grid">
          <div
            v-for="item in trendSummaryItems"
            :key="item.key"
            class="trend-summary-card"
            :class="`trend-summary-card--${item.key}`"
          >
            <span class="trend-summary-icon" aria-hidden="true">
              <SvgIcon :src="item.icon" size="22" />
            </span>
            <span class="trend-summary-copy">
              <span>{{ item.label }}</span>
              <strong>+{{ item.value }}</strong>
            </span>
          </div>
        </div>

        <div ref="trendRef" class="chart-body trend-plot">
          <span class="trend-axis-label">{{ t('workbench.chart.quantity') }}</span>
          <canvas ref="trendCanvasRef" class="trend-canvas"></canvas>
          <canvas
            v-if="!prefersReducedMotion"
            ref="trendMotionCanvasRef"
            class="trend-motion-canvas"
            aria-hidden="true"
          ></canvas>
          <div class="trend-legend">
            <span v-for="item in trendLegendItems" :key="item.type" class="trend-legend-item">
              <span class="trend-legend-line" :style="{ backgroundColor: item.color }"></span>
              <span>{{ item.type }}</span>
            </span>
          </div>
          <div
            v-if="trendTooltip.visible"
            class="trend-tooltip"
            :style="{ left: `${trendTooltip.x}px`, top: `${trendTooltip.y}px` }"
          >
            <div class="trend-tooltip-date">{{ trendTooltip.date }}</div>
            <div v-for="item in trendTooltip.items" :key="item.type" class="trend-tooltip-row">
              <span class="trend-tooltip-dot" :style="{ backgroundColor: item.color }"></span>
              <span>{{ item.type }}</span>
              <strong>{{ item.value }}</strong>
            </div>
          </div>
        </div>

        <div v-if="trendInsight" class="trend-insight" role="status">
          <span class="trend-insight-icon" aria-hidden="true">
            <SvgIcon :src="trendInsight.icon" size="17" />
          </span>
          <span>
            <strong>{{ t('workbench.chart.insightLeader', { type: trendInsight.type }) }}</strong>
            {{
              t('workbench.chart.insightChange', {
                start: trendInsight.start,
                end: trendInsight.end,
              })
            }}
          </span>
        </div>
      </div>
      <div v-else class="chart-empty">{{ t('workbench.chart.empty', '暂无数据') }}</div>
    </article>

    <article class="chart-card chart-card--type" :class="cardThemeClass">
      <header class="chart-header">
        <div class="chart-heading-copy">
          <h2>{{ t('workbench.chart.fileType', '文件类型分布') }}</h2>
          <p>{{ t('workbench.chart.fileTypeHint') }}</p>
        </div>
      </header>
      <div v-if="loading" class="chart-skeleton"></div>
      <div v-else-if="fileTypeData.length" ref="typeRef" class="chart-body type-plot">
        <canvas ref="typeCanvasRef" class="type-canvas"></canvas>
        <div class="type-center">
          <div class="type-center-value">{{ fileTypeTotal }}</div>
          <div class="type-center-label">{{ t('workbench.chart.fileTotal', '文件总数') }}</div>
        </div>
        <div class="type-legend">
          <div v-for="item in displayedFileTypeLegendItems" :key="item.type" class="type-legend-item">
            <span class="type-legend-dot" :style="{ backgroundColor: item.color }"></span>
            <span class="type-legend-label">{{ item.type }}</span>
            <strong>{{ item.value }}</strong>
            <span>{{ item.percent }}%</span>
          </div>
        </div>
        <div
          v-if="typeTooltip.visible"
          class="trend-tooltip type-tooltip"
          :style="{ left: `${typeTooltip.x}px`, top: `${typeTooltip.y}px` }"
        >
          <div class="trend-tooltip-date">{{ typeTooltip.type }}</div>
          <div class="trend-tooltip-row">
            <span class="trend-tooltip-dot" :style="{ backgroundColor: typeTooltip.color }"></span>
            <span>{{ t('workbench.chart.count', '数量') }}</span>
            <strong>{{ typeTooltip.value }}</strong>
          </div>
          <div class="trend-tooltip-row">
            <span class="trend-tooltip-dot" :style="{ backgroundColor: typeTooltip.color }"></span>
            <span>{{ t('workbench.chart.percent', '占比') }}</span>
            <strong>{{ typeTooltip.percent }}%</strong>
          </div>
        </div>
      </div>
      <div v-else class="chart-empty chart-empty--file">
        <span class="chart-empty__icon" aria-hidden="true">
          <SvgIcon :src="icon.resource.file" size="24" />
        </span>
        <strong>{{ t('workbench.chart.fileEmptyTitle') }}</strong>
        <span>{{ t('workbench.chart.fileEmptyDesc') }}</span>
        <BButton type="primary" size="small" class="chart-empty__action" @click="emit('openFiles')">
          <SvgIcon :src="icon.file_upload" size="15" aria-hidden="true" />
          {{ t('workbench.chart.fileEmptyAction') }}
        </BButton>
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { FILE_TYPE_COLOR_HEX, RESOURCE_COLOR_CSS_VAR, RESOURCE_COLOR_HEX } from '@/config/resourceColor';
  import {
    getTrendMotionDirection,
    getTrendMotionPhase,
    getTrendMotionPoint,
    getTrendMotionProgress,
    getTrendSummaryTiming,
    TREND_CANVAS_KEYFRAMES,
    TREND_CANVAS_TIMING,
    TREND_MOTION_ONE_WAY_DURATION,
    TREND_MOTION_START_DELAY,
    TREND_SUMMARY_KEYFRAMES,
  } from './workbenchTrendAnimation';
  import { filterTrendDataByRange, type TrendRange } from './workbenchTrendRange';

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
  const emit = defineEmits<{ openFiles: [] }>();

  const { t } = useI18n();
  const activeTrendRange = ref<TrendRange>('sevenDays');
  const trendRangeOptions = computed(() => [
    { key: 'sevenDays', label: t('workbench.chart.rangeSevenDays') },
    { key: 'month', label: t('workbench.chart.rangeMonth') },
  ]);
  const trendTitle = computed(() =>
    activeTrendRange.value === 'month' ? t('workbench.chart.trendMonth') : t('workbench.chart.trendSevenDays'),
  );
  const trendHint = computed(() =>
    activeTrendRange.value === 'month'
      ? t('workbench.chart.trendHintMonth')
      : t('workbench.chart.trendHintSevenDays'),
  );
  const cardThemeClass = computed(() => (props.themeKey === 'night' ? 'chart-card--night' : 'chart-card--day'));
  const trendRef = ref<HTMLElement | null>(null);
  const trendCanvasRef = ref<HTMLCanvasElement | null>(null);
  const trendMotionCanvasRef = ref<HTMLCanvasElement | null>(null);
  const typeRef = ref<HTMLElement | null>(null);
  const typeCanvasRef = ref<HTMLCanvasElement | null>(null);

  let trendCanvasAnimation: Animation | null = null;
  let trendSummaryAnimations: Animation[] = [];
  let trendEntryAnimationPlayed = false;
  let trendMotionFrameId: number | null = null;
  let trendMotionStartedAt = 0;
  let trendMotionLastFrameAt = 0;
  let trendMotionPhase = 0;
  let trendMotionProgress = 0;
  let trendMotionDirection: 1 | -1 = 1;
  let trendMotionWasHovering = false;
  let trendMotionHoverTarget: number | null = null;
  let trendMotionWidth = 0;
  let trendMotionHeight = 0;
  let trendMotionPointBackground = '#fff';
  let trendMotionTracks: Array<{ color: string; points: Array<{ x: number; y: number }> }> = [];
  let typeFrameId: number | null = null;
  let trendResizeObserver: ResizeObserver | null = null;
  let typeResizeObserver: ResizeObserver | null = null;
  let chartVisibilityObserver: IntersectionObserver | null = null;
  let trendEventTarget: HTMLElement | null = null;
  let typeEventTarget: HTMLElement | null = null;
  let trendIsVisible = true;
  let typeIsVisible = true;
  let lastTypeFrameAt = 0;
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  const TYPE_CHART_FRAME_INTERVAL = 48;
  const TYPE_LEGEND_WIDTH = 136;
  const TREND_PLOT_TOP = 30;
  const TREND_PLOT_RIGHT = 16;
  const TREND_PLOT_BOTTOM = 48;
  const TREND_PLOT_LEFT = 42;
  const TREND_TOOLTIP_WIDTH = 146;

  const trendTooltip = reactive({
    visible: false,
    index: -1,
    x: 0,
    y: 0,
    date: '',
    items: [] as Array<{ type: string; value: number; color: string }>,
  });

  const typeTooltip = reactive({
    visible: false,
    x: 0,
    y: 0,
    type: '',
    value: 0,
    percent: 0,
    color: '',
  });

  function getThemeVar(name: string, fallback = '#666') {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  }

  function getFileTypeColorMap() {
    return {
      [t('cloudSpace.image', '图片')]: FILE_TYPE_COLOR_HEX.image,
      [t('cloudSpace.video', '视频')]: FILE_TYPE_COLOR_HEX.video,
      [t('cloudSpace.audio', '音频')]: FILE_TYPE_COLOR_HEX.audio,
      [t('cloudSpace.pdf', 'PDF')]: FILE_TYPE_COLOR_HEX.pdf,
      [t('cloudSpace.word', 'Word')]: FILE_TYPE_COLOR_HEX.word,
      [t('cloudSpace.excel', 'Excel')]: FILE_TYPE_COLOR_HEX.excel,
      [t('cloudSpace.ppt', 'PPT')]: FILE_TYPE_COLOR_HEX.ppt,
      [t('cloudSpace.text', '文本')]: FILE_TYPE_COLOR_HEX.text,
      [t('cloudSpace.compress', '压缩包')]: FILE_TYPE_COLOR_HEX.compress,
      [t('cloudSpace.other', '其他')]: FILE_TYPE_COLOR_HEX.other,
    };
  }

  function getTrendColorMap() {
    return {
      [t('workbench.chart.bookmark', '书签')]: getThemeVar(
        RESOURCE_COLOR_CSS_VAR.bookmark,
        RESOURCE_COLOR_HEX.bookmark,
      ),
      [t('workbench.chart.note', '笔记')]: getThemeVar(RESOURCE_COLOR_CSS_VAR.note, RESOURCE_COLOR_HEX.note),
      [t('workbench.chart.file', '文件')]: getThemeVar(RESOURCE_COLOR_CSS_VAR.file, RESOURCE_COLOR_HEX.file),
      [t('workbench.chart.tag', '标签')]: getThemeVar(RESOURCE_COLOR_CSS_VAR.tag, RESOURCE_COLOR_HEX.tag),
    };
  }

  const visibleTrendData = computed(() => filterTrendDataByRange(props.trendData, activeTrendRange.value));

  const trendSummaryItems = computed(() => {
    const configs = [
      { key: 'bookmark', label: t('workbench.chart.bookmark'), icon: icon.resource.bookmark },
      { key: 'note', label: t('workbench.chart.note'), icon: icon.resource.note },
      { key: 'file', label: t('workbench.chart.file'), icon: icon.resource.file },
    ];
    return configs.map((config) => ({
      ...config,
      value: visibleTrendData.value
        .filter((item) => item.type === config.label)
        .reduce((sum, item) => sum + Number(item.value || 0), 0),
    }));
  });

  const trendInsight = computed(() => {
    const dates = Array.from(new Set(visibleTrendData.value.map((item) => item.date)));
    if (dates.length < 2) return null;
    const leader = [...trendSummaryItems.value].sort((a, b) => b.value - a.value)[0];
    if (!leader || leader.value <= 0) return null;
    const values = dates.map(
      (date) => visibleTrendData.value.find((item) => item.date === date && item.type === leader.label)?.value || 0,
    );
    let strongestIndex = 1;
    let strongestChange = Number(values[1] || 0) - Number(values[0] || 0);
    for (let index = 2; index < values.length; index += 1) {
      const change = Number(values[index] || 0) - Number(values[index - 1] || 0);
      if (change > strongestChange) {
        strongestChange = change;
        strongestIndex = index;
      }
    }
    return {
      type: leader.label,
      icon: leader.icon,
      start: dates[strongestIndex - 1],
      end: dates[strongestIndex],
    };
  });

  const trendLegendItems = computed(() => {
    const colorMap = getTrendColorMap();
    return Array.from(new Set(visibleTrendData.value.map((item) => item.type))).map((type) => ({
      type,
      color: colorMap[type] || RESOURCE_COLOR_HEX.bookmark,
    }));
  });

  const fileTypeTotal = computed(() => props.fileTypeData.reduce((sum, item) => sum + Number(item.value || 0), 0));

  const fileTypeLegendItems = computed(() => {
    const colorMap = getFileTypeColorMap();
    const total = Math.max(fileTypeTotal.value, 1);
    return props.fileTypeData
      .map((item) => ({
        type: item.type,
        value: Number(item.value || 0),
        color: colorMap[item.type] || FILE_TYPE_COLOR_HEX.other,
        percent: Math.round((Number(item.value || 0) / total) * 100),
      }))
      .sort((a, b) => b.value - a.value);
  });
  const displayedFileTypeLegendItems = computed(() => fileTypeLegendItems.value.slice(0, 6));

  function destroyAll() {
    stopTrendAnimation();
    stopTypeAnimation();
  }

  function destroyTrend() {
    stopTrendAnimation();
  }

  function destroyType() {
    stopTypeAnimation();
    typeTooltip.visible = false;
  }

  async function syncCharts() {
    if (props.loading) {
      destroyAll();
      return;
    }
    await nextTick();

    if (trendRef.value && trendCanvasRef.value && visibleTrendData.value.length) {
      startTrendAnimation();
    } else {
      destroyTrend();
    }

    if (typeRef.value && typeCanvasRef.value && props.fileTypeData.length) {
      startTypeAnimation();
    } else {
      destroyType();
    }
  }

  function handleTrendRangeChange() {
    void syncCharts();
  }

  function handleResize() {
    drawTrend();
    prepareTrendMotionTracks();
    drawType(performance.now());
  }

  function getTypeCenterX(width: number) {
    return Math.max(72, (width - TYPE_LEGEND_WIDTH) / 2);
  }

  function buildTrendSeries() {
    const colorMap = getTrendColorMap();
    const dates = Array.from(new Set(visibleTrendData.value.map((item) => item.date)));
    const types = Array.from(new Set(visibleTrendData.value.map((item) => item.type)));
    const valueMap = new Map(
      visibleTrendData.value.map((item) => [`${item.date}__${item.type}`, Number(item.value || 0)]),
    );
    const rawMaxValue = Math.max(...visibleTrendData.value.map((item) => Number(item.value || 0)), 1);
    const maxValue = Math.max(4, Math.ceil(rawMaxValue / 4) * 4);
    return {
      dates,
      types,
      colorMap,
      maxValue,
      series: types.map((type) => ({
        type,
        color: colorMap[type] || RESOURCE_COLOR_HEX.bookmark,
        values: dates.map((date) => valueMap.get(`${date}__${type}`) || 0),
      })),
    };
  }

  function hexToRgba(color: string, alpha: number) {
    if (!color.startsWith('#')) return color;
    const normalized =
      color.length === 4 ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}` : color;
    const value = Number.parseInt(normalized.slice(1), 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function drawTrendPath(ctx: CanvasRenderingContext2D, points: Array<{ x: number; y: number }>) {
    if (!points.length) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 0; i < points.length - 1; i += 1) {
      // 工作台数据经常出现 0 → 峰值 → 0。旧的贝塞尔控制点会越过相邻日期，
      // 在低点处画出回勾；这里使用稳定的日期折线，保证每个点都严格落在对应日期。
      ctx.lineTo(points[i + 1].x, points[i + 1].y);
    }
  }

  function drawTrend() {
    const canvas = trendCanvasRef.value;
    const container = trendRef.value;
    if (!canvas || !container || !visibleTrendData.value.length) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    if (!width || !height) return;

    if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const top = TREND_PLOT_TOP;
    const right = TREND_PLOT_RIGHT;
    const bottom = TREND_PLOT_BOTTOM;
    const left = TREND_PLOT_LEFT;
    const plotWidth = Math.max(width - left - right, 1);
    const plotHeight = Math.max(height - top - bottom, 1);
    const { dates, series, maxValue } = buildTrendSeries();
    const activeIndex =
      trendTooltip.visible && trendTooltip.index >= 0 && trendTooltip.index < dates.length ? trendTooltip.index : -1;
    const axisTextColor = getThemeVar('--workbench-chart-axis-text', '#626a7a');
    const gridColor = getThemeVar('--workbench-chart-grid-line', '#e2e6f0');
    const axisLineColor = getThemeVar('--workbench-chart-axis-line', '#aeb7ca');
    const primaryColor = getThemeVar('--primary-color', '#615ced');
    const pointBackground = getThemeVar('--menu-body-bg-color', '#fff');
    const labelStep = dates.length > 20 ? 5 : dates.length > 10 ? 3 : dates.length > 7 ? 2 : 1;

    ctx.lineWidth = 1;
    ctx.strokeStyle = gridColor;
    for (let i = 0; i < 4; i += 1) {
      const y = top + (plotHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + plotWidth, y);
      ctx.stroke();
    }

    // 横纵轴使用独立实色，并给日期补短刻度；深色模式下不再依赖低对比度网格猜测横轴位置。
    ctx.beginPath();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = axisLineColor;
    ctx.moveTo(left, top);
    ctx.lineTo(left, top + plotHeight);
    ctx.lineTo(left + plotWidth, top + plotHeight);
    ctx.stroke();

    dates.forEach((_date, index) => {
      const isRegularTick = index === dates.length - 1 || index % labelStep === 0;
      if (!isRegularTick) return;
      const x = left + (dates.length === 1 ? plotWidth / 2 : (plotWidth / (dates.length - 1)) * index);
      ctx.beginPath();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = axisLineColor;
      ctx.moveTo(x, top + plotHeight);
      ctx.lineTo(x, top + plotHeight + 5);
      ctx.stroke();
    });

    ctx.fillStyle = axisTextColor;
    ctx.font = '500 11px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i += 1) {
      const value = Math.round(maxValue - (maxValue / 4) * i);
      ctx.fillText(String(value), left - 10, top + (plotHeight / 4) * i);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    dates.forEach((date, index) => {
      const isActive = index === activeIndex;
      const isRegularLabel = index === dates.length - 1 || index % labelStep === 0;
      const isTooCloseToActive = activeIndex >= 0 && Math.abs(index - activeIndex) <= 1;
      if (!isActive && (!isRegularLabel || isTooCloseToActive)) return;
      const x = left + (dates.length === 1 ? plotWidth / 2 : (plotWidth / (dates.length - 1)) * index);
      ctx.fillStyle = isActive ? primaryColor : axisTextColor;
      ctx.font = isActive ? '700 11px sans-serif' : '500 11px sans-serif';
      ctx.fillText(date, x, top + plotHeight + 11);
    });

    const activePoints: Array<{ x: number; y: number; color: string }> = [];
    series.forEach((line) => {
      const points = line.values.map((value, index) => ({
        x: left + (dates.length === 1 ? plotWidth / 2 : (plotWidth / (dates.length - 1)) * index),
        y: top + plotHeight - (Number(value || 0) / maxValue) * plotHeight,
        value,
      }));
      if (!points.length) return;

      const fillGradient = ctx.createLinearGradient(0, top, 0, top + plotHeight);
      fillGradient.addColorStop(0, hexToRgba(line.color, props.themeKey === 'night' ? 0.16 : 0.12));
      fillGradient.addColorStop(1, hexToRgba(line.color, 0.01));

      drawTrendPath(ctx, points);
      ctx.lineTo(points[points.length - 1].x, top + plotHeight);
      ctx.lineTo(points[0].x, top + plotHeight);
      ctx.closePath();
      ctx.fillStyle = fillGradient;
      ctx.fill();

      drawTrendPath(ctx, points);
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = line.color;
      ctx.stroke();

      const activePoint = activeIndex >= 0 && prefersReducedMotion ? points[activeIndex] : null;
      if (activePoint) activePoints.push({ x: activePoint.x, y: activePoint.y, color: line.color });
    });

    if (activeIndex >= 0) {
      const activeX = left + (dates.length === 1 ? plotWidth / 2 : (plotWidth / (dates.length - 1)) * activeIndex);
      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.globalAlpha = props.themeKey === 'night' ? 0.72 : 0.5;
      ctx.lineWidth = 1;
      ctx.strokeStyle = primaryColor;
      ctx.moveTo(activeX, top);
      ctx.lineTo(activeX, top + plotHeight);
      ctx.stroke();
      ctx.restore();

      activePoints.forEach((point) => {
        ctx.beginPath();
        ctx.fillStyle = pointBackground;
        ctx.strokeStyle = point.color;
        ctx.lineWidth = 2.5;
        ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.fillStyle = point.color;
        ctx.arc(point.x, point.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }

  function startTrendAnimation() {
    stopTrendAnimation();
    drawTrend();
    if (prefersReducedMotion) return;
    if (!trendEntryAnimationPlayed) {
      const canvas = trendCanvasRef.value;
      if (!canvas) return;
      trendEntryAnimationPlayed = true;
      canvas.dataset.motionState = 'running';
      trendCanvasAnimation = canvas.animate(TREND_CANVAS_KEYFRAMES, TREND_CANVAS_TIMING);
      const activeAnimation = trendCanvasAnimation;
      activeAnimation.onfinish = () => {
        if (trendCanvasAnimation !== activeAnimation) return;
        canvas.dataset.motionState = 'finished';
        trendCanvasAnimation = null;
      };
      const summaryCards = trendRef.value
        ?.closest('.trend-content')
        ?.querySelectorAll<HTMLElement>('.trend-summary-card');
      trendSummaryAnimations = Array.from(summaryCards || []).map((card, index) =>
        card.animate(TREND_SUMMARY_KEYFRAMES, getTrendSummaryTiming(index)),
      );
    }
    startTrendMotionAnimation();
  }

  function stopTrendAnimation() {
    if (trendCanvasRef.value) delete trendCanvasRef.value.dataset.motionState;
    trendCanvasAnimation?.cancel();
    trendCanvasAnimation = null;
    trendSummaryAnimations.forEach((animation) => animation.cancel());
    trendSummaryAnimations = [];
    stopTrendMotionAnimation();
    trendTooltip.visible = false;
    trendTooltip.index = -1;
  }

  function prepareTrendMotionTracks() {
    const canvas = trendMotionCanvasRef.value;
    const container = trendRef.value;
    if (!canvas || !container || !visibleTrendData.value.length) {
      trendMotionTracks = [];
      return;
    }

    const metrics = getCanvasMetrics(canvas, container);
    if (!metrics) {
      trendMotionTracks = [];
      return;
    }

    const { width, height } = metrics;
    const plotWidth = Math.max(width - TREND_PLOT_LEFT - TREND_PLOT_RIGHT, 1);
    const plotHeight = Math.max(height - TREND_PLOT_TOP - TREND_PLOT_BOTTOM, 1);
    const { dates, series, maxValue } = buildTrendSeries();
    trendMotionWidth = width;
    trendMotionHeight = height;
    trendMotionPointBackground = getThemeVar('--menu-body-bg-color', '#fff');
    trendMotionTracks = series.map((line) => ({
      color: line.color,
      points: line.values.map((value, index) => ({
        x: TREND_PLOT_LEFT + (dates.length === 1 ? plotWidth / 2 : (plotWidth / Math.max(dates.length - 1, 1)) * index),
        y: TREND_PLOT_TOP + plotHeight - (Number(value || 0) / maxValue) * plotHeight,
      })),
    }));
  }

  function drawTrendMotion(time: number) {
    const canvas = trendMotionCanvasRef.value;
    const container = trendRef.value;
    if (!canvas || !container) return;
    if (trendMotionWidth !== container.clientWidth || trendMotionHeight !== container.clientHeight) {
      prepareTrendMotionTracks();
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, trendMotionWidth, trendMotionHeight);
    if (!trendMotionTracks.length) return;

    const frameDelta = trendMotionLastFrameAt ? Math.min(time - trendMotionLastFrameAt, 64) : 0;
    trendMotionLastFrameAt = time;
    const pointCount = trendMotionTracks[0]?.points.length || 0;
    const isHovering = trendTooltip.visible && trendTooltip.index >= 0 && pointCount > 0;

    if (isHovering) {
      const hoverProgress = pointCount === 1 ? 0.5 : trendTooltip.index / (pointCount - 1);
      trendMotionDirection = getTrendMotionDirection(
        trendMotionHoverTarget ?? trendMotionProgress,
        hoverProgress,
        trendMotionDirection,
      );
      trendMotionHoverTarget = hoverProgress;
      const focusStrength = 1 - Math.exp(-frameDelta / 150);
      trendMotionProgress += (hoverProgress - trendMotionProgress) * focusStrength;
      trendMotionWasHovering = true;
    } else {
      if (time < trendMotionStartedAt) return;
      if (trendMotionWasHovering) {
        trendMotionPhase = getTrendMotionPhase(trendMotionProgress, trendMotionDirection);
        trendMotionWasHovering = false;
        trendMotionHoverTarget = null;
      }
      trendMotionPhase = (trendMotionPhase + (frameDelta / TREND_MOTION_ONE_WAY_DURATION) * Math.PI) % (Math.PI * 2);
      trendMotionDirection = Math.sin(trendMotionPhase) >= 0 ? 1 : -1;
      trendMotionProgress = getTrendMotionProgress(trendMotionPhase);
    }

    trendMotionTracks.forEach((track) => {
      const point = getTrendMotionPoint(track.points, trendMotionProgress);
      if (!point) return;

      ctx.save();
      ctx.globalAlpha = props.themeKey === 'night' ? 0.2 : 0.14;
      ctx.fillStyle = track.color;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.fillStyle = trendMotionPointBackground;
      ctx.strokeStyle = track.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 3.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });
  }

  function startTrendMotionAnimation() {
    stopTrendMotionAnimation();
    prepareTrendMotionTracks();
    if (!trendMotionTracks.length) return;
    trendMotionStartedAt = performance.now() + TREND_MOTION_START_DELAY;
    trendMotionLastFrameAt = 0;
    trendMotionPhase = 0;
    trendMotionProgress = 0;
    trendMotionDirection = 1;
    trendMotionWasHovering = false;
    trendMotionHoverTarget = null;
    runTrendMotionAnimation();
  }

  function runTrendMotionAnimation() {
    if (trendMotionFrameId !== null || !trendMotionTracks.length) return;
    const frame = (time: number) => {
      if (!trendIsVisible) {
        pauseTrendMotionAnimation();
        return;
      }
      drawTrendMotion(time);
      trendMotionFrameId = requestAnimationFrame(frame);
    };
    trendMotionFrameId = requestAnimationFrame(frame);
  }

  function resumeTrendMotionAnimation() {
    if (prefersReducedMotion || trendMotionFrameId !== null) return;
    prepareTrendMotionTracks();
    if (!trendMotionTracks.length) return;
    trendMotionStartedAt = performance.now();
    trendMotionLastFrameAt = 0;
    runTrendMotionAnimation();
  }

  function pauseTrendMotionAnimation() {
    if (trendMotionFrameId !== null) cancelAnimationFrame(trendMotionFrameId);
    trendMotionFrameId = null;
    trendMotionLastFrameAt = 0;
    if (trendMotionWasHovering) {
      trendMotionPhase = getTrendMotionPhase(trendMotionProgress, trendMotionDirection);
      trendMotionWasHovering = false;
      trendMotionHoverTarget = null;
    }
  }

  function stopTrendMotionAnimation() {
    pauseTrendMotionAnimation();
    trendMotionTracks = [];
    trendMotionHoverTarget = null;
    const canvas = trendMotionCanvasRef.value;
    const ctx = canvas?.getContext('2d');
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function getCanvasMetrics(canvas: HTMLCanvasElement, container: HTMLElement) {
    const width = container.clientWidth;
    const height = container.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    if (!width || !height) return null;
    if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, width, height };
  }

  function getTypeSegments(time = performance.now()) {
    const total = Math.max(fileTypeTotal.value, 1);
    let current = -Math.PI / 2 + Math.sin(time / 1800) * 0.08;
    return fileTypeLegendItems.value.map((item) => {
      const angle = (item.value / total) * Math.PI * 2;
      const gap = Math.min(0.035, angle * 0.18);
      const segment = {
        ...item,
        start: current + gap,
        end: current + angle - gap,
        mid: current + angle / 2,
      };
      current += angle;
      return segment;
    });
  }

  function drawType(time = performance.now()) {
    const canvas = typeCanvasRef.value;
    const container = typeRef.value;
    if (!canvas || !container || !props.fileTypeData.length) return;

    const metrics = getCanvasMetrics(canvas, container);
    if (!metrics) return;

    const { ctx, width, height } = metrics;
    ctx.clearRect(0, 0, width, height);

    const cx = getTypeCenterX(width);
    const cy = height / 2 + 8;
    const radius = Math.min(height * 0.34, Math.max(54, (width - TYPE_LEGEND_WIDTH) * 0.3));
    const lineWidth = Math.max(14, Math.min(20, radius * 0.22));
    const pulse = 0.5 + 0.5 * Math.sin(time / 520);

    ctx.beginPath();
    ctx.arc(cx, cy, radius + 10 + pulse * 3, 0, Math.PI * 2);
    ctx.strokeStyle = colorMixFallback('--noteType-hover-color', 0.13);
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 18;
    ctx.shadowColor = getThemeVar('--noteType-hover-color', '#615ced');
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = colorMixFallback('--text-color', props.themeKey === 'night' ? 0.1 : 0.08);
    ctx.lineWidth = lineWidth;
    ctx.stroke();

    getTypeSegments(time).forEach((segment, index) => {
      const gradient = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
      gradient.addColorStop(0, hexToRgba(segment.color, 0.58));
      gradient.addColorStop(0.48, segment.color);
      gradient.addColorStop(1, hexToRgba(segment.color, 0.72));

      ctx.beginPath();
      ctx.arc(cx, cy, radius, segment.start, segment.end);
      ctx.strokeStyle = hexToRgba(segment.color, 0.18);
      ctx.lineWidth = lineWidth + 12;
      ctx.lineCap = 'round';
      ctx.shadowBlur = 24;
      ctx.shadowColor = segment.color;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, radius, segment.start, segment.end);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.shadowBlur = 14;
      ctx.shadowColor = segment.color;
      ctx.stroke();

      const beadAngle = segment.mid + Math.sin(time / 620 + index) * 0.025;
      const bx = cx + Math.cos(beadAngle) * radius;
      const by = cy + Math.sin(beadAngle) * radius;
      ctx.beginPath();
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = segment.color;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 12;
      ctx.shadowColor = segment.color;
      ctx.arc(bx, by, 3.4 + pulse * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
    });

    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(22, radius - lineWidth - 10), 0, Math.PI * 2);
    ctx.fillStyle = colorMixFallback('--menu-body-bg-color', 0.62);
    ctx.fill();
  }

  function colorMixFallback(varName: string, alpha: number) {
    return hexToRgba(getThemeVar(varName, '#8c8f99'), alpha);
  }

  function startTypeAnimation() {
    stopTypeAnimation();
    if (prefersReducedMotion) {
      drawType(0);
      return;
    }
    const frame = (time: number) => {
      if (!typeIsVisible) {
        stopTypeAnimation();
        return;
      }
      if (time - lastTypeFrameAt >= TYPE_CHART_FRAME_INTERVAL) {
        drawType(time);
        lastTypeFrameAt = time;
      }
      typeFrameId = requestAnimationFrame(frame);
    };
    typeFrameId = requestAnimationFrame(frame);
  }

  function stopTypeAnimation() {
    if (typeFrameId) cancelAnimationFrame(typeFrameId);
    typeFrameId = null;
  }

  function handleTrendPointer(event: MouseEvent) {
    const container = trendRef.value;
    if (!container || !visibleTrendData.value.length) return;
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const left = TREND_PLOT_LEFT;
    const right = TREND_PLOT_RIGHT;
    const top = TREND_PLOT_TOP;
    const bottom = TREND_PLOT_BOTTOM;
    const plotWidth = Math.max(width - left - right, 1);
    const plotHeight = Math.max(height - top - bottom, 1);
    if (x < left || x > left + plotWidth || y < top || y > top + plotHeight) {
      hideTrendTooltip();
      return;
    }
    const { dates, series } = buildTrendSeries();
    const index = Math.max(0, Math.min(dates.length - 1, Math.round(((x - left) / plotWidth) * (dates.length - 1))));
    const activeX = left + (dates.length === 1 ? plotWidth / 2 : (plotWidth / (dates.length - 1)) * index);
    const tooltipItems = series.map((line) => ({
      type: line.type,
      value: line.values[index] || 0,
      color: line.color,
    }));

    const shouldRedraw = !trendTooltip.visible || trendTooltip.index !== index;
    trendTooltip.visible = true;
    trendTooltip.index = index;
    trendTooltip.date = dates[index] || '';
    trendTooltip.items = tooltipItems;
    const preferredTooltipX = activeX > width / 2 ? activeX - TREND_TOOLTIP_WIDTH - 12 : activeX + 12;
    trendTooltip.x = Math.min(Math.max(preferredTooltipX, 8), Math.max(8, width - TREND_TOOLTIP_WIDTH - 8));
    trendTooltip.y = top + 8;
    if (shouldRedraw) drawTrend();
  }

  function hideTrendTooltip() {
    if (!trendTooltip.visible && trendTooltip.index === -1) return;
    trendTooltip.visible = false;
    trendTooltip.index = -1;
    drawTrend();
  }

  function normalizeAngle(angle: number) {
    const full = Math.PI * 2;
    return ((angle % full) + full) % full;
  }

  function handleTypePointer(event: MouseEvent) {
    const container = typeRef.value;
    if (!container || !props.fileTypeData.length) return;
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const cx = getTypeCenterX(width);
    const cy = height / 2 + 8;
    const radius = Math.min(height * 0.34, Math.max(54, (width - TYPE_LEGEND_WIDTH) * 0.3));
    const lineWidth = Math.max(14, Math.min(20, radius * 0.22));
    const distance = Math.hypot(x - cx, y - cy);
    const angle = normalizeAngle(Math.atan2(y - cy, x - cx));
    const segment = getTypeSegments(prefersReducedMotion ? 0 : performance.now()).find((item) => {
      const start = normalizeAngle(item.start);
      const end = normalizeAngle(item.end);
      const inArc = start <= end ? angle >= start && angle <= end : angle >= start || angle <= end;
      return inArc && distance >= radius - lineWidth * 1.2 && distance <= radius + lineWidth * 1.35;
    });

    if (!segment) {
      typeTooltip.visible = false;
      return;
    }

    typeTooltip.visible = true;
    typeTooltip.type = segment.type;
    typeTooltip.value = segment.value;
    typeTooltip.percent = segment.percent;
    typeTooltip.color = segment.color;
    typeTooltip.x = Math.min(Math.max(x + 12, 8), width - 138);
    typeTooltip.y = Math.min(Math.max(y - 12, 8), height - 86);
  }

  function hideTypeTooltip() {
    typeTooltip.visible = false;
  }

  watch(
    () => [props.loading, props.themeKey, props.trendData, props.fileTypeData],
    () => {
      syncCharts();
    },
    { deep: true, immediate: true },
  );

  window.addEventListener('resize', handleResize);

  watch(
    () => trendRef.value,
    (el) => {
      trendResizeObserver?.disconnect();
      if (trendEventTarget) {
        chartVisibilityObserver?.unobserve(trendEventTarget);
        trendEventTarget.removeEventListener('mousemove', handleTrendPointer);
        trendEventTarget.removeEventListener('mouseleave', hideTrendTooltip);
        trendEventTarget = null;
      }
      if (el) {
        trendResizeObserver = new ResizeObserver(() => handleResize());
        trendResizeObserver.observe(el);
        el.addEventListener('mousemove', handleTrendPointer);
        el.addEventListener('mouseleave', hideTrendTooltip);
        trendEventTarget = el;
        chartVisibilityObserver?.observe(el);
      }
    },
    { immediate: true },
  );

  watch(
    () => typeRef.value,
    (el) => {
      typeResizeObserver?.disconnect();
      if (typeEventTarget) {
        chartVisibilityObserver?.unobserve(typeEventTarget);
        typeEventTarget.removeEventListener('mousemove', handleTypePointer);
        typeEventTarget.removeEventListener('mouseleave', hideTypeTooltip);
        typeEventTarget = null;
      }
      if (el) {
        typeResizeObserver = new ResizeObserver(() => handleResize());
        typeResizeObserver.observe(el);
        el.addEventListener('mousemove', handleTypePointer);
        el.addEventListener('mouseleave', hideTypeTooltip);
        typeEventTarget = el;
        chartVisibilityObserver?.observe(el);
      }
    },
    { immediate: true },
  );

  if ('IntersectionObserver' in window) {
    chartVisibilityObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.target === trendRef.value) {
            trendIsVisible = entry.isIntersecting;
            if (trendIsVisible && visibleTrendData.value.length) {
              drawTrend();
              if (trendEntryAnimationPlayed) resumeTrendMotionAnimation();
              else startTrendAnimation();
            }
            if (!trendIsVisible) {
              trendTooltip.visible = false;
              trendTooltip.index = -1;
              pauseTrendMotionAnimation();
            }
          }
          if (entry.target === typeRef.value) {
            typeIsVisible = entry.isIntersecting;
            if (typeIsVisible && props.fileTypeData.length && !typeFrameId) startTypeAnimation();
            if (!typeIsVisible) destroyType();
          }
        });
      },
      { rootMargin: '120px 0px', threshold: 0.01 },
    );
  }

  onBeforeUnmount(() => {
    window.removeEventListener('resize', handleResize);
    trendResizeObserver?.disconnect();
    typeResizeObserver?.disconnect();
    chartVisibilityObserver?.disconnect();
    if (trendEventTarget) {
      trendEventTarget.removeEventListener('mousemove', handleTrendPointer);
      trendEventTarget.removeEventListener('mouseleave', hideTrendTooltip);
    }
    if (typeEventTarget) {
      typeEventTarget.removeEventListener('mousemove', handleTypePointer);
      typeEventTarget.removeEventListener('mouseleave', hideTypeTooltip);
    }
    destroyAll();
  });
</script>

<style scoped lang="less">
  .chart-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }

  .chart-card--trend {
    grid-column: span 2;
  }

  .chart-card--type {
    grid-column: span 1;
  }

  .chart-card {
    position: relative;
    min-width: 0;
    height: 420px;
    padding: 20px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--card-border-color);
    border-radius: 18px;
    color: var(--text-color);
    background: var(--menu-body-bg-color);
    box-shadow: 0 18px 44px -38px rgba(30, 27, 75, 0.38);
  }

  .chart-card--day {
    background: linear-gradient(
      145deg,
      var(--menu-body-bg-color) 0%,
      color-mix(in srgb, var(--primary-color) 2.5%, var(--menu-body-bg-color)) 100%
    );
  }

  .chart-card--night {
    background: linear-gradient(
      145deg,
      var(--menu-body-bg-color) 0%,
      color-mix(in srgb, var(--primary-color) 5%, var(--menu-body-bg-color)) 100%
    );
  }

  .chart-header {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }

  .chart-heading-copy {
    position: relative;
    min-width: 0;
    padding-left: 14px;

    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 1px;
      width: 4px;
      height: 34px;
      border-radius: 999px;
      background: var(--primary-color);
    }
  }

  .chart-heading-copy h2 {
    margin: 0;
    color: var(--text-color);
    font-size: 18px;
    line-height: 1.25;
    font-weight: 750;
    letter-spacing: -0.01em;
  }

  .chart-heading-copy p {
    margin: 5px 0 0;
    color: var(--desc-color);
    font-size: 11.5px;
    line-height: 1.45;
  }

  .trend-range-tabs.tab-container.is-segment {
    flex: 0 0 auto;
    border-radius: 10px;
    background: var(--bl-input-noBorder-bg-color);
  }

  .trend-range-tabs :deep(.tab) {
    min-width: 72px;
    min-height: 34px;
    justify-content: center;
    padding: 0 14px;
    line-height: 34px;
  }

  .trend-range-tabs :deep(.tab.is-active) {
    color: var(--primary-color);
    font-weight: 700;
    background: var(--menu-body-bg-color);
    box-shadow: inset 0 -2px 0 var(--primary-color);
  }

  .trend-content {
    min-height: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .trend-summary-grid {
    margin-top: 16px;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .trend-summary-card {
    min-width: 0;
    min-height: 68px;
    padding: 10px 12px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 10px;
    border: 1px solid var(--card-border-color);
    border-left-width: 3px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--menu-body-bg-color) 92%, var(--bl-input-noBorder-bg-color));
  }

  .trend-summary-card--bookmark {
    border-left-color: var(--resource-bookmark-color, #635bff);
  }

  .trend-summary-card--note {
    border-left-color: var(--resource-note-color, #00a67e);
  }

  .trend-summary-card--file {
    border-left-color: var(--resource-file-color, #ff8a00);
  }

  .trend-summary-icon {
    width: 38px;
    height: 38px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border-radius: 11px;
  }

  .trend-summary-card--bookmark .trend-summary-icon,
  .trend-summary-card--bookmark strong {
    color: var(--resource-bookmark-color, #635bff);
  }

  .trend-summary-card--bookmark .trend-summary-icon {
    background: color-mix(in srgb, var(--resource-bookmark-color, #635bff) 10%, transparent);
  }

  .trend-summary-card--note .trend-summary-icon,
  .trend-summary-card--note strong {
    color: var(--resource-note-color, #00a67e);
  }

  .trend-summary-card--note .trend-summary-icon {
    background: color-mix(in srgb, var(--resource-note-color, #00a67e) 10%, transparent);
  }

  .trend-summary-card--file .trend-summary-icon,
  .trend-summary-card--file strong {
    color: var(--resource-file-color, #ff8a00);
  }

  .trend-summary-card--file .trend-summary-icon {
    background: color-mix(in srgb, var(--resource-file-color, #ff8a00) 10%, transparent);
  }

  .trend-summary-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .trend-summary-copy > span {
    color: var(--desc-color);
    font-size: 11px;
  }

  .trend-summary-copy strong {
    font-size: 20px;
    line-height: 1.15;
    font-weight: 760;
    font-variant-numeric: tabular-nums;
  }

  .chart-body {
    flex: 1;
    min-height: 0;
    position: relative;
    z-index: 1;
  }

  .trend-plot {
    min-height: 190px;
    margin-top: 8px;
    overflow: hidden;
    border-radius: 10px;
    cursor: crosshair;
  }

  .trend-axis-label {
    position: absolute;
    top: 7px;
    left: 42px;
    z-index: 2;
    color: var(--workbench-chart-axis-text);
    font-size: 11px;
    font-weight: 600;
    pointer-events: none;
  }

  .trend-canvas {
    position: absolute;
    z-index: 1;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .trend-motion-canvas {
    position: absolute;
    z-index: 2;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .trend-legend {
    position: absolute;
    left: 42px;
    right: 16px;
    bottom: 1px;
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 8px 18px;
    align-items: center;
    pointer-events: none;
  }

  .trend-legend-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    color: var(--desc-color);
    font-size: 11px;
    line-height: 16px;
  }

  .trend-legend-line {
    width: 18px;
    height: 2px;
    border-radius: 999px;
    flex-shrink: 0;
  }

  .trend-tooltip {
    position: absolute;
    z-index: 3;
    min-width: 126px;
    padding: 8px 9px;
    border: 1px solid var(--card-border-color);
    border-radius: 9px;
    background: var(--menu-body-bg-color);
    box-shadow: 0 12px 30px -18px rgba(0, 0, 0, 0.35);
    backdrop-filter: blur(12px);
    pointer-events: none;
  }

  .trend-tooltip-date {
    margin-bottom: 5px;
    color: var(--text-color);
    font-size: 12px;
    font-weight: 700;
  }

  .trend-tooltip-row {
    display: grid;
    grid-template-columns: 8px minmax(0, 1fr) auto;
    align-items: center;
    gap: 5px;
    color: var(--desc-color);
    font-size: 11px;
    line-height: 18px;

    strong {
      color: var(--text-color);
      font-size: 12px;
      font-variant-numeric: tabular-nums;
    }
  }

  .trend-tooltip-dot {
    width: 6px;
    height: 6px;
    border-radius: 999px;
  }

  .trend-insight {
    min-height: 38px;
    padding: 8px 11px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 9px;
    border: 1px solid var(--card-border-color);
    border-left: 3px solid var(--primary-color);
    border-radius: 10px;
    color: var(--desc-color);
    background: color-mix(in srgb, var(--primary-color) 5%, var(--menu-body-bg-color));
    font-size: 11px;
    line-height: 1.45;
  }

  .trend-insight strong {
    color: var(--text-color);
    font-weight: 700;
  }

  .trend-insight-icon {
    width: 28px;
    height: 28px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: #fff;
    background: var(--primary-color);
  }

  .type-plot {
    margin-top: 12px;
    overflow: hidden;
    border: 1px solid var(--card-border-color);
    border-radius: 12px;
    background: color-mix(in srgb, var(--menu-body-bg-color) 92%, var(--bl-input-noBorder-bg-color));
  }

  .type-canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .type-center {
    position: absolute;
    left: calc((100% - 136px) / 2);
    top: calc(50% + 8px);
    transform: translate(-50%, -50%);
    text-align: center;
    pointer-events: none;
  }

  .type-center-value {
    font-size: 25px;
    line-height: 1;
    font-weight: 800;
    color: var(--text-color);
    font-variant-numeric: tabular-nums;
  }

  .type-center-label {
    margin-top: 4px;
    font-size: 11px;
    color: var(--desc-color);
    white-space: nowrap;
  }

  .type-legend {
    position: absolute;
    top: 28px;
    right: 10px;
    bottom: 12px;
    width: 136px;
    display: flex;
    flex-direction: column;
    gap: 7px;
    overflow: hidden;
  }

  .type-legend-item {
    display: grid;
    grid-template-columns: 8px minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 5px;
    min-height: 22px;
    padding: 3px 6px;
    border-radius: 7px;
    background: var(--menu-body-bg-color);
    border: 1px solid var(--card-border-color);
    color: var(--desc-color);
    font-size: 10px;

    strong {
      color: var(--text-color);
      font-size: 11px;
      font-variant-numeric: tabular-nums;
    }
  }

  .type-legend-dot {
    width: 6px;
    height: 6px;
    border-radius: 999px;
  }

  .type-legend-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .type-tooltip {
    min-width: 120px;
  }

  .chart-empty {
    margin-top: 12px;
    flex: 1;
    border-radius: 10px;
    border: 1px dashed var(--card-border-color);
    background: color-mix(in srgb, var(--primary-color) 2.5%, var(--menu-body-bg-color));
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 18px;
    box-sizing: border-box;
    font-size: 12px;
    color: var(--desc-color);
    position: relative;
    z-index: 1;
  }

  .chart-empty--file {
    border-style: solid;
    background:
      radial-gradient(
        circle at 50% 38%,
        color-mix(in srgb, var(--resource-file-color, #ff8a00) 9%, transparent),
        transparent 43%
      ),
      color-mix(in srgb, var(--resource-file-color, #ff8a00) 2.5%, var(--menu-body-bg-color));
  }

  .chart-empty__icon {
    width: 46px;
    height: 46px;
    display: grid;
    place-items: center;
    border-radius: 14px;
    color: var(--resource-file-color, #ff8a00);
    background: color-mix(in srgb, var(--resource-file-color, #ff8a00) 11%, transparent);
    box-shadow: 0 12px 24px -18px color-mix(in srgb, var(--resource-file-color, #ff8a00) 70%, transparent);
  }

  .chart-empty--file strong {
    color: var(--text-color);
    font-size: 14px;
    font-weight: 700;
  }

  .chart-empty--file > span:not(.chart-empty__icon) {
    max-width: 280px;
    line-height: 1.5;
    text-align: center;
  }

  .chart-empty__action {
    margin-top: 3px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .chart-skeleton {
    margin-top: 14px;
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

  .chart-skeleton--trend {
    min-height: 310px;
  }

  @keyframes workbench-chart-shine {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  @media (max-width: 1100px) {
    .chart-grid {
      grid-template-columns: 1fr;
    }

    .chart-card--trend,
    .chart-card--type {
      grid-column: auto;
    }

    .chart-card--type {
      height: 340px;
    }
  }

  @media (max-width: 760px) {
    .chart-card {
      height: auto;
      min-height: 380px;
      padding: 16px;
    }

    .chart-header {
      flex-direction: column;
    }

    .trend-summary-grid {
      grid-template-columns: 1fr;
    }

    .trend-content {
      min-height: 520px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .chart-skeleton {
      animation: none;
    }
  }
</style>
