<template>
  <!-- 导出画布：固定 400×640 几何，预览与导出只整体缩放，不随界面密度或端型重排。 -->
  <article ref="rootRef" class="wr-poster" :class="`wr-theme-${theme}`">
    <header class="wr-p-head">
      <span class="wr-p-brand">
        <SvgIcon :density-aware="false" :src="icon.growth.rank" size="16" />
        {{ t('growth.wrBrand') }}
      </span>
      <span v-if="report.week" class="wr-p-week">
        {{ t('growth.wrWeekLabel', { year: report.weekYear, week: report.week }) }}
      </span>
    </header>

    <section class="wr-p-profile">
      <span class="wr-p-avatar">
        <SvgIcon :density-aware="false" :src="avatarSrc" size="40" />
      </span>
      <span class="wr-p-who">
        <strong>{{ displayName }}</strong>
        <span>{{ rangeLabel }}</span>
      </span>
      <span class="wr-p-rank">
        <b>Lv.{{ report.level }}</b>
        <span>{{ rankName }}</span>
      </span>
    </section>

    <section class="wr-p-hero">
      <div class="wr-p-hero-copy">
        <span class="wr-p-kicker">{{ t('growth.wrTitleKicker') }}</span>
        <h2>{{ milestone.title }}</h2>
        <p>{{ milestone.desc }}</p>
      </div>
      <span class="wr-p-emblem" aria-hidden="true">
        <SvgIcon :density-aware="false" :src="milestone.icon" size="28" />
      </span>
    </section>

    <section class="wr-p-stats">
      <div class="wr-p-stat">
        <b>{{ report.total }}</b>
        <span
          ><SvgIcon :density-aware="false" :src="icon.growth.create" size="13" />{{ t('growth.wrStatRecords') }}</span
        >
      </div>
      <div class="wr-p-stat">
        <b>{{ report.activeDays }}<small>/7</small></b>
        <span
          ><SvgIcon :density-aware="false" :src="icon.common.calendar" size="13" />{{
            t('growth.wrStatActiveDays')
          }}</span
        >
      </div>
      <div class="wr-p-stat">
        <b>+{{ report.exp }}</b>
        <span><SvgIcon :density-aware="false" :src="icon.growth.level" size="13" />{{ t('growth.wrStatExp') }}</span>
      </div>
    </section>

    <section class="wr-p-card">
      <div class="wr-p-card-head">
        <span>{{ t('growth.wrDailyRecords') }}</span>
        <em><i class="wr-p-dot is-on"></i>{{ t('growth.wrCheckedIn') }}</em>
      </div>
      <div class="wr-p-bars">
        <div v-for="day in chartDays" :key="day.key" class="wr-p-day">
          <span class="wr-p-track" :class="{ 'is-future': day.future }">
            <span v-if="!day.future" class="wr-p-fill" :class="{ 'is-zero': !day.total }" :style="day.fillStyle"></span>
          </span>
          <span class="wr-p-val" :class="{ 'is-future': day.future }">{{ day.future ? '—' : day.total }}</span>
          <span class="wr-p-lbl" :class="{ 'is-today': day.isToday }">{{ day.label }}</span>
          <i class="wr-p-dot" :class="day.future ? 'is-none' : day.checkedIn ? 'is-on' : 'is-off'"></i>
        </div>
      </div>
    </section>

    <section class="wr-p-card">
      <div class="wr-p-card-head">
        <span>{{ t('growth.wrComposition') }}</span>
        <em>{{ compositionSummary }}</em>
      </div>
      <div class="wr-p-mix">
        <span
          v-for="segment in segments"
          :key="segment.key"
          :class="`is-${segment.key}`"
          :style="{ flexGrow: segment.value }"
        ></span>
      </div>
      <div class="wr-p-legend">
        <div v-for="segment in legend" :key="segment.key">
          <span :title="segment.label">{{ segment.label }}</span>
          <b><i :class="`is-${segment.key}`"></i>{{ segment.value }}</b>
        </div>
      </div>
    </section>

    <footer class="wr-p-foot">
      <b>{{ siteHost }}</b>
      <span>{{ t('growth.wrSiteTagline') }}</span>
    </footer>
  </article>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { SITE_ORIGIN } from '@/utils/seoMeta';
  import {
    WEEKLY_REPORT_TYPES,
    weeklyReportMilestone,
    weeklyReportTheme,
    type NormalizedWeeklyReport,
    type WeeklyReportMilestoneKey,
    type WeeklyReportTypeKey,
  } from '@/utils/weeklyReport';

  const props = defineProps<{ report: NormalizedWeeklyReport; displayName: string; avatarSrc: string }>();
  const { t, locale } = useI18n();
  const rootRef = ref<HTMLElement | null>(null);
  defineExpose({ root: rootRef });

  const siteHost = new URL(SITE_ORIGIN).host;
  const theme = computed(() => weeklyReportTheme(props.report.level));
  const rankName = computed(() => props.report.levelName || t(`growth.ranks.${props.report.level}`));

  const MILESTONES: Record<WeeklyReportMilestoneKey, { title: string; icon: string }> = {
    newWeek: { title: 'wrMilestoneNewWeek', icon: icon.growth.create },
    fullAttendance: { title: 'wrMilestoneFullAttendance', icon: icon.growth.checkin },
    writer: { title: 'wrMilestoneWriter', icon: icon.resource.note },
    collector: { title: 'wrMilestoneCollector', icon: icon.resource.bookmark },
    organizer: { title: 'wrMilestoneOrganizer', icon: icon.resource.file },
    doer: { title: 'wrMilestoneDoer', icon: icon.growth.action },
    curator: { title: 'wrMilestoneCurator', icon: icon.growth.organize },
    momentum: { title: 'wrMilestoneMomentum', icon: icon.growth.level },
    pause: { title: 'wrMilestonePause', icon: icon.noteDetail.history },
    seed: { title: 'wrMilestoneSeed', icon: icon.growth.create },
  };
  const milestone = computed(() => {
    const entry = MILESTONES[weeklyReportMilestone(props.report)];
    return { title: t(`growth.${entry.title}`), desc: t(`growth.${entry.title}Desc`), icon: entry.icon };
  });

  function formatDay(value: string | null) {
    if (!value) return '--';
    return new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
      Date.parse(`${value}T00:00:00Z`),
    );
  }
  const rangeLabel = computed(() => {
    const { start, end, dataEnd, inProgress } = props.report;
    if (inProgress) return `${formatDay(start)} – ${formatDay(dataEnd)} · ${t('growth.wrInProgress')}`;
    return `${formatDay(start)} – ${formatDay(end)}`;
  });

  const chartDays = computed(() => {
    const max = Math.max(1, ...props.report.days.filter((day) => !day.future).map((day) => day.total));
    const weekday = new Intl.DateTimeFormat(locale.value, { weekday: 'short', timeZone: 'UTC' });
    return props.report.days.map((day, index) => ({
      ...day,
      key: day.day || String(index),
      label: day.isToday ? t('growth.wrToday') : day.day ? weekday.format(Date.parse(`${day.day}T00:00:00Z`)) : '',
      fillStyle: { height: day.total ? `${Math.max(12, Math.round((day.total / max) * 100))}%` : undefined },
    }));
  });

  const TYPE_LABELS: Record<WeeklyReportTypeKey, string> = {
    bookmarks: 'wrTypeBookmark',
    notes: 'wrTypeNote',
    files: 'wrTypeFile',
    todos: 'wrTypeTodo',
    organized: 'wrTypeOrganized',
  };
  const legend = computed(() =>
    WEEKLY_REPORT_TYPES.map((key) => ({
      key,
      label: t(`growth.${TYPE_LABELS[key]}`),
      value: props.report.counts[key],
    })),
  );
  const segments = computed(() => legend.value.filter((segment) => segment.value > 0));
  const compositionSummary = computed(() =>
    props.report.total
      ? t('growth.wrCompositionSummary', { created: props.report.created, completed: props.report.completed })
      : t('growth.wrNoRecords'),
  );
