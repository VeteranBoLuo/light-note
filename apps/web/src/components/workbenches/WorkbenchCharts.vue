<template>
  <div class="chart-grid">
    <div class="chart-card" :class="cardThemeClass">
      <div class="chart-title">{{ t('workbench.chart.trend', '本周内容趋势') }}</div>
      <div v-if="loading" class="chart-skeleton"></div>
      <div v-else-if="trendData.length" ref="trendRef" class="chart-body neon-trend">
        <canvas ref="trendCanvasRef" class="trend-canvas"></canvas>
        <div class="trend-legend">
          <span v-for="item in trendLegendItems" :key="item.type" class="trend-legend-item">
            <span
              class="trend-legend-dot"
              :style="{ backgroundColor: item.color, boxShadow: `0 0 10px ${item.color}` }"
            ></span>
            {{ item.type }}
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
      <div v-else class="chart-empty">{{ t('workbench.chart.empty', '暂无数据') }}</div>
    </div>

    <div class="chart-card" :class="cardThemeClass">
      <div class="chart-title">{{ t('workbench.chart.fileType', '文件类型分布') }}</div>
      <div v-if="loading" class="chart-skeleton"></div>
      <div v-else-if="fileTypeData.length" ref="typeRef" class="chart-body neon-type">
        <canvas ref="typeCanvasRef" class="type-canvas"></canvas>
        <div class="type-center">
          <div class="type-center-value">{{ fileTypeTotal }}</div>
          <div class="type-center-label">{{ t('workbench.chart.fileTotal', '文件总数') }}</div>
        </div>
        <div class="type-legend">
          <div v-for="item in displayedFileTypeLegendItems" :key="item.type" class="type-legend-item">
            <span
              class="type-legend-dot"
              :style="{ backgroundColor: item.color, boxShadow: `0 0 10px ${item.color}` }"
            ></span>
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
      <div v-else class="chart-empty">{{ t('workbench.chart.empty', '暂无数据') }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { FILE_TYPE_COLOR_HEX, RESOURCE_COLOR_CSS_VAR, RESOURCE_COLOR_HEX } from '@/config/resourceColor';

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
  const trendCanvasRef = ref<HTMLCanvasElement | null>(null);
  const typeRef = ref<HTMLElement | null>(null);
  const typeCanvasRef = ref<HTMLCanvasElement | null>(null);

  let trendFrameId: number | null = null;
  let typeFrameId: number | null = null;
  let trendResizeObserver: ResizeObserver | null = null;
  let typeResizeObserver: ResizeObserver | null = null;
  let chartVisibilityObserver: IntersectionObserver | null = null;
  let trendEventTarget: HTMLElement | null = null;
  let typeEventTarget: HTMLElement | null = null;
  let trendIsVisible = true;
  let typeIsVisible = true;
  let lastTrendFrameAt = 0;
  let lastTypeFrameAt = 0;
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  const CHART_FRAME_INTERVAL = 48;
  const TYPE_LEGEND_WIDTH = 136;

  const trendTooltip = reactive({
    visible: false,
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

  const trendLegendItems = computed(() => {
    const colorMap = getTrendColorMap();
    return Array.from(new Set(props.trendData.map((item) => item.type))).map((type) => ({
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
    trendTooltip.visible = false;
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

    if (trendRef.value && trendCanvasRef.value && props.trendData.length) {
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

  function handleResize() {
    drawTrend(performance.now());
    drawType(performance.now());
  }

  function getTypeCenterX(width: number) {
    return Math.max(72, (width - TYPE_LEGEND_WIDTH) / 2);
  }

  function buildTrendSeries() {
    const colorMap = getTrendColorMap();
    const dates = Array.from(new Set(props.trendData.map((item) => item.date)));
    const types = Array.from(new Set(props.trendData.map((item) => item.type)));
    const valueMap = new Map(props.trendData.map((item) => [`${item.date}__${item.type}`, Number(item.value || 0)]));
    return {
      dates,
      types,
      colorMap,
      maxValue: Math.max(...props.trendData.map((item) => Number(item.value || 0)), 1),
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

  function getSmoothControlPoints(points: Array<{ x: number; y: number }>, index: number) {
    const current = points[index];
    const previous = points[index - 1] || current;
    const next = points[index + 1] || current;
    const tension = 0.18;
    return {
      c1x: current.x + (next.x - previous.x) * tension,
      c1y: current.y + (next.y - previous.y) * tension,
    };
  }

  function drawSmoothPath(ctx: CanvasRenderingContext2D, points: Array<{ x: number; y: number }>) {
    if (!points.length) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 0; i < points.length - 1; i += 1) {
      const cp1 = getSmoothControlPoints(points, i);
      const cp2 = getSmoothControlPoints(points, i + 1);
      ctx.bezierCurveTo(cp1.c1x, cp1.c1y, cp2.c1x, cp2.c1y, points[i + 1].x, points[i + 1].y);
    }
  }

  function drawTrend(time = performance.now()) {
    const canvas = trendCanvasRef.value;
    const container = trendRef.value;
    if (!canvas || !container || !props.trendData.length) return;

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

    const top = 36;
    const right = 16;
    const bottom = 34;
    const left = 34;
    const plotWidth = Math.max(width - left - right, 1);
    const plotHeight = Math.max(height - top - bottom, 1);
    const { dates, series, maxValue } = buildTrendSeries();
    const descColor = getThemeVar('--desc-color', '#71717a');
    const gridColor = getThemeVar('--bl-input-noBorder-bg-color', '#f4f4f5');
    const phase = (time / 1200) % 1;

    ctx.lineWidth = 1;
    ctx.strokeStyle = gridColor;
    ctx.globalAlpha = props.themeKey === 'night' ? 0.42 : 0.68;
    for (let i = 0; i <= 3; i += 1) {
      const y = top + (plotHeight / 3) * i;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + plotWidth, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = descColor;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    dates.forEach((date, index) => {
      if (dates.length > 7 && index % 2 !== 0) return;
      const x = left + (dates.length === 1 ? plotWidth / 2 : (plotWidth / (dates.length - 1)) * index);
      ctx.fillText(String(date).slice(5) || date, x, top + plotHeight + 12);
    });

    series.forEach((line, lineIndex) => {
      const points = line.values.map((value, index) => ({
        x: left + (dates.length === 1 ? plotWidth / 2 : (plotWidth / (dates.length - 1)) * index),
        y: top + plotHeight - (Number(value || 0) / maxValue) * plotHeight,
        value,
      }));
      if (!points.length) return;

      const fillGradient = ctx.createLinearGradient(0, top, width * (1 + phase), top + plotHeight);
      fillGradient.addColorStop(0, hexToRgba(line.color, 0.02));
      fillGradient.addColorStop(Math.max(0.05, phase - 0.2), hexToRgba(line.color, 0.08));
      fillGradient.addColorStop(Math.min(0.95, phase + 0.2), hexToRgba(line.color, 0.25));
      fillGradient.addColorStop(1, hexToRgba(line.color, 0.02));

      drawSmoothPath(ctx, points);
      ctx.lineTo(points[points.length - 1].x, top + plotHeight);
      ctx.lineTo(points[0].x, top + plotHeight);
      ctx.closePath();
      ctx.fillStyle = fillGradient;
      ctx.fill();

      drawSmoothPath(ctx, points);
      ctx.lineWidth = 10;
      ctx.strokeStyle = hexToRgba(line.color, props.themeKey === 'night' ? 0.2 : 0.14);
      ctx.shadowBlur = 18;
      ctx.shadowColor = line.color;
      ctx.stroke();

      drawSmoothPath(ctx, points);
      ctx.lineWidth = 4.2;
      ctx.strokeStyle = hexToRgba(line.color, 0.82);
      ctx.shadowBlur = 16;
      ctx.shadowColor = line.color;
      ctx.stroke();

      drawSmoothPath(ctx, points);
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = 0.72;
      ctx.shadowBlur = 0;
      ctx.stroke();
      ctx.globalAlpha = 1;

      points.forEach((point, index) => {
        const pulse = 0.5 + 0.5 * Math.sin(time / 360 + index * 0.8 + lineIndex);
        ctx.beginPath();
        ctx.fillStyle = hexToRgba(line.color, 0.18 + pulse * 0.12);
        ctx.arc(point.x, point.y, 8 + pulse * 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = line.color;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 12;
        ctx.shadowColor = line.color;
        ctx.arc(point.x, point.y, 3.2 + pulse * 0.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
      });
    });
  }

  function startTrendAnimation() {
    stopTrendAnimation();
    if (prefersReducedMotion) {
      drawTrend(0);
      return;
    }
    const frame = (time: number) => {
      if (!trendIsVisible) {
        stopTrendAnimation();
        return;
      }
      if (time - lastTrendFrameAt >= CHART_FRAME_INTERVAL) {
        drawTrend(time);
        lastTrendFrameAt = time;
      }
      trendFrameId = requestAnimationFrame(frame);
    };
    trendFrameId = requestAnimationFrame(frame);
  }

  function stopTrendAnimation() {
    if (trendFrameId) cancelAnimationFrame(trendFrameId);
    trendFrameId = null;
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
      if (time - lastTypeFrameAt >= CHART_FRAME_INTERVAL) {
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
    if (!container || !props.trendData.length) return;
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const left = 34;
    const right = 16;
    const top = 36;
    const plotWidth = Math.max(width - left - right, 1);
    const { dates, series } = buildTrendSeries();
    const index = Math.max(0, Math.min(dates.length - 1, Math.round(((x - left) / plotWidth) * (dates.length - 1))));
    const tooltipItems = series.map((line) => ({
      type: line.type,
      value: line.values[index] || 0,
      color: line.color,
    }));

    trendTooltip.visible = true;
    trendTooltip.date = dates[index] || '';
    trendTooltip.items = tooltipItems;
    trendTooltip.x = Math.min(Math.max(x + 12, 8), width - 138);
    trendTooltip.y = top + Math.min(34, Math.max(0, height - 150));
  }

  function hideTrendTooltip() {
    trendTooltip.visible = false;
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
            if (trendIsVisible && props.trendData.length && !trendFrameId) startTrendAnimation();
            if (!trendIsVisible) destroyTrend();
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
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .chart-card {
    position: relative;
    border-radius: 14px;
    padding: 14px;
    height: 270px;
    box-sizing: border-box;
    background: var(--menu-body-bg-color);
    border: 1px solid color-mix(in srgb, var(--card-border-color) 72%, transparent);
    box-shadow: 0 12px 30px -28px color-mix(in srgb, var(--text-color) 38%, transparent);
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
      opacity: 0.55;
    }

    &:hover::before {
      opacity: 1;
    }
  }

  .chart-card--day {
    background: linear-gradient(
      160deg,
      color-mix(in srgb, var(--primary-color) 2%, var(--menu-body-bg-color)),
      var(--menu-body-bg-color)
    );

    &::before {
      background:
        radial-gradient(circle at 100% 0%, rgba(108, 99, 255, 0.07), transparent 44%),
        radial-gradient(circle at 0% 100%, rgba(0, 194, 255, 0.05), transparent 50%);
    }
  }

  .chart-card--night {
    background: linear-gradient(
      155deg,
      color-mix(in srgb, var(--primary-color) 5%, var(--menu-body-bg-color)),
      var(--menu-body-bg-color)
    );
    border-color: color-mix(in srgb, var(--primary-color) 20%, var(--card-border-color));

    &::before {
      background:
        radial-gradient(circle at 100% 0%, rgba(124, 92, 255, 0.13), transparent 46%),
        radial-gradient(circle at 0% 100%, rgba(0, 229, 255, 0.08), transparent 56%);
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

  .neon-trend {
    overflow: hidden;
    border-radius: 10px;
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--menu-body-bg-color) 36%, transparent), transparent 54%),
      radial-gradient(
        circle at 50% 0%,
        color-mix(in srgb, var(--noteType-hover-color) 10%, transparent),
        transparent 54%
      );

    &::before {
      content: '';
      position: absolute;
      inset: 0;
      pointer-events: none;
      background-image:
        linear-gradient(color-mix(in srgb, var(--text-color) 5%, transparent) 1px, transparent 1px),
        linear-gradient(90deg, color-mix(in srgb, var(--text-color) 4%, transparent) 1px, transparent 1px);
      background-size: 48px 48px;
      mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.6), transparent 78%);
      opacity: 0.75;
    }
  }

  .trend-canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .trend-legend {
    position: absolute;
    top: 5px;
    left: 10px;
    right: 10px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px 12px;
    align-items: center;
    pointer-events: none;
  }

  .trend-legend-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    color: var(--desc-color);
    font-size: 11px;
    line-height: 16px;
  }

  .trend-legend-dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    flex-shrink: 0;
  }

  .trend-tooltip {
    position: absolute;
    z-index: 3;
    min-width: 126px;
    padding: 8px 9px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--menu-body-bg-color) 92%, transparent);
    border: 1px solid color-mix(in srgb, var(--noteType-hover-color) 30%, var(--workbench-border-color, transparent));
    box-shadow:
      0 10px 28px rgba(0, 0, 0, 0.18),
      inset 0 1px 0 rgba(255, 255, 255, 0.1);
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

  .neon-type {
    overflow: hidden;
    border-radius: 10px;
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--menu-body-bg-color) 38%, transparent), transparent 58%),
      radial-gradient(
        circle at 34% 50%,
        color-mix(in srgb, var(--noteType-hover-color) 11%, transparent),
        transparent 54%
      );

    &::before {
      content: '';
      position: absolute;
      inset: 0;
      pointer-events: none;
      background-image:
        linear-gradient(color-mix(in srgb, var(--text-color) 4%, transparent) 1px, transparent 1px),
        linear-gradient(90deg, color-mix(in srgb, var(--text-color) 4%, transparent) 1px, transparent 1px);
      background-size: 44px 44px;
      mask-image: radial-gradient(circle at 34% 50%, rgba(0, 0, 0, 0.72), transparent 74%);
      opacity: 0.68;
    }
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
    text-shadow: 0 0 16px color-mix(in srgb, var(--noteType-hover-color) 28%, transparent);
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
    top: 18px;
    right: 10px;
    bottom: 12px;
    width: 136px;
    display: flex;
    flex-direction: column;
    gap: 5px;
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
    background: color-mix(in srgb, var(--menu-body-bg-color) 52%, transparent);
    border: 1px solid color-mix(in srgb, var(--text-color) 7%, transparent);
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

  @media (max-width: 760px) {
    .chart-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .chart-card::before,
    .chart-skeleton {
      animation: none;
      transition: none;
    }
  }
</style>
