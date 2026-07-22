<template>
  <div class="activity-heatmap" :class="{ 'is-loading': loading }" :aria-busy="loading">
    <div class="activity-heatmap__head">
      <div class="activity-heatmap__heading">
        <h2 class="activity-heatmap__title">{{ t('growth.heatmapTitle') }}</h2>
        <p class="activity-heatmap__caption">{{ t('growth.heatmapCaption') }}</p>
      </div>
      <BSelect
        v-if="yearOptions.length > 1"
        v-model:value="selectedYear"
        class="activity-heatmap__year"
        :options="yearOptions"
        :aria-label="t('growth.heatmapYearPicker')"
        @change="handleYearChange"
      />
    </div>

    <div ref="scrollRef" class="activity-heatmap__scroll">
      <div class="activity-heatmap__grid-wrap">
        <div class="activity-heatmap__months" :style="gridColumnsStyle">
          <span v-for="(label, index) in monthLabels" :key="index" class="activity-heatmap__month">{{ label }}</span>
        </div>

        <div class="activity-heatmap__body">
          <div class="activity-heatmap__weekdays" aria-hidden="true">
            <span v-for="(label, index) in weekdayLabels" :key="index" class="activity-heatmap__weekday">{{
              label
            }}</span>
          </div>

          <div class="activity-heatmap__grid" :style="gridColumnsStyle">
            <template v-for="cell in cells" :key="cell.key">
              <BTooltip v-if="cell.inYear" :title="cellHoverTip(cell)" :delay="120">
                <span
                  class="activity-heatmap__cell"
                  :class="[
                    `heat-${cell.level}`,
                    { 'is-today': cell.isToday, 'is-selected': selectedCell?.key === cell.key },
                  ]"
                  role="button"
                  tabindex="0"
                  :aria-label="cellDetailTip(cell)"
                  :data-current-day="cell.isToday || undefined"
                  @click="selectCell(cell)"
                  @keydown.enter.prevent="selectCell(cell)"
                  @keydown.space.prevent="selectCell(cell)"
                />
              </BTooltip>
              <span v-else class="activity-heatmap__cell is-blank" aria-hidden="true" />
            </template>
          </div>
        </div>
      </div>
    </div>

    <p v-if="selectedCell" class="activity-heatmap__selected" role="status">{{ cellDetailTip(selectedCell) }}</p>

    <div class="activity-heatmap__foot">
      <div class="activity-heatmap__stats">
        <span>{{ t('growth.heatmapActiveDays', { n: summary.activeDays }) }}</span>
        <span>{{ t('growth.heatmapLongest', { n: summary.longestStreak }) }}</span>
        <span v-if="shownYear === currentYear">{{ t('growth.heatmapWeek', { n: summary.weekCount }) }}</span>
      </div>

      <div class="activity-heatmap__legend">
        <span>{{ t('growth.heatmapLess') }}</span>
        <i
          v-for="level in [0, 1, 2, 3, 4]"
          :key="level"
          class="activity-heatmap__cell"
          :class="`heat-${level}`"
          aria-hidden="true"
        />
        <span>{{ t('growth.heatmapMore') }}</span>
      </div>
    </div>

    <p v-if="loadError" class="activity-heatmap__error">{{ t('growth.heatmapLoadFailed') }}</p>
    <p v-else-if="!loading && summary.activeDays === 0" class="activity-heatmap__empty">{{
      t('growth.heatmapEmpty')
    }}</p>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import growthApi from '@/api/growthApi.ts';
  import { getRootZoom } from '@/utils/zoom.ts';

  const activityTypes = ['bookmark', 'note', 'file', 'checkin'] as const;
  type ActivityType = (typeof activityTypes)[number];
  type ActivityBreakdown = Record<ActivityType, number>;

  interface HeatmapDay {
    day: string;
    count: number;
    breakdown: ActivityBreakdown;
  }

  interface HeatmapData {
    year: number;
    availableYears: number[];
    days: HeatmapDay[];
    summary: { activeDays: number; longestStreak: number; weekCount: number };
  }

  interface HeatmapCell {
    key: string;
    day: string;
    inYear: boolean;
    count: number;
    breakdown: ActivityBreakdown;
    level: number;
    isToday: boolean;
    month: number;
  }

  const { t, locale } = useI18n();
  const currentYear = new Date().getFullYear();
  const selectedYear = ref(currentYear);
  const data = ref<HeatmapData | null>(null);
  const loading = ref(false);
  const loadError = ref(false);
  const selectedCell = ref<HeatmapCell | null>(null);
  const scrollRef = ref<HTMLElement | null>(null);
  let latestRequest = 0;

  function normalizeBreakdown(breakdown?: Partial<ActivityBreakdown>): ActivityBreakdown {
    return {
      bookmark: Math.max(0, Number(breakdown?.bookmark || 0)),
      note: Math.max(0, Number(breakdown?.note || 0)),
      file: Math.max(0, Number(breakdown?.file || 0)),
      checkin: Math.max(0, Number(breakdown?.checkin || 0)),
    };
  }

  const shownYear = computed(() => data.value?.year || selectedYear.value);
  const summary = computed(() => data.value?.summary || { activeDays: 0, longestStreak: 0, weekCount: 0 });
  const yearOptions = computed(() => {
    const years = data.value?.availableYears?.length ? data.value.availableYears : [currentYear];
    return years.map((year) => ({ value: year, label: t('growth.heatmapYear', { year }) }));
  });
  const activityByDay = computed(() => {
    const result = new Map<string, HeatmapDay>();
    for (const item of data.value?.days || []) {
      result.set(item.day, { ...item, breakdown: normalizeBreakdown(item.breakdown) });
    }
    return result;
  });
  const weekdayLabels = computed(() =>
    locale.value.startsWith('zh') ? ['', '一', '', '三', '', '五', ''] : ['', 'Mon', '', 'Wed', '', 'Fri', ''],
  );

  const pad = (value: number) => String(value).padStart(2, '0');
  const formatDay = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const addDays = (date: Date, offset: number) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
  const dateFromKey = (day: string) => {
    const [year, month, date] = day.split('-').map(Number);
    return new Date(year, month - 1, date);
  };

  function levelOf(count: number) {
    if (count <= 0) return 0;
    if (count === 1) return 1;
    if (count <= 3) return 2;
    if (count <= 6) return 3;
    return 4;
  }

  const weekCount = computed(() => {
    const januaryFirst = new Date(shownYear.value, 0, 1);
    const daysInYear = new Date(shownYear.value, 1, 29).getMonth() === 1 ? 366 : 365;
    return Math.ceil((januaryFirst.getDay() + daysInYear) / 7);
  });
  const gridColumnsStyle = computed(() => ({
    gridTemplateColumns: `repeat(${weekCount.value}, var(--heatmap-cell-size))`,
  }));

  const cells = computed<HeatmapCell[]>(() => {
    const year = shownYear.value;
    const januaryFirst = new Date(year, 0, 1);
    const firstWeekday = januaryFirst.getDay();
    const gridStart = addDays(januaryFirst, -firstWeekday);
    const today = formatDay(new Date());
    const list: HeatmapCell[] = [];

    for (let week = 0; week < weekCount.value; week += 1) {
      for (let weekday = 0; weekday < 7; weekday += 1) {
        const date = addDays(gridStart, week * 7 + weekday);
        const inYear = date.getFullYear() === year;
        const day = formatDay(date);
        const activity = inYear ? activityByDay.value.get(day) : undefined;
        const count = activity?.count || 0;
        list.push({
          key: `${week}-${weekday}`,
          day,
          inYear,
          count,
          breakdown: activity?.breakdown || normalizeBreakdown(),
          level: inYear ? levelOf(count) : 0,
          isToday: inYear && day === today,
          month: date.getMonth(),
        });
      }
    }
    return list;
  });

  const monthLabels = computed(() => {
    const labels = new Array(weekCount.value).fill('');
    let previousMonth = -1;
    for (let week = 0; week < weekCount.value; week += 1) {
      const firstCellInYear = cells.value.slice(week * 7, week * 7 + 7).find((cell) => cell.inYear);
      if (!firstCellInYear || firstCellInYear.month === previousMonth) continue;
      labels[week] = new Date(shownYear.value, firstCellInYear.month, 1).toLocaleDateString(locale.value, {
        month: 'short',
      });
      previousMonth = firstCellInYear.month;
    }
    return labels;
  });

  function breakdownText(cell: Pick<HeatmapCell, 'breakdown'>) {
    return activityTypes
      .filter((type) => cell.breakdown[type] > 0)
      .map((type) => t(`growth.heatmapType${type[0].toUpperCase()}${type.slice(1)}`, { n: cell.breakdown[type] }))
      .join(' · ');
  }

  function cellHoverTip(cell: Pick<HeatmapCell, 'day' | 'count'>) {
    const date = dateFromKey(cell.day).toLocaleDateString(locale.value, { month: 'long', day: 'numeric' });
    return cell.count > 0
      ? t('growth.heatmapCellTip', { date, n: cell.count })
      : t('growth.heatmapCellTipEmpty', { date });
  }

  function cellDetailTip(cell: Pick<HeatmapCell, 'day' | 'count' | 'breakdown'>) {
    const summary = cellHoverTip(cell);
    if (cell.count <= 0) return summary;
    const breakdown = breakdownText(cell);
    return breakdown ? t('growth.heatmapCellTipWithBreakdown', { summary, breakdown }) : summary;
  }

  function selectCell(cell: HeatmapCell) {
    selectedCell.value = cell;
  }

  function scrollToRelevantWeek() {
    const container = scrollRef.value;
    const todayCell = container?.querySelector<HTMLElement>('[data-current-day="true"]');
    if (!container) return;
    if (!todayCell || shownYear.value !== currentYear) {
      container.scrollLeft = 0;
      return;
    }
    // gBCR 是视觉坐标，scrollLeft/clientWidth 是布局坐标；按项目 zoom 约定先换算。
    const zoom = getRootZoom();
    const left =
      (todayCell.getBoundingClientRect().left - container.getBoundingClientRect().left) / zoom + container.scrollLeft;
    container.scrollLeft = Math.max(0, left - container.clientWidth / 2 + todayCell.offsetWidth / 2);
  }

  async function load(year = selectedYear.value) {
    const targetYear = Number(year);
    if (!Number.isInteger(targetYear)) return;
    const requestId = ++latestRequest;
    const previousYear = shownYear.value;
    loading.value = true;
    loadError.value = false;
    selectedCell.value = null;
    try {
      const response = await growthApi.getHeatmap(targetYear);
      if (requestId !== latestRequest) return;
      if (response?.status !== 200 || !response.data) throw new Error('heatmap_unavailable');
      data.value = response.data as HeatmapData;
      selectedYear.value = data.value.year;
      await nextTick();
      scrollToRelevantWeek();
    } catch (error) {
      if (requestId === latestRequest) {
        console.error('获取知识足迹失败:', error);
        selectedYear.value = previousYear;
        loadError.value = true;
      }
    } finally {
      if (requestId === latestRequest) loading.value = false;
    }
  }

  function handleYearChange(value: unknown) {
    const year = Number(value);
    if (Number.isInteger(year) && year !== shownYear.value) void load(year);
  }

  onMounted(() => void load(currentYear));

  defineExpose({
    reload: () => load(shownYear.value),
  });
