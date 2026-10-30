<template>
  <!-- 故事卡：固定深色海报语言，不随主题切换；桌面为 420×720 画布整体缩放，手机铺满屏幕。 -->
  <article class="ar-story" :class="[`theme-${chapter}`, `is-${variant}`, { enter: animate }]">
    <template v-if="chapter === 'cover'">
      <div class="kicker rise" style="--i: 0">
        <SvgIcon :density-aware="false" :src="icon.todoWorkspace.star" size="16" />
        <span>{{ t('annualReport.cover.kicker') }}</span>
      </div>
      <div class="cover-id rise" style="--i: 1">
        <span class="cover-avatar"><SvgIcon :density-aware="false" :src="avatarSrc" size="60" /></span>
        <div>
          <div class="cover-name">{{ displayName }}</div>
          <div class="cover-meta">
            Lv.{{ report.profile?.level || 1 }}
            <template v-if="joinedThisYear">
              · {{ t('annualReport.cover.joined', { date: formatAnnualDate(report.profile?.joinedDay, locale) }) }}
            </template>
          </div>
        </div>
      </div>
      <div class="cover-year rise" style="--i: 2">{{ report.year }}</div>
      <i18n-t
        v-if="light && joinedThisYear"
        keypath="annualReport.cover.leadJoined"
        tag="p"
        class="s-lead rise"
        style="--i: 3"
      >
        <template #date
          ><b>{{ formatAnnualDate(report.profile?.joinedDay, locale) }}</b></template
        >
        <template #days
          ><b>{{ report.profile?.joinDays }}</b></template
        >
      </i18n-t>
      <i18n-t v-else-if="light" keypath="annualReport.cover.leadLight" tag="p" class="s-lead rise" style="--i: 3">
        <template #total
          ><b>{{ number(overview.total) }}</b></template
        >
      </i18n-t>
      <i18n-t v-else keypath="annualReport.cover.lead" tag="p" class="s-lead rise" style="--i: 3">
        <template #days
          ><b>{{ number(report.profile?.joinDays || 1) }}</b></template
        >
        <template #total
          ><b>{{ number(overview.total) }}</b></template
        >
      </i18n-t>
      <div class="cover-cta rise" style="--i: 4">
        <BButton class="pill" @click.stop="emit('next')">
          {{ t('annualReport.cover.start') }}
          <SvgIcon class="pill-arrow" :density-aware="false" :src="icon.pagination.chevron" size="12" />
        </BButton>
        <BButton type="text" class="ghost" @click.stop="emit('poster')">{{ t('annualReport.directPoster') }}</BButton>
      </div>
      <div class="s-foot rise" style="--i: 5">
        <span>{{ t('annualReport.dataEnd', { date: dataEndLabel }) }} · {{ t('annualReport.aboutMinute') }}</span>
        <span>{{ t('annualReport.privateOnly') }}</span>
      </div>
    </template>

    <template v-else-if="chapter === 'overview'">
      <Kicker :number="number_" :icon="icon.growth.create" :label="t('annualReport.overview.kicker')" />
      <div class="s-head rise" style="--i: 1">
        <div class="s-big">
          {{ count(overview.total) }}<small>{{ t('annualReport.overview.unit') }}</small>
        </div>
      </div>
      <p class="s-lead rise" style="--i: 2">{{ overviewLead }}</p>
      <div class="s-body">
        <div class="bars">
          <div v-for="(item, index) in typeBars" :key="item.type" class="bar-row rise" :style="{ '--i': index + 3 }">
            <span class="bar-icon" :style="{ color: ANNUAL_TYPE_META[item.type].story }">
              <SvgIcon :density-aware="false" :src="ANNUAL_TYPE_META[item.type].icon" size="18" />
            </span>
            <span class="bar-label">{{ t(`annualReport.types.${item.type}`) }}</span>
            <span class="bar-track">
              <i
                class="grow"
                :style="{ '--i': index, width: `${item.ratio}%`, background: ANNUAL_TYPE_META[item.type].dot }"
              />
            </span>
            <span class="bar-value">{{ count(item.value) }}</span>
          </div>
        </div>
        <div v-if="light && lightItems.length" class="glass rise" style="--i: 8">
          <div class="gl">{{ t('annualReport.overview.lightItems') }}</div>
          <div v-for="item in lightItems" :key="`${item.type}:${item.id}`" class="light-item">
            <SvgIcon
              :density-aware="false"
              :src="ANNUAL_TYPE_META[item.type].icon"
              size="15"
              :style="{ color: ANNUAL_TYPE_META[item.type].story }"
            />
            <span class="light-title">{{ item.title || t('annualReport.details.untitled') }}</span>
            <span class="light-date">{{ formatAnnualDate(item.date, locale) }}</span>
          </div>
        </div>
        <div v-if="overview.first" class="glass push rise" style="--i: 9">
          <div class="gl">{{
            t('annualReport.overview.first', { date: formatAnnualDate(overview.first.date, locale) })
          }}</div>
          <div class="gv">
            <SvgIcon
              :density-aware="false"
              :src="ANNUAL_TYPE_META[overview.first.type].icon"
              size="15"
              :style="{ color: ANNUAL_TYPE_META[overview.first.type].story }"
            />
            {{ overview.first.title || t('annualReport.details.untitled') }}
          </div>
        </div>
      </div>
      <StoryFoot
        :text="
          overview.batchExcluded
            ? t('annualReport.overview.batch', { n: number(overview.batchExcluded) })
            : t('annualReport.overview.foot')
        "
        :detail="detailLabel"
        @detail="emit('details')"
      />
    </template>

    <template v-else-if="chapter === 'rhythm' && rhythm">
      <Kicker :number="number_" :icon="icon.todoWorkspace.calendar" :label="t('annualReport.rhythm.kicker')" />
      <div class="s-head rise" style="--i: 1">
        <div class="s-big"
          >{{ count(rhythm.activeDays) }}<small>{{ t('annualReport.rhythm.unit') }}</small></div
        >
      </div>
      <i18n-t
        v-if="rhythm.longestStreak.days >= 2"
        keypath="annualReport.rhythm.streak"
        tag="p"
        class="s-lead rise"
        style="--i: 2"
      >
        <template #days
          ><b>{{ t('annualReport.rhythm.streakDays', { n: rhythm.longestStreak.days }) }}</b></template
        >
        <template #range>{{ streakRange }}</template>
      </i18n-t>
      <p v-else class="s-lead rise" style="--i: 2">{{ t('annualReport.rhythm.noStreak') }}</p>
      <div class="s-body">
        <div class="cal rise" style="--i: 3" aria-hidden="true">
          <template v-for="row in calendar" :key="row.month">
            <span class="cal-month">{{ row.month }}</span>
            <i v-for="cell in row.cells" :key="cell.key" :class="cell.className" />
          </template>
        </div>
        <div class="cal-legend rise" style="--i: 4">
          {{ t('annualReport.rhythm.less') }}
          <i class="l0" /><i class="l1" /><i class="l2" /><i class="l3" /><i class="l4" />
          {{ t('annualReport.rhythm.more') }}
        </div>
        <div class="tiles push rise" style="--i: 5">
          <div v-if="rhythm.busiestMonth" class="tile">
            <b>{{ t('annualReport.rhythm.month', { n: rhythm.busiestMonth.month }) }}</b>
            <span>{{ t('annualReport.rhythm.busiestMonth') }}</span>
          </div>
          <div v-if="rhythm.busiestDay" class="tile">
            <b>{{ t('annualReport.rhythm.busiestCount', { n: rhythm.busiestDay.count }) }}</b>
            <span>{{
              t('annualReport.rhythm.busiestDay', { date: formatAnnualDate(rhythm.busiestDay.date, locale) })
            }}</span>
          </div>
          <div class="tile">
            <b>{{ t('annualReport.rhythm.days', { n: rhythm.longestStreak.days }) }}</b>
            <span>{{ t('annualReport.rhythm.longest') }}</span>
          </div>
        </div>
      </div>
      <StoryFoot :text="t('annualReport.rhythm.foot')" />
    </template>

    <template v-else-if="chapter === 'notes' && notes">
      <Kicker :number="number_" :icon="icon.resource.note" :label="t('annualReport.notes.kicker')" />
      <div class="s-head rise" style="--i: 1">
        <div class="s-big"
          >{{ count(notes.count) }}<small>{{ t('annualReport.notes.unit') }}</small></div
        >
      </div>
      <i18n-t v-if="notes.chars >= 500" keypath="annualReport.notes.lead" tag="p" class="s-lead rise" style="--i: 2">
        <template #chars
          ><b>{{ compact(notes.chars) }}</b></template
        >
        <template #avg>{{ number(notes.avgChars) }}</template>
      </i18n-t>
      <p v-else class="s-lead rise" style="--i: 2">{{ t('annualReport.notes.leadShort') }}</p>
      <div class="s-body">
        <div v-if="notes.mostRevised" class="glass rise" style="--i: 3">
          <div class="gl">{{ t('annualReport.notes.mostRevised') }}</div>
          <div class="gv">
            <span class="gv-title">{{ notes.mostRevised.title || t('annualReport.details.untitled') }}</span>
            <small>· {{ t('annualReport.notes.versions', { n: notes.mostRevised.versions }) }}</small>
          </div>
        </div>
        <div v-if="notes.longest" class="glass rise" style="--i: 4">
          <div class="gl">{{ t('annualReport.notes.longest') }}</div>
          <div class="gv">
            <span class="gv-title">{{ notes.longest.title || t('annualReport.details.untitled') }}</span>
            <small>· {{ t('annualReport.notes.chars', { n: compact(notes.longest.chars) }) }}</small>
          </div>
        </div>
        <div class="push rise" style="--i: 5">
          <div class="mini-label">{{ notesMonthlyLabel }}</div>
          <div class="months">
            <i
              v-for="(value, index) in notes.perMonth"
              :key="index"
              class="growy"
              :class="{ peak: value > 0 && value === notesPeak }"
              :style="{ '--i': index, height: `${value ? Math.max(4, (value / notesPeak) * 100) : 0}%` }"
            />
          </div>
          <div class="months-label"
            ><span v-for="index in 12" :key="index">{{ index }}</span></div
          >
        </div>
      </div>
      <StoryFoot
        :text="t('annualReport.notes.foot')"
        :detail="detailLabel && t('annualReport.notes.detail')"
        @detail="emit('details')"
      />
    </template>

    <template v-else-if="chapter === 'bookmarks' && bookmarks">
      <Kicker :number="number_" :icon="icon.resource.bookmark" :label="t('annualReport.bookmarks.kicker')" />
      <div class="s-head rise" style="--i: 1">
        <div class="s-big"
          >{{ count(bookmarks.count) }}<small>{{ t('annualReport.bookmarks.unit') }}</small></div
        >
      </div>
      <p class="s-lead rise" style="--i: 2">{{ t('annualReport.bookmarks.lead', { n: bookmarks.domains.length }) }}</p>
      <div class="s-body domains">
        <div
          v-for="(item, index) in bookmarks.domains"
          :key="item.domain"
          class="domain rise"
          :style="{ '--i': index + 3 }"
        >
          <span class="favicon">{{ item.domain.charAt(0).toUpperCase() }}</span>
          <span class="domain-name">
            <span>{{ item.domain }}</span>
            <span class="domain-track"
              ><i class="grow" :style="{ '--i': index, width: `${(item.count / domainPeak) * 100}%` }"
            /></span>
          </span>
          <span class="domain-value">{{ count(item.count) }}</span>
        </div>
        <div v-if="bookmarks.busiestDay" class="glass push rise" style="--i: 8">
          <div class="gl">{{ t('annualReport.bookmarks.busiest') }}</div>
          <div class="gv">
            {{ formatAnnualDate(bookmarks.busiestDay.date, locale) }}
            <small>· {{ t('annualReport.bookmarks.busiestValue', { n: bookmarks.busiestDay.count }) }}</small>
          </div>
        </div>
      </div>
      <StoryFoot :text="t('annualReport.bookmarks.foot')" :detail="detailLabel" @detail="emit('details')" />
    </template>

    <template v-else-if="chapter === 'keywords' && keywords && keywords.top.length">
      <Kicker :number="number_" :icon="icon.resource.tag" :label="t('annualReport.keywords.kicker')" />
      <div class="s-head rise" style="--i: 1">
        <span class="kw-main">
          <span class="kw-main-name">{{ keywords.top[0].name }}</span>
          <small>{{ t('annualReport.keywords.count', { n: keywords.top[0].count }) }}</small>
        </span>
      </div>
      <i18n-t keypath="annualReport.keywords.lead" tag="p" class="s-lead rise" style="--i: 2">
        <template #tag>{{ keywords.top[0].name }}</template>
        <template #n
          ><b>{{ t('annualReport.keywords.count', { n: keywords.top[0].count }) }}</b></template
        >
      </i18n-t>
      <div class="s-body">
        <div class="kw-list">
          <span v-for="(tag, index) in keywords.top.slice(1)" :key="tag.id" class="kw pop" :style="{ '--i': index }">
            {{ tag.name }} <small>{{ tag.count }}</small>
          </span>
        </div>
        <div v-if="keywords.newTags.length" class="glass push rise" style="--i: 5">
          <div class="gl">{{ t('annualReport.keywords.newTags') }}</div>
          <div class="gv new-tags">
            <span v-for="tag in keywords.newTags" :key="tag.id">
              {{ tag.name }}
              <small v-if="tag.month">· {{ t('annualReport.keywords.since', { month: tag.month }) }}</small>
            </span>
          </div>
        </div>
      </div>
      <StoryFoot
        :text="t('annualReport.keywords.foot')"
        :detail="detailLabel && t('annualReport.keywords.detail')"
        @detail="emit('details')"
      />
    </template>

    <template v-else-if="chapter === 'time' && time && time.peakSegment">
      <Kicker :number="number_" :icon="icon.todoWorkspace.clock" :label="t('annualReport.time.kicker')" />
      <div class="s-head rise" style="--i: 1">
        <div class="s-big time-big">{{ t(`annualReport.time.segments.${time.peakSegment.key}`) }}</div>
      </div>
      <i18n-t keypath="annualReport.time.lead" tag="p" class="s-lead rise" style="--i: 2">
        <template #share
          ><b>{{ time.peakSegment.share }}%</b></template
        >
        <template #hour
          ><b>{{ t('annualReport.time.hour', { n: time.peakHour ?? 0 }) }}</b></template
        >
      </i18n-t>
      <div class="s-body">
        <div class="rise" style="--i: 3">
          <div class="hours">
            <i
              v-for="(value, hour) in time.hours"
              :key="hour"
              class="growy"
              :class="{ peak: hour >= time.peakSegment.from && hour < time.peakSegment.to }"
              :style="{ '--i': hour, height: `${Math.max(2, (value / hoursPeak) * 100)}%` }"
            />
          </div>
          <div class="hours-axis">
            <span>{{ t('annualReport.time.axisStart') }}</span
            ><span>6</span><span>12</span><span>18</span>
            <span>{{ t('annualReport.time.axisEnd') }}</span>
          </div>
        </div>
        <div class="push rise" style="--i: 5">
          <div class="split">
            <i :style="{ width: `${time.weekdayShare}%` }" class="split-a" />
            <i :style="{ width: `${100 - time.weekdayShare}%` }" class="split-b" />
          </div>
          <div class="split-label">
            <span>{{ t('annualReport.time.weekday', { n: time.weekdayShare }) }}</span>
            <span>{{ t('annualReport.time.weekend', { n: 100 - time.weekdayShare }) }}</span>
          </div>
        </div>
      </div>
      <StoryFoot :text="t('annualReport.time.foot')" />
    </template>

    <template v-else-if="chapter === 'action' && action">
      <Kicker :number="number_" :icon="icon.todoWorkspace.checkSquare" :label="t('annualReport.action.kicker')" />
      <div class="s-head rise" style="--i: 1">
        <div v-if="action.todos" class="s-big"
          >{{ count(action.todos) }}<small>{{ t('annualReport.action.todosUnit') }}</small></div
        >
        <div v-else class="s-big"
          >{{ count(action.checkinDays) }}<small>{{ t('annualReport.action.checkinUnit') }}</small></div
        >
      </div>
      <i18n-t
        :keypath="action.level > action.startLevel ? 'annualReport.action.levelUp' : 'annualReport.action.levelKeep'"
        tag="p"
        class="s-lead rise"
        style="--i: 2"
      >
        <template #from>{{ action.startLevel }}</template>
        <template #to
          ><b>Lv.{{ action.level }}</b></template
        >
      </i18n-t>
      <div class="s-body">
        <div class="tiles two">
          <div class="tile rise" style="--i: 3">
            <SvgIcon :density-aware="false" :src="icon.growth.checkin" size="18" />
            <b>{{ t('annualReport.rhythm.days', { n: count(action.checkinDays) }) }}</b>
            <span>{{ t('annualReport.action.checkin', { n: action.longestCheckinStreak }) }}</span>
          </div>
          <div class="tile rise" style="--i: 4">
            <SvgIcon :density-aware="false" :src="icon.growth.reward" size="18" />
            <b>{{ t('annualReport.action.achievementsValue', { n: count(action.achievements) }) }}</b>
            <span>{{ t('annualReport.action.achievements') }}</span>
          </div>
          <div class="tile rise" style="--i: 5">
            <SvgIcon :density-aware="false" :src="icon.growth.level" size="18" />
            <b>
              {{
                action.level > action.startLevel
                  ? t('annualReport.action.levelDelta', { n: action.level - action.startLevel })
                  : t('annualReport.action.levelSame')
              }}
            </b>
            <span>{{ t('annualReport.action.levelRange', { from: action.startLevel, to: action.level }) }}</span>
          </div>
          <div class="tile rise" style="--i: 6">
            <SvgIcon :density-aware="false" :src="icon.growth.coin" size="18" />
            <b>{{ count(action.points) }}</b>
            <span>{{ t('annualReport.action.points') }}</span>
          </div>
        </div>
      </div>
      <StoryFoot
        :text="
          action.since > (report.start || '')
            ? t('annualReport.action.foot', { date: formatAnnualDate(action.since, locale) })
            : t('annualReport.action.footFull')
        "
      />
    </template>
  </article>
