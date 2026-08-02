<template>
  <div class="growth-page">
    <div class="growth-container">
      <header class="growth-hero">
        <BButton class="growth-back" @click="goBack">
          <svg-icon :src="icon.arrow_left" size="16" />
          <span>{{ t('common.back') }}</span>
        </BButton>
        <h1 class="growth-title">{{ t('growth.pageTitle') }}</h1>
        <p class="growth-subtitle">{{ t('growth.pageSubtitle') }}</p>
        <BButton class="growth-report-btn" :loading="wrLoading" @click="openWeeklyReport"
          >📊 {{ t('growth.weeklyReportEntry') }}</BButton
        >
      </header>

      <div v-if="isAdminContext" class="growth-admin-notice" role="status">
        <strong>{{ t('growth.adminContextTitle') }}</strong>
        <span>{{ t('growth.adminContextNotice') }}</span>
      </div>

      <BTabs
        v-if="bookmark.isMobile"
        v-model:active-tab="activeMobileSection"
        class="growth-mobile-tabs"
        variant="segment"
        :options="mobileSectionOptions"
      />

      <section v-if="showGrowthSection('overview')" class="growth-panel">
        <GrowthCard :read-only="isAdminContext" @activity-changed="refreshHeatmap" />
      </section>

      <section v-if="showGrowthSection('tasks') && showGrowthTasks" id="growth-tasks" class="growth-panel">
        <GrowthTasks :data="growthTasks" :show-completed="true" :read-only="isAdminContext" />
      </section>

      <section v-if="showGrowthSection('achievements')" id="growth-heatmap" class="growth-panel">
        <ActivityHeatmap ref="heatmapRef" />
      </section>

      <div v-if="showGrowthSection('overview')" class="growth-row">
        <section v-if="questsEnabled" class="growth-panel growth-panel--flex">
          <DailyQuests
            :quests="quests"
            :bonus="questBonus"
            :claiming="claiming"
            :read-only="isAdminContext"
            @claim="onClaim"
          />
        </section>
        <section class="growth-panel growth-panel--flex">
          <GrowthStats :stats="stats" />
        </section>
      </div>

      <!-- 周挑战与每日任务的等级上限规则不同：管理员/满级账号仍可查看周挑战。 -->
      <section v-if="showGrowthSection('tasks')" class="growth-panel">
        <WeeklyChallenge :read-only="isAdminContext" />
      </section>

      <section v-if="showGrowthSection('assets')" class="growth-panel">
        <PointsShop :read-only="isAdminContext" />
      </section>

      <section v-if="showGrowthSection('assets')" class="growth-panel">
        <LotteryDraw :read-only="isAdminContext" />
      </section>

      <section v-if="showGrowthSection('assets')" class="growth-panel">
        <MyInventory :read-only="isAdminContext" />
      </section>

      <section v-if="showGrowthSection('achievements') && streakMilestones.length" class="growth-panel">
        <MilestoneLadder :milestones="streakMilestones" :current-streak="currentStreak" />
      </section>

      <section v-if="showGrowthSection('achievements')" class="growth-panel">
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

      <section v-if="showGrowthSection('achievements')" class="growth-panel">
        <GrowthTimeline :items="timeline" />
      </section>

      <!-- 情感回顾不抢占每日任务首屏，放在记录流之后按需浏览。 -->
      <section v-if="showGrowthSection('achievements') && showRecap" id="growth-recap" class="growth-panel">
        <RecapCard />
      </section>
    </div>

    <WeeklyReportModal v-model:visible="wrVisible" :report="wrData" />
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onActivated, onMounted, ref, watch } from 'vue';
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

  type MobileGrowthSection = 'overview' | 'tasks' | 'achievements' | 'assets';

  const { t } = useI18n();
  const route = useRoute();
  const router = useRouter();
  const user = useUserStore();
  const bookmark = bookmarkStore();
  const activeMobileSection = ref<MobileGrowthSection>('overview');
  const mobileSectionOptions = computed(() => [
    { key: 'overview', label: t('growth.mobileTabOverview') },
    { key: 'tasks', label: t('growth.mobileTabTasks') },
    { key: 'achievements', label: t('growth.mobileTabAchievements') },
    { key: 'assets', label: t('growth.mobileTabAssets') },
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

  function sectionForHash(hash: string): MobileGrowthSection | null {
    if (hash === '#growth-tasks') return 'tasks';
    if (hash === '#growth-heatmap' || hash === '#growth-recap') return 'achievements';
    return null;
  }

  function showGrowthSection(section: MobileGrowthSection) {
    return !bookmark.isMobile || activeMobileSection.value === section;
  }

  function scrollToHash() {
    const targetId = route.hash.replace(/^#/, '');
    if (!targetId) return;
    const targetSection = sectionForHash(route.hash);
    if (bookmark.isMobile && targetSection) activeMobileSection.value = targetSection;
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
  const EMPTY_BONUS = { exp: 0, claimed: false, claimable: false };
  const stats = computed(() => dashboard.value?.stats || EMPTY_STATS);
  const achievements = computed(() => dashboard.value?.achievements || []);
  const quests = computed(() => dashboard.value?.quests || []);
  const timeline = computed(() => dashboard.value?.timeline || []);
  // 仅在后端明确 questsEnabled===false(满级/root)时隐藏任务卡;游客/加载中默认展示
  const questsEnabled = computed(() => dashboard.value?.questsEnabled !== false);
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
        if (res.data.already) {
          message.info(t('growth.questClaimedAlready'));
        } else if (res.data.capped) {
          message.info(t('growth.questCapped'));
        } else {
          const pts = res.data.pointsEarned || 0;
          if (pts > 0) {
            message.success(t('growth.questClaimOkPts', { n: res.data.expGained, p: pts }));
          } else {
            message.success(t('growth.questClaimOk', { n: res.data.expGained }));
          }
          recordOperation({ module: '成长', operation: `领取每日任务奖励（经验+${res.data.expGained}、积分+${pts}）` });
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
    loadGrowthTasks(true); // 成长任务由资源创建和资料更新旁路完成，进页时强制同步
    loadRecap(); // 最近沉淀/那年今日/尘封回顾
    scrollToHash();
  });

  onActivated(() => {
    // 从笔记库、书签或待办返回时，资源旁路完成可能已经更新了一次性任务状态。
    void loadGrowthTasks(true);
    void loadRecap();
    scrollToHash();
  });

  // 工作台「查看全部成长任务」会带 hash；页面被 keep-alive 时也要响应同页 hash 变化。
  watch(
    () => route.hash,
    () => scrollToHash(),
  );

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
    max-width: 640px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  /* 大屏放宽容器,容纳 GrowthCard 的左右两栏,消除 PC 两侧大片留白 */
  @media (min-width: 900px) {
    .growth-container {
      max-width: 960px;
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
  @media (max-width: 767px) {
    .growth-page {
      padding: 18px 12px 36px;
    }
    .growth-container {
      gap: 12px;
    }
    .growth-mobile-tabs {
      position: sticky;
      top: 0;
      z-index: 3;
      width: 100%;
      box-sizing: border-box;
      border-radius: 12px;
      background: var(--background-color);
      box-shadow: 0 7px 18px -18px color-mix(in srgb, var(--text-color) 55%, transparent);
    }
    .growth-mobile-tabs :deep(.tab) {
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
