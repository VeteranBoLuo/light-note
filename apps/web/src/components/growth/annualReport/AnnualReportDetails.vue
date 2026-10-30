<template>
  <div class="ar-details" :class="{ 'is-sheet': sheet }">
    <template v-if="content">
      <h3 class="ard-title">
        <span class="ard-lock"><SvgIcon :src="icon.growth.lock" size="14" /></span>
        {{ content.title }}
      </h3>
      <p class="ard-sub">{{ t('annualReport.privateOnly') }} · {{ content.sub }}</p>
      <div class="ard-rows">
        <div v-for="row in content.rows" :key="row.key" class="ard-row">
          <span class="ard-icon" :class="`is-${row.tone}`">
            <b v-if="row.letter">{{ row.letter }}</b>
            <SvgIcon v-else :src="row.icon" size="16" />
          </span>
          <span class="ard-text">
            <span class="ard-name">{{ row.title }}</span>
            <small v-if="row.sub">{{ row.sub }}</small>
          </span>
          <span v-if="row.value" class="ard-value">{{ row.value }}</span>
          <BButton v-if="row.target" type="text" size="small" class="ard-open" @click="emit('open', row.target)">
            {{ row.action }}
          </BButton>
        </div>
      </div>
      <section v-if="typeRows.length" class="ard-section">
        <h4>{{ t('annualReport.details.byType') }}</h4>
        <div class="ard-rows">
          <div v-for="row in typeRows" :key="row.type" class="ard-row">
            <span class="ard-icon" :class="`is-${row.type}`"><SvgIcon :src="row.icon" size="16" /></span>
            <span class="ard-text"
              ><span class="ard-name">{{ t(`annualReport.types.${row.type}`) }}</span></span
            >
            <span class="ard-value">{{ formatAnnualNumber(row.value, locale) }}</span>
          </div>
        </div>
      </section>
    </template>
    <template v-else-if="tip">
      <h3 class="ard-title">
        <span class="ard-lock"><SvgIcon :src="icon.growth.lock" size="14" /></span>
        {{ tip.title }}
      </h3>
      <p class="ard-tip">{{ tip.body }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, type RouteLocationRaw } from 'vue-router';
  import type { AnnualReportChapter } from '@lightnote/shared/annual-report';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { resolveResourceRoute } from '@/utils/resourceNavigation';
  import {
    ANNUAL_RECORD_TYPES,
    ANNUAL_TYPE_META,
    formatAnnualCompact,
    formatAnnualDate,
    formatAnnualNumber,
    type AnnualReport,
    type AnnualResourceItem,
  } from '@/utils/annualReport';

  const props = defineProps<{ report: AnnualReport; chapter: AnnualReportChapter; sheet?: boolean }>();
  const emit = defineEmits<{ open: [target: RouteLocationRaw] }>();
  const { t, locale } = useI18n();
  const route = useRoute();

  interface DetailRow {
    key: string;
    tone: string;
    icon?: string;
    letter?: string;
    title: string;
    sub?: string;
    value?: string;
    action?: string;
    target?: RouteLocationRaw | null;
  }

  function resourceRow(item: AnnualResourceItem, sub: string): DetailRow {
    return {
      key: `${item.type}:${item.id}`,
      tone: item.type,
      icon: ANNUAL_TYPE_META[item.type].icon,
      title: item.title || t('annualReport.details.untitled'),
      sub,
      action: t('annualReport.details.open'),
      target: resolveResourceRoute(
        { type: item.type, id: item.id, title: item.title },
        { noteReturnPath: route.fullPath },
      ),
    };
  }

  const content = computed(() => {
    const report = props.report;
    if (props.chapter === 'overview' && report.tier !== 'full' && report.light?.items.length) {
      return {
        title: t('annualReport.details.lightTitle'),
        sub: t('annualReport.details.lightSub'),
        rows: [...report.light.items]
          .reverse()
          .map((item) => resourceRow(item, formatAnnualDate(item.date, locale.value))),
      };
    }
    if (props.chapter === 'overview' && report.overview?.first) {
      const rows = [
        resourceRow(
          report.overview.first,
          t('annualReport.details.firstOfYear', { date: formatAnnualDate(report.overview.first.date, locale.value) }),
        ),
      ];
      const last = report.overview.last;
      if (last && `${last.type}:${last.id}` !== rows[0].key) {
        rows.push(
          resourceRow(last, t('annualReport.details.latest', { date: formatAnnualDate(last.date, locale.value) })),
        );
      }
      return { title: t('annualReport.details.overviewTitle'), sub: t('annualReport.details.overviewSub'), rows };
    }
    if (props.chapter === 'notes' && report.notes?.highlights.length) {
      return {
        title: t('annualReport.details.notesTitle'),
        sub: t('annualReport.details.notesSub'),
        rows: report.notes.highlights.map((note) => ({
          ...resourceRow({ type: 'note', id: note.id, title: note.title, date: null }, ''),
          value: note.versions
            ? t('annualReport.notes.versions', { n: note.versions })
            : note.chars
              ? t('annualReport.notes.chars', { n: formatAnnualCompact(note.chars, locale.value) })
              : '',
        })),
      };
    }
    if (props.chapter === 'bookmarks' && report.bookmarks?.domains.length) {
      return {
        title: t('annualReport.details.bookmarksTitle'),
        sub: t('annualReport.details.bookmarksSub'),
        rows: report.bookmarks.domains.map<DetailRow>((item) => ({
          key: item.domain,
          tone: 'bookmark',
          letter: item.domain.charAt(0).toUpperCase(),
          title: item.domain,
          value: t('annualReport.details.domainCount', { n: item.count }),
          action: t('annualReport.details.view'),
          target: { path: '/search', query: { q: item.domain, type: 'bookmark' } },
        })),
      };
    }
    if (props.chapter === 'keywords' && report.keywords?.top.length) {
      return {
        title: t('annualReport.details.keywordsTitle'),
        sub: t('annualReport.details.keywordsSub'),
        rows: report.keywords.top.map<DetailRow>((tag) => ({
          key: tag.id,
          tone: 'tag',
          icon: icon.resource.tag,
          title: tag.name,
          value: t('annualReport.details.tagCount', { n: tag.count }),
          action: t('annualReport.details.enter'),
          target: resolveResourceRoute({ type: 'tag', id: tag.id }),
        })),
      };
    }
    return null;
  });

  const typeRows = computed(() => {
    if (props.chapter !== 'overview' || props.report.tier !== 'full') return [];
    const byType = props.report.overview?.byType;
    return ANNUAL_RECORD_TYPES.filter((type) => (byType?.[type] || 0) > 0).map((type) => ({
      type,
      icon: ANNUAL_TYPE_META[type].icon,
      value: byType?.[type] || 0,
    }));
  });

  const tip = computed(() => {
    const since = props.report.action?.since;
    const startsLate = Boolean(since && props.report.start && since > props.report.start);
    switch (props.chapter) {
      case 'cover':
        return { title: t('annualReport.details.tips.coverTitle'), body: t('annualReport.details.tips.coverBody') };
      case 'rhythm':
        return { title: t('annualReport.details.tips.rhythmTitle'), body: t('annualReport.details.tips.rhythmBody') };
      case 'time':
        return { title: t('annualReport.details.tips.timeTitle'), body: t('annualReport.details.tips.timeBody') };
      case 'action':
        return startsLate
          ? {
              title: t('annualReport.details.tips.actionTitle', { date: formatAnnualDate(since, locale.value) }),
              body: t('annualReport.details.tips.actionBody'),
            }
          : {
              title: t('annualReport.details.tips.actionFullTitle'),
              body: t('annualReport.details.tips.actionFullBody'),
            };
      default:
        return null;
    }
  });
