<template>
  <section
    ref="boardViewport"
    v-auto-scrollbar
    class="points-leaderboard"
    :class="{ 'is-mobile': mobile, 'scroll-whole-board': scrollWholeBoard }"
    :tabindex="scrollWholeBoard ? 0 : undefined"
    :aria-label="t('growth.leaderboard.title')"
  >
    <header class="leaderboard-heading">
      <div class="leaderboard-title">
        <span class="title-mark" aria-hidden="true"><SvgIcon :src="icon.growth.trophy" size="24" /></span>
        <h2>{{ t('growth.leaderboard.title') }}</h2>
      </div>
      <BButton type="text" :disabled="!rules" @click="rulesOpen = true">
        <SvgIcon :src="icon.message.info" size="16" aria-hidden="true" />
        {{ t('growth.leaderboard.rules') }}
      </BButton>
    </header>
    <div class="leaderboard-toolbar">
      <BTabs
        class="leaderboard-board-tabs"
        :active-tab="board"
        :options="boardOptions"
        :variant="mobile ? 'solid' : 'line'"
        :aria-label="t('growth.leaderboard.tab')"
        @change="selectBoard"
      >
        <template #label="{ tab }">
          <span class="board-tab-label">
            <SvgIcon :src="boardIcons[tab.key as LeaderboardType]" size="17" class="board-label-icon" aria-hidden="true" />
            {{ tab.label }}
          </span>
        </template>
      </BTabs>
      <div class="leaderboard-period">
        <span v-if="rangeLabel" class="board-period-label">
          <SvgIcon :src="board === 'total' ? icon.noteDetail.history : icon.common.calendar" size="15" class="board-label-icon" aria-hidden="true" />
          <span><strong>{{ rangeLabel }}</strong><span v-if="periodHint"> · {{ periodHint }}</span></span>
        </span>
        <BTabs
          v-if="board === 'week' && previousAvailable"
          :active-tab="period"
          :options="periodOptions"
          variant="pill"
          :aria-label="t('growth.leaderboard.period')"
          @change="selectPeriod"
        />
      </div>
    </div>

    <BCard v-if="data && data.canParticipate !== false && data.phase !== 'closing'" as="section" :padding="mobile ? '10px 12px' : '12px 16px'" class="leaderboard-mine">
      <h3 class="mine-title"><SvgIcon :src="icon.growth.rank" size="17" class="mine-icon" aria-hidden="true" />{{ personalTitle }}</h3>
      <dl class="my-metrics" :class="{ 'is-weekly': weekly }">
        <div>
          <dt>{{ t('growth.leaderboard.myRank') }}</dt>
          <dd :class="{ 'my-rank': data.mine }">{{ data.mine ? t('growth.leaderboard.placeValue', { n: number(data.mine.rank) }) : t('growth.leaderboard.unranked') }}</dd>
        </div>
        <div>
          <dt>{{ t('growth.leaderboard.score') }}</dt>
          <dd>{{ number(data.mine?.score ?? 0) }} <small>{{ t('growth.leaderboard.pointsUnit') }}</small></dd>
        </div>
        <div v-if="weekly">
          <dt>{{ t('growth.leaderboard.days') }}</dt>
          <dd>{{ number(data.ownDays) }} <small>{{ t('growth.leaderboard.daysUnit') }}</small></dd>
        </div>
      </dl>
      <div v-if="personalHint || sources.length" class="my-detail">
        <strong v-if="personalHint">{{ personalHint }}</strong>
        <span v-if="sources.length">{{ sources.join(' · ') }}</span>
      </div>
    </BCard>

    <div ref="columnsElement" class="leaderboard-columns" :class="{ 'has-prizes': data?.weekly }">
      <LeaderboardRows
        :title="rankingTitle"
        :data="data"
        :weekly="weekly"
        :mobile="mobile"
        :bounded="!scrollWholeBoard"
        :loading="loading"
        :error="error"
        @retry="load()"
        @profile="openProfile"
      />
      <BCard v-if="data?.weekly" as="aside" padding="12px" class="leaderboard-prizes">
        <header>
          <div class="prize-title">
            <span class="prize-mark" aria-hidden="true"><SvgIcon :src="icon.growth.reward" size="19" /></span>
            <h3>{{ rewardTitle }}</h3>
          </div>
          <span>{{ t('growth.leaderboard.pointsUnit') }}</span>
        </header>
        <p v-if="observationWeek" class="prize-summary">{{ t('growth.leaderboard.observationHint') }}</p>
        <ol class="prizes">
          <li
            v-for="(points, index) in data.rules.prizes"
            :key="index"
            :data-rank="index + 1"
          >
            <span class="prize-tier"><SvgIcon :src="icon.growth.medal" size="16" aria-hidden="true" />{{ t('growth.leaderboard.placeValue', { n: index + 1 }) }}</span>
            <strong>{{ points }}</strong>
          </li>
        </ol>
        <p v-if="!observationWeek" class="prize-summary">{{ rewardSummary }}</p>
        <p class="prize-note">{{ t('growth.leaderboard.threshold', { score: data.rules.minimumScore, days: data.rules.minimumDays }) }}</p>
        <p v-if="data.phase === 'live' && !observationWeek" class="prize-guide">{{ t('growth.leaderboard.prizeRule') }}</p>
      </BCard>
    </div>
    <ChatUserProfileModal
      v-model:visible="profileOpen"
      :profile="profile"
      :actions-profile="profile"
      :preview-posts="profile?.previewPosts"
      :all-achievements="profile?.allAchievements"
      :loading="profileLoading"
      :error="profileError"
      :is-own="profile?.isOwn"
      :chat-actions="false"
      :session-key="profileSession"
      @retry="loadProfile"
      @navigate="navigateFromProfile"
      @after-close="finishProfileClose"
    />
    <LeaderboardRules v-if="rules" :mobile="mobile" :open="rulesOpen" :rules="rules" @close="rulesOpen = false" />
  </section>
