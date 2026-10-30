<template>
  <!-- 导出画布：固定 400×640，预览与导出只整体缩放；只放汇总数字，不放任何资源标题。 -->
  <article ref="rootRef" class="ar-poster" :class="{ 'has-keywords': keywordsShown }">
    <header class="arp-head">
      <span class="arp-brand">
        <span class="arp-brand-icon"><SvgIcon :density-aware="false" :src="icon.todoWorkspace.star" size="16" /></span>
        {{ t('annualReport.poster.brand') }}
      </span>
      <span class="arp-year">{{ report.year }}</span>
    </header>

    <section class="arp-id">
      <span class="arp-avatar">
        <SvgIcon
          :density-aware="false"
          :src="showName ? avatarSrc : icon.todoWorkspace.star"
          :size="showName ? 42 : 20"
        />
      </span>
      <span class="arp-who">
        <b>{{ showName ? displayName : t('annualReport.poster.anonymous', { year: report.year }) }}</b>
        <span>{{ t('annualReport.poster.day', { n: report.profile?.joinDays || 1 }) }}</span>
      </span>
      <span class="arp-level">Lv.{{ report.profile?.level || 1 }}</span>
    </section>

    <section class="arp-title">
      <div>
        <div class="arp-title-label">{{ t('annualReport.titles.label') }}</div>
        <div class="arp-title-text" :class="{ 'is-long': titleText.length > 12 }">{{ titleText }}</div>
        <div class="arp-title-sub">{{ titleSub }}</div>
      </div>
      <span class="arp-title-icon"><SvgIcon :density-aware="false" :src="titleIcon" size="26" /></span>
    </section>

    <section class="arp-tiles">
      <div v-for="tile in tiles" :key="tile.label">
        <b>{{ formatAnnualNumber(tile.value, locale) }}</b>
        <span>{{ tile.label }}</span>
      </div>
    </section>

    <section class="arp-box">
      <div class="arp-box-head">
        <span>{{ chart.title }}</span>
        <small>{{ chart.note }}</small>
      </div>
      <div class="arp-bars" :style="{ gridTemplateColumns: `repeat(${chart.values.length}, minmax(0, 1fr))` }">
        <i
          v-for="(value, index) in chart.values"
          :key="index"
          :class="{ peak: value > 0 && value === chart.peak }"
          :style="{ height: value ? `${Math.max(6, (value / chart.peak) * 100)}%` : '0%' }"
        />
      </div>
      <div class="arp-bar-labels" :style="{ gridTemplateColumns: `repeat(${chart.values.length}, minmax(0, 1fr))` }">
        <span v-for="(_, index) in chart.values" :key="index">{{ index + 1 }}</span>
      </div>
    </section>

    <section class="arp-box">
      <div class="arp-box-head">
        <span>{{ t('annualReport.poster.composition') }}</span>
        <small>{{ compositionNote }}</small>
      </div>
      <div class="arp-stack">
        <i
          v-for="item in composition.filter((entry) => entry.value > 0)"
          :key="item.type"
          :style="{ flex: item.value, background: ANNUAL_TYPE_META[item.type].dot }"
        />
      </div>
      <div class="arp-legend">
        <span v-for="item in legendItems" :key="item.type">
          <em :style="{ background: ANNUAL_TYPE_META[item.type].dot }" />{{ t(`annualReport.types.${item.type}`) }}
          <b>{{ formatAnnualNumber(item.value, locale) }}</b>
        </span>
      </div>
    </section>

    <section v-if="keywordsShown" class="arp-keywords">
      {{ t('annualReport.poster.keywords') }}
      <span v-for="tag in report.keywords!.top.slice(0, 3)" :key="tag.id">{{ tag.name }}</span>
    </section>

    <footer class="arp-foot">
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
  import { ANNUAL_RECORD_TYPES, ANNUAL_TYPE_META, formatAnnualNumber, type AnnualReport } from '@/utils/annualReport';
  import { annualTitleText, annualTitleSub } from './annualTitle';

  const props = defineProps<{
    report: AnnualReport;
    displayName: string;
    avatarSrc: string;
    showName: boolean;
    showKeywords: boolean;
  }>();
  const { t, locale } = useI18n();
  const rootRef = ref<HTMLElement | null>(null);
  defineExpose({ root: rootRef });

  const siteHost = new URL(SITE_ORIGIN).host;
  const light = computed(() => props.report.tier !== 'full');
  const keywordsShown = computed(
    () => props.showKeywords && !light.value && Boolean(props.report.keywords?.top.length),
  );
  const titleText = computed(() => annualTitleText(props.report, t));
  const titleSub = computed(() => annualTitleSub(props.report, t, locale.value));
  const titleIcon = computed(() => {
    const noun = props.report.title?.noun;
    return noun ? ANNUAL_TYPE_META[noun].icon : icon.organize.spark;
  });

  const tiles = computed(() => {
    const overview = props.report.overview;
    const rhythm = props.report.rhythm;
    return light.value
      ? [
          { value: overview?.total || 0, label: t('annualReport.poster.records') },
          { value: rhythm?.activeDays || 0, label: t('annualReport.poster.activeDays') },
          { value: props.report.profile?.joinDays || 1, label: t('annualReport.poster.joinDays') },
        ]
      : [
          { value: overview?.total || 0, label: t('annualReport.poster.records') },
          { value: rhythm?.activeDays || 0, label: t('annualReport.poster.activeDays') },
          { value: rhythm?.longestStreak.days || 0, label: t('annualReport.poster.streak') },
        ];
  });

  const chart = computed(() => {
    if (light.value) {
      const weeks = props.report.light?.weeks || [];
      return {
        title:
          props.report.light?.from === 'join'
            ? t('annualReport.poster.weeklyJoin')
            : t('annualReport.poster.weeklyRecent', { n: weeks.length }),
        note: t('annualReport.poster.weeklyRange', { n: weeks.length }),
        values: weeks,
        peak: Math.max(1, ...weeks),
      };
    }
    const months = props.report.rhythm?.months || Array(12).fill(0);
    const busiest = props.report.rhythm?.busiestMonth;
    return {
      title: t('annualReport.poster.monthly'),
      note: busiest ? t('annualReport.poster.monthlyPeak', { month: busiest.month, n: busiest.count }) : '',
      values: months,
      peak: Math.max(1, ...months),
    };
  });

  const composition = computed(() =>
    ANNUAL_RECORD_TYPES.map((type) => ({ type, value: props.report.overview?.byType[type] || 0 })),
  );
  const legendItems = computed(() => composition.value.filter((item) => item.value > 0 || !light.value));
  const compositionNote = computed(() => {
    const overview = props.report.overview;
    const added = t('annualReport.poster.compositionNew', { n: formatAnnualNumber(overview?.resources, locale.value) });
    const done = overview?.byType.todo
      ? t('annualReport.poster.compositionDone', { n: formatAnnualNumber(overview.byType.todo, locale.value) })
      : '';
    return added + done;
  });