</script>

<style scoped lang="less">
  .wr-poster {
    --wr-primary: #8b7cff;
    --wr-secondary: #45d9ff;
    --wr-accent: #c4b5fd;
    --wr-glow: rgba(139, 124, 255, 0.3);
    --wr-soft: rgba(139, 124, 255, 0.16);
    position: relative;
    box-sizing: border-box;
    isolation: isolate;
    display: flex;
    flex-direction: column;
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    gap: 10px;
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    width: 400px;
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    height: 640px;
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    padding: 22px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 24px;
    background:
      radial-gradient(120% 60% at 100% 0%, var(--wr-glow) 0%, transparent 58%),
      linear-gradient(180deg, #13163a 0%, #0d1022 62%);
    color: #fff;
    font-family: var(--app-font-family);
    line-height: 1.4;
    text-align: left;
  }
  .wr-poster.wr-theme-ocean {
    --wr-primary: #3478f6;
    --wr-secondary: #28d9cc;
    --wr-accent: #93c5fd;
    --wr-glow: rgba(52, 120, 246, 0.32);
    --wr-soft: rgba(52, 120, 246, 0.18);
  }
  .wr-poster.wr-theme-violet {
    --wr-primary: #8b5cf6;
    --wr-secondary: #d76bff;
    --wr-accent: #c4b5fd;
    --wr-glow: rgba(139, 92, 246, 0.32);
    --wr-soft: rgba(139, 92, 246, 0.18);
  }
  .wr-poster.wr-theme-gold {
    --wr-primary: #f59e0b;
    --wr-secondary: #ff6b4a;
    --wr-accent: #ffd166;
    --wr-glow: rgba(245, 158, 11, 0.3);
    --wr-soft: rgba(245, 158, 11, 0.16);
  }
  .wr-poster.wr-theme-coral {
    --wr-primary: #f43f5e;
    --wr-secondary: #fb923c;
    --wr-accent: #fda4af;
    --wr-glow: rgba(244, 63, 94, 0.3);
    --wr-soft: rgba(244, 63, 94, 0.16);
  }

  .wr-p-head,
  .wr-p-card-head,
  .wr-p-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .wr-p-brand {
    display: inline-flex;
    align-items: center;
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    gap: 7px;
    color: rgba(255, 255, 255, 0.88);
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.04em;
  }
  .wr-p-brand .svg-icon {
    color: var(--wr-secondary);
  }
  .wr-p-week {
    color: rgba(255, 255, 255, 0.62);
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }

  .wr-p-profile {
    display: flex;
    align-items: center;
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    gap: 12px;
  }
  .wr-p-avatar {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    width: 44px;
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    height: 44px;
    overflow: hidden;
    border: 2px solid rgba(255, 255, 255, 0.72);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.12);
    box-shadow: 0 0 0 4px var(--wr-soft);
  }
  .wr-p-who {
    display: flex;
    flex: 1;
    flex-direction: column;
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    gap: 3px;
    min-width: 0;
  }
  .wr-p-who strong {
    overflow: hidden;
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    font-size: 17px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .wr-p-who span,
  .wr-p-rank span {
    color: rgba(255, 255, 255, 0.64);
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    font-size: 12px;
    white-space: nowrap;
  }
  .wr-p-rank {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    gap: 2px;
  }
  .wr-p-rank b {
    color: var(--wr-accent);
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    font-size: 15px;
  }

  .wr-p-hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    gap: 14px;
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    padding: 13px 16px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 18px;
    background: linear-gradient(125deg, var(--wr-soft), rgba(255, 255, 255, 0.035));
  }
  .wr-p-kicker {
    color: var(--wr-secondary);
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    font-size: 12px;
    font-weight: 700;
  }
  .wr-p-hero h2 {
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    margin: 3px 0;
    overflow: hidden;
    color: #fff;
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    font-size: 25px;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .wr-p-hero p {
    margin: 0;
    color: rgba(255, 255, 255, 0.74);
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    font-size: 13px;
    line-height: 1.5;
  }
  .wr-p-emblem {
    display: flex;
    align-items: center;
    justify-content: center;
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    width: 56px;
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    height: 56px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 17px;
    background: rgba(7, 10, 27, 0.45);
    color: var(--wr-secondary);
  }

  .wr-p-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    gap: 8px;
  }
  .wr-p-stat {
    min-width: 0;
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    padding: 10px 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.05);
  }
  .wr-p-stat b {
    display: block;
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    font-size: 22px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    line-height: 1.25;
  }
  .wr-p-stat small {
    color: rgba(255, 255, 255, 0.62);
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    font-size: 14px;
    font-weight: 700;
  }
  .wr-p-stat span {
    display: flex;
    align-items: center;
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    gap: 5px;
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    margin-top: 2px;
    color: rgba(255, 255, 255, 0.66);
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    font-size: 12px;
    white-space: nowrap;
  }
  .wr-p-stat .svg-icon {
    color: var(--wr-secondary);
  }

  .wr-p-card {
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    padding: 11px 14px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.04);
  }
  .wr-p-card-head {
    color: rgba(255, 255, 255, 0.86);
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    font-size: 13px;
    font-weight: 700;
  }
  .wr-p-card-head em {
    display: inline-flex;
    align-items: center;
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    gap: 5px;
    color: rgba(255, 255, 255, 0.66);
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    font-size: 12px;
    font-style: normal;
    font-weight: 600;
  }

  .wr-p-bars {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    gap: 8px;
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    margin-top: 9px;
  }
  .wr-p-day {
    display: flex;
    flex-direction: column;
    align-items: center;
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    gap: 3px;
    min-width: 0;
  }
  .wr-p-track {
    position: relative;
    box-sizing: border-box;
    width: 100%;
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    max-width: 26px;
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    height: 58px;
    overflow: hidden;
    border-radius: 7px;
    background: rgba(255, 255, 255, 0.06);
  }
  .wr-p-track.is-future {
    border: 1px dashed rgba(255, 255, 255, 0.24);
    background: transparent;
  }
  .wr-p-fill {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    border-radius: 7px 7px 5px 5px;
    background: linear-gradient(to top, var(--wr-primary), var(--wr-secondary));
  }
  .wr-p-fill.is-zero {
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    height: 4px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.18);
  }
  .wr-p-val {
    color: rgba(255, 255, 255, 0.9);
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }
  .wr-p-val.is-future {
    color: rgba(255, 255, 255, 0.5);
    font-weight: 600;
  }
  .wr-p-lbl {
    color: rgba(255, 255, 255, 0.64);
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    font-size: 12px;
    white-space: nowrap;
  }
  .wr-p-lbl.is-today {
    color: #fff;
    font-weight: 700;
  }
  .wr-p-dot {
    display: inline-block;
    box-sizing: border-box;
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    width: 7px;
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    height: 7px;
    border-radius: 50%;
  }
  .wr-p-dot.is-on {
    background: var(--wr-secondary);
  }
  .wr-p-dot.is-off {
    border: 1px solid rgba(255, 255, 255, 0.36);
  }
  .wr-p-dot.is-none {
    visibility: hidden;
  }

  .wr-p-mix {
    display: flex;
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    gap: 3px;
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    height: 8px;
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    margin: 10px 0;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.07);
  }
  .wr-p-mix span {
    min-width: 0;
    border-radius: 999px;
  }
  /* 列宽随文字，整体两端对齐：英文较长的类型名也不截断。 */
  .wr-p-legend {
    display: grid;
    grid-template-columns: repeat(5, auto);
    justify-content: space-between;
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    gap: 4px;
  }
  .wr-p-legend div {
    display: flex;
    flex-direction: column;
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    gap: 2px;
    min-width: 0;
  }
  .wr-p-legend span {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    color: rgba(255, 255, 255, 0.66);
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    font-size: 12px;
    white-space: nowrap;
  }
  .wr-p-legend i {
    display: inline-block;
    flex: 0 0 auto;
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    width: 7px;
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    height: 7px;
    border-radius: 50%;
  }
  .wr-p-legend b {
    display: inline-flex;
    align-items: center;
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    gap: 6px;
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    font-size: 16px;
    font-variant-numeric: tabular-nums;
    font-weight: 800;
  }
  /* 构成配色对齐产品资源色，在深色画布上提亮以保持可辨。 */
  .is-bookmarks {
    background: #8582ff;
  }
  .is-notes {
    background: #1fc79f;
  }
  .is-files {
    background: #ff9a2e;
  }
  .is-todos {
    background: #38bdf8;
  }
  .is-organized {
    background: #e2e8f0;
  }

  .wr-p-foot {
    margin-top: auto;
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    padding-top: 10px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    /* ui-density-fixed: 周报卡为固定 400×640 导出画布，不随界面密度缩放 */
    font-size: 12px;
  }
  .wr-p-foot b {
    color: rgba(255, 255, 255, 0.82);
    letter-spacing: 0.02em;
  }
  .wr-p-foot span {
    color: rgba(255, 255, 255, 0.6);
  }
</style>
