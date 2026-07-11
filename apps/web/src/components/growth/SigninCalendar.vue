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
        <template v-if="cell !== null">{{ cell }}</template>
        <small v-if="cell !== null && canMakeup && !isChecked(cell) && isYesterday(cell)" class="cal-makeup-badge">{{ $t('growth.useProtectCard') }}</small>
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
    // 免账本用户(如 root)历史签到无逐日记录,但有当前连续签到数:
    // 今日已签则「今日往前 streak-1 天」视为连续签到日,与「连续签到 N 天」保持一致。
    if (props.checkedInToday) {
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
    color: var(--resource-bookmark-color);
    position: relative;
  }
  .cal-cell.makeup-able:hover {
    background: color-mix(in srgb, var(--resource-bookmark-color) 12%, transparent);
  }
  .cal-makeup-badge {
    position: absolute;
    bottom: 1px;
    font-size: 9px;
    line-height: 1;
    color: var(--resource-bookmark-color);
    opacity: 0.8;
    pointer-events: none;
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