</template>

<script lang="ts" setup>
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import { feedGet, type PublicUserCard } from '@/api/communityFeedApi';
  import ChatUserProfileModal from '@/components/communityChat/ChatUserProfileModal.vue';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';
  import { getPointsLeaderboard, type LeaderboardData, type LeaderboardPeriod, type LeaderboardType } from '@/api/pointsLeaderboardApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { useForegroundRefresh } from '@/composables/useForegroundRefresh';
  import icon from '@/config/icon';
  import { useUserStore } from '@/store';
  import LeaderboardRows from './LeaderboardRows.vue';
  import LeaderboardRules from './LeaderboardRules.vue';

  const props = defineProps<{ mobile: boolean }>();
  const { t, locale } = useI18n();
  const user = useUserStore();
  const router = useRouter();
  const profileOpen = ref(false);
  const profile = ref<PublicUserCard | null>(null);
  const profileLoading = ref(false);
  const profileError = ref(false);
  const profileSession = ref(0);
  let profileRequest: AbortController | null = null;
  let profileId = '';
  let profileTrigger: HTMLElement | null = null;

  async function loadProfile() {
    profileRequest?.abort();
    const request = new AbortController();
    profileRequest = request;
    profileLoading.value = true;
    profileError.value = false;
    profile.value = null;
    try {
      const target = await feedGet<PublicUserCard>(
        'profiles/' + encodeURIComponent(profileId),
        { view: 'card', locale: locale.value },
        { signal: request.signal },
      );
      if (!target?.userPublicId || !Array.isArray(target.previewPosts)) throw new Error('USER_CARD_UNAVAILABLE');
      if (!request.signal.aborted) profile.value = target;
    } catch {
      if (!request.signal.aborted) profileError.value = true;
    } finally {
      if (profileRequest === request) {
        profileRequest = null;
        profileLoading.value = false;
      }
    }
  }

  function openProfile(communityId: string, trigger: HTMLElement) {
    profileId = communityId;
    profileTrigger = trigger;
    profileSession.value += 1;
    profileOpen.value = true;
    void loadProfile();
  }

  watch(profileOpen, (open) => {
    if (open) return;
    profileRequest?.abort();
  });

  function finishProfileClose() {
    if (profileOpen.value) return;
    profile.value = null;
    const trigger = profileTrigger;
    profileTrigger = null;
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
  }
  watch([() => user.id, () => user.role, () => user.adminContext?.id], () => (profileOpen.value = false));

  function navigateFromProfile(path: string) {
    profileTrigger = null;
    return closeCurrentMobileOverlayThen(
      () => (profileOpen.value = false),
      () => router.push(path),
    );
  }
  const board = ref<LeaderboardType>('week');
  const period = ref<LeaderboardPeriod>('current');
  const boardIcons = { week: icon.growth.checkin, month: icon.common.calendar, total: icon.growth.crown };
  const weekly = computed(() => board.value === 'week');
  const boardOptions = computed(() => ['week', 'month', 'total'].map((key) => ({ key, label: t('growth.leaderboard.' + key) })));
  const periodOptions = computed(() => [
    { key: 'current', label: t('growth.leaderboard.currentWeek') },
    { key: 'previous', label: t('growth.leaderboard.previousWeek') },
  ]);
  const previousAvailable = ref(false);
  const loading = ref(true);
  const error = ref(false);
  const data = ref<LeaderboardData | null>(null);
  const rules = ref<LeaderboardData['rules']>();
  const rulesOpen = ref(false);
  const boardViewport = ref<HTMLElement | null>(null);
  const columnsElement = ref<HTMLElement | null>(null);
  const scrollWholeBoard = ref(false);
  const formatter = computed(() => new Intl.NumberFormat(locale.value));
  const number = (value: number) => formatter.value.format(value);
  let inflight: AbortController | null = null;

  const refresh = useForegroundRefresh({ refresh: () => load(true), canRefresh: () => !inflight });
  async function load(silent = false) {
    const controller = new AbortController();
    inflight?.abort();
    inflight = controller;
    if (!silent) {
      loading.value = true;
      error.value = false;
    }
    try {
      const result = await getPointsLeaderboard(board.value, period.value, controller.signal);
      if (controller.signal.aborted) return;
      data.value = result;
      rules.value = result.rules;
      previousAvailable.value = result.previousAvailable;
      error.value = false;
      refresh.markLoaded();
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (silent) throw failure;
      error.value = !data.value || data.value.phase === 'closing';
    } finally {
      if (inflight === controller) {
        inflight = null;
        loading.value = false;
      }
    }
  }

  watch([board, period, () => user.id, () => user.role], () => {
    data.value = null;
    if (boardViewport.value) boardViewport.value.scrollTop = 0;
    void load();
  }, { immediate: true });
  onBeforeUnmount(() => {
    inflight?.abort();
    profileRequest?.abort();
  });

  watch([boardViewport, columnsElement, data, loading, error, () => props.mobile], ([viewport, columns], _, onCleanup) => {
    const list = columns?.querySelector<HTMLElement>('.leaderboard-list');
    if (!viewport || !columns || !list) return;

    const prizes = columns.querySelector<HTMLElement>('.leaderboard-prizes');
    const listParts = Array.from(list.querySelectorAll<HTMLElement>('.list-heading, .table-header-viewport, .list-foot, .list-state'));
    const firstRow = list.querySelector<HTMLElement>('.table-row, .mobile-list-row');
    if (firstRow) listParts.push(firstRow);

    // Leave room for the fixed content and at least one row before making the list the scroll owner.
    const updateScrollMode = () => {
      const columnsOffset = columns.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop;
      const available = viewport.clientHeight - columnsOffset;
      const listBorder = list.offsetHeight - list.clientHeight;
      const listHeight = listParts.reduce((height, part) => height + part.offsetHeight, listBorder);
      const prizeHeight = prizes?.offsetHeight ?? 0;
      const stacked = prizes && prizes.offsetLeft === list.offsetLeft;
      const needed = stacked
        ? listHeight + prizeHeight + parseFloat(getComputedStyle(columns).rowGap)
        : Math.max(listHeight, prizeHeight);
      scrollWholeBoard.value = needed > available + 1;
      if (!scrollWholeBoard.value) viewport.scrollTop = 0;
    };

    updateScrollMode();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateScrollMode);
    for (const element of [viewport, ...viewport.children, ...listParts]) observer.observe(element);
    if (prizes) observer.observe(prizes);
    onCleanup(() => observer.disconnect());
  }, { flush: 'post' });

  function selectBoard(key: string) {
    if (key === 'week' || key === 'month' || key === 'total') {
      board.value = key;
      period.value = 'current';
    }
  }

  function selectPeriod(key: string) {
    if (key === 'current' || key === 'previous') period.value = key;
  }

  const rangeLabel = computed(() => {
    if (board.value === 'total') return t('growth.leaderboard.lifetime');
    const range = data.value?.range;
    if (!range) return '';
    const start = new Date(range.start + 'T00:00:00Z');
    if (board.value === 'month') {
      return new Intl.DateTimeFormat(locale.value, { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(start);
    }
    const date = new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const last = new Date(Date.parse(range.end + 'T00:00:00Z') - 86_400_000);
    return date.format(start) + '–' + date.format(last);
  });

  const periodHint = computed(() => {
    if (!weekly.value) return t('growth.leaderboard.rankingOnly');
    if (data.value?.phase === 'closing') return t('growth.leaderboard.closing');
    if (data.value?.phase === 'settled') return t('growth.leaderboard.settled');
    return t(data.value?.weekly?.mode === 'observation' ? 'growth.leaderboard.observation' : 'growth.leaderboard.cutoff');
  });

  const periodKey = computed(() => weekly.value ? (period.value === 'previous' ? 'previous' : 'current') : board.value);
  const personalTitle = computed(() => t('growth.leaderboard.personal.' + periodKey.value));
  const rankingTitle = computed(() => t('growth.leaderboard.ranking.' + periodKey.value));

  const sources = computed(() => {
    if (!weekly.value) return [];
    return Object.entries(data.value?.mine?.sources ?? {}).map(([key, points]) => {
      // resultData camel-cases nested API keys, but the points dictionary uses reason codes.
      const reason = key.replace(/[A-Z]/g, (letter) => '_' + letter.toLowerCase());
      const label = reason === 'manor_sale' ? 'growth.leaderboard.cropSale'
        : reason === 'manor_aquarium_sale' ? 'growth.leaderboard.aquariumSale'
        : 'growth.pointsReason.' + reason;
      return t(label) + ' ' + number(points);
    });
  });

  const personalHint = computed(() => {
    const snapshot = data.value;
    if (!snapshot?.weekly) return '';
    const mine = snapshot.mine;
    if (!mine) return t(snapshot.phase === 'settled' ? 'growth.leaderboard.noPrevious' : 'growth.leaderboard.startHint');
    if (snapshot.weekly.mode === 'observation') return '';
    if (mine.rewardState === 'paid') return t('growth.leaderboard.minePaid', { n: mine.rewardPoints });
    if (mine.rewardState === 'pending') return t('growth.leaderboard.pending');
    if (mine.rewardState === 'skipped') return t('growth.leaderboard.skipped');
    if (snapshot.phase === 'settled') return t(mine.qualified ? 'growth.leaderboard.noPrize' : 'growth.leaderboard.notQualified');
    if (!mine.qualified) {
      const missing = [];
      const score = snapshot.rules.minimumScore - mine.score;
      const days = snapshot.rules.minimumDays - mine.activeDays;
      if (score > 0) missing.push(t('growth.leaderboard.scoreValue', { n: number(score) }));
      if (days > 0) missing.push(t('growth.leaderboard.effectiveDaysValue', { n: days }));
      return t('growth.leaderboard.shortfall', { missing: new Intl.ListFormat(locale.value).format(missing) });
    }
    if (mine.rewardPoints) return t('growth.leaderboard.ownProjected', { n: number(mine.rewardPoints) });
    return t(mine.rank > snapshot.rules.prizes.length
      ? 'growth.leaderboard.qualifiedOutsideTop'
      : 'growth.leaderboard.qualified');
  });

  const observationWeek = computed(() => data.value?.weekly?.mode === 'observation');
  const rewardTitle = computed(() => t(observationWeek.value ? 'growth.leaderboard.rewardTiers'
    : data.value?.phase === 'settled' ? 'growth.leaderboard.previousRewards' : 'growth.leaderboard.thisRewards'));
  const rewardSummary = computed(() => {
    const snapshot = data.value;
    if (!snapshot?.weekly) return '';
    const { slots, paidSlots, qualifiedCount } = snapshot.weekly;
    const key = snapshot.phase === 'settled' && slots ? 'rewardProgress' : 'qualifiedCount';
    return t('growth.leaderboard.' + key, { qualified: qualifiedCount, total: slots, paid: paidSlots });
  });
</script>

<style scoped lang="less">
  .points-leaderboard {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    gap: var(--ui-space-12, 12px);
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    font-variant-numeric: tabular-nums;
  }

  .leaderboard-heading, .leaderboard-toolbar, .leaderboard-mine { flex: none; }

  .leaderboard-heading, .leaderboard-toolbar, .leaderboard-period, .leaderboard-prizes > header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-8, 8px);
    min-width: 0;
  }

  .leaderboard-heading h2 {
    margin: 0;
    font-size: var(--ui-font-24, 24px);
    font-weight: 720;
  }

  .leaderboard-title, .board-tab-label, .board-period-label, .mine-title, .prize-title, .prize-tier {
    display: flex;
    align-items: center;
    gap: var(--ui-space-7, 7px);
    min-width: 0;
  }

  .leaderboard-title { gap: var(--ui-space-12, 12px); }
  .title-mark, .prize-mark {
    display: grid;
    place-items: center;
    flex: none;
    width: var(--ui-layout-40, 40px);
    height: var(--ui-layout-40, 40px);
    border-radius: var(--ui-space-12, 12px);
    color: var(--workspace-purple-text);
    background: var(--workspace-purple-selected);
  }

  .board-label-icon { flex: none; }
  .mine-icon { color: var(--workspace-purple-text); }

  .leaderboard-toolbar {
    border-bottom: 1px solid var(--workspace-border);
    flex-wrap: wrap;
  }

  .leaderboard-period {
    font-size: var(--ui-font-13, 13px);
    color: var(--desc-color);
    margin-left: auto;
    flex-wrap: wrap;

    strong { color: var(--text-color); }
  }

  .leaderboard-mine h3, .leaderboard-prizes h3 {
    font-size: var(--ui-font-16, 16px);
    margin: 0;
  }

  .my-metrics {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin: var(--ui-space-8, 8px) 0 0;
    gap: var(--ui-space-12, 12px);

    &.is-weekly { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    > div + div {
      border-inline-start: 1px solid var(--workspace-divider);
      padding-inline-start: var(--ui-space-16, 16px);
    }
    dt {
      color: var(--desc-color);
      font-size: var(--ui-font-12, 12px);
    }
    dd {
      margin: var(--ui-space-3, 3px) 0 0;
      font-size: var(--ui-font-24, 24px);
      font-weight: 700;
      overflow-wrap: anywhere;
    }
    small {
      font-size: var(--ui-font-12, 12px);
      font-weight: 500;
      color: var(--desc-color);
    }
    .my-rank { color: var(--workspace-purple-text); }
  }

  .my-detail {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--ui-space-4, 4px) var(--ui-space-12, 12px);
    border-top: 1px solid var(--workspace-divider);
    margin-top: var(--ui-space-8, 8px);
    padding-top: var(--ui-space-6, 6px);
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
    line-height: 1.45;

    strong { color: var(--workspace-purple-text); }
  }

  .leaderboard-columns {
    display: grid;
    flex: 1 1 0;
    min-height: 0;
    gap: var(--ui-space-16, 16px);
    align-items: start;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);

    &.has-prizes {
      grid-template-columns: minmax(0, 1fr) clamp(var(--ui-layout-220, 220px), 26%, var(--ui-layout-300, 300px));
    }
  }

  .leaderboard-prizes {
    font-size: var(--ui-font-13, 13px);
    background: linear-gradient(150deg, var(--chip-pending-bg), var(--workspace-content) 48%);

    p { margin: var(--ui-space-6, 6px) 0 0; }
    header > span, .prize-note, .prize-guide { color: var(--desc-color); }
  }

  .prize-mark {
    width: var(--ui-layout-32, 32px);
    height: var(--ui-layout-32, 32px);
    border-radius: var(--ui-space-8, 8px);
    color: var(--chip-pending-fg);
    background: var(--chip-pending-bg);
    border: 1px solid var(--chip-pending-border);
  }

  .prizes {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--ui-space-6, 6px);
    margin: var(--ui-space-10, 10px) 0 0;
    padding: 0;
    list-style: none;

    li {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      gap: var(--ui-space-4, 4px);
      min-height: var(--ui-control-34, 34px);
      padding: var(--ui-space-5, 5px) var(--ui-space-3, 3px);
      border-radius: var(--ui-space-9, 9px);
      border: 1px solid var(--prize-border, var(--workspace-border));
      background: var(--prize-background, var(--workspace-canvas));

      &[data-rank='1'] {
        --prize-foreground: var(--chip-pending-fg);
        --prize-background: var(--chip-pending-bg);
        --prize-border: var(--chip-pending-border);
      }
      &[data-rank='2'] {
        --prize-foreground: var(--leaderboard-silver-fg);
        --prize-background: var(--leaderboard-silver-bg);
        --prize-border: var(--leaderboard-silver-border);
      }
      &[data-rank='3'] {
        --prize-foreground: var(--leaderboard-bronze-fg);
        --prize-background: var(--leaderboard-bronze-bg);
        --prize-border: var(--leaderboard-bronze-border);
      }
      strong {
        color: var(--text-color);
        font-size: var(--ui-font-22, 22px);
        line-height: 1.1;
      }
    }
    .prize-tier {
      gap: var(--ui-space-3, 3px);
      font-size: var(--ui-font-12, 12px);
      color: var(--prize-foreground, var(--desc-color));
    }
  }

  .prize-summary { font-weight: 700; }
  .prize-guide {
    border-top: 1px solid var(--workspace-divider);
    padding-top: var(--ui-space-6, 6px);
    font-size: var(--ui-font-12, 12px);
  }

  .is-mobile {
    gap: var(--ui-space-8, 8px);

    .leaderboard-heading h2 { font-size: var(--ui-font-18, 18px); }
    .title-mark { width: var(--ui-layout-36, 36px); height: var(--ui-layout-36, 36px); }
    .leaderboard-toolbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      align-items: stretch;
      border: 0;
    }
    .leaderboard-board-tabs {
      width: 100%;
      box-sizing: border-box;

      :deep(.tab) {
        flex: 1;
        min-width: 0;
        min-height: var(--ui-control-32, 32px);
        padding-inline: var(--ui-space-6, 6px);
      }
      :deep(.tab.is-active) {
        color: var(--workspace-purple-text);
        background: var(--workspace-content);
      }
    }
    .leaderboard-period { margin-left: 0; }
    .leaderboard-columns.has-prizes {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr);
      gap: var(--ui-space-8, 8px);
    }
    .leaderboard-prizes { grid-row: 1; }
    .my-metrics {
      gap: var(--ui-space-6, 6px);
      > div + div { padding-inline-start: var(--ui-space-8, 8px); }
      dd { font-size: var(--ui-font-20, 20px); }
    }
  }

  .points-leaderboard.scroll-whole-board {
    overflow-y: auto;
    overscroll-behavior-y: contain;

    .leaderboard-columns {
      flex: none;
      grid-template-rows: auto;
    }
  }
</style>
