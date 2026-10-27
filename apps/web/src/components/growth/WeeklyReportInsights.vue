<template>
  <aside class="wr-insights" :class="{ 'is-mobile': isMobile }">
    <p class="wr-private-line">
      <SvgIcon :src="icon.growth.lock" size="14" />
      <b>{{ t('growth.wrPrivateOnly') }}</b>
      <span>· {{ t('growth.wrPrivateHint') }}</span>
    </p>

    <section v-if="report.prev" class="wr-card">
      <div class="wr-card-head">
        <span class="wr-card-title">{{ isLast ? t('growth.wrCompareLast') : t('growth.wrCompareCurrent') }}</span>
        <span v-if="!justStarted && compareRange" class="wr-card-meta">{{ compareRange }}</span>
      </div>
      <template v-if="justStarted">
        <div class="wr-compare-line">
          <span class="wr-compare-badge is-flat" aria-hidden="true">·</span>
          <strong>{{ t('growth.wrCompareJustStarted') }}</strong>
        </div>
        <p class="wr-compare-sub">{{ t('growth.wrCompareJustStartedDesc') }}</p>
      </template>
      <template v-else>
        <div class="wr-compare-line">
          <span class="wr-compare-badge" :class="`is-${direction}`" aria-hidden="true">{{ ARROWS[direction] }}</span>
          <strong :class="`is-${direction}`">{{ compareHeadline }}</strong>
        </div>
        <p class="wr-compare-sub">
          {{
            t('growth.wrCompareDetail', {
              label: periodLabel,
              current: report.total,
              previous: report.prevTotal,
            })
          }}
        </p>
        <div class="wr-compare-grid">
          <div v-for="cell in compareCells" :key="cell.key" class="wr-compare-cell">
            <span class="wr-compare-label" :title="cell.label"
              ><i :class="`is-${cell.key}`"></i><span>{{ cell.label }}</span></span
            >
            <b>{{ cell.value }}</b>
            <span class="wr-delta" :class="`is-${cell.direction}`">{{ cell.deltaText }}</span>
          </div>
        </div>
      </template>
    </section>

    <section v-if="report.items" class="wr-card">
      <div class="wr-card-head">
        <span class="wr-card-title">{{ isLast ? t('growth.wrItemsLast') : t('growth.wrItemsCurrent') }}</span>
        <span class="wr-card-meta">{{
          report.created ? t('growth.wrItemsCount', { n: report.created }) : t('growth.wrItemsMeta')
        }}</span>
      </div>
      <div v-if="!report.items.length" class="wr-items-empty">
        <p>{{ t('growth.wrItemsEmpty') }}<br />{{ t('growth.wrItemsEmptyHint') }}</p>
        <BButton v-if="!readOnly" size="small" @click="emit('navigate', '/noteLibrary')">
          <SvgIcon :src="icon.resource.note" size="15" />{{ t('growth.wrItemsEmptyAction') }}
        </BButton>
      </div>
      <template v-else>
        <ul class="wr-items">
          <li v-for="item in visibleItems" :key="`${item.type}:${item.id}`">
            <BButton
              class="wr-item"
              type="text"
              :title="item.title || t('growth.wrUntitled')"
              v-click-log="{ module: '成长', operation: '从周报打开资源' }"
              @click="openItem(item)"
            >
              <span class="wr-item-icon" :class="`is-${item.type}`"
                ><SvgIcon :src="ITEM_ICONS[item.type]" size="16"
              /></span>
              <span class="wr-item-title">{{ item.title || t('growth.wrUntitled') }}</span>
              <span class="wr-item-day">{{ weekdayOf(item.day) }}</span>
            </BButton>
          </li>
        </ul>
        <div v-if="report.items.length > PREVIEW_COUNT || truncated" class="wr-items-more">
          <BButton v-if="report.items.length > PREVIEW_COUNT" type="text" @click="expanded = !expanded">
            {{
              expanded
                ? t('growth.wrItemsCollapse')
                : t('growth.wrItemsExpand', { n: report.items.length - PREVIEW_COUNT })
            }}
          </BButton>
          <span v-if="expanded && truncated" class="wr-card-meta">{{
            t('growth.wrItemsLimited', { n: report.items.length })
          }}</span>
        </div>
      </template>
    </section>

    <section class="wr-card">
      <div class="wr-challenge-head">
        <div class="wr-challenge-heading">
          <span class="wr-card-title">{{ t('growth.wrChallengeTitle') }}</span>
          <span v-if="weekly" class="wr-card-meta">{{ challengeSummary }}</span>
        </div>
        <div class="wr-challenge-actions">
          <BButton type="text" @click="emit('navigate', allChallengesRoute)">{{ t('growth.wrChallengeAll') }}</BButton>
          <BButton
            v-if="claimable"
            size="small"
            class="wr-claim"
            :loading="claimingKey === claimable.key"
            :disabled="readOnly || Boolean(claimingKey) || claimingRewards"
            :title="readOnly ? t('growth.adminContextActionUnavailable') : challengeName(claimable.key)"
            @click="claim(claimable)"
          >
            <SvgIcon :src="icon.growth.reward" size="15" />{{ t('growth.wrChallengeClaim', { n: claimable.reward }) }}
          </BButton>
        </div>
      </div>
      <BLoading v-if="!weekly && weeklyLoading" inline loading class="wr-challenge-state" />
      <div v-else-if="!weekly" class="wr-challenge-state">
        <span>{{ t('growth.wrChallengeLoadFailed') }}</span>
        <BButton type="text" @click="reloadWeekly">{{ t('growth.wrRetry') }}</BButton>
      </div>
      <p v-else-if="!pendingChallenges.length" class="wr-challenge-state">{{ t('growth.wrChallengeAllDone') }}</p>
      <template v-else>
        <div v-for="challenge in pendingChallenges" :key="challenge.key" class="wr-challenge-row">
          <span class="wr-challenge-icon"
            ><SvgIcon :src="CHALLENGE_ICONS[challenge.metric] || icon.growth.action" size="16"
          /></span>
          <div class="wr-challenge-main">
            <div class="wr-challenge-name">
              <span>{{ challengeName(challenge.key) }}</span>
              <em>{{ challenge.cur }}/{{ challenge.target }}</em>
              <small>{{ t('growth.weeklyReward', { n: challenge.reward }) }}</small>
            </div>
            <BProgress :percent="progressOf(challenge)" size="small" :show-info="false" />
          </div>
          <span v-if="challenge.metric === 'activeDays' && weekly?.todayActive" class="wr-challenge-today">
            <SvgIcon :src="icon.message.success" size="13" />{{ t('growth.wrChallengeTodayDone') }}
          </span>
          <BButton
            v-else-if="!readOnly && challengeRoute(challenge)"
            type="text"
            class="wr-challenge-go"
            v-click-log="{ module: '成长', operation: `从周报前往每周挑战-${challenge.key}` }"
            @click="emit('navigate', challengeRoute(challenge)!)"
          >
            {{ goLabel(challenge.metric) }}
          </BButton>
        </div>
      </template>
    </section>
  </aside>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { RouteLocationRaw } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BProgress from '@/components/base/BasicComponents/BProgress.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { recordOperation } from '@/api/commonApi';
  import { useGrowth, type WeeklyChallenge } from '@/composables/useGrowth';
  import { useMobileLayout } from '@/composables/useMobileLayout';
  import { resolveGrowthActionRoute, resolveWeeklyChallengeRoute } from '@/utils/growthNavigation';
  import { resolveResourceRoute } from '@/utils/resourceNavigation';
  import {
    WEEKLY_REPORT_TYPES,
    weeklyReportDirection,
    type NormalizedWeeklyReport,
    type WeeklyReportItem,
    type WeeklyReportTypeKey,
  } from '@/utils/weeklyReport';

  const props = defineProps<{ report: NormalizedWeeklyReport; readOnly?: boolean }>();
  const emit = defineEmits<{ navigate: [target: RouteLocationRaw] }>();
  const { t, te, locale } = useI18n();
  const isMobile = useMobileLayout();
  const { weekly, loadWeekly, claimWeekly, claimingRewards } = useGrowth();

  const PREVIEW_COUNT = 4;
  const ARROWS = { up: '↑', down: '↓', flat: '=' } as const;
  const ITEM_ICONS = { bookmark: icon.resource.bookmark, note: icon.resource.note, file: icon.resource.file };
  const CHALLENGE_ICONS: Record<string, string> = {
    communityPosts: icon.growth.achievement.community_post_1,
    bookmark: icon.resource.bookmark,
    collect: icon.resource.bookmark,
    note: icon.resource.note,
    checkin: icon.growth.checkin,
    todo: icon.growth.action,
    progress: icon.growth.action,
    organize: icon.growth.organize,
    variety: icon.growth.organize,
    activeDays: icon.common.calendar,
  };
  const GO_LABELS: Record<string, string> = {
    note: 'wrGoNote',
    bookmark: 'wrGoCollect',
    collect: 'wrGoCollect',
    todo: 'wrGoTodo',
    progress: 'wrGoTodo',
    organize: 'wrGoOrganize',
    variety: 'wrGoOrganize',
    activeDays: 'wrGoOrganize',
    communityPosts: 'wrGoCommunity',
    checkin: 'wrGoCheckin',
  };
  const TYPE_LABELS: Record<WeeklyReportTypeKey, string> = {
    bookmarks: 'wrTypeBookmark',
    notes: 'wrTypeNote',
    files: 'wrTypeFile',
    todos: 'wrTypeTodo',
    organized: 'wrTypeOrganized',
  };

  const isLast = computed(() => props.report.kind === 'last' || !props.report.inProgress);
  // 更早的通知快照没有周期类型，用中性的「这一周」，避免把几周前说成上周。
  const periodLabel = computed(() => {
    if (props.report.inProgress) return t('growth.wrPeriodCurrent');
    return props.report.kind === 'last' ? t('growth.wrPeriodLast') : t('growth.wrPeriodThatWeek');
  });
  const justStarted = computed(
    () => props.report.inProgress && props.report.total === 0 && props.report.elapsedDays <= 1,
  );

  function formatDay(value: string | null) {
    if (!value) return '';
    return new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
      Date.parse(`${value}T00:00:00Z`),
    );
  }
  function weekdayOf(value: string | null) {
    if (!value) return '';
    return new Intl.DateTimeFormat(locale.value, { weekday: 'short', timeZone: 'UTC' }).format(
      Date.parse(`${value}T00:00:00Z`),
    );
  }

  const compareRange = computed(() => {
    const { compareStart, compareEnd } = props.report;
    if (!compareStart || !compareEnd) return '';
    const range = `${formatDay(compareStart)} – ${formatDay(compareEnd)}`;
    return isLast.value ? t('growth.wrCompareLastRange', { range }) : t('growth.wrCompareCurrentRange', { range });
  });
  const direction = computed(() => weeklyReportDirection(props.report.total - props.report.prevTotal));
  const compareHeadline = computed(() => {
    const delta = props.report.total - props.report.prevTotal;
    if (direction.value === 'up') return t('growth.wrCompareUp', { n: delta });
    if (direction.value === 'down') return t('growth.wrCompareDown', { n: -delta });
    return t('growth.wrCompareFlat');
  });
  const compareCells = computed(() =>
    WEEKLY_REPORT_TYPES.map((key) => {
      const value = props.report.counts[key];
      const delta = value - (props.report.prev?.[key] || 0);
      const cellDirection = weeklyReportDirection(delta);
      return {
        key,
        label: t(`growth.${TYPE_LABELS[key]}`),
        value,
        direction: cellDirection,
        deltaText:
          cellDirection === 'up' ? `↑ ${delta}` : cellDirection === 'down' ? `↓ ${-delta}` : t('growth.wrDeltaFlat'),
      };
    }),
  );

  const expanded = ref(false);
  watch(
    () => [props.report.kind, props.report.start],
    () => {
      expanded.value = false;
    },
  );
  const visibleItems = computed(() =>
    expanded.value ? props.report.items || [] : (props.report.items || []).slice(0, PREVIEW_COUNT),
  );
  const truncated = computed(() => (props.report.items?.length || 0) < props.report.created);
  function openItem(item: WeeklyReportItem) {
    const target = resolveResourceRoute({ type: item.type, id: item.id, title: item.title });
    if (target) emit('navigate', target);
  }

  const weeklyLoading = ref(false);
  async function reloadWeekly() {
    weeklyLoading.value = true;
    try {
      await loadWeekly();
    } finally {
      weeklyLoading.value = false;
    }
  }
  onMounted(reloadWeekly);

  const pendingChallenges = computed(() =>
    (weekly.value?.challenges || [])
      .filter((challenge) => !challenge.done)
      .sort((left, right) => left.target - left.cur - (right.target - right.cur))
      .slice(0, 2),
  );
  const claimable = computed(() => (weekly.value?.challenges || []).find((challenge) => challenge.claimable) || null);
  const challengeSummary = computed(() => {
    const challenges = weekly.value?.challenges || [];
    const weekday = new Date().getDay() || 7;
    const left = 7 - weekday;
    return t('growth.wrChallengeSummary', {
      done: challenges.filter((challenge) => challenge.done).length,
      total: challenges.length,
      left: left > 0 ? t('growth.wrChallengeDaysLeft', { n: left }) : t('growth.wrChallengeLastDay'),
    });
  });
  const allChallengesRoute = computed(() => resolveGrowthActionRoute('open_weekly_challenges', isMobile.value)!);

  function challengeName(key: string) {
    const path = `growth.weeklyName.${key}`;
    return te(path) ? t(path) : key;
  }
  function progressOf(challenge: WeeklyChallenge) {
    return challenge.target ? Math.min(100, Math.round((challenge.cur / challenge.target) * 100)) : 0;
  }
  function challengeRoute(challenge: WeeklyChallenge) {
    return resolveWeeklyChallengeRoute(challenge.metric, isMobile.value);
  }
  function goLabel(metric: string) {
    return t(`growth.${GO_LABELS[metric] || 'wrGoDefault'}`);
  }

  const claimingKey = ref<string | null>(null);
  async function claim(challenge: WeeklyChallenge) {
    if (props.readOnly || claimingKey.value || claimingRewards.value) return;
    claimingKey.value = challenge.key;
    try {
      const res = await claimWeekly(challenge.key);
      if (res?.status === 200 && res.data?.ok) {
        message.success(
          t(Number(res.data.reward) > 0 ? 'growth.weeklyClaimOk' : 'growth.rewardClaimed', { n: res.data.reward }),
        );
        recordOperation({ module: '成长', operation: `领取每周挑战 ${challenge.key}（+${res.data.reward} 积分）` });
      } else if (res?.data?.msg) {
        message.info(res.data.msg);
      }
    } catch (error) {
      console.error('领取每周挑战失败:', error);
    } finally {
      claimingKey.value = null;
    }
  }
