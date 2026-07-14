<template>
  <div class="cal" :class="{ 'cal-wide': wide }">
    <div class="cal-head">
      <span class="cal-title">{{ t('growth.calTitle') }}</span>
      <div class="cal-nav">
        <button class="cal-arrow" @click="prevMonth" aria-label="prev">‹</button>
        <span class="cal-month">{{ monthLabel }}</span>
        <button class="cal-arrow" :disabled="atCurrentMonth" @click="nextMonth" aria-label="next">›</button>
      </div>
    </div>

    <div class="cal-weekrow">
      <span v-for="w in weekLabels" :key="w" class="cal-wd">{{ w }}</span>
    </div>
    <div class="cal-grid">
      <span
        v-for="(cell, i) in cells"
        :key="i"
        class="cal-cell"
        :class="{
          blank: cell === null,
          checked: cell !== null && isChecked(cell),
          today: cell !== null && isToday(cell),
          'makeup-able': cell !== null && canMakeup && !isChecked(cell) && isYesterday(cell),
        }"
        @click="cell !== null && onCellClick(cell)"
      >
        <template v-if="cell !== null">
          <span class="cal-cell-day">{{ cell }}</span>
          <span v-if="canMakeup && !isChecked(cell) && isYesterday(cell)" class="cal-makeup-tag">补</span>
        </template>
      </span>
    </div>

    <div class="cal-foot">
      <span class="cal-dot-legend"><i class="cal-legend-dot"></i>{{ t('growth.calCheckedLegend') }}</span>
      <span class="cal-month-count">{{ t('growth.calMonthCheckins', { n: monthCheckinCount }) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';

  const props = defineProps<{ checkinDays: string[]; checkedInToday?: boolean; streak?: number; wide?: boolean; canMakeup?: boolean }>();
const emit = defineEmits<{ makeup: [] }>();
  const { t, locale } = useI18n();

  const now = new Date();
  const viewYear = ref(now.getFullYear());
  const viewMonth = ref(now.getMonth()); // 0-11

  const weekLabels = computed(() =>
    locale.value.startsWith('zh')
      ? ['日', '一', '二', '三', '四', '五', '六']
      : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
  );
  const monthLabel = computed(() => {
    try {
      return new Date(viewYear.value, viewMonth.value, 1).toLocaleDateString(locale.value, {
        year: 'numeric',
        month: 'long',
      });
    } catch {
      return `${viewYear.value}-${viewMonth.value + 1}`;
    }
  });

  const checkedSet = computed(() => new Set(props.checkinDays || []));
  const pad = (n: number) => String(n).padStart(2, '0');
  const dayStr = (d: number) => `${viewYear.value}${pad(viewMonth.value + 1)}${pad(d)}`;

  // 当月网格:前置空格补齐周一列 + 1..当月天数
  const cells = computed<(number | null)[]>(() => {
    const firstWeekday = new Date(viewYear.value, viewMonth.value, 1).getDay(); // 0=周日
    const daysInMonth = new Date(viewYear.value, viewMonth.value + 1, 0).getDate();
    const arr: (number | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(d);
    return arr;
  });

  function isYesterday(d: number) {
    const y = new Date(now.getTime() - 86_400_000);
    return viewYear.value === y.getFullYear() && viewMonth.value === y.getMonth() && d === y.getDate();
  }
  function onCellClick(d: number) {
    if (!props.canMakeup) return;
    if (isChecked(d) || isToday(d)) return;
    if (!isYesterday(d)) return;
    emit('makeup');
  }
  function isToday(d: number) {
    return viewYear.value === now.getFullYear() && viewMonth.value === now.getMonth() && d === now.getDate();
  }
  function isChecked(d: number) {
    if (checkedSet.value.has(dayStr(d))) return true;
    // streak 推算仅用于「无逐日签到明细」的免账本用户(如 root):有 checkinDays 明细的用户一律按真实记录高亮,
    // 不能再用连续数往前点亮,否则会把实际没签的昨天(断签日)也点成已签(如连签2天却把前一天空白日点亮)。
    if (props.checkedInToday && (props.checkinDays?.length ?? 0) === 0) {
      const cell = new Date(viewYear.value, viewMonth.value, d).getTime();
      const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const diff = Math.round((today0 - cell) / 86_400_000);
      if (diff >= 0 && diff <= Math.max(1, props.streak || 1) - 1) return true;
    }
    return false;
  }
  const monthCheckinCount = computed(() => cells.value.filter((c): c is number => c !== null && isChecked(c)).length);

  const atCurrentMonth = computed(() => viewYear.value === now.getFullYear() && viewMonth.value === now.getMonth());
  function prevMonth() {
    if (viewMonth.value === 0) {
      viewMonth.value = 11;
      viewYear.value -= 1;
    } else viewMonth.value -= 1;
  }
  function nextMonth() {
    if (atCurrentMonth.value) return; // 不看未来
    if (viewMonth.value === 11) {
      viewMonth.value = 0;
      viewYear.value += 1;
    } else viewMonth.value += 1;
  }
</script>

<style scoped lang="less">
  .cal {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  /* 宽版(满级卡内):撑满左栏宽度、格子加高,填满留白并与右侧段位路线视觉对齐 */
  .cal-wide {
    max-width: none;
  }
  .cal-wide .cal-cell {
    aspect-ratio: auto;
    min-height: 48px;
  }
  .cal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }
  .cal-title {
    font-size: 14px;
    font-weight: 700;
  }
  .cal-nav {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .cal-arrow {
    width: 24px;
    height: 24px;
    border-radius: 7px;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 55%, transparent);
    background: transparent;
    color: var(--text-color);
    cursor: pointer;
    line-height: 1;
    font-size: 15px;
  }
  .cal-arrow:hover:not(:disabled) {
    color: var(--primary-color);
    border-color: color-mix(in srgb, var(--primary-color) 45%, transparent);
  }
  .cal-arrow:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .cal-month {
    font-size: 13px;
    font-weight: 600;
    color: var(--desc-color);
    min-width: 96px;
    text-align: center;
  }
  .cal-weekrow,
  .cal-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 6px;
  }
  .cal-wd {
    text-align: center;
    font-size: 11.5px;
    color: var(--desc-color);
  }
  .cal-cell {
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12.5px;
    border-radius: 8px;
    color: var(--text-color);
    background: color-mix(in srgb, var(--primary-color) 4%, var(--background-color));
    font-variant-numeric: tabular-nums;
  }
  .cal-cell.blank {
    background: transparent;
  }
  .cal-cell.checked {
    background: linear-gradient(135deg, var(--primary-color), color-mix(in srgb, var(--primary-color) 72%, #22d3ee));
    color: #fff;
    font-weight: 700;
    box-shadow: 0 6px 14px -8px color-mix(in srgb, var(--primary-color) 80%, transparent);
  }
  .cal-cell.today:not(.checked) {
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--primary-color) 60%, transparent);
    color: var(--primary-color);
    font-weight: 700;
  }
  .cal-cell.makeup-able {
    cursor: pointer;
    box-shadow: inset 0 0 0 1.5px var(--resource-bookmark-color);
    position: relative;
    flex-direction: column;
    gap: 1px;
  }
  .cal-cell.makeup-able:hover {
    background: color-mix(in srgb, var(--resource-bookmark-color) 12%, transparent);
  }
  .cal-cell-day {
    line-height: 1.2;
  }
  .cal-makeup-tag {
    font-size: 9px;
    line-height: 1;
    font-weight: 700;
    color: var(--resource-bookmark-color);
    background: color-mix(in srgb, var(--resource-bookmark-color) 15%, transparent);
    padding: 0 4px;
    border-radius: 3px;
  }
  .cal-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 12px;
    color: var(--desc-color);
  }
  .cal-dot-legend {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .cal-legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    background: linear-gradient(135deg, var(--primary-color), color-mix(in srgb, var(--primary-color) 72%, #22d3ee));
  }
  .cal-month-count {
    color: var(--primary-color);
    font-weight: 600;
  }
</style>
