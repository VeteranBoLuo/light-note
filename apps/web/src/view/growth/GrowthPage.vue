<template>
  <div ref="growthPageRef" class="growth-page" :class="{ 'growth-page--wide': useWideDesktopLayout }">
    <div class="growth-container" :class="{ 'growth-container--wide': useWideDesktopLayout }">
      <header v-if="!useWideDesktopLayout" class="growth-hero">
        <BButton class="growth-back" v-click-log="{ module: '成长', operation: '返回上一页' }" @click="goBack">
          <svg-icon :src="icon.arrow_left" size="16" />
          <span>{{ t('common.back') }}</span>
        </BButton>
        <h1 class="growth-title">{{ t('growth.pageTitle') }}</h1>
        <p class="growth-subtitle">{{ t('growth.pageSubtitle') }}</p>
        <BButton
          class="growth-report-btn"
          :loading="wrLoading"
          v-click-log="{ module: '成长', operation: '打开成长周报' }"
          @click="openWeeklyReport"
        >
          <SvgIcon :src="icon.growth.rank" size="15" /> {{ t('growth.weeklyReportEntry') }}
        </BButton>
      </header>

      <div v-if="isAdminContext" class="growth-admin-notice" role="status">
        <strong>{{ t('growth.adminContextTitle') }}</strong>
        <span>{{ t('growth.adminContextNotice') }}</span>
      </div>

      <div class="growth-workspace" :class="{ 'growth-workspace--wide': useWideDesktopLayout }">
        <aside v-if="useWideDesktopLayout" class="growth-desktop-sidebar">
          <header class="growth-hero growth-hero--sidebar">
            <BButton class="growth-back" v-click-log="{ module: '成长', operation: '返回上一页' }" @click="goBack">
              <SvgIcon :src="icon.arrow_left" size="16" />
              <span>{{ t('common.back') }}</span>
            </BButton>
            <h1 class="growth-title">{{ t('growth.pageTitle') }}</h1>
            <p class="growth-subtitle">{{ t('growth.pageSubtitle') }}</p>
          </header>

          <nav class="growth-side-nav" :aria-label="t('growth.pageTitle')">
            <BButton
              v-for="option in desktopNavigationOptions"
              :key="option.key"
              class="growth-side-nav-item"
              :class="{ 'is-active': isDesktopNavigationActive(option) }"
              :aria-current="isDesktopNavigationActive(option) ? 'page' : undefined"
              v-click-log="{ module: '成长', operation: `切换成长模块-${option.key}` }"
              @click="selectDesktopNavigation(option)"
            >
              <span class="growth-side-nav-icon" aria-hidden="true">
                <SvgIcon :src="option.icon" size="17" />
              </span>
              <span class="growth-side-nav-label">{{ option.label }}</span>
              <span v-if="option.badge !== undefined" class="growth-side-nav-badge">{{ option.badge }}</span>
            </BButton>
          </nav>

          <BButton
            class="growth-side-report"
            :loading="wrLoading"
            v-click-log="{ module: '成长', operation: '打开成长周报' }"
            @click="openWeeklyReport"
          >
            <SvgIcon :src="icon.growth.rank" size="16" />
            <span>{{ t('growth.weeklyReportEntry') }}</span>
          </BButton>
        </aside>

        <main ref="growthMainRef" class="growth-main">
          <BTabs
            v-if="!useWideDesktopLayout"
            v-model:active-tab="activeSection"
            class="growth-section-tabs"
            variant="segment"
            :options="sectionOptions"
            v-click-log="{ module: '成长', operation: '切换成长模块' }"
            @select="handleSectionTabSelect"
          />

          <template v-if="activeSection === 'overview'">
            <section v-if="growthV2Enabled" class="growth-panel growth-panel--today">
              <TodayGrowthCard
                :data="claimable"
                :growth="growth"
                :loading="
                  claimableLoading ||
                  (!claimable && !claimableError) ||
                  preferencesLoading ||
                  (!preferences && !preferencesError)
                "
                :error="claimableError"
                :claiming="claimingRewards"
                :read-only="isAdminContext"
                :low-pressure="lowPressureMode"
                :compact="useWideDesktopLayout"
                :free-draws="freeLotteryRemaining"
                :show-next-action="!useWideDesktopLayout"
                @retry="loadClaimable"
                @claim-all="onClaimAll"
                @action="handleGrowthAction"
              />
            </section>

            <section class="growth-panel growth-panel--level">
              <div v-if="!growth && (growthLoading || !growthError)" class="growth-state"
                ><BLoading inline loading
              /></div>
              <div v-else-if="growthError && !growth" class="growth-state growth-state--error">
                <span>{{ t('growth.growthLoadFailed') }}</span>
                <BButton size="small" @click="load(true)">{{ t('common.retry') }}</BButton>
              </div>
              <GrowthCard
                v-else
                :read-only="isAdminContext"
                :show-calendar="!useWideDesktopLayout"
                :compact="useWideDesktopLayout"
                @activity-changed="refreshOverview"
              />
            </section>

            <section class="growth-panel growth-panel--stats">
              <div v-if="!dashboard && (dashboardLoading || !dashboardError)" class="growth-state"
                ><BLoading inline loading
              /></div>
              <div v-else-if="dashboardError && !dashboard" class="growth-state growth-state--error">
                <span>{{ t('growth.dashboardLoadFailed') }}</span>
                <BButton size="small" @click="loadDashboard">{{ t('common.retry') }}</BButton>
              </div>
              <GrowthStats v-else :stats="stats" />
            </section>

            <section
              v-if="useWideDesktopLayout"
              class="growth-overview-routine"
              :class="{ 'growth-overview-routine--single': !claimable?.nextAction }"
            >
              <GrowthNextActionCard
                v-if="claimable?.nextAction"
                :next-action="claimable.nextAction"
                :additional-actions="claimable.nextActions?.slice(1) || []"
                :read-only="isAdminContext"
                :low-pressure="lowPressureMode"
                @action="handleGrowthAction"
                @view-all="selectSection('tasks')"
              />
              <section class="growth-panel growth-overview-daily">
                <div v-if="!dashboard && (dashboardLoading || !dashboardError)" class="growth-state">
                  <BLoading inline loading />
                </div>
                <div v-else-if="dashboardError && !dashboard" class="growth-state growth-state--error">
                  <span>{{ t('growth.dashboardLoadFailed') }}</span>
                  <BButton size="small" @click="loadDashboard">{{ t('common.retry') }}</BButton>
                </div>
                <DailyQuests
                  v-else
                  :quests="quests"
                  :bonus="questBonus"
                  :claiming="claimingRewards"
                  :read-only="isAdminContext"
                  :daily-exp="growth?.dailyExp || 0"
                  :daily-cap="growth?.dailyCap || 0"
                  :daily-cap-reached="Boolean(growth?.dailyCapReached)"
                  compact
                  :show-claim-action="false"
                  @claim="onClaim"
                  @go="handleQuestAction"
                />
              </section>
            </section>

            <section v-if="useWideDesktopLayout" id="growth-heatmap" class="growth-panel growth-knowledge-panel">
              <header class="growth-panel-heading">
                <div>
                  <h2>{{ t('growth.knowledgeCheckinTitle') }}</h2>
                  <p>{{ t('growth.knowledgeCheckinSubtitle') }}</p>
                </div>
              </header>
              <div class="growth-knowledge-panel__content">
                <div class="growth-knowledge-panel__calendar">
                  <SigninCalendar
                    wide
                    :checkin-days="stats.checkinDays || []"
                    :checked-in-today="Boolean(growth?.checkedInToday)"
                    :streak="growth?.streak || 0"
                    :makeup-days="growth?.makeupDays || []"
                    :read-only="isAdminContext"
                    @makeup="onUseProtectCard"
                  />
                </div>
                <ActivityHeatmap ref="heatmapRef" class="growth-knowledge-panel__heatmap" />
              </div>
            </section>

            <section v-else id="growth-heatmap" class="growth-panel">
              <ActivityHeatmap ref="heatmapRef" />
            </section>

            <section v-if="growthV2Enabled" id="growth-recap" class="growth-panel growth-footprint">
              <header class="growth-panel-heading">
                <div>
                  <h2>{{ t('growth.footprintTitle') }}</h2>
                  <p>{{ t('growth.footprintSubtitle') }}</p>
                </div>
              </header>
              <GrowthTimeline v-if="timeline.length" :items="timeline" />
              <div v-else class="growth-state">{{ t('growth.footprintEmpty') }}</div>
            </section>

            <section v-if="growthV2Enabled" class="growth-panel">
              <GrowthPreferencesCard
                :preferences="preferences"
                :loading="preferencesLoading || (!preferences && !preferencesError)"
                :error="preferencesError"
                :saving="preferencesSaving"
                :read-only="isAdminContext"
                @save="onSavePreferences"
                @retry="loadPreferences"
              />
            </section>
          </template>

          <template v-if="activeSection === 'tasks'">
            <header v-if="growthV2Enabled" class="growth-section-heading">
              <div>
                <h2>{{ t('growth.taskCenterTitle') }}</h2>
                <p>{{ t('growth.taskCenterSubtitle') }}</p>
              </div>
              <BTooltip v-if="claimableCount > 0" :title="claimAllTooltip" :disabled="!bookmark.isDesktop" :delay="160">
                <BButton
                  class="growth-claim-all"
                  type="primary"
                  :loading="claimingRewards"
                  :disabled="isAdminContext || claimingRewards"
                  @click="onClaimAll"
                >
                  <SvgIcon :src="icon.growth.reward" size="15" />
                  {{ t('growth.claimAllCount', { n: claimableCount }) }}
                </BButton>
              </BTooltip>
            </header>

            <section class="growth-panel growth-task-center">
              <BTabs
                v-model:active-tab="taskView"
                class="growth-task-tabs"
                variant="line"
                :options="taskViewOptions"
                @select="handleTaskViewSelect"
              />

              <div class="growth-task-workspace">
                <div class="growth-task-workspace__main">
                  <template v-if="taskView === 'daily'">
                    <div v-if="!dashboard && (dashboardLoading || !dashboardError)" class="growth-state">
                      <BLoading inline loading />
                    </div>
                    <div v-else-if="dashboardError && !dashboard" class="growth-state growth-state--error">
                      <span>{{ t('growth.dashboardLoadFailed') }}</span>
                      <BButton size="small" @click="loadDashboard">{{ t('common.retry') }}</BButton>
                    </div>
                    <DailyQuests
                      v-else
                      :quests="quests"
                      :bonus="questBonus"
                      :claiming="claimingRewards"
                      :read-only="isAdminContext"
                      :daily-exp="growth?.dailyExp || 0"
                      :daily-cap="growth?.dailyCap || 0"
                      :daily-cap-reached="Boolean(growth?.dailyCapReached)"
                      @claim="onClaim"
                      @go="handleQuestAction"
                    />
                  </template>

                  <section v-else-if="taskView === 'weekly'" id="growth-weekly">
                    <WeeklyChallenge :read-only="isAdminContext" @loaded="handleWeeklyLoaded" />
                  </section>

                  <section v-else id="growth-tasks">
                    <div v-if="!growthTasks && (growthTasksLoading || !growthTasksError)" class="growth-state"
                      ><BLoading inline loading
                    /></div>
                    <div v-else-if="growthTasksError && !growthTasks" class="growth-state growth-state--error">
                      <span>{{ t('growth.tasksLoadFailed') }}</span>
                      <BButton size="small" @click="loadGrowthTasks(true)">{{ t('common.retry') }}</BButton>
                    </div>
                    <GrowthTasks
                      v-else
                      :data="growthTasks"
                      :show-completed="true"
                      :read-only="isAdminContext"
                      :low-pressure="lowPressureMode"
                    />
                  </section>
                </div>

                <aside class="growth-task-summary" :aria-label="t('growth.taskTodayExperience')">
                  <header>
                    <span class="growth-task-summary__icon" aria-hidden="true">
                      <SvgIcon :src="icon.growth.level" size="19" />
                    </span>
                    <div>
                      <h3>{{ t('growth.taskTodayExperience') }}</h3>
                      <p>{{ t('growth.taskTodayExperienceSubtitle') }}</p>
                    </div>
                  </header>
                  <div class="growth-task-summary__progress">
                    <strong>{{ growth?.dailyExp || 0 }}</strong>
                    <span>/ {{ growth?.dailyCap || 0 }}</span>
                  </div>
                  <div class="growth-task-summary__track" aria-hidden="true">
                    <span :style="{ width: `${dailyExperiencePercent}%` }"></span>
                  </div>
                  <dl class="growth-task-summary__sources">
                    <div
                      ><dt>{{ t('growth.earnCheckin') }}</dt
                      ><dd>{{ t('growth.earnCheckinValue') }}</dd></div
                    >
                    <div
                      ><dt>{{ t('growth.earnCreate') }}</dt
                      ><dd>{{ t('growth.earnCreateValue') }}</dd></div
                    >
                    <div
                      ><dt>{{ t('growth.earnDailyQuest') }}</dt
                      ><dd>{{ t('growth.earnDailyQuestValue') }}</dd></div
                    >
                  </dl>
                  <div class="growth-task-summary__points">
                    <strong>{{ t('growth.taskPointsSummary') }}</strong>
                    <span>{{ t('growth.taskDailyPoints') }}</span>
                    <span>{{ t('growth.taskWeeklyPoints') }}</span>
                  </div>
                </aside>
              </div>
            </section>
          </template>

          <template v-if="activeSection === 'achievements'">
            <section v-if="!dashboard && (dashboardLoading || !dashboardError)" class="growth-panel growth-state">
              <BLoading inline loading />
            </section>
            <section v-else-if="dashboardError && !dashboard" class="growth-panel growth-state growth-state--error">
              <span>{{ t('growth.dashboardLoadFailed') }}</span>
              <BButton size="small" @click="loadDashboard">{{ t('common.retry') }}</BButton>
            </section>
            <template v-else>
              <section v-if="growthV2Enabled" class="growth-panel">
                <AchievementHighlights :achievements="achievements" />
              </section>
              <section class="growth-panel">
                <AchievementWall
                  :achievements="achievements"
                  :unlocked-count="dashboard?.unlockedCount || 0"
                  :total-achievements="dashboard?.totalAchievements || achievements.length"
                  :claimable-count="dashboard?.claimableCount || 0"
                  :claiming-key="claimingAch || (claimingRewards ? '__busy__' : null)"
                  :read-only="isAdminContext"
                  @claim="onClaimAchievement"
                />
              </section>
              <section v-if="streakMilestones.length" class="growth-panel">
                <MilestoneLadder :milestones="streakMilestones" :current-streak="currentStreak" />
              </section>
              <template v-if="!growthV2Enabled">
                <section id="growth-recap" class="growth-panel"><GrowthTimeline :items="timeline" /></section>
              </template>
            </template>
          </template>

          <template v-if="activeSection === 'rewards'">
            <BButton
              v-if="growthV2Enabled && preferences && freeLotteryRemaining > 0 && !lowPressureMode"
              class="growth-free-lottery-hint"
              v-click-log="{ module: '成长', operation: '打开免费抽奖提示' }"
              @click="selectRewardSection('lottery')"
            >
              <SvgIcon :src="icon.growth.reward" size="17" />
              <span>{{ t('growth.freeLotteryHint', { n: freeLotteryRemaining }) }}</span>
              <SvgIcon :src="icon.arrow_right" size="13" />
            </BButton>
            <BTabs
              v-if="!useWideDesktopLayout"
              v-model:active-tab="activeRewardSection"
              class="growth-reward-tabs"
              variant="line"
              :options="rewardSectionOptions"
              v-click-log="{ module: '成长', operation: '切换资产与奖励子页' }"
              @select="handleRewardTabSelect"
            />
            <section class="growth-panel" :class="{ 'growth-points-panel': activeRewardSection === 'ledger' }">
              <PointsUsagePage v-if="activeRewardSection === 'ledger'" embedded :show-summary="pointsCenterEnabled" />
              <MyInventory v-else-if="activeRewardSection === 'inventory'" :read-only="isAdminContext" />
              <PointsShop
                v-else-if="activeRewardSection === 'shop'"
                :read-only="isAdminContext"
                :focus="String(route.query.focus || '')"
                :show-goal="pointsCenterEnabled"
              />
              <LotteryDraw v-else :read-only="isAdminContext" @focus-header="scrollLotteryToPreferredPosition" />
            </section>
          </template>
        </main>
      </div>
    </div>

    <WeeklyReportModal v-model:visible="wrVisible" :report="wrData" />
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import GrowthCard from '@/components/growth/GrowthCard.vue';
  import GrowthTasks from '@/components/growth/GrowthTasks.vue';
  import ActivityHeatmap from '@/components/growth/ActivityHeatmap.vue';
  import SigninCalendar from '@/components/growth/SigninCalendar.vue';
  import DailyQuests from '@/components/growth/DailyQuests.vue';
  import GrowthStats from '@/components/growth/GrowthStats.vue';
  import AchievementWall from '@/components/growth/AchievementWall.vue';
  import GrowthTimeline from '@/components/growth/GrowthTimeline.vue';
  import MilestoneLadder from '@/components/growth/MilestoneLadder.vue';
  import PointsShop from '@/components/growth/PointsShop.vue';
  import LotteryDraw from '@/components/growth/LotteryDraw.vue';
  import MyInventory from '@/components/growth/MyInventory.vue';
  import PointsUsagePage from '@/view/pointsUsage/PointsUsagePage.vue';
  import WeeklyChallenge from '@/components/growth/WeeklyChallenge.vue';
  import TodayGrowthCard from '@/components/growth/TodayGrowthCard.vue';
  import GrowthPreferencesCard from '@/components/growth/GrowthPreferencesCard.vue';
  import GrowthNextActionCard from '@/components/growth/GrowthNextActionCard.vue';
  import AchievementHighlights from '@/components/growth/AchievementHighlights.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { recordOperation } from '@/api/commonApi.ts';
  import { useGrowth } from '@/composables/useGrowth.ts';
  import { useGrowthClaimFeedback } from '@/composables/useGrowthClaimFeedback';
  import WeeklyReportModal from '@/components/growth/WeeklyReportModal.vue';
  import growthApi from '@/api/growthApi.ts';
  import { bookmarkStore, useUserStore } from '@/store';
  import { resetMobileScrollElement } from '@/composables/useMobileNavigationState';
  import { useForegroundRefresh } from '@/composables/useForegroundRefresh';
  import { resolveDailyQuestClaimFeedback } from '@/utils/dailyQuestClaim';
  import { resolveDailyQuestRoute, resolveGrowthActionRoute } from '@/utils/growthNavigation';
  import { scrollIntoContainer } from '@/utils/zoom';

  type GrowthSection = 'overview' | 'tasks' | 'achievements' | 'rewards';
  type RewardSection = 'shop' | 'lottery' | 'inventory' | 'ledger';
  type TaskView = 'daily' | 'weekly' | 'onboarding';
  type GrowthNavOption<T extends string> = { key: T; label: string; icon: string; badge?: number };
  type DesktopGrowthNavOption = {
    key: string;
    label: string;
    icon: string;
    badge?: number;
    section: GrowthSection;
    reward?: RewardSection;
  };

  const { t } = useI18n();
  const route = useRoute();
  const router = useRouter();
  const user = useUserStore();
  const bookmark = bookmarkStore();
  const routeSection = String(route.query.section || '');
  const routeRewardSection = String(route.query.reward || '').replace(/^center$/, 'ledger');
  const validRewardSections: RewardSection[] = ['shop', 'lottery', 'inventory', 'ledger'];
  const hasRewardDeepLink = validRewardSections.includes(routeRewardSection as RewardSection);
  const activeSection = ref<GrowthSection>(
    ['overview', 'tasks', 'achievements', 'rewards'].includes(routeSection)
      ? (routeSection as GrowthSection)
      : 'overview',
  );
  const activeRewardSection = ref<RewardSection>(hasRewardDeepLink ? (routeRewardSection as RewardSection) : 'ledger');
  const taskView = ref<TaskView>(
    route.hash === '#growth-weekly' ? 'weekly' : route.hash === '#growth-tasks' ? 'onboarding' : 'daily',
  );
  const growthPageRef = ref<HTMLElement | null>(null);
  const growthMainRef = ref<HTMLElement | null>(null);
  const useWideDesktopLayout = computed(() => bookmark.isDesktop && !bookmark.isCompactLayout);
  const sectionOptions = computed<GrowthNavOption<GrowthSection>[]>(() => {
    const achievementBadge = achievementClaimableCount.value;
    return [
      { key: 'overview', label: t('growth.mobileTabOverview'), icon: icon.growth.rank },
      { key: 'tasks', label: t('growth.mobileTabTasks'), icon: icon.growth.action },
      {
        key: 'achievements',
        label: t('growth.mobileTabAchievements'),
        icon: icon.growth.level,
        badge: achievementBadge > 0 ? achievementBadge : undefined,
      },
      {
        key: 'rewards',
        label:
          growthV2Enabled.value && !bookmark.isMobile ? t('growth.assetsRewardsTitle') : t('growth.mobileTabRewards'),
        icon: icon.growth.reward,
      },
    ];
  });
  const rewardSectionOptions = computed<GrowthNavOption<RewardSection>[]>(() => {
    const options: GrowthNavOption<RewardSection>[] = [
      { key: 'ledger', label: t('growth.pointsLogTitle'), icon: icon.noteDetail.history },
      { key: 'inventory', label: t('growth.rewardTabInventory'), icon: icon.growth.storage },
      { key: 'shop', label: t('growth.rewardTabShop'), icon: icon.growth.coin },
      { key: 'lottery', label: t('growth.rewardTabLottery'), icon: icon.growth.reward },
    ];
    if (growthV2Enabled.value) return options;
    return [options[2], options[3], options[1], options[0]];
  });
  const desktopNavigationOptions = computed<DesktopGrowthNavOption[]>(() => [
    ...sectionOptions.value
      .filter((option) => option.key !== 'rewards')
      .map((option) => ({ ...option, section: option.key })),
    ...rewardSectionOptions.value.map((option) => ({
      ...option,
      key: `reward-${option.key}`,
      section: 'rewards' as const,
      reward: option.key,
    })),
  ]);
  const isAdminContext = computed(() => Boolean(user.adminContext));
  const {
    growth,
    dashboard,
    growthTasks,
    lottery,
    weekly,
    claimable,
    preferences,
    loading: growthLoading,
    growthError,
    dashboardLoading,
    dashboardError,
    growthTasksLoading,
    growthTasksError,
    claimableLoading,
    claimableError,
    preferencesLoading,
    preferencesError,
    claimingRewards,
    load,
    loadDashboard,
    loadGrowthTasks,
    loadWeekly,
    loadLottery,
    loadClaimable,
    claimAllRewards,
    loadPreferences,
    savePreferences,
    claimDailyBonus,
    claimAchievement,
    useProtectCard,
  } = useGrowth();
  const growthV2Enabled = computed(() => growth.value?.features?.growthCenterV2 ?? import.meta.env.DEV);
  const pointsCenterEnabled = computed(() => growth.value?.features?.pointsCenter ?? import.meta.env.DEV);
  const claimableCount = computed(() => Number(claimable.value?.count || 0));
  const { achievementClaimableCount, claimAllTooltip, snapshotClaimableBreakdown, claimSuccessMessage } =
    useGrowthClaimFeedback(claimable);
  const lowPressureMode = computed(() => Boolean(preferences.value?.lowPressureMode));
  const freeLotteryRemaining = computed(() => Number(lottery.value?.freeRemaining || 0));
  const preferencesSaving = ref(false);
  const usingProtectCard = ref(false);
  const heatmapRef = ref<{ reload: () => void | Promise<void> } | null>(null);

  const dailyQuestDoneCount = computed(() => quests.value.filter((quest) => quest.done).length);
  const weeklyChallengeDoneCount = computed(
    () => weekly.value?.challenges?.filter((challenge) => challenge.done).length || 0,
  );
  const weeklyChallengeCount = computed(() => weekly.value?.challenges?.length || 0);
  const onboardingDoneCount = computed(() => Number(growthTasks.value?.completedCount || 0));
  const onboardingTaskCount = computed(() => Number(growthTasks.value?.totalCount || 0));
  const taskViewOptions = computed<GrowthNavOption<TaskView>[]>(() => [
    {
      key: 'daily',
      label: t('growth.taskTabDaily', { done: dailyQuestDoneCount.value, total: quests.value.length }),
      icon: icon.growth.action,
    },
    {
      key: 'weekly',
      label: t('growth.taskTabWeekly', {
        done: weekly.value ? weeklyChallengeDoneCount.value : '—',
        total: weekly.value ? weeklyChallengeCount.value : '—',
      }),
      icon: icon.common.calendar,
    },
    {
      key: 'onboarding',
      label: t('growth.taskTabOnboarding', {
        done: onboardingDoneCount.value,
        total: onboardingTaskCount.value,
      }),
      icon: icon.growth.create,
    },
  ]);
  const dailyExperiencePercent = computed(() => {
    const cap = Math.max(0, Number(growth.value?.dailyCap || 0));
    return cap > 0 ? Math.min(100, Math.round((Math.max(0, Number(growth.value?.dailyExp || 0)) / cap) * 100)) : 0;
  });

  function sectionForHash(hash: string): GrowthSection | null {
    if (hash === '#growth-tasks') return 'tasks';
    if (hash === '#growth-weekly') return 'tasks';
    if (hash === '#growth-heatmap') return 'overview';
    if (hash === '#growth-recap') return growthV2Enabled.value ? 'overview' : 'achievements';
    return null;
  }

  function scrollToHash() {
    const targetId = route.hash.replace(/^#/, '');
    if (!targetId) return;
    const targetSection = sectionForHash(route.hash);
    if (targetSection && activeSection.value !== targetSection) {
      // 带 hash 的入口由程序切换分区，不会触发用户点击 Tab 的回顶逻辑。
      activeSection.value = targetSection;
    }
    if (route.hash === '#growth-weekly') taskView.value = 'weekly';
    if (route.hash === '#growth-tasks') taskView.value = 'onboarding';
    void nextTick(() => {
      document
        .getElementById(targetId)
        ?.scrollIntoView({ behavior: 'smooth', block: route.hash === '#growth-weekly' ? 'end' : 'start' });
    });
  }

  function handleWeeklyLoaded() {
    // 每周挑战会在挂载后异步撑开；数据回来后再对齐一次，避免只滚到加载占位的位置。
    if (route.hash === '#growth-weekly') scrollToHash();
  }

  function refreshOverview() {
    void heatmapRef.value?.reload();
    const requests: Array<Promise<unknown>> = [loadDashboard(), loadClaimable()];
    if (useWideDesktopLayout.value) requests.push(loadLottery());
    void Promise.all(requests);
  }

  async function onUseProtectCard(date: string) {
    if (isAdminContext.value || usingProtectCard.value) return;
    usingProtectCard.value = true;
    try {
      const response = await useProtectCard(date);
      if (response?.status === 200 && response.data?.ok) {
        message.success(t('growth.protectCardOk', { n: response.data.streak }));
        recordOperation({ module: '成长', operation: '使用补签卡' });
        await Promise.all([load(true), loadDashboard()]);
        await heatmapRef.value?.reload();
      } else {
        message.info(t('growth.protectCardFail'));
      }
    } catch (error) {
      console.error('补签失败:', error);
      message.info(t('growth.protectCardFail'));
    } finally {
      usingProtectCard.value = false;
    }
  }

  async function scrollLotteryToPreferredPosition() {
    if (!bookmark.isMobile) return;
    await nextTick();
    // BTabs 先 emit select、再更新 v-model；同时 LotteryDraw 还需要一次挂载布局。
    // 等两个绘制帧后再读取标题坐标，避免拿旧奖励页高度计算后被新面板顶偏。
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    const container = growthPageRef.value;
    const lotteryTitle = document.getElementById('lottery-title');
    if (!container || !lotteryTitle) return;
    // 直接以“积分抽奖”标题为准，在标题上方保留主 Tab、间距和卡片内边距。
    // 不再依赖旧面板的锚点位置，保证标题始终完整出现在首屏而不是被滚到顶部之外。
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    scrollIntoContainer(container, lotteryTitle, 112, reduceMotion ? 'auto' : 'smooth');
  }

  function handleSectionTabSelect(section: string) {
    // 切换或再次点击当前分区时，只重置承载正文的滚动容器；宽屏左栏保持独立固定。
    if (bookmark.isMobile && section === 'rewards' && activeRewardSection.value === 'lottery') {
      void scrollLotteryToPreferredPosition();
      return;
    }
    void nextTick(() =>
      resetMobileScrollElement(useWideDesktopLayout.value ? growthMainRef.value : growthPageRef.value),
    );
  }

  function handleRewardTabSelect(section: string) {
    if (section === 'lottery') void scrollLotteryToPreferredPosition();
  }

  function selectSection(section: GrowthSection) {
    activeSection.value = section;
    handleSectionTabSelect(section);
  }

  function isDesktopNavigationActive(option: DesktopGrowthNavOption) {
    return (
      activeSection.value === option.section &&
      (option.section !== 'rewards' || option.reward === activeRewardSection.value)
    );
  }

  function selectDesktopNavigation(option: DesktopGrowthNavOption) {
    if (option.section === 'rewards' && option.reward) activeRewardSection.value = option.reward;
    selectSection(option.section);
  }

  function handleTaskViewSelect(view: string) {
    taskView.value = view as TaskView;
    if (taskView.value === 'onboarding') void loadGrowthTasks();
  }

  function selectRewardSection(section: RewardSection) {
    activeRewardSection.value = section;
    if (useWideDesktopLayout.value) {
      void nextTick(() => resetMobileScrollElement(growthMainRef.value));
      return;
    }
    if (section === 'lottery') void scrollLotteryToPreferredPosition();
  }

  // 空缺省:游客 / 加载前统一给零值,组件照常渲染(成就全未解锁、统计为 0,呈现"待收集"引导)
  const EMPTY_STATS = {
    joinDays: 0,
    currentStreak: 0,
    maxStreak: 0,
    totalCheckins: 0,
    bookmarkCount: 0,
    noteCount: 0,
    fileCount: 0,
    tagCount: 0,
    completedTodoCount: 0,
    organizedResourceCount: 0,
    weekExp: 0,
    checkinDays: [] as string[],
  };
  const EMPTY_BONUS = { exp: 0, points: 0, claimed: false, claimable: false };
  const stats = computed(() => dashboard.value?.stats || EMPTY_STATS);
  const achievements = computed(() => dashboard.value?.achievements || []);
  const quests = computed(() => dashboard.value?.quests || []);
  const timeline = computed(() => dashboard.value?.timeline || []);
  const questBonus = computed(() => dashboard.value?.questBonus || EMPTY_BONUS);
  const streakMilestones = computed(() => dashboard.value?.streakMilestones || []);
  const currentStreak = computed(() => dashboard.value?.currentStreak ?? growth.value?.streak ?? 0);

  async function onClaim() {
    if (isAdminContext.value || claimingRewards.value) return;
    try {
      const res = await claimDailyBonus();
      if (res?.status === 200 && res.data?.ok) {
        const feedback = resolveDailyQuestClaimFeedback(res.data);
        if (feedback.level === 'success') {
          message.success(t(feedback.key, feedback.params));
          recordOperation({ module: '成长', operation: '领取日常任务阶段奖励' });
        } else {
          message.info(t(feedback.key, feedback.params));
        }
      }
    } catch (err) {
      console.error('领取每日奖励失败:', err);
    }
  }

  async function onClaimAll() {
    if (isAdminContext.value || claimingRewards.value) return;
    const pendingBreakdown = snapshotClaimableBreakdown();
    try {
      const res = await claimAllRewards();
      if (res?.status === 200 && res.data?.ok) {
        const claimed = Number(res.data.claimed || 0);
        if (claimed > 0) {
          message.success(claimSuccessMessage(res.data, pendingBreakdown));
          recordOperation({ module: '成长', operation: '一键领取成长奖励成功' });
        } else {
          message.info(t('growth.claimAllEmpty'));
        }
      } else {
        message.error(t('growth.claimAllFailed'));
      }
    } catch (error) {
      console.error('一键领取成长奖励失败:', error);
      message.error(t('growth.claimAllFailed'));
    }
  }

  function handleQuestAction(key: string) {
    const target = resolveDailyQuestRoute(key, bookmark.isMobile);
    if (target) {
      void router.push(target);
      return;
    }
    if (key === 'checkin') activeSection.value = 'overview';
    else activeSection.value = 'tasks';
  }

  function handleGrowthAction(action: string) {
    if (action === 'open_weekly_report') {
      void openWeeklyReport();
      return;
    }
    if (action === 'profile') {
      if (bookmark.isMobile) void router.push('/myInfo');
      else window.dispatchEvent(new CustomEvent('light-note:open-profile'));
      return;
    }
    const target = resolveGrowthActionRoute(action, bookmark.isMobile);
    if (target) {
      void router.push(target);
      return;
    }
    activeSection.value = 'tasks';
  }

  async function onSavePreferences(value: Parameters<typeof savePreferences>[0]) {
    if (isAdminContext.value || preferencesSaving.value) return;
    preferencesSaving.value = true;
    try {
      const res = await savePreferences(value);
      if (res?.status === 200 && res.data?.ok) {
        message.success(t('growth.preferencesSaved'));
        recordOperation({ module: '成长', operation: '保存成长偏好成功' });
        void heatmapRef.value?.reload();
      } else {
        message.error(t('growth.preferencesSaveFailed'));
      }
    } catch (error) {
      console.error('保存成长偏好失败:', error);
      message.error(t('growth.preferencesSaveFailed'));
    } finally {
      preferencesSaving.value = false;
    }
  }

  const wrVisible = ref(false);
  const wrData = ref<any>(null);
  const wrLoading = ref(false);
  async function openWeeklyReport() {
    if (wrLoading.value) return;
    wrLoading.value = true;
    try {
      const res = await growthApi.getWeeklyReport();
      if (res?.status === 200) {
        wrData.value = res.data;
        wrVisible.value = true;
      } else {
        message.error(t('growth.weeklyReportFailed'));
      }
    } catch (err) {
      console.error('获取周报失败:', err);
      message.error(t('growth.weeklyReportFailed'));
    } finally {
      wrLoading.value = false;
    }
  }

  onMounted(() => {
    void load(); // 任务分区也需要今日经验与每日上限；共享请求会与概览卡片自动合并。
    void Promise.all([loadDashboard(), loadClaimable(), loadPreferences()]);
    if (activeSection.value === 'tasks') void Promise.all([loadGrowthTasks(true), loadWeekly()]);
    if (activeSection.value === 'rewards' || (activeSection.value === 'overview' && useWideDesktopLayout.value)) {
      void loadLottery();
    }
    scrollToHash();
  });

  watch(
    () => route.query.report,
    (report) => {
      if (report !== 'weekly') return;
      void openWeeklyReport();
      const { report: _report, ...query } = route.query;
      void router.replace({ query, hash: route.hash });
    },
    { immediate: true },
  );

  /*
   * 从后台切回前台时补一次数据。原来这里是 onActivated（本意是「从笔记库、书签或待办
   * 返回时同步旁路完成的任务状态」），但全站没有 keep-alive，从别处回到本页就是重新挂载，
   * 那件事已由上面的 onMounted 完成；真正取不到新数据的只有「页面一直在、人离开了」：
   * Android App 切后台再回来、PC 标签页搁很久再切回。
   * 成长页几乎每块都绑在「今天」上（每日任务、签到、连续天数），挂一夜回来看到的会是昨天。
   * 刷新过程静默，提示由顶部那条全局细进度条负责（composable 内部已注册）。
   */
  useForegroundRefresh({
    refresh: () => {
      const requests: Array<Promise<unknown>> = [loadDashboard(), load(true), loadClaimable()];
      if (activeSection.value === 'tasks') requests.push(loadGrowthTasks(true), loadWeekly());
      if (activeSection.value === 'rewards' || (activeSection.value === 'overview' && useWideDesktopLayout.value)) {
        requests.push(loadLottery());
      }
      return Promise.all(requests);
    },
    // 领取奖励在途或周报弹框开着时不插队刷新：会把面板数据换到用户正在看的内容底下。
    canRefresh: () => !claimingRewards.value && !claimingAch.value && !wrVisible.value,
  });

  // 工作台「查看全部成长任务」会带 hash；已在成长页时再进一次不会重挂载（router-view key 固定），
  // 所以同页 hash 变化要单独响应。
  watch(
    () => route.hash,
    () => scrollToHash(),
  );

  watch(
    () => route.query.section,
    (section) => {
      // 个人资料头像框选择器等入口会在成长页已经挂载时改 query；此时路由组件不会重建，
      // 必须把外部导航反向同步回 Tab，不能只让地址栏变成 tasks/achievements。
      const requested = String(section || '');
      const nextSection = ['overview', 'tasks', 'achievements', 'rewards'].includes(requested)
        ? (requested as GrowthSection)
        : 'overview';
      if (activeSection.value !== nextSection) activeSection.value = nextSection;
    },
  );

  watch(
    () => route.query.reward,
    (reward) => {
      const requested = String(reward || '').replace(/^center$/, 'ledger');
      const nextReward = validRewardSections.includes(requested as RewardSection)
        ? (requested as RewardSection)
        : growthV2Enabled.value
          ? 'ledger'
          : 'shop';
      if (activeRewardSection.value !== nextReward) activeRewardSection.value = nextReward;
    },
  );

  watch(activeSection, (section) => {
    // 路由已切到目标分区时无需反写；重复 replace 会清掉建议入口携带的任务锚点。
    if (route.query.section !== section) {
      void router.replace({
        query: { ...route.query, section },
        hash: sectionForHash(route.hash) === section ? route.hash : '',
      });
    }
    if (section === 'tasks') void Promise.all([loadGrowthTasks(), loadWeekly()]);
    if (section === 'rewards' || (section === 'overview' && useWideDesktopLayout.value)) void loadLottery();
  });

  watch(activeRewardSection, (reward) => {
    if (activeSection.value === 'rewards')
      void router.replace({ query: { ...route.query, section: 'rewards', reward } });
  });

  watch(
    growthV2Enabled,
    (enabled) => {
      if (!hasRewardDeepLink) activeRewardSection.value = enabled ? 'ledger' : 'shop';
    },
    { immediate: true },
  );

  const claimingAch = ref<string | null>(null);
  async function onClaimAchievement(key: string) {
    if (isAdminContext.value || claimingAch.value || claimingRewards.value) return;
    claimingAch.value = key;
    try {
      const res = await claimAchievement(key);
      if (res?.status === 200 && res.data?.ok) {
        if (res.data.frameId) {
          const frameName = t(`growth.shopItems.${res.data.frameId}.name`);
          message.success(t('growth.achClaimFrameOk', { n: res.data.reward, name: frameName }));
          recordOperation({
            module: '成长',
            operation: `领取成就奖励成功-${key}`,
          });
        } else {
          message.success(t('growth.achClaimOk', { n: res.data.reward }));
          recordOperation({ module: '成长', operation: `领取成就奖励成功-${key}` });
        }
      } else if (res?.data?.reason === 'claimed') {
        message.info(t('growth.achClaimedAlready'));
      } else if (res?.data?.reason === 'locked') {
        message.info(t('growth.achClaimLocked'));
      }
    } catch (err) {
      console.error('领取成就奖励失败:', err);
    } finally {
      claimingAch.value = null;
    }
  }

  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push('/home');
  }