</script>

<style scoped lang="less">
  .wr-insights {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-6, 6px);
    min-width: 0;
  }
  .wr-private-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ui-space-6, 6px);
    margin: 0;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .wr-private-line .svg-icon {
    color: var(--primary-color);
  }
  .wr-private-line b {
    color: var(--text-color);
    font-weight: 600;
  }

  .wr-card {
    padding: var(--ui-space-12, 12px) var(--ui-space-16, 16px);
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--surface-card-bg);
  }
  .wr-card-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--ui-space-10, 10px);
  }
  .wr-card-title {
    color: var(--text-color);
    font-size: var(--ui-font-14, 14px);
    font-weight: 600;
    white-space: nowrap;
  }
  .wr-card-meta {
    min-width: 0;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  .wr-compare-line {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    margin-top: var(--ui-space-10, 10px);
  }
  .wr-compare-line strong {
    color: var(--text-color);
    font-size: var(--ui-font-20, 20px);
    font-weight: 700;
  }
  .wr-compare-line strong.is-up {
    color: var(--success-color);
  }
  .wr-compare-line strong.is-down {
    color: var(--warning-color);
  }
  .wr-compare-badge {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: var(--ui-space-22, 22px);
    height: var(--ui-space-22, 22px);
    border: 1.5px solid currentColor;
    border-radius: 50%;
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
    font-weight: 800;
  }
  .wr-compare-badge.is-up {
    color: var(--success-color);
  }
  .wr-compare-badge.is-down {
    color: var(--warning-color);
  }
  .wr-compare-sub {
    margin: var(--ui-space-4, 4px) 0 0;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.5;
  }
  .wr-compare-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--ui-layout-88, 88px)), 1fr));
    margin-top: var(--ui-space-12, 12px);
    border-top: 1px solid var(--surface-divider-color);
  }
  .wr-compare-cell {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-3, 3px);
    min-width: 0;
    padding: var(--ui-space-10, 10px) var(--ui-space-6, 6px) var(--ui-space-2, 2px);
  }
  .wr-compare-cell b {
    color: var(--text-color);
    font-size: var(--ui-font-18, 18px);
    font-variant-numeric: tabular-nums;
  }
  .wr-compare-label {
    display: flex;
    align-items: center;
    gap: var(--ui-space-5, 5px);
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.5;
  }
  .wr-compare-label > span {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .wr-compare-label i {
    flex: 0 0 auto;
    width: var(--ui-space-7, 7px);
    height: var(--ui-space-7, 7px);
    border-radius: 50%;
  }
  .wr-compare-label i.is-bookmarks {
    background: var(--resource-bookmark-color);
  }
  .wr-compare-label i.is-notes {
    background: var(--resource-note-color);
  }
  .wr-compare-label i.is-files {
    background: var(--resource-file-color);
  }
  .wr-compare-label i.is-todos {
    background: var(--todo-module-color);
  }
  .wr-compare-label i.is-organized {
    background: var(--desc-color);
  }
  .wr-delta {
    font-size: var(--ui-font-12, 12px);
    font-weight: 600;
    white-space: nowrap;
  }
  .wr-delta.is-up {
    color: var(--success-color);
  }
  .wr-delta.is-down {
    color: var(--warning-color);
  }
  .wr-delta.is-flat {
    color: var(--desc-color);
    font-weight: 500;
  }

  .wr-items {
    margin: var(--ui-space-8, 8px) calc(var(--ui-space-8, 8px) * -1) 0;
    padding: 0;
    list-style: none;
  }
  .wr-item.b_btn {
    display: grid;
    grid-template-columns: var(--ui-control-28, 28px) minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--ui-space-10, 10px);
    width: 100%;
    height: auto;
    min-height: var(--ui-control-38, 38px);
    padding: var(--ui-space-3, 3px) var(--ui-space-8, 8px);
    border-radius: 8px;
    color: var(--text-color);
    line-height: 1.4;
    text-align: left;
  }
  .wr-item.b_btn:hover {
    background: var(--menu-item-h-bg-color);
    text-decoration: none;
  }
  .wr-item-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--ui-control-28, 28px);
    height: var(--ui-control-28, 28px);
    border: 1px solid currentColor;
    border-radius: 8px;
  }
  .wr-item-icon.is-bookmark {
    color: var(--resource-bookmark-color);
  }
  .wr-item-icon.is-note {
    color: var(--resource-note-color);
  }
  .wr-item-icon.is-file {
    color: var(--resource-file-color);
  }
  .wr-item-title {
    overflow: hidden;
    font-size: var(--ui-font-13, 13px);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .wr-item-day {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    white-space: nowrap;
  }
  .wr-items-more {
    display: flex;
    align-items: center;
    gap: var(--ui-space-10, 10px);
    margin-top: var(--ui-space-2, 2px);
  }
  .wr-items-empty {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-12, 12px);
    margin-top: var(--ui-space-10, 10px);
    padding-top: var(--ui-space-12, 12px);
    border-top: 1px solid var(--surface-divider-color);
  }
  .wr-items-empty p {
    margin: 0;
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
    line-height: 1.5;
  }
  .wr-items-empty .b_btn {
    flex: 0 0 auto;
    gap: var(--ui-space-6, 6px);
  }

  /* 标题与操作放不下时整组操作换到下一行，而不是互相覆盖或截断进度说明。 */
  .wr-challenge-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-6, 6px) var(--ui-space-10, 10px);
  }
  .wr-challenge-heading {
    display: flex;
    flex: 1 0 auto;
    align-items: baseline;
    gap: var(--ui-space-10, 10px);
  }
  /* 窄屏标题行放不下进度说明时换到第二行，不截断。 */
  .wr-insights.is-mobile .wr-challenge-heading {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--ui-space-2, 2px);
  }
  .wr-challenge-actions {
    display: flex;
    flex: 0 0 auto;
    margin-left: auto;
    align-items: center;
    gap: var(--ui-space-8, 8px);
  }
  .wr-claim.b_btn {
    gap: var(--ui-space-6, 6px);
    border: 1px solid var(--primary-color);
    color: var(--primary-color);
    font-weight: 600;
  }
  .wr-challenge-state {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    margin: var(--ui-space-10, 10px) 0 0;
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
  }
  .wr-challenge-row {
    display: grid;
    grid-template-columns: var(--ui-control-28, 28px) minmax(0, 1fr) var(--ui-layout-76, 76px);
    align-items: center;
    gap: var(--ui-space-10, 10px);
    padding: var(--ui-space-9, 9px) 0;
  }
  .wr-challenge-row:first-of-type {
    margin-top: var(--ui-space-4, 4px);
  }
  .wr-challenge-row + .wr-challenge-row {
    border-top: 1px solid var(--surface-divider-color);
  }
  .wr-challenge-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--ui-control-28, 28px);
    height: var(--ui-control-28, 28px);
    border: 1px solid var(--primary-color);
    border-radius: 8px;
    color: var(--primary-color);
  }
  .wr-challenge-main {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-5, 5px);
    min-width: 0;
  }
  .wr-challenge-name {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--ui-space-2, 2px) var(--ui-space-8, 8px);
    color: var(--text-color);
    font-size: var(--ui-font-13, 13px);
  }
  .wr-challenge-name em {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    font-style: normal;
    font-variant-numeric: tabular-nums;
  }
  .wr-challenge-name small {
    margin-left: auto;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    white-space: nowrap;
  }
  .wr-challenge-go.b_btn {
    justify-self: end;
  }
  .wr-challenge-today {
    display: inline-flex;
    justify-self: end;
    align-items: center;
    gap: var(--ui-space-4, 4px);
    color: var(--success-color);
    font-size: var(--ui-font-12, 12px);
    text-align: right;
  }
</style>