</script>

<style scoped lang="less">
  .ar-details {
    color: var(--text-color);
  }
  .ard-title {
    display: flex;
    align-items: center;
    gap: var(--ui-space-6, 6px);
    margin: 0 0 var(--ui-space-4, 4px);
    font-size: var(--ui-font-15, 15px);
    font-weight: 650;
  }
  .ard-lock {
    display: inline-flex;
    color: var(--desc-color);
  }
  .ard-sub,
  .ard-tip {
    margin: 0 0 var(--ui-space-12, 12px);
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .ard-tip {
    margin-top: var(--ui-space-6, 6px);
    font-size: var(--ui-font-13, 13px);
    line-height: 1.6;
  }
  .ard-rows {
    display: flex;
    flex-direction: column;
  }
  .ard-row {
    display: flex;
    align-items: center;
    gap: var(--ui-space-10, 10px);
    min-height: var(--ui-layout-44, 44px);
    padding: var(--ui-space-6, 6px) 0;
    border-top: 1px solid var(--workspace-divider);
  }
  .ard-row:first-child {
    border-top: 0;
  }
  .ard-icon {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: var(--ui-layout-30, 30px);
    height: var(--ui-layout-30, 30px);
    border: 1px solid currentColor;
    border-radius: 8px;
    font-size: var(--ui-font-13, 13px);
  }
  .ard-icon.is-bookmark {
    color: var(--resource-bookmark-color);
  }
  .ard-icon.is-note {
    color: var(--resource-note-color);
  }
  .ard-icon.is-file {
    color: var(--resource-file-color);
  }
  .ard-icon.is-tag {
    color: var(--resource-tag-color);
  }
  .ard-icon.is-todo {
    color: var(--todo-module-color);
  }
  .ard-icon.is-organize {
    color: var(--workspace-purple-text);
  }
  .ard-text {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }
  .ard-name {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: var(--ui-font-14, 14px);
  }
  .ard-text small {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .ard-value {
    flex: 0 0 auto;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .ard-open {
    flex: 0 0 auto;
    color: var(--workspace-purple-text);
  }
  .ard-section {
    margin-top: var(--ui-space-18, 18px);
    padding-top: var(--ui-space-14, 14px);
    border-top: 1px solid var(--workspace-divider);
  }
  .ard-section h4 {
    margin: 0 0 var(--ui-space-8, 8px);
    font-size: var(--ui-font-13, 13px);
    font-weight: 600;
  }
</style>