</script>

<style scoped lang="less">
  .activity-heatmap {
    --heatmap-cell-size: 13px;
    --heatmap-gap: 3px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }
  .activity-heatmap__head,
  .activity-heatmap__foot {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .activity-heatmap__heading {
    min-width: 0;
  }
  .activity-heatmap__title,
  .activity-heatmap__caption,
  .activity-heatmap__empty,
  .activity-heatmap__error,
  .activity-heatmap__selected {
    margin: 0;
  }
  .activity-heatmap__title {
    font-size: 15px;
    line-height: 1.35;
    font-weight: 700;
    color: var(--text-color);
  }
  .activity-heatmap__caption {
    margin-top: 3px;
    font-size: 12px;
    color: var(--desc-color);
  }
  .activity-heatmap__year {
    width: 100px;
    flex: 0 0 auto;
  }
  .activity-heatmap__scroll {
    overflow-x: auto;
    overscroll-behavior-x: contain;
    padding-bottom: 3px;
    scrollbar-width: thin;
  }
  .activity-heatmap__grid-wrap {
    width: max-content;
    min-width: 100%;
  }
  .activity-heatmap__months {
    display: grid;
    gap: var(--heatmap-gap);
    margin: 0 0 4px 26px;
  }
  .activity-heatmap__month {
    min-width: var(--heatmap-cell-size);
    overflow: visible;
    color: var(--desc-color);
    font-size: 10.5px;
    line-height: 1;
    white-space: nowrap;
  }
  .activity-heatmap__body {
    display: flex;
    gap: 6px;
  }
  .activity-heatmap__weekdays {
    display: grid;
    grid-template-rows: repeat(7, var(--heatmap-cell-size));
    gap: var(--heatmap-gap);
    width: 20px;
  }
  .activity-heatmap__weekday {
    color: var(--desc-color);
    font-size: 10px;
    line-height: var(--heatmap-cell-size);
    text-align: right;
  }
  .activity-heatmap__grid {
    display: grid;
    grid-auto-flow: column;
    grid-template-rows: repeat(7, var(--heatmap-cell-size));
    gap: var(--heatmap-gap);
  }
  .activity-heatmap__grid :deep(.b-tooltip-wrap) {
    display: block;
    width: var(--heatmap-cell-size);
    height: var(--heatmap-cell-size);
  }
  .activity-heatmap__cell {
    display: block;
    width: var(--heatmap-cell-size);
    height: var(--heatmap-cell-size);
    box-sizing: border-box;
    border-radius: 3px;
    background: color-mix(in srgb, var(--primary-color) 6%, var(--workspace-panel-bg-color));
  }
  .activity-heatmap__cell:not(.is-blank) {
    cursor: pointer;
  }
  .activity-heatmap__cell.heat-1 {
    background: color-mix(in srgb, var(--primary-color) 27%, var(--card-background));
  }
  .activity-heatmap__cell.heat-2 {
    background: color-mix(in srgb, var(--primary-color) 48%, var(--card-background));
  }
  .activity-heatmap__cell.heat-3 {
    background: color-mix(in srgb, var(--primary-color) 70%, var(--card-background));
  }
  .activity-heatmap__cell.heat-4 {
    background: var(--primary-color);
    box-shadow: 0 3px 8px -5px color-mix(in srgb, var(--primary-color) 90%, transparent);
  }
  .activity-heatmap__cell.is-blank {
    background: transparent;
  }
  .activity-heatmap__cell.is-today {
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--text-color) 55%, transparent);
  }
  .activity-heatmap__cell.is-selected,
  .activity-heatmap__cell:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--primary-color) 65%, transparent);
    outline-offset: 2px;
  }
  .activity-heatmap.is-loading .activity-heatmap__cell:not(.is-blank) {
    animation: heatmap-pulse 1.1s ease-in-out infinite alternate;
  }
  .activity-heatmap__selected {
    padding: 7px 10px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 24%, var(--card-border-color));
    border-radius: 8px;
    background: color-mix(in srgb, var(--primary-color) 6%, var(--card-background));
    color: var(--text-color);
    font-size: 12px;
    line-height: 1.5;
  }
  .activity-heatmap__stats,
  .activity-heatmap__legend {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--desc-color);
    font-size: 12px;
  }
  .activity-heatmap__stats {
    flex-wrap: wrap;
    gap: 6px 14px;
  }
  .activity-heatmap__legend {
    gap: 3px;
    font-size: 11px;
  }
  .activity-heatmap__legend span {
    margin: 0 2px;
  }
  .activity-heatmap__legend .activity-heatmap__cell {
    cursor: default;
  }
  .activity-heatmap__empty,
  .activity-heatmap__error {
    font-size: 12px;
    text-align: center;
  }
  .activity-heatmap__empty {
    color: var(--desc-color);
  }
  .activity-heatmap__error {
    color: var(--danger-color, var(--text-color));
  }
  @keyframes heatmap-pulse {
    from {
      opacity: 0.5;
    }
    to {
      opacity: 0.9;
    }
  }
  @media (max-width: 720px) {
    .activity-heatmap {
      --heatmap-cell-size: 12px;
    }
    .activity-heatmap__head {
      align-items: center;
    }
    .activity-heatmap__foot {
      align-items: flex-start;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .activity-heatmap.is-loading .activity-heatmap__cell:not(.is-blank) {
      animation: none;
    }
  }
</style>