</template>

<script setup lang="ts">
  import { computed, defineComponent, h, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { AnnualReportChapter, AnnualReportRecordType } from '@lightnote/shared/annual-report';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import {
    ANNUAL_RECORD_TYPES,
    ANNUAL_TYPE_META,
    annualChapterHasDetails,
    annualDayIndex,
    annualDayLevel,
    formatAnnualCompact,
    formatAnnualDate,
    formatAnnualNumber,
    type AnnualReport,
  } from '@/utils/annualReport';

  const props = withDefaults(
    defineProps<{
      report: AnnualReport;
      chapter: AnnualReportChapter;
      /** 章节序号（封面之后从 1 起），显示在左上角。 */
      number?: number;
      variant?: 'card' | 'immersive';
      displayName: string;
      avatarSrc: string;
    }>(),
    { number: 0, variant: 'card' },
  );
  const emit = defineEmits<{ next: []; poster: []; details: [] }>();
  const { t, locale } = useI18n();

  const Kicker = defineComponent({
    props: { number: { type: Number, default: 0 }, icon: { type: String, required: true }, label: String },
    setup: (kicker) => () =>
      h('div', { class: 'kicker rise', style: '--i: 0' }, [
        h(SvgIcon, { densityAware: false, src: kicker.icon, size: '16' }),
        h('span', { class: 'kicker-number' }, String(kicker.number).padStart(2, '0')),
        h('span', kicker.label),
      ]),
  });
  const StoryFoot = defineComponent({
    props: { text: String, detail: { type: [String, Boolean], default: '' } },
    emits: ['detail'],
    setup:
      (foot, { emit: emitFoot }) =>
      () =>
        h('div', { class: 's-foot' }, [
          h('span', foot.text),
          foot.detail
            ? h(
                BButton,
                {
                  type: 'text',
                  class: 's-detail',
                  onClick: (event: Event) => (event.stopPropagation(), emitFoot('detail')),
                },
                () => String(foot.detail),
              )
            : null,
        ]),
  });

  /* ---------- 数字递增：章节切换时 0.6 秒内完成；减少动态效果时直接显示终值 ---------- */
  const reduceMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  const animate = !reduceMotion;
  const progress = ref(animate ? 0 : 1);
  let frame = 0;
  function startCount() {
    cancelAnimationFrame(frame);
    if (!animate) return;
    progress.value = 0;
    const startedAt = performance.now();
    const step = (now: number) => {
      const elapsed = Math.min(1, (now - startedAt) / 600);
      progress.value = 1 - (1 - elapsed) ** 3;
      if (elapsed < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  }
  watch(() => props.chapter, startCount, { immediate: true });
  onBeforeUnmount(() => cancelAnimationFrame(frame));

  const number = (value: number | null | undefined) => formatAnnualNumber(value, locale.value);
  const compact = (value: number | null | undefined) => formatAnnualCompact(value, locale.value);
  const count = (value: number | null | undefined) => number(Math.round(Number(value || 0) * progress.value));
  const number_ = computed(() => props.number);

  const light = computed(() => props.report.tier !== 'full');
  const overview = computed(() => props.report.overview!);
  const rhythm = computed(() => props.report.rhythm);
  const notes = computed(() => props.report.notes);
  const bookmarks = computed(() => props.report.bookmarks);
  const keywords = computed(() => props.report.keywords);
  const time = computed(() => props.report.time);
  const action = computed(() => props.report.action);
  const joinedThisYear = computed(() => {
    const joined = props.report.profile?.joinedDay;
    return Boolean(joined && props.report.start && joined >= props.report.start);
  });
  const dataEndLabel = computed(() => formatAnnualDate(props.report.dataEnd, locale.value));
  const detailLabel = computed(() =>
    props.variant === 'immersive' && annualChapterHasDetails(props.report, props.chapter)
      ? t('annualReport.viewDetails')
      : '',
  );

  const overviewLead = computed(() => {
    const byType = overview.value.byType;
    const separator = t('annualReport.overview.separator');
    if (light.value) {
      const parts = [
        byType.bookmark && t('annualReport.overview.lightBookmarks', { n: byType.bookmark }),
        byType.note && t('annualReport.overview.lightNotes', { n: byType.note }),
        byType.file && t('annualReport.overview.lightFiles', { n: byType.file }),
        byType.todo && t('annualReport.overview.lightTodos', { n: byType.todo }),
      ].filter(Boolean);
      return `${parts.join(separator)}${parts.length ? t('annualReport.overview.end') : ''}${t('annualReport.overview.lightOutro')}`;
    }
    const parts = [
      overview.value.resources && t('annualReport.overview.resources', { n: number(overview.value.resources) }),
      byType.todo && t('annualReport.overview.todos', { n: number(byType.todo) }),
      byType.organize && t('annualReport.overview.organized', { n: number(byType.organize) }),
    ].filter(Boolean) as string[];
    const sentence = parts.join(separator);
    return sentence ? `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}${t('annualReport.overview.end')}` : '';
  });
  const typeBars = computed(() => {
    const byType = overview.value.byType;
    const peak = Math.max(1, ...ANNUAL_RECORD_TYPES.map((type) => byType[type] || 0));
    return ANNUAL_RECORD_TYPES.filter((type) => !light.value || byType[type] > 0).map(
      (type: AnnualReportRecordType) => ({
        type,
        value: byType[type] || 0,
        ratio: ((byType[type] || 0) / peak) * 100,
      }),
    );
  });
  const lightItems = computed(() => [...(props.report.light?.items || [])].slice(-5).reverse());

  const streakRange = computed(() => {
    const streak = rhythm.value?.longestStreak;
    if (!streak?.start || !streak.end) return '';
    return `${formatAnnualDate(streak.start, locale.value)} – ${formatAnnualDate(streak.end, locale.value)}`;
  });
  /** 年历：行 = 月，列 = 日；统计截止日之后的日子画虚线格，月份不存在的日子留空。 */
  const calendar = computed(() => {
    const report = props.report;
    const days = report.rhythm?.days || [];
    return Array.from({ length: 12 }, (_, month) => {
      const daysInMonth = new Date(Date.UTC(report.year, month + 1, 0)).getUTCDate();
      const cells = Array.from({ length: 31 }, (_, day) => {
        const key = `${month}-${day}`;
        if (day >= daysInMonth) return { key, className: 'none' };
        const date = `${report.year}-${String(month + 1).padStart(2, '0')}-${String(day + 1).padStart(2, '0')}`;
        if (!report.dataEnd || date > report.dataEnd) return { key, className: 'future' };
        return { key, className: `l${annualDayLevel(days[annualDayIndex(report, date)] || 0)}` };
      });
      return { month: month + 1, cells };
    });
  });

  const notesPeak = computed(() => Math.max(1, ...(notes.value?.perMonth || [0])));
  const notesMonthlyLabel = computed(() => {
    const perMonth = notes.value?.perMonth || [];
    const month = perMonth.indexOf(notesPeak.value) + 1;
    return t('annualReport.notes.monthly', { month, n: notesPeak.value });
  });
  const domainPeak = computed(() => Math.max(1, ...(bookmarks.value?.domains.map((item) => item.count) || [0])));
  const hoursPeak = computed(() => Math.max(1, ...(time.value?.hours || [0])));
</script>

<style scoped lang="less">
  .ar-story {
    --a1: #8b7cff;
    --a2: #45d9ff;
    --glow: rgba(139, 124, 255, 0.32);
    position: relative;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    overflow: hidden;
    isolation: isolate;
    color: #fff;
    background:
      radial-gradient(120% 55% at 100% 0%, var(--glow) 0%, transparent 60%),
      radial-gradient(90% 40% at 0% 100%, rgba(69, 217, 255, 0.12) 0%, transparent 70%),
      linear-gradient(180deg, #13163a 0%, #0d1022 64%);
  }
  .ar-story.is-card {
    /* ui-density-fixed: 年度报告故事卡为固定 420×720 画布，整体缩放 */
    width: 420px;
    /* ui-density-fixed: 年度报告故事卡为固定 420×720 画布，整体缩放 */
    height: 720px;
    /* ui-density-fixed: 年度报告故事卡为固定 420×720 画布，整体缩放 */
    padding: 28px 28px 22px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 24px;
    box-shadow: 0 30px 70px -36px rgba(14, 16, 38, 0.95);
  }
  .ar-story.is-immersive {
    width: 100%;
    height: 100%;
    /* ui-density-fixed: 移动沉浸页专用尺寸，顶部留给进度条与关闭按钮 */
    padding: calc(env(safe-area-inset-top, 0px) + 92px) 24px calc(env(safe-area-inset-bottom, 0px) + 24px);
  }
  .theme-overview {
    --a1: #8b7cff;
    --a2: #45d9ff;
  }
  .theme-rhythm {
    --a1: #34d399;
    --a2: #45d9ff;
    --glow: rgba(52, 211, 153, 0.26);
  }
  .theme-notes {
    --a1: #2dd4aa;
    --a2: #a3e635;
    --glow: rgba(0, 168, 132, 0.32);
  }
  .theme-bookmarks {
    --a1: #8b7cff;
    --a2: #c4b5fd;
    --glow: rgba(97, 92, 237, 0.38);
  }
  .theme-keywords {
    --a1: #f472b6;
    --a2: #fb7185;
    --glow: rgba(236, 72, 153, 0.3);
  }
  .theme-time {
    --a1: #818cf8;
    --a2: #38bdf8;
    --glow: rgba(99, 102, 241, 0.34);
  }
  .theme-action {
    --a1: #38bdf8;
    --a2: #34d399;
    --glow: rgba(14, 165, 233, 0.3);
  }
  .theme-cover {
    --a1: #c4b5fd;
    --a2: #45d9ff;
    --glow: rgba(139, 124, 255, 0.4);
  }

  :deep(.kicker) {
    display: flex;
    align-items: center;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    gap: 8px;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.06em;
    color: rgba(255, 255, 255, 0.7);
  }
  :deep(.kicker) > :first-child,
  :deep(.kicker-number) {
    color: var(--a1);
    font-variant-numeric: tabular-nums;
  }
  .s-head {
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    margin-top: 26px;
  }
  .s-big {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    gap: 10px;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    font-size: 72px;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    line-height: 1;
    font-weight: 800;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
    color: #fff;
  }
  .is-immersive .s-big {
    /* ui-density-fixed: 移动沉浸页专用尺寸 */
    font-size: 64px;
  }
  .s-big small {
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    font-size: 20px;
    font-weight: 650;
    letter-spacing: 0;
    color: rgba(255, 255, 255, 0.86);
  }
  .time-big {
    white-space: nowrap;
  }
  .is-card .time-big {
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    font-size: 56px;
  }
  .is-immersive .time-big {
    /* ui-density-fixed: 移动沉浸页专用尺寸，按屏宽收缩避免折行 */
    font-size: min(56px, calc((100vw - 48px) / 5.6));
  }
  .s-lead {
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    margin: 14px 0 0;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    font-size: 16px;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.86);
  }
  .s-lead b {
    color: #fff;
  }
  .s-body {
    display: flex;
    flex: 1;
    flex-direction: column;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    gap: 14px;
    min-height: 0;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    margin-top: 24px;
  }
  .push {
    margin-top: auto;
  }
  :deep(.s-foot) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    gap: 10px;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    padding-top: 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    font-size: 12px;
    color: rgba(255, 255, 255, 0.62);
  }
  .theme-cover .s-foot {
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    margin-top: 22px;
  }
  :deep(.s-detail.b_btn) {
    flex: 0 0 auto;
    height: auto;
    line-height: inherit;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    padding: 6px 0;
    border: 0;
    background: transparent;
    color: var(--a1);
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    font-size: 13px;
    cursor: pointer;
  }
  .glass {
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    padding: 14px 16px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.06);
  }
  .gl,
  .mini-label {
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    font-size: 12px;
    color: rgba(255, 255, 255, 0.62);
  }
  .mini-label {
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    margin-bottom: 8px;
  }
  .gv {
    display: flex;
    align-items: center;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    gap: 6px;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    margin-top: 4px;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    font-size: 15px;
    font-weight: 650;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    line-height: 1.45;
  }
  .gv-title {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .gv small {
    flex: 0 0 auto;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    font-size: 13px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.7);
  }
  .new-tags {
    flex-wrap: wrap;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    gap: 4px 14px;
  }

  .cover-id {
    display: flex;
    align-items: center;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    gap: 14px;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    margin-top: 34px;
  }
  .cover-avatar {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    width: 64px;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    height: 64px;
    overflow: hidden;
    border-radius: 20px;
    background: linear-gradient(135deg, #8b7cff, #45d9ff);
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.14);
  }
  .cover-name {
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    font-size: 20px;
    font-weight: 700;
  }
  .cover-meta {
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    margin-top: 4px;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    font-size: 13px;
    color: rgba(255, 255, 255, 0.66);
  }
  .cover-year {
    margin-top: auto;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    font-size: 112px;
    font-weight: 850;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    line-height: 0.9;
    letter-spacing: -0.04em;
    color: #ece9ff;
    text-shadow: 0 0 40px rgba(139, 124, 255, 0.45);
  }
  .is-immersive .cover-year {
    /* ui-density-fixed: 移动沉浸页专用尺寸 */
    font-size: 100px;
  }
  .cover-cta {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    gap: 12px;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    margin-top: 26px;
  }
  .pill.b_btn {
    display: inline-flex;
    align-items: center;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    gap: 8px;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    height: 44px;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    padding: 0 22px;
    border: 0;
    border-radius: 22px;
    background: #fff;
    color: #191b3a;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    line-height: 44px;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
  }
  .pill-arrow {
    transform: rotate(-90deg);
  }
  .ghost.b_btn {
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    height: 44px;
    padding: 0;
    border: 0;
    background: transparent;
    color: rgba(255, 255, 255, 0.78);
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    font-size: 14px;
    text-decoration: underline;
    text-underline-offset: 4px;
    cursor: pointer;
  }
  .pill.b_btn:focus-visible,
  .ghost.b_btn:focus-visible,
  :deep(.s-detail:focus-visible) {
    outline: 2px solid #fff;
    outline-offset: 2px;
  }

  .bars {
    display: flex;
    flex-direction: column;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    gap: 12px;
  }
  .bar-row {
    display: grid;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    grid-template-columns: 22px 5.5em minmax(0, 1fr) 44px;
    align-items: center;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    gap: 8px;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    font-size: 14px;
  }
  .bar-icon {
    display: inline-flex;
  }
  .bar-label {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: rgba(255, 255, 255, 0.82);
  }
  .bar-track {
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    height: 10px;
    overflow: hidden;
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.08);
  }
  .bar-track i,
  .domain-track i {
    display: block;
    height: 100%;
    border-radius: 5px;
    transform-origin: left;
  }
  .bar-value,
  .domain-value {
    font-weight: 700;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .light-item {
    display: flex;
    align-items: center;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    gap: 8px;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    padding: 7px 0;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    font-size: 14px;
  }
  .light-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .light-date {
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    font-size: 12px;
    color: rgba(255, 255, 255, 0.55);
  }

  .cal {
    display: grid;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    grid-template-columns: 22px repeat(31, minmax(0, 1fr));
    align-items: center;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    gap: 3px;
  }
  .cal-month {
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    font-size: 11px;
    color: rgba(255, 255, 255, 0.6);
  }
  .cal i,
  .cal-legend i {
    display: block;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    height: 15px;
    border-radius: 2px;
  }
  .cal-legend i {
    display: inline-block;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    width: 9px;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    height: 9px;
  }
  .cal .none {
    background: transparent;
  }
  .cal .future {
    outline: 1px dashed rgba(255, 255, 255, 0.14);
    outline-offset: -1px;
  }
  .l0 {
    background: rgba(255, 255, 255, 0.07);
  }
  .l1 {
    background: rgba(52, 211, 153, 0.35);
  }
  .l2 {
    background: rgba(52, 211, 153, 0.6);
  }
  .l3 {
    background: rgba(52, 211, 153, 0.85);
  }
  .l4 {
    background: #eafff6;
    box-shadow: 0 0 0 1.5px #34d399;
  }
  .cal-legend {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    gap: 6px;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    font-size: 11px;
    color: rgba(255, 255, 255, 0.55);
  }
  .tiles {
    display: grid;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    grid-template-columns: repeat(3, minmax(0, 1fr));
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    gap: 8px;
  }
  .tile {
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    padding: 10px 10px 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.06);
  }
  .tile b {
    display: block;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    font-size: 22px;
    font-variant-numeric: tabular-nums;
  }
  .tile > span {
    display: block;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    margin-top: 2px;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    font-size: 12px;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    line-height: 1.4;
    color: rgba(255, 255, 255, 0.66);
  }
  .tiles.two {
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    grid-template-columns: repeat(2, minmax(0, 1fr));
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    gap: 10px;
  }
  .tiles.two .tile {
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    padding: 14px;
    color: var(--a1);
  }
  .tiles.two .tile b {
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    margin-top: 8px;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    font-size: 28px;
    color: #fff;
  }

  .months {
    display: grid;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    grid-template-columns: repeat(12, minmax(0, 1fr));
    align-items: end;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    gap: 6px;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    height: 72px;
  }
  .months i {
    display: block;
    border-radius: 4px 4px 2px 2px;
    background: rgba(255, 255, 255, 0.18);
    transform-origin: bottom;
  }
  .months i.peak {
    background: linear-gradient(180deg, #a3e635, #2dd4aa);
  }
  .months-label {
    display: grid;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    grid-template-columns: repeat(12, minmax(0, 1fr));
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    gap: 6px;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    margin-top: 4px;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    font-size: 11px;
    text-align: center;
    color: rgba(255, 255, 255, 0.55);
  }

  .domains {
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    gap: 16px;
  }
  .domain {
    display: grid;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    grid-template-columns: 26px minmax(0, 1fr) 40px;
    align-items: center;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    gap: 10px;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    font-size: 14px;
  }
  .favicon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    width: 26px;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    height: 26px;
    border-radius: 7px;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    font-size: 12px;
    font-weight: 700;
    background: rgba(255, 255, 255, 0.1);
  }
  .domain-name {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .domain-name > span:first-child {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .domain-track {
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    height: 6px;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    margin-top: 5px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.08);
  }
  .domain-track i {
    background: var(--a1);
  }

  .kw-main {
    display: inline-flex;
    align-items: center;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    gap: 10px;
    max-width: 100%;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    padding: 12px 20px;
    border: 2px solid #ff8ec3;
    border-radius: 999px;
    background: rgba(236, 72, 153, 0.18);
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    font-size: 34px;
    font-weight: 800;
  }
  .kw-main-name {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .kw-main small {
    flex: 0 0 auto;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    font-size: 15px;
    font-weight: 650;
    color: #ffc4de;
  }
  .kw-list {
    display: flex;
    flex-wrap: wrap;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    gap: 10px;
  }
  .kw {
    display: inline-flex;
    align-items: center;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    gap: 6px;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    padding: 7px 14px;
    border: 1px solid rgba(255, 142, 195, 0.55);
    border-radius: 999px;
    background: rgba(236, 72, 153, 0.08);
    color: #ffd6ea;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    font-size: 15px;
    font-weight: 600;
  }
  .kw small {
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    font-size: 12px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.62);
  }

  .hours {
    display: flex;
    align-items: flex-end;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    gap: 3px;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    height: 150px;
  }
  .hours i {
    flex: 1;
    border-radius: 3px 3px 1px 1px;
    background: rgba(255, 255, 255, 0.16);
    transform-origin: bottom;
  }
  .hours i.peak {
    background: linear-gradient(180deg, var(--a2), var(--a1));
  }
  .hours-axis,
  .split-label {
    display: flex;
    justify-content: space-between;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    margin-top: 6px;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    font-size: 11px;
    color: rgba(255, 255, 255, 0.55);
  }
  .split-label {
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    font-size: 13px;
    color: rgba(255, 255, 255, 0.75);
  }
  .split {
    display: flex;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    gap: 2px;
    /* ui-density-fixed: 年度报告故事卡为固定画布 */
    height: 12px;
    overflow: hidden;
    border-radius: 6px;
  }
  .split i {
    display: block;
  }
  .split-a {
    background: var(--a1);
  }
  .split-b {
    background: var(--a2);
  }

  /* 入场动效只做状态衔接，0.7 秒内结束；减少动态效果时整体关闭。 */
  .enter :deep(.rise) {
    animation: annual-rise 0.5s cubic-bezier(0.2, 0.7, 0.2, 1) both;
    animation-delay: calc(var(--i, 0) * 70ms);
  }
  .enter .grow {
    animation: annual-grow 0.7s cubic-bezier(0.2, 0.7, 0.2, 1) both;
    animation-delay: calc(240ms + var(--i, 0) * 40ms);
  }
  .enter .growy {
    animation: annual-growy 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) both;
    animation-delay: calc(200ms + var(--i, 0) * 18ms);
  }
  .enter .pop {
    animation: annual-pop 0.35s ease-out both;
    animation-delay: calc(200ms + var(--i, 0) * 28ms);
  }
  @keyframes annual-rise {
    from {
      opacity: 0;
      transform: translateY(14px);
    }
  }
  @keyframes annual-grow {
    from {
      transform: scaleX(0);
    }
  }
  @keyframes annual-growy {
    from {
      transform: scaleY(0);
    }
  }
  @keyframes annual-pop {
    from {
      opacity: 0;
      transform: scale(0.4);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .enter :deep(.rise),
    .enter .grow,
    .enter .growy,
    .enter .pop {
      animation: none;
    }
  }
</style>
