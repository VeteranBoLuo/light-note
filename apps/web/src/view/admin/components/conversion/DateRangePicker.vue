<template>
  <div class="drp" :class="{ open: opened }" v-click-outside="close">
    <button class="drp-trigger" @click="toggle">
      <span class="drp-label">{{ rangeLabel }}</span>
      <span class="drp-arrow">{{ opened ? '▲' : '▼' }}</span>
    </button>

    <div v-if="opened" class="drp-panel">
      <!-- 左侧：快捷预设 -->
      <div class="drp-presets">
        <p class="drp-section-title">快捷选择</p>
        <button
          v-for="p in presets"
          :key="p.key"
          class="drp-preset-btn"
          :class="{ active: activePreset === p.key }"
          @click="pickPreset(p)"
        >{{ p.label }}</button>
      </div>

      <div class="drp-divider" />

      <!-- 右侧：双月日历面板 -->
      <div class="drp-calendar">
        <div class="drp-cal-header">
          <button class="drp-nav-btn" @click="shiftYear(-1)">&lt;&lt;</button>
          <button class="drp-nav-btn" @click="shiftMonth(-1)">&lt;</button>
          <span class="drp-month-label">{{ monthLabel(0) }}</span>
          <span class="drp-month-label">{{ monthLabel(1) }}</span>
          <button class="drp-nav-btn" @click="shiftMonth(1)">&gt;</button>
          <button class="drp-nav-btn" @click="shiftYear(1)">&gt;&gt;</button>
        </div>

        <div class="drp-cal-grids">
          <div class="drp-month" v-for="mi in [0, 1]" :key="mi">
            <div class="drp-weekdays">
              <span v-for="d in weekdays" :key="d">{{ d }}</span>
            </div>
            <div class="drp-days">
              <button
                v-for="cell in monthDays(mi)"
                :key="cell.key"
                class="drp-day"
                :class="dayClass(cell)"
                :disabled="!cell.inMonth"
                @click="pickDay(cell)"
              >{{ cell.inMonth ? cell.day : '' }}</button>
            </div>
          </div>
        </div>

        <div class="drp-cal-footer">
          <div class="drp-cal-range-hint">
            {{ calStart || '未选' }} ~ {{ calEnd || '未选' }}
          </div>
          <div class="drp-cal-actions">
            <button class="drp-btn" @click="confirmRange">确定</button>
            <button class="drp-btn ghost" @click="pickAll">全期</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { ref, computed, onMounted } from 'vue';

  const emit = defineEmits<{
    change: [start?: string, end?: string];
  }>();

  const opened = ref(false);
  const startDate = ref('');
  const endDate = ref('');
  const activePreset = ref('today');

  // 日历状态
  const baseMonth = ref(new Date().getMonth());
  const baseYear = ref(new Date().getFullYear());
  const calStart = ref('');   // YYYY-MM-DD, 日历中已点起始
  const calEnd = ref('');     // YYYY-MM-DD, 日历中已点结束

  const weekdays = ['一', '二', '三', '四', '五', '六', '日'];

  interface Preset {
    key: string;
    label: string;
    start: () => string;
    end: () => string;
  }

  const presets: Preset[] = [
    { key: 'today', label: '今日', start: () => dayjsStr(), end: () => dayjsStr() },
    { key: '7d', label: '最近7天', start: () => dayjsStr(-6), end: () => dayjsStr() },
    { key: '30d', label: '最近30天', start: () => dayjsStr(-29), end: () => dayjsStr() },
    { key: '90d', label: '最近90天', start: () => dayjsStr(-89), end: () => dayjsStr() },
  ];

  function dayjsStr(offset = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  }

  function fmt(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  const rangeLabel = computed(() => {
    if (activePreset.value === 'all') return '全期';
    const p = presets.find(p => p.key === activePreset.value);
    if (p) return p.label;
    if (startDate.value || endDate.value) {
      return `${startDate.value || '起'} ~ ${endDate.value || '今'}`;
    }
    return '全期';
  });

  // 日历逻辑
  function shiftMonth(d: number) {
    const d2 = new Date(baseYear.value, baseMonth.value + d, 1);
    baseYear.value = d2.getFullYear();
    baseMonth.value = d2.getMonth();
  }
  function shiftYear(d: number) {
    baseYear.value += d;
  }

  function monthLabel(offset: number) {
    const d = new Date(baseYear.value, baseMonth.value + offset, 1);
    return `${d.getFullYear()}年 ${d.getMonth() + 1}月`;
  }

  interface DayCell {
    key: string;
    year: number;
    month: number;
    day: number;
    inMonth: boolean;
    dateStr: string;
  }

  function monthDays(offset: number): DayCell[] {
    const y = baseYear.value;
    const m = baseMonth.value + offset;
    const first = new Date(y, m, 1);
    // 周一是一周第一天: getDay()=0(日) → idx 6; else idx-1
    const startDow = first.getDay() === 0 ? 6 : first.getDay() - 1;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells: DayCell[] = [];
    // 上月填充
    const prevMonth = new Date(y, m, 0);
    const prevDays = prevMonth.getDate();
    for (let i = startDow - 1; i >= 0; i--) {
      const d = prevDays - i;
      const date = new Date(y, m - 1, d);
      cells.push({
        key: `p-${d}`,
        year: date.getFullYear(),
        month: date.getMonth(),
        day: d,
        inMonth: false,
        dateStr: fmt(date),
      });
    }
    // 本月天数
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(y, m, d);
      cells.push({
        key: `c-${d}`,
        year: date.getFullYear(),
        month: date.getMonth(),
        day: d,
        inMonth: true,
        dateStr: fmt(date),
      });
    }
    // 下月填充(补齐6行=42格)
    const extra = 42 - cells.length;
    for (let d = 1; d <= extra; d++) {
      const date = new Date(y, m + 1, d);
      cells.push({
        key: `n-${d}`,
        year: date.getFullYear(),
        month: date.getMonth(),
        day: d,
        inMonth: false,
        dateStr: fmt(date),
      });
    }
    return cells;
  }

  function dayClass(cell: DayCell) {
    const cls: string[] = [];
    if (!cell.inMonth) cls.push('dim');
    if (cell.dateStr === calStart.value) cls.push('start');
    if (cell.dateStr === calEnd.value) cls.push('end');
    if (calStart.value && calEnd.value && cell.dateStr > calStart.value && cell.dateStr < calEnd.value) cls.push('in-range');
    const today = dayjsStr();
    if (cell.dateStr === today && !calStart.value && !calEnd.value) cls.push('today');
    return cls.join(' ');
  }

  function pickDay(cell: DayCell) {
    if (!cell.inMonth) return;
    // 无起始 → 设起始
    if (!calStart.value) {
      calStart.value = cell.dateStr;
      calEnd.value = '';
      return;
    }
    // 已有起始无结束 → 设结束(或重置起始)
    if (!calEnd.value) {
      if (cell.dateStr < calStart.value) {
        calStart.value = cell.dateStr;
        calEnd.value = '';
      } else if (cell.dateStr === calStart.value) {
        calStart.value = '';
      } else {
        calEnd.value = cell.dateStr;
      }
      return;
    }
    // 已有完整区间 → 重新开始
    calStart.value = cell.dateStr;
    calEnd.value = '';
  }

  function confirmRange() {
    if (calStart.value) {
      activePreset.value = '';
      startDate.value = calStart.value;
      endDate.value = calEnd.value || calStart.value;
      emit('change', startDate.value, endDate.value || undefined);
      opened.value = false;
    }
  }

  function pickPreset(p: Preset) {
    activePreset.value = p.key;
    startDate.value = p.start();
    endDate.value = p.end();
    emit('change', startDate.value, endDate.value);
    opened.value = false;
  }

  function pickAll() {
    activePreset.value = 'all';
    startDate.value = '';
    endDate.value = '';
    calStart.value = '';
    calEnd.value = '';
    emit('change');
    opened.value = false;
  }

  function toggle() {
    if (!opened.value) {
      // 打开时同步日历状态
      if (startDate.value) {
        calStart.value = startDate.value;
        calEnd.value = endDate.value || '';
        const d = new Date(startDate.value);
        baseYear.value = d.getFullYear();
        baseMonth.value = d.getMonth();
      }
    }
    opened.value = !opened.value;
  }

  function close() {
    opened.value = false;
  }

  onMounted(() => {
    const p = presets.find(p => p.key === 'today')!;
    startDate.value = p.start();
    endDate.value = p.end();
    emit('change', startDate.value, endDate.value);
  });

  // click-outside directive
  const vClickOutside = {
    mounted(el: HTMLElement, binding: any) {
      (el as any).__clickOutside = (e: MouseEvent) => {
        if (!el.contains(e.target as Node)) {
          binding.value();
        }
      };
      document.addEventListener('click', (el as any).__clickOutside);
    },
    unmounted(el: HTMLElement) {
      document.removeEventListener('click', (el as any).__clickOutside);
    },
  };