</script>

<style scoped lang="less">
  .growth-panel.growth-points-panel {
    padding: 0;
    border: 0;
    background: transparent;
    box-shadow: none;
  }

  /* 与设置页同理:index.vue 子路由根元素被内联 position:fixed + height:calc(100%-60px),
     必须自身 overflow-y:auto 在固定框内滚动,勿用 min-height:100vh(见记忆 subroute-fixed-scroll)。 */
  .growth-page {
    height: 100%;
    overflow-y: auto;
    padding: 28px 24px 64px;
    box-sizing: border-box;
    background: var(--background-color);
    color: var(--text-color);
  }
  .growth-page--wide {
    overflow: hidden;
  }
  .growth-container {
    max-width: 720px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  /* 大屏放宽容器,容纳 GrowthCard 的左右两栏,消除 PC 两侧大片留白 */
  @media (min-width: 900px) {
    .growth-container {
      max-width: 1120px;
    }
  }
  .growth-container.growth-container--wide {
    height: 100%;
    min-height: 0;
    max-width: 1480px;
  }
  .growth-workspace {
    min-width: 0;
  }
  .growth-workspace--wide {
    display: grid;
    min-height: 0;
    flex: 1 1 auto;
    grid-template-columns: 208px minmax(0, 1fr);
    align-items: start;
    gap: 18px;
    overflow: hidden;
  }
  .growth-main {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 18px;
  }
  .growth-desktop-sidebar {
    position: static;
    display: flex;
    max-height: 100%;
    min-width: 0;
    flex-direction: column;
    overflow-y: auto;
    scrollbar-width: thin;
  }
  .growth-workspace--wide .growth-main {
    height: 100%;
    overflow-y: auto;
    scrollbar-width: thin;
  }
  .growth-hero--sidebar {
    flex: 0 0 auto;
    padding: 0 4px 16px;
  }
  .growth-side-nav {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
    border: 1px solid var(--card-border-color);
    border-radius: 16px;
    background: var(--workbench-subcard-bg);
    box-shadow: 0 12px 28px -24px rgba(30, 35, 70, 0.45);
  }
  .growth-side-nav-item.b_btn,
  .growth-side-report.b_btn {
    width: 100%;
    margin: 0;
    box-sizing: border-box;
    border: 1px solid transparent;
    background: transparent;
    color: var(--desc-color);
    box-shadow: none;
  }
  .growth-side-nav-item.b_btn {
    position: relative;
    justify-content: flex-start;
    gap: 10px;
    height: 46px;
    padding: 0 11px;
    overflow: hidden;
    border-radius: 11px;
    line-height: normal;
    text-align: left;
  }
  .growth-side-nav-item.b_btn::before {
    content: '';
    position: absolute;
    top: 9px;
    bottom: 9px;
    left: 0;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: transparent;
  }
  .growth-side-nav-item.b_btn:hover {
    border-color: var(--card-border-color);
    background: var(--hover-background);
    color: var(--text-color);
  }
  .growth-side-nav-item.b_btn.is-active {
    border-color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 10%, var(--workbench-subcard-bg));
    color: var(--primary-color);
    font-weight: 700;
  }
  .growth-side-nav-item.b_btn.is-active::before {
    background: var(--primary-color);
  }
  .growth-side-nav-icon {
    display: grid;
    width: 30px;
    height: 30px;
    flex: 0 0 30px;
    place-items: center;
    border: 1px solid var(--card-border-color);
    border-radius: 9px;
    background: var(--background-color);
    color: currentColor;
  }
  .growth-side-nav-item.is-active .growth-side-nav-icon {
    border-color: var(--primary-color);
    background: var(--primary-color);
    color: #fff;
  }
  .growth-side-nav-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .growth-side-nav-badge {
    min-width: 20px;
    height: 20px;
    margin-left: auto;
    padding: 0 6px;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--primary-color);
    border-radius: 10px;
    background: var(--primary-color);
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
  }
  .growth-side-report.b_btn {
    justify-content: flex-start;
    gap: 8px;
    height: 42px;
    margin-top: 12px;
    padding: 0 14px;
    border-color: var(--primary-color);
    border-radius: 11px;
    background: color-mix(in srgb, var(--primary-color) 8%, var(--background-color));
    color: var(--primary-color);
    font-weight: 600;
  }
  .growth-side-report.b_btn:hover {
    background: color-mix(in srgb, var(--primary-color) 14%, var(--background-color));
  }
  .growth-hero {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .growth-back {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 30px !important;
    padding: 0 12px 0 8px !important;
    margin-bottom: 8px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 70%, transparent);
    background: transparent;
    color: var(--desc-color);
    font-size: 13px;
    cursor: pointer;
    transition:
      color 0.15s,
      border-color 0.15s,
      background 0.15s;
  }
  .growth-back:hover {
    color: var(--primary-color);
    border-color: color-mix(in srgb, var(--primary-color) 45%, transparent);
    background: color-mix(in srgb, var(--primary-color) 6%, transparent);
  }
  .growth-title {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .growth-subtitle {
    margin: 0;
    font-size: 13px;
    color: var(--desc-color);
  }
  .growth-report-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    align-self: flex-start;
    margin-top: 10px;
    height: 32px !important;
    padding: 0 14px !important;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 40%, transparent);
    background: color-mix(in srgb, var(--primary-color) 8%, transparent);
    color: var(--primary-color);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }
  .growth-report-btn:hover {
    background: color-mix(in srgb, var(--primary-color) 15%, transparent);
  }
  .growth-panel {
    border: 1px solid color-mix(in srgb, var(--card-border-color) 62%, transparent);
    border-radius: 16px;
    background: var(--workbench-subcard-bg);
    padding: 20px;
    scroll-margin-top: 18px;
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.03),
      0 12px 28px -22px rgba(30, 35, 70, 0.35);
    .cal {
      margin: 0 auto;
      width: 50%;
    }
  }
  .growth-admin-notice {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 13px 15px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 30%, transparent);
    border-radius: 12px;
    background: color-mix(in srgb, var(--primary-color) 7%, var(--workbench-subcard-bg));
    color: var(--text-color);
    font-size: 13px;
    line-height: 1.55;
  }
  .growth-admin-notice span {
    color: var(--desc-color);
  }
  /* 每日任务 + 数据统计:大屏并排,窄屏堆叠 */
  .growth-row {
    display: flex;
    gap: 18px;
    align-items: stretch;
  }
  .growth-panel--flex {
    flex: 1 1 0;
    min-width: 0;
  }
  .growth-panel--today {
    padding: 0;
    border: 0;
    background: transparent;
    box-shadow: none;
  }
  .growth-page--wide .growth-panel--stats {
    padding: 14px;
  }
  .growth-page--wide .growth-panel--level {
    padding: 14px;
  }
  .growth-page--wide .growth-panel--stats :deep(.gs) {
    display: grid;
    grid-template-columns: minmax(220px, 0.42fr) minmax(0, 1fr);
    align-items: stretch;
    gap: 12px;
  }
  .growth-page--wide .growth-panel--stats :deep(.gs-hero) {
    padding: 10px 12px;
  }
  .growth-page--wide .growth-panel--stats :deep(.gs-grid) {
    grid-template-columns: repeat(9, minmax(64px, 1fr));
    gap: 6px;
  }
  .growth-page--wide .growth-panel--stats :deep(.gs-tile) {
    min-width: 0;
    padding: 8px 4px;
  }
  .growth-knowledge-panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .growth-knowledge-panel__content {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(300px, 0.72fr) minmax(0, 1.45fr);
    align-items: stretch;
    gap: 16px;
  }
  .growth-knowledge-panel__heatmap,
  .growth-knowledge-panel__calendar {
    min-width: 0;
    padding: 14px;
    box-sizing: border-box;
    border: 1px solid var(--card-border-color);
    border-radius: 13px;
    background: var(--background-color);
  }
  .growth-knowledge-panel__calendar {
    display: flex;
    align-items: center;
  }
  .growth-knowledge-panel__calendar :deep(.cal) {
    width: 100%;
  }
  .growth-knowledge-panel__calendar :deep(.cal-cell) {
    min-height: 34px;
  }
  .growth-overview-routine {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
    align-items: stretch;
    gap: 18px;
  }
  .growth-overview-routine--single {
    grid-template-columns: minmax(0, 1fr);
  }
  .growth-overview-daily {
    height: 100%;
    min-width: 0;
    padding: 12px;
    box-sizing: border-box;
  }
  .growth-task-center {
    flex: 0 0 auto;
    padding: 0;
    overflow: hidden;
  }
  .growth-task-tabs {
    padding: 0 16px;
    border-bottom: 1px solid var(--card-border-color);
  }
  .growth-task-tabs :deep(.tab) {
    min-height: 46px;
  }
  .growth-task-workspace {
    min-width: 0;
    padding: 16px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 280px;
    align-items: start;
    gap: 16px;
  }
  .growth-task-workspace__main {
    min-width: 0;
  }
  .growth-task-summary {
    min-width: 0;
    padding: 15px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    border: 1px solid var(--card-border-color);
    border-radius: 13px;
    background: var(--background-color);
  }
  .growth-task-summary header {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .growth-task-summary header > div {
    min-width: 0;
  }
  .growth-task-summary h3,
  .growth-task-summary p {
    margin: 0;
  }
  .growth-task-summary h3 {
    font-size: 14px;
  }
  .growth-task-summary p {
    margin-top: 2px;
    color: var(--desc-color);
    font-size: 10.5px;
  }
  .growth-task-summary__icon {
    width: 36px;
    height: 36px;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--primary-color);
    border-radius: 10px;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 8%, var(--background-color));
  }
  .growth-task-summary__progress {
    display: flex;
    align-items: baseline;
    gap: 4px;
    color: var(--desc-color);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .growth-task-summary__progress strong {
    color: var(--primary-color);
    font-size: 30px;
    line-height: 1;
  }
  .growth-task-summary__track {
    height: 5px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--card-border-color);
  }
  .growth-task-summary__track span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--primary-color);
  }
  .growth-task-summary__sources,
  .growth-task-summary__sources div {
    margin: 0;
  }
  .growth-task-summary__sources {
    display: grid;
    gap: 7px;
  }
  .growth-task-summary__sources div {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    align-items: start;
    gap: 10px;
    color: var(--desc-color);
    font-size: 11px;
  }
  .growth-task-summary__sources dt {
    white-space: nowrap;
  }
  .growth-task-summary__sources dd {
    margin: 0;
    color: var(--text-color);
    font-weight: 650;
    text-align: right;
    overflow-wrap: anywhere;
  }
  .growth-task-summary__points {
    padding-top: 10px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    border-top: 1px solid var(--card-border-color);
    color: var(--desc-color);
    font-size: 10.5px;
  }
  .growth-task-summary__points strong {
    width: 100%;
    color: var(--text-color);
    font-size: 11.5px;
  }
  .growth-task-summary__points span {
    padding: 4px 7px;
    border: 1px solid var(--card-border-color);
    border-radius: 999px;
    background: var(--workbench-subcard-bg);
  }
  .growth-section-heading,
  .growth-panel-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .growth-section-heading h2,
  .growth-panel-heading h2 {
    margin: 0;
    color: var(--text-color);
    font-size: 18px;
  }
  .growth-section-heading p,
  .growth-panel-heading p {
    margin: 3px 0 0;
    color: var(--desc-color);
    font-size: 12px;
  }
  .growth-footprint {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .growth-state {
    min-height: 112px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--desc-color);
    font-size: 12px;
  }
  .growth-state--error {
    flex-direction: column;
    color: var(--warning-color, #a05f00);
  }
  .growth-free-lottery-hint.b_btn {
    width: 100%;
    min-height: 44px;
    display: flex;
    justify-content: flex-start;
    gap: 9px;
    padding: 0 14px;
    border: 1px solid var(--primary-color);
    border-radius: 12px;
    color: var(--primary-color);
    background: var(--workbench-subcard-bg);
    box-shadow: none;
  }
  .growth-free-lottery-hint span {
    flex: 1;
    text-align: left;
  }
  html.light-note-mobile-rendering .growth-free-lottery-hint.b_btn {
    border-color: var(--primary-color);
    background: var(--background-color);
    box-shadow: none;
  }
  .growth-section-tabs {
    position: sticky;
    top: 0;
    z-index: 3;
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--card-border-color);
    border-radius: 13px;
    background: var(--background-color);
  }
  .growth-section-tabs :deep(.tab) {
    min-height: 44px;
    flex: 1 1 25%;
    justify-content: center;
  }
  .growth-section-tabs :deep(.tab-badge) {
    border: 1px solid var(--primary-color);
    background: var(--primary-color);
    color: #fff;
    opacity: 1;
  }
  .growth-reward-tabs {
    align-self: stretch;
    border-bottom: 1px solid var(--card-border-color);
  }
  @media (max-width: 900px) {
    .growth-task-workspace,
    .growth-knowledge-panel__content {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @media (max-width: 767px) {
    .growth-page {
      padding: 18px 12px 36px;
    }
    .growth-container {
      gap: 12px;
    }
    .growth-main {
      gap: 12px;
    }
    .growth-section-tabs :deep(.tab) {
      min-width: 0;
      min-height: 44px;
      padding: 0 8px;
      flex: 1 1 25%;
      justify-content: center;
      line-height: 44px;
    }
    .growth-back,
    .growth-report-btn {
      min-height: 44px !important;
    }
    .growth-title {
      font-size: 21px;
    }
    .growth-panel {
      padding: 14px;
      border-radius: 14px;

      .cal {
        width: 100%;
      }
    }
    .growth-row {
      flex-direction: column;
    }
    .growth-section-heading {
      align-items: flex-start;
      flex-direction: column;
    }
    .growth-section-heading :deep(.b-tooltip-wrap) {
      width: 100%;
    }
    .growth-section-heading .b_btn {
      width: 100%;
    }
    .growth-task-tabs {
      padding: 0 8px;
      overflow-x: auto;
    }
    .growth-task-tabs :deep(.tab) {
      min-width: max-content;
      padding-inline: 10px;
    }
    .growth-task-workspace {
      padding: 12px;
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
