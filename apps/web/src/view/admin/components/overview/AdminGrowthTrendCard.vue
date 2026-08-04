<template>
  <section class="growth-trend" aria-label="近 7 天新增趋势">
    <article v-for="panel in panels" :key="panel.key" class="growth-trend__panel">
      <header class="growth-trend__head">
        <div class="growth-trend__title">
          <strong>{{ panel.title }}</strong>
          <div class="growth-trend__legend">
            <span v-for="series in panel.series" :key="series.key" class="growth-trend__legend-item">
              <i :style="{ background: `var(${series.colorVar})` }"></i>{{ series.label }}
            </span>
          </div>
        </div>
        <dl class="growth-trend__summary">
          <div>
            <dt>7 天新增</dt>
            <dd>{{ panel.summary.sum }}</dd>
          </div>
          <div>
            <dt>日均</dt>
            <dd>{{ panel.summary.dailyAverage }}</dd>
          </div>
          <div>
            <dt>峰值</dt>
            <dd>{{ panel.summary.peakLabel || '-' }} / {{ panel.summary.peakValue }}</dd>
          </div>
        </dl>
      </header>

      <div class="growth-trend__chart" @mouseleave="clearHover">
        <div class="growth-trend__axis" aria-hidden="true">
          <span v-for="(tick, index) in panel.ticks" :key="index">{{ formatTick(tick) }}</span>
        </div>
        <div class="growth-trend__plot">
          <svg class="growth-trend__svg" viewBox="0 0 100 42" preserveAspectRatio="none" role="img">
            <line
              v-for="(tick, index) in panel.ticks"
              :key="`grid-${index}`"
              class="growth-trend__grid"
              x1="0"
              x2="100"
              :y1="(42 / (panel.ticks.length - 1)) * index"
              :y2="(42 / (panel.ticks.length - 1)) * index"
              vector-effect="non-scaling-stroke"
            />
            <line
              v-if="hoverIndex !== null"
              class="growth-trend__hover-line"
              :x1="hoverX"
              :x2="hoverX"
              y1="0"
              y2="42"
              vector-effect="non-scaling-stroke"
            />
            <template v-for="series in panel.series" :key="`area-${series.key}`">
              <polygon
                v-if="panel.showArea"
                class="growth-trend__area"
                :points="buildAreaPoints(series.values, panel.axisMax)"
                :style="{ fill: `var(${series.colorVar})` }"
              />
            </template>
            <polyline
              v-for="series in panel.series"
              :key="`line-${series.key}`"
              class="growth-trend__line"
              :points="buildLinePoints(series.values, panel.axisMax)"
              :style="{ stroke: `var(${series.colorVar})` }"
              vector-effect="non-scaling-stroke"
            />
            <rect
              v-for="(area, index) in hitAreas"
              :key="`hit-${index}`"
              class="growth-trend__hit"
              :x="area.x"
              y="0"
              :width="area.width"
              height="42"
              @mouseenter="setHover(panel.key, index)"
            />
          </svg>

          <!-- 圆点走 HTML 层:SVG 非等比拉伸会把圆压成椭圆 -->
          <template v-if="hoverIndex !== null">
            <span
              v-for="series in panel.series"
              :key="`dot-${series.key}`"
              class="growth-trend__dot"
              :style="dotStyle(series.values[hoverIndex!] || 0, panel.axisMax, series.colorVar)"
            ></span>
          </template>

          <div
            v-if="hoverIndex !== null && activePanelKey === panel.key"
            class="growth-trend__tooltip"
            :class="`is-${tooltipAnchor.align}`"
            :style="{ left: `${tooltipAnchor.left}%` }"
          >
            <strong>{{ days[hoverIndex!]?.label }}</strong>
            <span v-for="series in panel.series" :key="`tip-${series.key}`">
              <i :style="{ background: `var(${series.colorVar})` }"></i>
              {{ series.label }}
              <b>{{ series.values[hoverIndex!] || 0 }}</b>
            </span>
          </div>
        </div>
      </div>

      <div class="growth-trend__x">
        <span v-for="(day, index) in days" :key="index" :class="{ 'is-active': hoverIndex === index }">
          {{ day.label }}
        </span>
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import {
    buildAreaPoints,
    buildAxisTicks,
    buildHitAreas,
    buildLinePoints,
    normalizeTrendDays,
    resolveAxisMax,
    resolveTooltipAnchor,
    summarizeSeries,
    type AdminTrendDay,
  } from './adminTrendChart';

  const props = defineProps<{ trend?: AdminTrendDay[] | null }>();

  // 两个面板共享同一条时间轴:悬浮索引联动,便于对比同一天的用户与内容变化。
  // 但 tooltip 只在鼠标所在的面板显示,避免同时弹两个气泡。
  const hoverIndex = ref<number | null>(null);
  const activePanelKey = ref<string | null>(null);

  function setHover(panelKey: string, index: number) {
    hoverIndex.value = index;
    activePanelKey.value = panelKey;
  }

  function clearHover() {
    hoverIndex.value = null;
    activePanelKey.value = null;
  }
  const days = computed(() => normalizeTrendDays(props.trend));
  const labels = computed(() => days.value.map((day) => day.label));
  const hitAreas = computed(() => buildHitAreas(days.value.length));
  const hoverX = computed(() => {
    const count = days.value.length;
    if (hoverIndex.value === null || count <= 1) return 50;
    return (hoverIndex.value / (count - 1)) * 100;
  });

  const tooltipAnchor = computed(() => resolveTooltipAnchor(hoverIndex.value ?? 0, days.value.length));

  // 用户与内容量级差异大,拆两个面板各自定轴,而不是共用一根 Y 轴或做双轴
  const panels = computed(() => {
    const userValues = days.value.map((day) => day.users);
    const bookmarkValues = days.value.map((day) => day.bookmarks);
    const noteValues = days.value.map((day) => day.notes);
    const fileValues = days.value.map((day) => day.files);
    const contentValues = days.value.map((day) => day.contentTotal);

    const userAxis = resolveAxisMax(userValues);
    const contentAxis = resolveAxisMax([...bookmarkValues, ...noteValues, ...fileValues]);

    return [
      {
        key: 'users',
        title: '用户新增',
        axisMax: userAxis,
        ticks: buildAxisTicks(userAxis),
        showArea: true,
        summary: summarizeSeries(userValues, labels.value),
        series: [{ key: 'users', label: '新增用户', colorVar: '--primary-color', values: userValues }],
      },
      {
        key: 'content',
        title: '内容新增',
        axisMax: contentAxis,
        ticks: buildAxisTicks(contentAxis),
        showArea: false,
        summary: summarizeSeries(contentValues, labels.value),
        series: [
          { key: 'bookmark', label: '书签', colorVar: '--resource-bookmark-color', values: bookmarkValues },
          { key: 'note', label: '笔记', colorVar: '--resource-note-color', values: noteValues },
          { key: 'file', label: '文件', colorVar: '--resource-file-color', values: fileValues },
        ],
      },
    ];
  });

  function formatTick(value: number) {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  function dotStyle(value: number, axisMax: number, colorVar: string) {
    const ratio = Math.max(0, Number(value) || 0) / Math.max(1, axisMax);
    return {
      left: `${hoverX.value}%`,
      top: `${(1 - ratio) * 100}%`,
      background: `var(${colorVar})`,
    };
  }
</script>

<style scoped lang="less">
  @import '@/assets/css/admin-breakpoints.less';
  .growth-trend {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }

  .growth-trend__panel {
    min-width: 0;
    padding: 14px;
    border: 1px solid var(--card-border-color);
    border-radius: 12px;
    background: var(--card-background);
  }

  .growth-trend__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }

  .growth-trend__title strong {
    display: block;
    color: var(--text-color);
    font-size: 14px;
  }

  .growth-trend__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 5px;
  }

  .growth-trend__legend-item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--desc-color);
    font-size: 12px;

    i {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
  }

  .growth-trend__summary {
    display: flex;
    gap: 14px;
    margin: 0;

    div {
      display: grid;
      gap: 2px;
    }

    dt {
      color: var(--desc-color);
      font-size: 11px;
    }

    dd {
      margin: 0;
      color: var(--text-color);
      font-size: 14px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
  }

  .growth-trend__chart {
    display: flex;
    gap: 8px;
    height: 150px;
  }

  .growth-trend__axis {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    flex: 0 0 auto;
    color: var(--desc-color);
    font-size: 10px;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .growth-trend__plot {
    position: relative;
    min-width: 0;
    flex: 1;
  }

  .growth-trend__svg {
    width: 100%;
    height: 100%;
    display: block;
    overflow: visible;
  }

  .growth-trend__grid {
    stroke: color-mix(in srgb, var(--text-color) 10%, transparent);
    stroke-width: 1;
  }

  .growth-trend__hover-line {
    stroke: color-mix(in srgb, var(--primary-color) 45%, transparent);
    stroke-width: 1;
    stroke-dasharray: 3 3;
  }

  .growth-trend__area {
    opacity: 0.12;
  }

  .growth-trend__line {
    fill: none;
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  .growth-trend__hit {
    fill: transparent;
    cursor: crosshair;
  }

  .growth-trend__dot {
    position: absolute;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    box-shadow: 0 0 0 2px var(--card-background);
    pointer-events: none;
  }

  .growth-trend__tooltip {
    position: absolute;
    top: 4px;
    z-index: 2;
    display: grid;
    gap: 3px;
    min-width: 116px;
    padding: 7px 9px;
    border: 1px solid var(--card-border-color);
    border-radius: 8px;
    background: var(--menu-body-bg-color, var(--card-background));
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
    color: var(--text-color);
    font-size: 11px;
    pointer-events: none;
    transform: translateX(-50%);

    &.is-start {
      transform: translateX(0);
    }

    &.is-end {
      transform: translateX(-100%);
    }

    strong {
      font-size: 12px;
    }

    span {
      display: flex;
      align-items: center;
      gap: 5px;
      color: var(--desc-color);
    }

    i {
      width: 7px;
      height: 7px;
      flex: 0 0 auto;
      border-radius: 50%;
    }

    b {
      margin-left: auto;
      color: var(--text-color);
      font-variant-numeric: tabular-nums;
    }
  }

  .growth-trend__x {
    display: flex;
    justify-content: space-between;
    margin-top: 6px;
    padding-left: 26px;
    color: var(--desc-color);
    font-size: 10px;

    .is-active {
      color: var(--primary-color);
      font-weight: 600;
    }
  }

  @media (max-width: @admin-bp-desktop) {
    .growth-trend {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .growth-trend__line,
    .growth-trend__dot {
      transition: none;
    }
  }
</style>