</script>

<style lang="less" scoped>
  .drp { position: relative; }

  .drp-trigger {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 12px;
    border: 1px solid var(--card-border-color, #ddd);
    border-radius: 6px;
    background: var(--background-color);
    color: var(--text-color);
    cursor: pointer; font-size: 13px; white-space: nowrap;
  }
  .drp-trigger:hover { border-color: #615ced; }
  .drp-arrow { font-size: 10px; color: var(--sub-text-color, #888); }

  .drp-panel {
    position: absolute; top: calc(100% + 6px); left: 0; z-index: 100;
    display: flex; gap: 0;
    padding: 16px;
    border: 1px solid var(--card-border-color, #ddd);
    border-radius: 10px;
    background: var(--card-background, var(--background-color));
    box-shadow: 0 4px 20px rgba(0,0,0,.15);
  }

  /* 左侧预设 */
  .drp-presets {
    display: flex; flex-direction: column; gap: 4px;
    min-width: 110px;
  }
  .drp-section-title {
    margin: 0 0 6px;
    font-size: 12px; font-weight: 600;
    color: var(--sub-text-color, #888);
  }
  .drp-preset-btn {
    display: block; width: 100%;
    padding: 6px 12px; border: 0; border-radius: 6px;
    background: transparent; color: var(--text-color);
    text-align: left; cursor: pointer; font-size: 13px;
  }
  .drp-preset-btn:hover { background: rgba(97,92,237,.1); }
  .drp-preset-btn.active { background: #615ced; color: #fff; }

  .drp-divider {
    width: 1px; margin: 0 16px;
    background: var(--card-border-color, #ddd);
  }

  /* 右侧日历面板 */
  .drp-calendar {
    display: flex; flex-direction: column; gap: 8px;
  }

  /* 导航 */
  .drp-cal-header {
    display: flex; align-items: center; justify-content: center; gap: 8px;
  }
  .drp-nav-btn {
    padding: 2px 6px; border: 0; border-radius: 4px;
    background: transparent; color: var(--text-color);
    cursor: pointer; font-size: 12px; line-height: 1;
  }
  .drp-nav-btn:hover { background: rgba(97,92,237,.1); }
  .drp-month-label {
    min-width: 90px; text-align: center;
    font-size: 14px; font-weight: 600; color: var(--text-color);
  }

  /* 双月网格 */
  .drp-cal-grids {
    display: flex; gap: 16px;
  }
  .drp-month { display: flex; flex-direction: column; gap: 2px; }

  .drp-weekdays {
    display: grid; grid-template-columns: repeat(7, 32px);
    text-align: center;
  }
  .drp-weekdays span {
    font-size: 11px; color: var(--sub-text-color, #888);
    padding: 4px 0; line-height: 1;
  }

  .drp-days {
    display: grid; grid-template-columns: repeat(7, 32px);
    text-align: center;
  }
  .drp-day {
    padding: 4px 0; border: 0; border-radius: 4px;
    background: transparent; color: var(--text-color);
    cursor: pointer; font-size: 12px; line-height: 1.4;
  }
  .drp-day:hover {
    background: rgba(97,92,237,.15);
    border-radius: 4px;
  }
  .drp-day.dim { visibility: hidden; cursor: default; }
  .drp-day.dim:hover { background: transparent; }
  .drp-day.today { font-weight: 700; color: #615ced; }
  .drp-day.start {
    background: #615ced; color: #fff; border-radius: 4px 0 0 4px;
  }
  .drp-day.end {
    background: #615ced; color: #fff; border-radius: 0 4px 4px 0;
  }
  .drp-day.start.end {
    border-radius: 4px;
  }
  .drp-day.in-range {
    background: rgba(97,92,237,.3); border-radius: 0;
  }

  /* 底部 */
  .drp-cal-footer {
    display: flex; align-items: center; justify-content: space-between;
    margin-top: 4px;
  }
  .drp-cal-range-hint {
    font-size: 12px; color: var(--sub-text-color, #888);
  }
  .drp-cal-actions {
    display: flex; gap: 8px;
  }
  .drp-btn {
    padding: 6px 14px; border: 0; border-radius: 6px;
    background: #615ced; color: #fff; cursor: pointer; font-size: 13px;
  }
  .drp-btn.ghost {
    background: transparent; border: 1px solid var(--card-border-color, #ddd);
    color: var(--text-color);
  }
</style>
