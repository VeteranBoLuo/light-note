<template>
  <div ref="growthPageRef" class="growth-page">
    <div class="growth-container">
      <header class="growth-hero">
        <BButton class="growth-back" @click="goBack">
          <svg-icon :src="icon.arrow_left" size="16" />
          <span>{{ t('common.back') }}</span>
        </BButton>
        <h1 class="growth-title">{{ t('growth.pageTitle') }}</h1>
        <p class="growth-subtitle">{{ t('growth.pageSubtitle') }}</p>
        <BButton class="growth-report-btn" :loading="wrLoading" @click="openWeeklyReport">
          <SvgIcon :src="icon.growth.rank" size="15" /> {{ t('growth.weeklyReportEntry') }}
        </BButton>
      </header>

      <div v-if="isAdminContext" class="growth-admin-notice" role="status">
        <strong>{{ t('growth.adminContextTitle') }}</strong>
        <span>{{ t('growth.adminContextNotice') }}</span>
      </div>

      <BTabs
        v-model:active-tab="activeSection"
        class="growth-section-tabs"
        variant="segment"
        :options="sectionOptions"
      />

      <section v-if="activeSection === 'overview'" class="growth-panel">
        <GrowthCard :read-only="isAdminContext" @activity-changed="refreshHeatmap" />
      </section>

      <div v-if="activeSection === 'overview'" class="growth-row growth-overview-row">
        <section class="growth-panel growth-panel--flex">
          <GrowthStats :stats="stats" />
        </section>
        <section id="growth-heatmap" class="growth-panel growth-panel--flex">
          <ActivityHeatmap ref="heatmapRef" />
        </section>
      </div>

      <template v-if="activeSection === 'tasks'">
        <div class="growth-row">
          <section class="growth-panel growth-panel--flex">
            <DailyQuests
              :quests="quests"
              :bonus="questBonus"
              :claiming="claiming"
              :read-only="isAdminContext"
              @claim="onClaim"
            />
          </section>
          <section v-if="showGrowthTasks" id="growth-tasks" class="growth-panel growth-panel--flex">
            <GrowthTasks :data="growthTasks" :show-completed="true" :read-only="isAdminContext" />
          </section>
        </div>
        <section class="growth-panel">
          <WeeklyChallenge :read-only="isAdminContext" />
        </section>
      </template>

      <template v-if="activeSection === 'achievements'">
        <section class="growth-panel">
          <AchievementWall
            :achievements="achievements"
            :unlocked-count="dashboard?.unlockedCount || 0"
            :total-achievements="dashboard?.totalAchievements || achievements.length"
            :claimable-count="dashboard?.claimableCount || 0"
            :claiming-key="claimingAch"
            :read-only="isAdminContext"
            @claim="onClaimAchievement"
          />
        </section>
        <section v-if="streakMilestones.length" class="growth-panel">
          <MilestoneLadder :milestones="streakMilestones" :current-streak="currentStreak" />
        </section>
        <section class="growth-panel"><GrowthTimeline :items="timeline" /></section>
        <section v-if="showRecap" id="growth-recap" class="growth-panel"><RecapCard /></section>
      </template>

      <template v-if="activeSection === 'rewards'">
        <BTabs
          v-model:active-tab="activeRewardSection"
          class="growth-reward-tabs"
          variant="line"
          :options="rewardSectionOptions"
        />
        <section class="growth-panel">
          <PointsShop v-if="activeRewardSection === 'shop'" :read-only="isAdminContext" />
          <LotteryDraw v-else-if="activeRewardSection === 'lottery'" :read-only="isAdminContext" />
          <MyInventory v-else-if="activeRewardSection === 'inventory'" :read-only="isAdminContext" />
          <PointsLedger v-else />
        </section>
      </template>
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
  import DailyQuests from '@/components/growth/DailyQuests.vue';
  import GrowthStats from '@/components/growth/GrowthStats.vue';
  import AchievementWall from '@/components/growth/AchievementWall.vue';
  import GrowthTimeline from '@/components/growth/GrowthTimeline.vue';
  import MilestoneLadder from '@/components/growth/MilestoneLadder.vue';
  import PointsShop from '@/components/growth/PointsShop.vue';
  import LotteryDraw from '@/components/growth/LotteryDraw.vue';
  import MyInventory from '@/components/growth/MyInventory.vue';
  import PointsLedger from '@/components/growth/PointsLedger.vue';
  import WeeklyChallenge from '@/components/growth/WeeklyChallenge.vue';
  import RecapCard from '@/components/growth/RecapCard.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { recordOperation } from '@/api/commonApi.ts';
  import { useGrowth } from '@/composables/useGrowth.ts';
  import WeeklyReportModal from '@/components/growth/WeeklyReportModal.vue';
  import growthApi from '@/api/growthApi.ts';
  import { bookmarkStore, useUserStore } from '@/store';
  import { resetMobileScrollElement } from '@/composables/useMobileNavigationState';
  import { useForegroundRefresh } from '@/composables/useForegroundRefresh';
  import { dailyQuestClaimLogText, resolveDailyQuestClaimFeedback } from '@/utils/dailyQuestClaim';

  type GrowthSection = 'overview' | 'tasks' | 'achievements' | 'rewards';
  type RewardSection = 'shop' | 'lottery' | 'inventory' | 'ledger';

  const { t } = useI18n();
  const route = useRoute();
  const router = useRouter();
  const user = useUserStore();
  const bookmark = bookmarkStore();
  const routeSection = String(route.query.section || '');
  const routeRewardSection = String(route.query.reward || '');
  const activeSection = ref<GrowthSection>(
    ['overview', 'tasks', 'achievements', 'rewards'].includes(routeSection)
      ? (routeSection as GrowthSection)
      : 'overview',
  );
  const activeRewardSection = ref<RewardSection>(
    ['shop', 'lottery', 'inventory', 'ledger'].includes(routeRewardSection)
      ? (routeRewardSection as RewardSection)
      : 'shop',
  );
  const growthPageRef = ref<HTMLElement | null>(null);
  let preserveNextMobileSectionScroll = false;
  const sectionOptions = computed(() => [
    { key: 'overview', label: t('growth.mobileTabOverview') },
    { key: 'tasks', label: t('growth.mobileTabTasks') },
    { key: 'achievements', label: t('growth.mobileTabAchievements') },
    { key: 'rewards', label: t('growth.mobileTabRewards') },
  ]);
  const rewardSectionOptions = computed(() => [
    { key: 'shop', label: t('growth.rewardTabShop') },
    { key: 'lottery', label: t('growth.rewardTabLottery') },
    { key: 'inventory', label: t('growth.rewardTabInventory') },
    { key: 'ledger', label: t('growth.rewardTabLedger') },
  ]);
  const isAdminContext = computed(() => Boolean(user.adminContext));
  const {
    growth,
    dashboard,
    recap,
    growthTasks,
    loadDashboard,
    loadGrowthTasks,
    loadRecap,
    claimDailyBonus,
    claimAchievement,
  } = useGrowth();
  const hasRecap = computed(
    () =>
      !!recap.value &&
      ((recap.value.weekly?.length || 0) > 0 || recap.value.onThisDay.length > 0 || recap.value.buried.length > 0),
  );
  const activeGrowthTaskCount = computed(() => growthTasks.value?.tasks.filter((task) => !task.claimed).length ?? 0);
  const showGrowthTasks = computed(() => !growthTasks.value || activeGrowthTaskCount.value > 0);
  const showRecap = computed(() => hasRecap.value);
  const heatmapRef = ref<{ reload: () => void | Promise<void> } | null>(null);

  function sectionForHash(hash: string): GrowthSection | null {
    if (hash === '#growth-tasks') return 'tasks';
    if (hash === '#growth-heatmap') return 'overview';
    if (hash === '#growth-recap') return 'achievements';
    return null;
  }

  function scrollToHash() {
    const targetId = route.hash.replace(/^#/, '');
    if (!targetId) return;
    const targetSection = sectionForHash(route.hash);
    if (targetSection && activeSection.value !== targetSection) {
      // 带 hash 的入口需要继续定位到目标卡片，不能被普通 Tab 切换的回顶逻辑覆盖。
      preserveNextMobileSectionScroll = bookmark.isMobile;
      activeSection.value = targetSection;
    }
    void nextTick(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function refreshHeatmap() {
    void heatmapRef.value?.reload();
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

  const claiming = ref(false);
  async function onClaim() {
    if (isAdminContext.value || claiming.value) return;
    claiming.value = true;
    try {
      const res = await claimDailyBonus();
      if (res?.status === 200 && res.data?.ok) {
        const feedback = resolveDailyQuestClaimFeedback(res.data);
        if (feedback.level === 'success') {
          message.success(t(feedback.key, feedback.params));
          recordOperation({ module: '成长', operation: dailyQuestClaimLogText(res.data) });
        } else {
          message.info(t(feedback.key, feedback.params));
        }
      }
    } catch (err) {
      console.error('领取每日奖励失败:', err);
    } finally {
      claiming.value = false;
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
        recordOperation({ module: '成长', operation: '查看本周周报' });
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
    recordOperation({ module: '成长', operation: '查看我的成长' });
    loadDashboard(); // 每次进页刷新(签到/创建后数据实时变化)
    // 只加载当前分区的专属数据；奖励子页在挂载时加载，避免 PC 首屏同时请求整页所有模块。
    if (activeSection.value === 'tasks') loadGrowthTasks(true);
    if (activeSection.value === 'achievements') loadRecap();
    scrollToHash();
  });

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
      const requests: Array<Promise<unknown>> = [loadDashboard()];
      if (activeSection.value === 'tasks') requests.push(loadGrowthTasks(true));
      if (activeSection.value === 'achievements') requests.push(loadRecap());
      return Promise.all(requests);
    },
    // 领取奖励在途或周报弹框开着时不插队刷新：会把面板数据换到用户正在看的内容底下。
    canRefresh: () => !claiming.value && !claimingAch.value && !wrVisible.value,
  });

  // 工作台「查看全部成长任务」会带 hash；已在成长页时再进一次不会重挂载（router-view key 固定），
  // 所以同页 hash 变化要单独响应。
  watch(
    () => route.hash,
    () => scrollToHash(),
  );

  watch(activeSection, (section) => {
    void router.replace({ query: { ...route.query, section } });
    if (section === 'tasks') void loadGrowthTasks();
    if (section === 'achievements') void loadRecap();
    if (!bookmark.isMobile) return;
    if (preserveNextMobileSectionScroll) {
      preserveNextMobileSectionScroll = false;
      return;
    }
    // 成长页四个分段共用同一个滚动容器；切换内容后必须回到页面起点，
    // 不能把上一分段的滚动位置带进结构和高度完全不同的新分段。
    void nextTick(() => resetMobileScrollElement(growthPageRef.value));
  });

  watch(activeRewardSection, (reward) => {
    if (activeSection.value === 'rewards')
      void router.replace({ query: { ...route.query, section: 'rewards', reward } });
  });

  const claimingAch = ref<string | null>(null);
  async function onClaimAchievement(key: string) {
    if (isAdminContext.value || claimingAch.value) return;
    claimingAch.value = key;
    try {
      const res = await claimAchievement(key);
      if (res?.status === 200 && res.data?.ok) {
        message.success(t('growth.achClaimOk', { n: res.data.reward }));
        recordOperation({ module: '成长', operation: `领取成就奖励 ${key}（+${res.data.reward} 积分）` });
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
  .growth-reward-tabs {
    align-self: stretch;
    border-bottom: 1px solid var(--card-border-color);
  }
  @media (max-width: 767px) {
    .growth-page {
      padding: 18px 12px 36px;
    }
    .growth-container {
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
  }
</style>