</script>

<style scoped lang="less">
  .ar-poster {
    position: relative;
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    gap: 10px;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    width: 400px;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    height: 640px;
    box-sizing: border-box;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    padding: 22px;
    overflow: hidden;
    isolation: isolate;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 24px;
    color: #fff;
    background:
      radial-gradient(120% 60% at 100% 0%, rgba(139, 124, 255, 0.34) 0%, transparent 58%),
      radial-gradient(80% 40% at 0% 100%, rgba(69, 217, 255, 0.12), transparent 70%),
      linear-gradient(180deg, #13163a 0%, #0d1022 62%);
    box-shadow: 0 24px 60px -30px rgba(14, 16, 38, 0.9);
  }
  .ar-poster > * {
    flex-shrink: 0;
  }
  .arp-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    font-size: 13px;
  }
  .arp-brand {
    display: inline-flex;
    align-items: center;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    gap: 7px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: rgba(255, 255, 255, 0.88);
  }
  .arp-brand-icon {
    display: inline-flex;
    color: #45d9ff;
  }
  .arp-year {
    font-weight: 800;
    letter-spacing: 0.06em;
    color: #c4b5fd;
  }
  .arp-id {
    display: flex;
    align-items: center;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    gap: 12px;
  }
  .arp-avatar {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    width: 46px;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    height: 46px;
    overflow: hidden;
    border-radius: 14px;
    background: linear-gradient(135deg, #8b7cff, #45d9ff);
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.18);
  }
  .arp-who {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }
  .arp-who b {
    overflow: hidden;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    font-size: 17px;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .arp-who span {
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    margin-top: 3px;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    font-size: 12px;
    color: rgba(255, 255, 255, 0.66);
  }
  .arp-level {
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    font-size: 15px;
    font-weight: 800;
    color: #ffb4c4;
  }
  .arp-title {
    display: flex;
    align-items: center;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    gap: 12px;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    padding: 14px 16px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 18px;
    background: linear-gradient(120deg, rgba(139, 124, 255, 0.26), rgba(69, 217, 255, 0.1));
  }
  .arp-title > div {
    flex: 1;
    min-width: 0;
  }
  .arp-title-label {
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    font-size: 12px;
    font-weight: 700;
    color: #ffd166;
  }
  .arp-title-text {
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    margin-top: 4px;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    font-size: 26px;
    font-weight: 800;
    letter-spacing: 0.02em;
  }
  .arp-title-text.is-long {
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布，长称号缩小一号保持单行 */
    font-size: 21px;
  }
  .arp-title-sub {
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    margin-top: 4px;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    font-size: 13px;
    color: rgba(255, 255, 255, 0.75);
  }
  .arp-title-icon {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    width: 54px;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    height: 54px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 16px;
    color: #ffd166;
    background: rgba(13, 16, 34, 0.6);
  }
  .arp-tiles {
    display: grid;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    grid-template-columns: repeat(3, minmax(0, 1fr));
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    gap: 8px;
  }
  .arp-tiles div {
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    padding: 10px 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.06);
  }
  .arp-tiles b {
    display: block;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    font-size: 24px;
    font-variant-numeric: tabular-nums;
  }
  .arp-tiles span {
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    font-size: 12px;
    color: rgba(255, 255, 255, 0.7);
  }
  .arp-box {
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    padding: 12px 14px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.05);
  }
  .arp-box-head {
    display: flex;
    justify-content: space-between;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    gap: 8px;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    font-size: 13px;
    font-weight: 650;
    color: rgba(255, 255, 255, 0.9);
  }
  .arp-box-head small {
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    font-size: 12px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.62);
  }
  .arp-bars {
    display: grid;
    align-items: end;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    gap: 6px;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    height: 64px;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    margin-top: 10px;
  }
  .has-keywords .arp-bars {
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    height: 46px;
  }
  .arp-bars i {
    display: block;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    min-height: 3px;
    border-radius: 4px 4px 2px 2px;
    background: rgba(255, 255, 255, 0.18);
  }
  .arp-bars i.peak {
    background: linear-gradient(180deg, #45d9ff, #8b7cff);
  }
  .arp-bar-labels {
    display: grid;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    gap: 6px;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    margin-top: 4px;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    font-size: 11px;
    text-align: center;
    color: rgba(255, 255, 255, 0.55);
  }
  .arp-stack {
    display: flex;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    gap: 3px;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    height: 8px;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    margin-top: 10px;
  }
  .arp-stack i {
    border-radius: 4px;
  }
  .arp-legend {
    display: grid;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    grid-template-columns: repeat(5, minmax(0, 1fr));
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    margin-top: 8px;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布，英文类型名也保持单行 */
    font-size: 11px;
    white-space: nowrap;
    color: rgba(255, 255, 255, 0.7);
  }
  .arp-legend span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .arp-legend b {
    display: block;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    margin-top: 2px;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    font-size: 15px;
    color: #fff;
    font-variant-numeric: tabular-nums;
  }
  .arp-legend em {
    display: inline-block;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    width: 7px;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    height: 7px;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    margin-right: 4px;
    border-radius: 50%;
    vertical-align: 1px;
  }
  .arp-keywords {
    display: flex;
    align-items: center;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    gap: 6px;
    overflow: hidden;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    font-size: 12px;
    white-space: nowrap;
    color: rgba(255, 255, 255, 0.66);
  }
  .arp-keywords span {
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    padding: 3px 9px;
    border: 1px solid rgba(255, 142, 195, 0.55);
    border-radius: 999px;
    color: #ffd6ea;
  }
  .arp-foot {
    display: flex;
    justify-content: space-between;
    margin-top: auto;
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    padding-top: 10px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    /* ui-density-fixed: 年度报告海报为固定 400×640 导出画布 */
    font-size: 12px;
    color: rgba(255, 255, 255, 0.62);
  }
  .arp-foot b {
    color: #fff;
  }
</style>
